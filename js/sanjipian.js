// 蝴蝶影院 - XPTV csp 格式（csp_sanjipian）
// 转换自 mira-cat nodejs/src/spider/video/sanjipian.js（py_sanjipian）。站点默认 https://ptt01.com
// 域名自愈逻辑保留：主站不可达时从导航站（x99dh）base64 名单解码最新域名（纯 JS 解码，无 Buffer）；
// 猫版的品牌诊断字段（vod_actor/vod_director/分隔线简介）按规范丢弃。播放为详情/播放页解析出的 m3u8 直链。
const DEFAULT_HOST = 'https://ptt01.com';
const NAV_URLS = ['https://x99dh.cc', 'https://x99dh.one'];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const BRAND = '蝴蝶影视';
const NAME = '蝴蝶影院';

let siteUrl = DEFAULT_HOST;

const CLASSES = [
    ['/p/1', '🎬 电影'], ['/p/3', '📺 电视剧'], ['/p/4', '🌸 动漫'], ['/p/2', '🎤 综艺'],
    ['/p/66', '⚡ 短剧'], ['/p/53', '⚽ 体育'], ['/p/66/c/67', '🎭 爽剧短剧'], ['/p/53/c/54', '🏟️ 足球'],
    ['/p/3/c/82', '🇰🇷 韩剧'], ['/p/4/c/86', '🇯🇵 日漫'],
];

const appConfig = {
    ver: 1,
    title: '蝴蝶影院',
    site: DEFAULT_HOST,
    tabs: CLASSES.map(([tid, name]) => ({ name, ext: { tid } })),
};

function headers(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || (siteUrl + '/'),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
    };
}

function formatRemarks(brand, meta) {
    const m = String(meta || '').trim().replace(/[\r\n\t]+/g, ' ').trim();
    return m ? `${brand} | ${m}` : brand;
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return siteUrl + u;
    return u;
}

function htmlUnescape(s) {
    return String(s || '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

// base64 → UTF-8 字符串（纯 JS 实现）
function b64decode(str) {
    str = String(str || '').replace(/[\r\n\s]/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
    if (!str) return '';
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const bytes = [];
    for (let i = 0; i < str.length; i += 4) {
        const c0 = alpha.indexOf(str[i]);
        const c1 = alpha.indexOf(str[i + 1]);
        const c2 = str[i + 2] === '=' ? -1 : alpha.indexOf(str[i + 2]);
        const c3 = str[i + 3] === '=' ? -1 : alpha.indexOf(str[i + 3]);
        if (c0 < 0 || c1 < 0) break;
        bytes.push((c0 << 2) | (c1 >> 4));
        if (c2 >= 0) bytes.push(((c1 & 15) << 4) | (c2 >> 2));
        if (c3 >= 0) bytes.push(((c2 & 3) << 6) | c3);
    }
    let out = '';
    for (let i = 0; i < bytes.length;) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if (b >= 0xC2 && b < 0xE0 && i + 1 < bytes.length) {
            out += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F)); i += 2;
        } else if (b >= 0xE0 && b < 0xF0 && i + 2 < bytes.length) {
            out += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F)); i += 3;
        } else if (b >= 0xF0 && b < 0xF5 && i + 3 < bytes.length) {
            const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F);
            const v = cp - 0x10000;
            out += String.fromCharCode(0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF)); i += 4;
        } else { i += 1; }
    }
    return out;
}

async function rawGet(targetUrl, referer) {
    const { data, status } = await $fetch.get(targetUrl, { headers: headers(referer) });
    return { data: typeof data === 'string' ? data : String(data || ''), status };
}

async function fetchText(targetUrl, referer, checkHost) {
    referer = referer || '';
    checkHost = checkHost !== false;
    if (!targetUrl) return { code: 0, text: '' };
    if (targetUrl.startsWith('//')) targetUrl = 'https:' + targetUrl;
    else if (targetUrl.startsWith('/')) targetUrl = siteUrl + targetUrl;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const r = await rawGet(targetUrl, referer);
            if (r.data && r.data.length > 1000) return { code: 200, text: r.data };
            if (checkHost && [404, 451, 502, 503].includes(r.status || 0)) {
                if (await refreshSiteUrl()) {
                    return fetchText(targetUrl, referer, false);
                }
                return { code: r.status, text: '' };
            }
        } catch (e) {}
    }
    return { code: -1, text: '' };
}

