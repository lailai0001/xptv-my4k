// 黄果短剧 - XPTV csp 格式（csp_huangguo）
// 转换自 mira-cat nodejs/src/spider/video/huangguo.js（py_huangguo），站点 https://huangguoai.com。
// 加密改写点核查：猫版 Node crypto 仅一处——封面图 AES-128-CBC 解密（IMG_KEY/IMG_IV、
// createDecipheriv('aes-128-cbc')、setAutoPadding(false) 后手工剥 PKCS 填充并按 JPEG EOI/PNG IEND 截断），
// 且该解密只供猫版自带的 fastify /proxy/img 路由使用；猫版列表/详情的封面实际不走该路由，
// 而是统一拼外部代理解密 https://huangguo.wulii.de5.net/?url=<enc>（proxyCoverUrl，见下，原样保留）。
// XPTV 模块无代理路由、$fetch 也取不了二进制图，故解密逻辑未内联（与猫版数据路径等价，非近似替代）；
// 其余取数/解析无签名、无 MD5/HMAC、无 POST，全 GET 正则解析（猫版即未用 cheerio）。
// 改动点：fetchRetry 的 setTimeout 递增延时（400*(s+1)ms）已删除、改串行立即重试（最多 3 次，逻辑不变）；
// Buffer.isBuffer 分支按 $fetch 返回形态（字符串/对象）改写；猫版 /proxy/img 路由丢弃；诊断卡无。
// 播放：猫版 play 为 parse:0 直出（videoInitialData 的 epPlaySrcs[ep] 或 videoSrc），本模块直出，无嗅探降级。
// 待真机验：$fetch 在真机运行时对本站 HTML/JSON 接口的返回形态、外部封面代理在真机的可达性。
const HOST = 'https://huangguoai.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const HTML_HEADERS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': HOST + '/',
};

// 分类: 源自猫版 CLASSES（原注: 源自 XPTV huangguo.js 的 appConfig.tabs）
const CLASSES = [
    { type_id: 'home', type_name: '首页' },
    { type_id: 'ai-duanju', type_name: 'AI成人短剧' },
    { type_id: 'ai-manju', type_name: 'AI成人漫剧' },
    { type_id: 'ai-huanlian', type_name: 'AI换脸' },
    { type_id: 'ai-mogai', type_name: 'AI魔改' },
    { type_id: 'ranks/hot', type_name: '排行榜' },
];

// 封面解密走外部代理（参考 REX 版：https://huangguo.wulii.de5.net），与猫版一致
const COVER_PROXY = 'https://huangguo.wulii.de5.net';

