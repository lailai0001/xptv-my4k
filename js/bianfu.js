// 蝙蝠视频 - XPTV csp 格式（csp_bianfu）
// 转换自 mira-cat nodejs/src/spider/video/bianfu.js（py_bianfu）。站点 https://257915.xyz
// 页面混淆为「反转 base64」，解码用纯 JS 实现（替代 Node Buffer）；播放在线为 HLS 直链，磁力条目原样透传 magnet。
const SITE = 'https://257915.xyz';
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-S9080) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

const CATS = [
    ['home', '首页推荐'], ['64360061', '中文字幕'], ['64370061', '网红主播'], ['64380061', '成人动漫'],
    ['64390061', '欧美情色'], ['64400061', '国模私拍'], ['64430061', '韩国伦理'], ['64170061', '国产情色'],
    ['64180061', '日本无码'], ['64170041', '日韩无码'], ['64190041', '欧美精品'], ['64200041', '国产精品'],
    ['64360041', '动漫精品'], ['64390041', '日韩精品'], ['64430041', '自拍偷拍'], ['64580041', '大秀视频'],
    ['64360111', '精品推荐'], ['64380111', '国产色情'], ['64630111', '91探花'], ['64750111', '传媒出品'],
    ['64170031', '国产自拍'], ['64180031', '欧美极品'], ['64380031', '极骚萝莉'], ['64169922', '国产专区(磁力)'],
    ['64179922', '日本有码(磁力)'], ['64189922', '日本无码(磁力)'], ['64199922', '欧美色情(磁力)'],
    ['64209922', '传媒作品(磁力)'], ['64180121', '麻豆传媒'],
];

const appConfig = {
    ver: 1,
    title: '蝙蝠视频',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.indexOf('http') === 0) return u;
    if (u.charAt(0) === '/') return SITE + u;
    return SITE + '/' + u;
}

// base64 → UTF-8 字符串（纯 JS 实现）
function b64decode(str) {
    str = t(str).replace(/[\r\n\s]/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
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

function reverseStr(s) {
    return s.split('').reverse().join('');
}

function cleanText(s) {
    return t(s).replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ');
}

async function fetchPage(url) {
    let html = '';
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': SITE + '/',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });
        html = typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
    if (!html) return '';
    const m = html.match(/\w+\('([A-Za-z0-9+/=]{1000,})/);
    let page = html;
    if (m) {
        try {
            const raw = b64decode(reverseStr(m[1]));
            const idx = raw.indexOf('<!DOCTYPE') >= 0 ? raw.indexOf('<!DOCTYPE') : raw.indexOf('<html');
            page = idx >= 0 ? raw.slice(idx) : raw;
        } catch (e) { page = html; }
    }
    page = page.replace(/document\.write\(d\('([^']+)'\)\);/g, (_, b64) => {
        try { return b64decode(b64); } catch (e) { return ''; }
    });
    page = page.replace(/<span[^>]*?display\s*:\s*none[^>]*?>[\s\S]*?<\/span>/gi, '');
    return page;
}

function parseList(html) {
    const items = [];
    const seen = {};
    if (!html) return items;
    const blocks = html.split(/<dl>/i);
    for (let i = 1; i < blocks.length; i++) {
        const dl = (blocks[i].split(/<\/dl>/i)[0]) || '';
        const am = dl.match(/href="((?:\/video\.php|\/torrent\.php)\?id=\d+)"/i);
        if (!am) continue;
        const path = am[1];
        if (seen[path]) continue;
        seen[path] = 1;
        const im = dl.match(/<img[^>]+src="([^"]+)"/i);
        const pic = im ? im[1] : '';
        const tm = dl.match(/<h3>([\s\S]*?)<\/h3>/i);
        const name = cleanText(tm ? tm[1] : '');
        if (!name || name.length > 120) continue;
        items.push({
            vod_id: 'bf:' + path,
            vod_name: name,
            vod_pic: absUrl(pic),
            vod_remarks: path.indexOf('torrent') >= 0 ? '磁力' : '',
            ext: { id: 'bf:' + path },
        });
    }
    return items;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let html;
    if (!tid || tid === 'home') {
        html = page > 1
            ? await fetchPage(SITE + '/list.php?id=64360061&page=' + page)
            : await fetchPage(SITE + '/');
    } else {
        html = await fetchPage(SITE + '/list.php?id=' + encodeURIComponent(tid) + '&page=' + page);
    }
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    const path = id.replace(/^bf:/, '');
    if (!path) return jsonify({ list: [] });
    const html = await fetchPage(absUrl(path));
    const tracks = [];
    if (path.indexOf('torrent') >= 0) {
        const mm = html.match(/magnet:\?[^\s"'<>]+/i);
        if (mm) tracks.push({ name: '磁力', pan: '', ext: { id: mm[0], flag: '磁力' } });
        return jsonify({ list: tracks.length ? [{ title: '磁力', tracks }] : [] });
    }
    const m2 = html.match(/playFilteredHLS\s*\(\s*['"]video['"]\s*,\s*['"]([^'"]+)['"]/i);
    if (m2) tracks.push({ name: '在线', pan: '', ext: { id: t(m2[1]), flag: '在线' } });
    return jsonify({ list: tracks.length ? [{ title: '在线', tracks }] : [] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    const idx = id.indexOf('$');
    const url = t(idx >= 0 ? id.slice(idx + 1) : id);
    if (!url) return jsonify({ urls: [], headers: [] });
    if (url.indexOf('magnet:') === 0) return jsonify({ urls: [url], headers: [] });
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': SITE + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    if (!kw) return jsonify({ list: [] });
    const out = [];
    const seen = {};
    for (let ti = 0; ti < 2; ti++) {
        const url = SITE + '/search.php?content=' + encodeURIComponent(kw) + '&type=' + (ti + 1);
        try {
            const html = await fetchPage(url);
            for (const it of parseList(html)) {
                if (!seen[it.vod_id]) { seen[it.vod_id] = 1; out.push(it); }
            }
        } catch (e) {}
    }
    return jsonify({ list: out });
}