// 动态自愈：从导航站解码最新可用域名
async function refreshSiteUrl() {
    for (const nav of NAV_URLS) {
        let text = '';
        try {
            const { data } = await $fetch.get(nav, { headers: headers() });
            text = typeof data === 'string' ? data : String(data || '');
        } catch (e) {
            continue;
        }
        if (!text) continue;
        const blocks = [...text.matchAll(/["']([A-Za-z0-9+/=]{100,})["']/g)];
        for (const bm of blocks) {
            try {
                const decoded = b64decode(bm[1]);
                let unquoted;
                try { unquoted = decodeURIComponent(decoded); } catch (e) { unquoted = decoded; }
                if (!unquoted.includes('[')) continue;
                if (!unquoted.includes(NAME) && !unquoted.includes('稀缺资源')) continue;
                const siteList = JSON.parse(unquoted);
                for (const item of siteList) {
                    const name = String(item.name || '').trim();
                    if (name !== NAME && name !== '稀缺资源') continue;
                    const cands = [];
                    if (item.url) cands.push(item.url);
                    for (const uo of item.urls || []) {
                        const u = uo.url || '';
                        if (u && !cands.includes(u)) cands.push(u);
                    }
                    for (const cUrl of cands) {
                        try {
                            const um = String(cUrl).match(/^(https?:\/\/[^/]+)/i);
                            if (!um) continue;
                            const base = um[1];
                            const { status } = await $fetch.get(base + '/p/1', { headers: headers() });
                            if (status === undefined || status === 200) {
                                siteUrl = base;
                                return true;
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {}
        }
    }
    return false;
}

function parseCardList(htmlText) {
    const cards = [];
    const seen = new Set();
    if (!htmlText) return cards;
    let itemBlocks = [...htmlText.matchAll(/(<div[^>]+class=["'][^"']*item[^"']*["'][\s\S]*?<\/div>\s*<\/div>\s*<\/div>)/gi)].map((m) => m[1]);
    if (!itemBlocks.length) {
        itemBlocks = [...htmlText.matchAll(/(<a[^>]+href=["']\/\d+["'][\s\S]*?<\/a>)/gi)].map((m) => m[1]);
    }
    for (const block of itemBlocks) {
        const mHref = block.match(/href=["'](\/(\d+))["']/);
        if (!mHref) continue;
        const path = mHref[1];
        if (seen.has(path)) continue;
        let title = '';
        const mTitle = block.match(/title=["']([^"']+)["']/);
        if (mTitle) title = mTitle[1].trim();
        if (!title) {
            const mTxt = block.match(/>([^<]{1,30})<\/a>/);
            if (mTxt) {
                const cleanTxt = mTxt[1].trim();
                if (cleanTxt && !cleanTxt.startsWith('fa-')) title = cleanTxt;
            }
        }
        if (!title) title = '视频 ' + mHref[2];
        let imgSrc = '';
        const mImg = block.match(/(?:src|data-original|data-src)=["']([^"']+)["']/i);
        if (mImg) {
            const cand = mImg[1].trim();
            if (!/(logo|avatar|icon|\.svg)/i.test(cand)) imgSrc = absUrl(cand);
        }
        const mRem = block.match(/class=["'][^"']*(?:badge|label|text-muted|remarks)[^"']*["'][^>]*>([^<]+)</i);
        const rawRemarks = mRem ? mRem[1].trim() : 'HD';
        seen.add(path);
        cards.push({
            vod_id: path,
            vod_name: htmlUnescape(title),
            vod_pic: imgSrc,
            vod_remarks: formatRemarks(BRAND, rawRemarks),
            ext: { id: path },
        });
    }
    return cards;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const basePath = String(ext.tid || '/p/1').trim();
    let reqPath = basePath;
    const queryParts = [];
    if (page > 1) queryParts.push('page=' + page);
    if (queryParts.length) reqPath += (reqPath.includes('?') ? '&' : '?') + queryParts.join('&');
    const res = await fetchText(reqPath, '', true);
    return jsonify({ list: parseCardList(res.text) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const targetPath = String(ext.id || '').trim();
    if (!targetPath) return jsonify({ list: [] });
    const res = await fetchText(targetPath, '', true);
    const htmlText = res.text || '';
    const directStreams = [...htmlText.matchAll(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/g)].map((m) => m[0]);
    const tracks = [];
    if (directStreams.length) {
        tracks.push({ name: '正片', pan: '', ext: { id: directStreams[0].replace(/\\\//g, '/'), flag: 'PTT01专线' } });
    } else {
        const rawPlayLinks = [...htmlText.matchAll(/<a[^>]+href=["'](\/v\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
        const seenEps = new Set();
        for (const m of rawPlayLinks) {
            const href = m[1];
            const epTitle = m[2].replace(/<[^>]+>/g, '').trim();
            if (!epTitle || /快捷键|XVIDEOS|广告/.test(epTitle)) continue;
            if (seenEps.has(href)) continue;
            seenEps.add(href);
            tracks.push({ name: epTitle, pan: '', ext: { id: href, flag: 'PTT01专线' } });
        }
    }
    return jsonify({ list: tracks.length ? [{ title: 'PTT01专线', tracks }] : [] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let playUrl = String(ext.id || '').trim();
    if (playUrl && !/^https?:\/\//i.test(playUrl) && playUrl.startsWith('/')) {
        const res = await fetchText(playUrl, '', true);
        const mHls = (res.text || '').match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/);
        if (mHls) playUrl = mHls[0].replace(/\\\//g, '/');
        else playUrl = absUrl(playUrl);
    }
    if (!playUrl) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [playUrl],
        headers: [{ 'User-Agent': UA, 'Referer': siteUrl + '/', 'Origin': siteUrl }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const wd = String(ext.text || '').trim();
    if (!wd) return jsonify({ list: [] });
    let searchUrl = '/search?q=' + encodeURIComponent(wd);
    if (page > 1) searchUrl += '&page=' + page;
    const res = await fetchText(searchUrl, '', true);
    return jsonify({ list: parseCardList(res.text) });
}