const appConfig = {
    ver: 1,
    title: '黄果短剧',
    site: HOST,
    tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

// 带重试的请求: 4xx(除429)不重试, 其余最多3次（猫版的 setTimeout 延时已删，改串行立即重试）
async function fetchRetry(url, opts, tries = 3) {
    let lastErr = null;
    for (let s = 0; s < tries; s++) {
        try {
            const res = await $fetch.get(url, opts);
            const st = res && typeof res.status === 'number' ? res.status : 0;
            if (st && st >= 400 && st < 500 && st !== 429) {
                const e = new Error('http ' + st);
                e.response = { status: st };
                throw e;
            }
            if (st === 429 || st >= 500) throw new Error('http ' + st);
            return res;
        } catch (e) {
            lastErr = e;
            const st = e && e.response && e.response.status;
            if (st && st >= 400 && st < 500 && st !== 429) throw e;
        }
    }
    throw lastErr;
}

async function getHtml(url, referer) {
    const headers = referer ? { ...HTML_HEADERS, Referer: referer } : HTML_HEADERS;
    const res = await fetchRetry(url, { headers });
    const d = res && res.data;
    if (typeof d === 'string') return d;
    if (d == null) return '';
    return String(d);
}

async function getJson(url) {
    const headers = { ...HTML_HEADERS, Accept: 'application/json, text/plain, */*' };
    const res = await fetchRetry(url, { headers });
    const d = res && res.data;
    if (d == null) return null;
    if (typeof d === 'object') return d;
    try {
        return JSON.parse(String(d));
    } catch (e) {
        return null;
    }
}

function stripTags(s) {
    return String(s || '').replace(/<[^>]*>/g, '').trim();
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return HOST + u;
    return u;
}

function proxyCoverUrl(imgUrl) {
    if (!imgUrl || !/^https?:\/\//i.test(imgUrl)) return imgUrl;
    return `${COVER_PROXY}/?url=${encodeURIComponent(imgUrl)}`;
}

function cleanPicUrl(u) {
    // 注意：封面 URL 带时效 auth_key 参数，必须保留，否则 403（与猫版一致，不去 query）
    return absUrl(u);
}

function metaContent(html, name) {
    if (!html) return '';
    let m = html.match(new RegExp('<meta[^>]+(?:property|name)=["\']' + name + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'));
    if (m) return decodeEntities(m[1]).trim();
    m = html.match(new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + name + '["\']', 'i'));
    return m ? decodeEntities(m[1]).trim() : '';
}

function extractTrackId(block) {
    let m = block.match(/data-track-id="(\d+)"/);
    if (m) return m[1];
    m = block.match(/href="[^"]*\/(?:video|detail)\/(\d+)\/?"/);
    return m ? m[1] : '';
}

function cleanTitle(s) {
    return stripTags(String(s || '').replace(/<span\b[^>]*\bsr-only\b[^>]*>[\s\S]*?<\/span>/gi, ''));
}

function extractCardTitle(block) {
    let m = block.match(/data-track-title="([^"]*)"/);
    if (m) return decodeEntities(m[1]).trim();
    m = block.match(/hg-(?:drama-card|rank-item)__title[^>]*>([\s\S]*?)<\/(?:a|h2)>/);
    if (m) {
        const t = cleanTitle(m[1]);
        if (t) return t;
    }
    m = block.match(/<a[^>]+href="[^"]*\/(?:video|detail)\/\d+\/?"[^>]*>([\s\S]*?)<\/a>/);
    return m ? cleanTitle(m[1]) : '';
}

// 单个剧卡解析
function parseCardBlock(block) {
    const id = extractTrackId(block);
    if (!id) return null;
    const imgM = block.match(/data-src="([^"]+)"/) || block.match(/src="([^"]+)"/);
    const title = extractCardTitle(block);
    if (!title) return null;
    const epBaseM = block.match(/data-ep-base="([^"]*)"/);
    const epSpanM = block.match(/hg-drama-card__episode[^>]*>([\s\S]*?)<\/span>/);
    const scoreSpanM = block.match(/hg-drama-card__score[^>]*>([\s\S]*?)<\/span>/);
    const epBase = epBaseM ? decodeEntities(epBaseM[1]).trim() : (epSpanM ? stripTags(epSpanM[1]) : '');
    const score = scoreSpanM ? stripTags(scoreSpanM[1]) : '';
    const remarks = epBase && score ? epBase + ' · ' + score : (epBase || score);
    return {
        vod_id: id,
        vod_name: title,
        vod_pic: proxyCoverUrl(cleanPicUrl(imgM ? imgM[1] : '')),
        vod_remarks: remarks,
        ext: { id },
    };
}

// 剧卡网格列表解析(parseAll=true 解析全部网格, 否则只取第一格)
function parseCards(html, parseAll) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const gridRe = /<div\s+class="[^"]*\bhg-card-grid\b[^"]*"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = gridRe.exec(html)) !== null) starts.push(m.index + m[0].length);
    if (!starts.length) return out;
    const n = parseAll ? starts.length : Math.min(1, starts.length);
    for (let i = 0; i < n; i++) {
        const segEnd = i + 1 < starts.length ? starts[i + 1] : html.length;
        const seg = html.slice(starts[i], segEnd);
        const cardRe = /<div\s+class="[^"]*\bhg-drama-card\b[^"]*"[^>]*>/g;
        const cstarts = [];
        let cm;
        while ((cm = cardRe.exec(seg)) !== null) cstarts.push(cm.index);
        for (let j = 0; j < cstarts.length; j++) {
            const cEnd = j + 1 < cstarts.length ? cstarts[j + 1] : seg.length;
            try {
                const card = parseCardBlock(seg.slice(cstarts[j], cEnd));
                if (!card || seen.has(card.vod_id)) continue;
                seen.add(card.vod_id);
                out.push(card);
            } catch (e) {}
        }
    }
    return out;
}

