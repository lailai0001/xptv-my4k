// 八卦 - XPTV csp 格式（csp_bagua）
// 转换自 mira-cat nodejs/src/spider/video/bagua.js（py_bagua）。站点 https://www.mrds66.com（WordPress，与每日大赛同站不同入口）
// 封面为 AES 加密存储，走 bagua-img-proxy 解密代理出图（前缀拼接原样保留）；播放为详情页 dplayer 直链。
const BASE_URL = 'https://www.mrds66.com';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const CATS = [
    ['latest', '最新更新'], ['mrds', '每日大赛'], ['ztds', '主题大赛'], ['rstt', '热搜吃瓜'],
    ['xazd', '校园学生'], ['blyp', '必撸大赛'], ['fctg', '反差泄密'], ['mhds', '网红黑料'],
    ['lqdp', '猎奇重口'], ['jdsj', 'AV看片'], ['mxwh', '明星大赛'], ['smdh', '动漫之家'],
    ['dypd', '影视国漫'], ['mtds', 'cos写真'], ['ysds', '声控ASMR'], ['czds', '寸止挑战'],
    ['hjds', '混剪PMV'], ['tgds', '原创投稿'], ['omjp', '欧美精品'], ['qwcs', '全网参赛'],
    ['aijc', 'AI剧场'],
];

const appConfig = {
    ver: 1,
    title: '八卦',
    site: BASE_URL,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    return t(s)
        .replace(/&quot;/g, '"')
        .replace(/&#34;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
}

function cleanText(s) {
    return decodeHtml(s)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function firstMatch(text, re, idx) {
    const m = String(text || '').match(re);
    return m ? decodeHtml(m[idx || 1] || '') : '';
}

function absUrl(url, base) {
    url = t(url);
    if (!url) return '';
    if (/^\/\//.test(url)) return 'https:' + url;
    if (/^https?:\/\//i.test(url)) return url;
    base = t(base || BASE_URL).replace(/\/+$/, '');
    if (url.charAt(0) === '/') return base + url;
    return base + '/' + url;
}

function proxyCover(url) {
    url = t(url);
    if (!url) return '';
    if (url.indexOf('data:') === 0) return url;
    if (url.indexOf('bagua-img-proxy') >= 0) return url;
    return IMG_PROXY + encodeURIComponent(absUrl(url, BASE_URL));
}

async function fetchHtml(url) {
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': BASE_URL + '/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseList(html) {
    const items = [];
    if (!html) return items;
    const seen = {};
    const articleRe = /<article\b[^>]*itemtype=["'][^"']*BlogPosting[^"']*["'][^>]*>[\s\S]*?<\/article>/gi;
    let m;
    while ((m = articleRe.exec(html))) {
        const block = m[0];
        if (/class=["'][^"']*ad-item/i.test(block)) continue;
        const href =
            firstMatch(block, /<a\b[^>]*href=["']([^"']*\/archives\/[^"']+)["'][^>]*>/i) ||
            firstMatch(block, /<meta\b[^>]*itemprop=["'][^"']*url[^"']*["'][^>]*content=["']([^"']+)["']/i);
        const title =
            firstMatch(block, /<h2[^>]*class=["'][^"']*post-card-title[^"']*["'][^>]*>([\s\S]*?)<\/h2>/i) ||
            firstMatch(block, /<meta\b[^>]*itemprop=["']headline["'][^>]*content=["']([^"']+)["']/i);
        const poster =
            firstMatch(block, /loadBannerDirect\(\s*["']([^"']+)["']/i) ||
            firstMatch(block, /<meta\b[^>]*itemprop=["']image["'][^>]*content=["']([^"']+)["']/i);
        if (!href || !title) continue;
        const url = absUrl(href, BASE_URL);
        if (seen[url]) continue;
        seen[url] = 1;
        items.push({
            vod_id: url,
            vod_name: cleanText(title),
            vod_pic: proxyCover(poster),
            vod_remarks: '',
            ext: { id: url },
        });
    }
    return items;
}

function extractVideoUrl(html) {
    let cfgText = firstMatch(html, /<div\b[^>]*class=["'][^"']*dplayer[^"']*["'][^>]*data-config=(["'])([\s\S]*?)\1/i, 2);
    if (cfgText) {
        try {
            const cfg = JSON.parse(decodeHtml(cfgText));
            if (cfg && cfg.video && cfg.video.url) return cfg.video.url;
        } catch (e) {
            const u = firstMatch(cfgText, /"url"\s*:\s*"([^"]+)"/i);
            if (u) return u.replace(/\\\//g, '/');
        }
    }
    const m3u8 = firstMatch(html, /["'](https?:\\?\/\\?\/[^"']+?\.m3u8[^"']*)["']/i);
    if (m3u8) return m3u8.replace(/\\\//g, '/');
    const mp4 = firstMatch(html, /["'](https?:\\?\/\\?\/[^"']+?\.mp4[^"']*)["']/i);
    if (mp4) return mp4.replace(/\\\//g, '/');
    return '';
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'xazd');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const path = id === 'latest'
        ? (page === 1 ? '/' : `/page/${page}/`)
        : (page === 1 ? `/category/${id}/` : `/category/${id}/${page}/`);
    const html = await fetchHtml(BASE_URL + path);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    if (!id) return jsonify({ list: [] });
    const url = id.startsWith('http') ? id : absUrl(id, BASE_URL);
    const html = await fetchHtml(url);
    const videoUrl = extractVideoUrl(html);
    const tracks = [];
    if (videoUrl) {
        tracks.push({ name: '正片', pan: '', ext: { id: absUrl(videoUrl, BASE_URL), flag: '八卦' } });
    }
    return jsonify({ list: tracks.length ? [{ title: '八卦', tracks }] : [] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.indexOf('$') >= 0) id = id.split('$').pop();
    const url = absUrl(id, BASE_URL);
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': BASE_URL + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!kw) return jsonify({ list: [] });
    const enc = encodeURIComponent(kw);
    const path = page === 1 ? `/search/${enc}/` : `/search/${enc}/${page}/`;
    const html = await fetchHtml(BASE_URL + path);
    return jsonify({ list: parseList(html) });
}
