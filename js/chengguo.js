// 橙果短剧 - XPTV csp 格式（csp_chengguo）
// 转换自 mira-cat nodejs/src/spider/video/chengguo.js（py_chengguo）。站点 https://chengguodj.com (Nuxt.js)
// 封面经站内 /_img/ 代理（base64url 编码原图 URL，纯 JS 实现，无 Buffer）；播放为详情/播放页解析出的 m3u8 直链。
const SITE = 'https://chengguodj.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1';

const CATS = [
    ['yuanchuang', '原创短剧'],
    ['mogai', '魔改短剧'],
    ['manju', '漫剧'],
    ['zhenren', '真人短剧'],
    ['aiduanju', 'AI短剧'],
    ['browse', '片库索引'],
    ['rank', '排行榜'],
    ['home', '首页推荐'],
];

const appConfig = {
    ver: 1,
    title: '橙果短剧',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function absUrl(u) {
    u = t(u).replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/').replace(/\\/g, '');
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('http') === 0) return u;
    if (u.charAt(0) === '/') return SITE + u;
    return SITE + '/' + u;
}

// UTF-8 字符串 → base64url（替代 Node Buffer）
function b64UrlEncode(str) {
    const bytes = [];
    const enc = encodeURIComponent(str);
    for (let i = 0; i < enc.length; i++) {
        if (enc[i] === '%') {
            bytes.push(parseInt(enc.slice(i + 1, i + 3), 16));
            i += 2;
        } else {
            bytes.push(enc.charCodeAt(i));
        }
    }
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        out += alpha[b0 >> 2];
        out += alpha[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
        out += b1 === undefined ? '=' : alpha[((b1 & 15) << 2) | ((b2 || 0) >> 6)];
        out += b2 === undefined ? '=' : alpha[b2 & 63];
    }
    return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function proxyImg(raw) {
    raw = absUrl(raw);
    if (!raw) return '';
    if (raw.indexOf(SITE + '/_img/') === 0) return raw;
    try {
        return SITE + '/_img/' + b64UrlEncode(raw);
    } catch (e) {
        return raw;
    }
}

async function fetchHtml(url) {
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Referer': SITE + '/',
            },
        });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseNuxtArr(html) {
    const m = html.match(/<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    try { return JSON.parse(t(m[1])); } catch (e) { return null; }
}

function nuxtVal(arr, idx) {
    if (typeof idx === 'number' && idx >= 0 && idx < arr.length) return arr[idx];
    return idx;
}

function extractList(html) {
    const arr = parseNuxtArr(html);
    if (!arr || !arr.length) return [];
    const items = [];
    const seen = {};
    for (const item of arr) {
        if (!item || typeof item !== 'object') continue;
        if (!('title' in item)) continue;
        if (!('slug' in item) && !('detail_route' in item)) continue;
        let title = nuxtVal(arr, item.title);
        if (!title || typeof title !== 'string') continue;
        title = t(title);
        if (!title) continue;
        let dramaPath = nuxtVal(arr, item.detail_route);
        if (!dramaPath || typeof dramaPath !== 'string') {
            const slug = nuxtVal(arr, item.slug);
            if (slug && typeof slug === 'string') dramaPath = '/drama/' + slug;
        }
        if (!dramaPath || typeof dramaPath !== 'string') continue;
        dramaPath = t(dramaPath);
        if (seen[dramaPath]) continue;
        seen[dramaPath] = 1;
        let pic = '';
        const coverObj = nuxtVal(arr, item.cover);
        if (coverObj && typeof coverObj === 'object') {
            const rawU = nuxtVal(arr, coverObj.url);
            if (rawU && typeof rawU === 'string') pic = rawU;
        }
        const eps = nuxtVal(arr, item.total_episode_count) || nuxtVal(arr, item.published_episode_count);
        const remarks = (typeof eps === 'number' && eps) ? '全' + eps + '集' : '';
        items.push({
            vod_id: 'cg:' + dramaPath,
            vod_name: title,
            vod_pic: proxyImg(pic),
            vod_remarks: remarks,
            ext: { id: 'cg:' + dramaPath },
        });
    }
    return items;
}

function catUrl(tid, page) {
    page = parseInt(page, 10) || 1;
    if (page <= 1) return SITE + '/' + tid;
    return SITE + '/' + tid + '/page-' + page;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'yuanchuang');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await fetchHtml(catUrl(id, page));
    return jsonify({ list: extractList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    id = id.replace(/^cg:/, '');
    if (!id) return jsonify({ list: [] });
    const detailUrl = absUrl(id);
    const html = await fetchHtml(detailUrl);
    const slug = id.replace(/\/+$/, '').split('/').pop();
    const episodes = [];
    const arr = parseNuxtArr(html);
    if (arr) {
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            if (!('total_episode_count' in item)) continue;
            const tot = nuxtVal(arr, item.total_episode_count);
            if (typeof tot === 'number' && tot > 0) {
                for (let ep = 1; ep <= tot; ep++) {
                    episodes.push({ name: '第' + ep + '集', path: '/play/' + slug + '/' + ep });
                }
                break;
            }
        }
    }
    if (!episodes.length) {
        const links = html.match(/href=["'](\/play\/[^"']+)["']/gi) || [];
        const seen = {};
        for (const l of links) {
            const hm = l.match(/href=["'](\/play\/[^"']+)["']/i);
            if (!hm || seen[hm[1]]) continue;
            seen[hm[1]] = 1;
            const num = hm[1].split('/').pop();
            episodes.push({ name: /^\d+$/.test(num) ? '第' + num + '集' : num, path: hm[1] });
        }
    }
    const tracks = episodes.map((ep) => ({
        name: ep.name,
        pan: '',
        ext: { id: JSON.stringify({ path: ep.path }), flag: '橙果' },
    }));
    return jsonify({ list: tracks.length ? [{ title: '橙果', tracks }] : [] });
}

async function resolvePlay(playPath) {
    const url = absUrl(playPath);
    const html = await fetchHtml(url);
    const arr = parseNuxtArr(html);
    if (arr) {
        for (const v of arr) {
            if (typeof v === 'string' && v.indexOf('.m3u8') >= 0 && v.indexOf('http') === 0) {
                return v.replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
            }
        }
    }
    const m = html.match(/["'](https?:\/\/[^"'\s<>\\]+\.m3u8[^"'\s<>\\]*)["']/i);
    if (m) return m[1].replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/');
    return '';
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    let payload = null;
    try { payload = JSON.parse(id); } catch (e) {}
    if (!payload || !payload.path) return jsonify({ urls: [], headers: [] });
    const url = await resolvePlay(payload.path);
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!kw) return jsonify({ list: [] });
    const url = SITE + '/search?keyword=' + encodeURIComponent(kw) + (page > 1 ? '&page=' + page : '');
    const html = await fetchHtml(url);
    return jsonify({ list: extractList(html) });
}