// 排行榜列表解析
function parseRankList(html) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const listM = html.match(/<div\s+class="[^"]*\bhg-rank-list\b[^"]*"[^>]*>/);
    const body = html.slice(listM ? listM.index + listM[0].length : 0);
    const itemRe = /<div\s+class="[^"]*\bhg-rank-item\b[^"]*"[^>]*>/g;
    const starts = [];
    let m;
    while ((m = itemRe.exec(body)) !== null) starts.push(m.index);
    for (let i = 0; i < starts.length; i++) {
        const seg = body.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : body.length);
        try {
            const id = extractTrackId(seg);
            if (!id || seen.has(id)) continue;
            const imgM = seg.match(/data-src="([^"]+)"/) || seg.match(/src="([^"]+)"/);
            const title = extractCardTitle(seg);
            if (!title) continue;
            seen.add(id);
            const tagsM = seg.match(/hg-rank-item__tags[^>]*>([\s\S]*?)<\/div>/);
            out.push({
                vod_id: id,
                vod_name: title,
                vod_pic: proxyCoverUrl(cleanPicUrl(imgM ? imgM[1] : '')),
                vod_remarks: tagsM ? stripTags(tagsM[1]) : '',
                ext: { id },
            });
        } catch (e) {}
    }
    return out;
}

// /api/videos/category JSON 条目解析
function parseApiItem(item) {
    if (!item || !item.id) return null;
    const parts = [];
    const epCount = parseInt(item.episode_count, 10) || 0;
    if (epCount > 0) parts.push((item.is_finished ? '全' : '更新至') + epCount + '集');
    if (item.score) parts.push(String(item.score) + '分');
    if (Array.isArray(item.tags) && item.tags.length) parts.push(item.tags.join('·'));
    return {
        vod_id: String(item.id),
        vod_name: String(item.title || ''),
        vod_pic: proxyCoverUrl(cleanPicUrl(item.cover || '')),
        vod_remarks: parts.join(' · '),
        ext: { id: String(item.id) },
    };
}

// 详情页头部: 标题/封面/简介
function parseDetailHead(html) {
    let title = metaContent(html, 'og:title');
    if (title) title = title.replace(/\s*-\s*黄果短剧\s*$/, '');
    if (!title) {
        const m = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (m) title = stripTags(decodeEntities(m[1]));
    }
    let pic = '';
    const posterDiv = html.match(/<div\s+class="[^"]*\bhg-web-play__poster\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (posterDiv) {
        const m = posterDiv[1].match(/data-src="([^"]+)"/) || posterDiv[1].match(/src="([^"]+)"/);
        if (m && m[1].indexOf('data:image') !== 0) pic = m[1];
    }
    if (!pic) {
        const m = html.match(/id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
        if (m) {
            try {
                const j = JSON.parse(m[1]);
                pic = (j && (j.posterSrc || j.coverSrc)) || '';
            } catch (e) {}
        }
    }
    if (!pic) {
        const m = html.match(/<img\b[^>]*\bdata-src="([^"]+)"[^>]*\bfetchpriority="high"[^>]*>/i)
            || html.match(/<img\b[^>]*\bfetchpriority="high"[^>]*\bdata-src="([^"]+)"[^>]*>/i)
            || html.match(/<img\b[^>]*\bdata-src="(https?:\/\/[^"]+?\.(?:jpe?g|png|webp|gif)(?:\?[^"]*)?)"[^>]*>/i);
        if (m) pic = m[1];
    }
    if (!pic) pic = metaContent(html, 'og:image');
    const content = metaContent(html, 'og:description');
    return { title, pic, content };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'home').replace(/^\//, '');
    let page = parseInt(ext.page, 10) || 1;
    if (page <= 0) page = 1;
    try {
        if (tid === 'home') {
            const html = await getHtml(HOST + '/');
            return jsonify({ list: parseCards(html, true) });
        }
        if (tid.indexOf('rank') !== -1) {
            const html = await getHtml(`${HOST}/${tid}/`);
            return jsonify({ list: parseRankList(html) });
        }
        // JSON 分类接口优先
        const json = await getJson(`${HOST}/api/videos/category/${tid}?page=${page}`);
        if (json && json.data && Array.isArray(json.data.items)) {
            const list = json.data.items.map((d) => parseApiItem(d)).filter(Boolean);
            return jsonify({ list });
        }
        // 兜底: 分类 HTML 页
        const url = `${HOST}/${tid}/${page > 1 ? page + '/' : ''}`;
        const html = await getHtml(url);
        return jsonify({ list: parseCards(html, false) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let vid = ext.id;
    if (Array.isArray(vid)) vid = vid[0];
    vid = String(vid || '').trim();
    if (!vid) return jsonify({ list: [{ title: '黄果短剧', tracks: [] }] });
    try {
        const html = await getHtml(`${HOST}/video/${vid}/`);
        const eps = [];
        const gridM = html.match(/<div\s+class="[^"]*\bhg-(?:web-play|web-detail)__ep-grid\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
        if (gridM) {
            const aRe = /<a\b[^>]*>[\s\S]*?<\/a>/g;
            let am;
            while ((am = aRe.exec(gridM[1])) !== null) {
                const hrefM = am[0].match(/href="([^"]+)"/);
                if (!hrefM) continue;
                const epIdM = am[0].match(/data-ep-id="([^"]*)"/);
                const ep = epIdM ? epIdM[1] : '';
                eps.push({ name: ep ? `第${ep}集` : stripTags(am[0]), url: absUrl(hrefM[1]), ep });
            }
        }
        if (!eps.length) {
            const pm = html.match(/<a\b[^>]*class="[^"]*\bhg-web-detail__play\b[^"]*"[^>]*href="([^"]+)"/);
            if (pm) eps.push({ name: '第1集', url: absUrl(pm[1]), ep: '' });
        }
        // playId 沿用猫版 detail 的 vod_play_url 集段（name$ 之后部分）原样: <集页URL>$$$<ep>
        const tracks = eps.map((e) => ({
            name: e.name,
            pan: '',
            ext: { id: `${e.url}$$$${e.ep}`, flag: '黄果短剧' },
        }));
        return jsonify({ list: [{ title: '黄果短剧', tracks }] });
    } catch (e) {
        return jsonify({ list: [{ title: '黄果短剧', tracks: [] }] });
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '');
    const sep = raw.indexOf('$$');
    const pageUrl = sep !== -1 ? raw.slice(0, sep) : raw;
    const ep = sep !== -1 ? raw.slice(sep + 2) : '';
    if (!pageUrl) return jsonify({ urls: [], headers: [] });
    try {
        const html = await getHtml(pageUrl, HOST + '/');
        let url = '';
        const m = html.match(/id="videoInitialData"[^>]*>([\s\S]*?)<\/script>/);
        if (m) {
            try {
                const j = JSON.parse(m[1]);
                const srcs = (j && j.epPlaySrcs) || {};
                // 猫版取 srcs[ep]（playId 为 $$$ 分隔时 ep 带前导 $，一并兼容原集号键）或 videoSrc
                url = srcs[ep] || (ep && ep.charAt(0) === '$' ? srcs[ep.slice(1)] : '') || (j && j.videoSrc) || '';
            } catch (e) {}
        }
        if (url) {
            url = String(url).replace(/\\u0026/g, '&');
            if (!/^https?:\/\//i.test(url)) {
                const um = url.match(/(https?:\/\/[^\s"']+)/);
                url = um ? um[1] : '';
            }
        }
        if (!url) return jsonify({ urls: [], headers: [] });
        return jsonify({
            urls: [url],
            headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
        });
    } catch (e) {
        return jsonify({ urls: [], headers: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    if (!wd) return jsonify({ list: [] });
    try {
        const html = await getHtml(`${HOST}/search/video/${encodeURIComponent(wd)}/`);
        return jsonify({ list: parseCards(html, false) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}
