// 818黑料网 - XPTV csp 格式（csp_818hl）
// 转换自 mira-cat nodejs/src/spider/video/hl818.js（py_818hl）。站点 https://cell.lacdfsq.cc/
// 封面走 bagua-img-proxy 解密代理出图（纯字符串拼接，原样保留）。
// 播放：dplayer 直链 parse:0 直出；仅有观看链接时为网页 URL（嗅探型播放降级：回源页 URL，待真机验）。
const HOST = 'https://cell.lacdfsq.cc/';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';

const appConfig = {
    ver: 1,
    title: '818黑料网',
    site: HOST,
    tabs: [
        { name: '最新', ext: { tid: '/latest/' } },
        { name: '热门', ext: { tid: '/hot/' } },
    ],
};

function H() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': HOST,
        'Origin': HOST.replace(/\/$/, ''),
    };
}

function proxyCover(url) {
    url = String(url || '').trim();
    if (!url) return '';
    if (url.indexOf('data:') === 0) return url;
    if (url.indexOf('bagua-img-proxy') >= 0) return url;
    return IMG_PROXY + encodeURIComponent(url);
}

async function getText(url) {
    try {
        const { data } = await $fetch.get(url, { headers: H() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function imgOf(html) {
    const clean = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    let m = clean.match(/z-image-loader-url\s*=\s*"([^"]+)"/i);
    if (m && /^https?:\/\//i.test(m[1])) return m[1];
    m = clean.match(/<img[^>]*class="[^"]*blog-background[^"]*"[^>]*>/i);
    if (m) {
        const sm = m[0].match(/(?:z-image-loader-url|data-src|src)\s*=\s*"([^"]+)"/i);
        if (sm && /^https?:\/\//i.test(sm[1]) && !/data:image/i.test(sm[1])) return sm[1];
    }
    m = clean.match(/https?:\/\/[^"'\s)]+\.(?:jpg|png|jpeg|webp)/i);
    if (m) return m[0];
    m = clean.match(/url\s*\(\s*['"]?([^"'\)]+)['"]?\s*\)/i);
    if (m) {
        const u = m[1].trim();
        if (/^https?:\/\//i.test(u)) return u;
    }
    return '';
}

function parseArticles(html) {
    const items = [];
    if (!html) return items;
    const re = /<article[\s\S]{0,3000}?<\/article>/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(html)) !== null) {
        const blk = m[0];
        const a = blk.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
        if (!a) continue;
        const href = a[1].trim();
        if (!href || href === '#' || seen.has(href)) continue;
        seen.add(href);
        const t = blk.match(/<h2[^>]*>([^<]{2,120})<\/h2>/i)
            || blk.match(/class="entry-title"[^>]*>([^<]{2,120})/i)
            || blk.match(/class="post-title"[^>]*>([^<]{2,120})/i);
        const title = t ? t[1].trim() : '';
        if (!title) continue;
        const tm = blk.match(/<time[^>]*>([^<]{2,40})<\/time>/i);
        items.push({
            vod_id: href,
            vod_name: title,
            vod_pic: proxyCover(imgOf(blk)),
            vod_remarks: tm ? tm[1].trim() : '',
            ext: { id: href },
        });
        if (items.length >= 30) break;
    }
    return items;
}

function parseCategories(html) {
    const items = [];
    const re = /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]{2,20})<\/a>\s*<\/li>/gi;
    const seen = new Set();
    let m;
    while ((m = re.exec(html)) !== null) {
        const href = m[1].trim(), name = m[2].trim();
        if (!href || href === '#' || !name || seen.has(href)) continue;
        seen.add(href);
        items.push({ name, ext: { tid: href } });
    }
    return items;
}

function buildGroups(vod) {
    const froms = String(vod.vod_play_from || '').split('$$$');
    const urlGroups = String(vod.vod_play_url || '').split('$$$');
    const list = [];
    urlGroups.forEach((g, gi) => {
        const flag = froms[gi] || froms[0] || '在线播放';
        const tracks = [];
        g.split('#').forEach((item) => {
            const idx = item.indexOf('$');
            if (idx < 0) return;
            const name = item.slice(0, idx) || '播放';
            const pid = item.slice(idx + 1);
            if (!pid) return;
            tracks.push({ name, pan: '', ext: { id: pid, flag } });
        });
        if (tracks.length) list.push({ title: flag, tracks });
    });
    return list;
}

async function getConfig() {
    const cfg = JSON.parse(JSON.stringify(appConfig));
    try {
        const html = await getText(HOST);
        const tabs = parseCategories(html);
        if (tabs.length) cfg.tabs = tabs;
    } catch (e) {}
    return jsonify(cfg);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (tid.includes('@folder')) {
        const raw = tid.replace('@folder', '');
        const url = raw.startsWith('http') ? raw : HOST.replace(/\/$/, '') + raw;
        const html = await getText(url);
        const videos = [];
        const re = /<h2[^>]*>([^<]{2,120})<\/h2>[\s\S]{0,500}?<a[^>]*href="([^"]+)"[^>]*>/gi;
        let m;
        while ((m = re.exec(html)) !== null) {
            videos.push({ vod_id: m[2], vod_name: m[1].trim(), vod_pic: '', vod_remarks: '', ext: { id: m[2] } });
            if (videos.length >= 60) break;
        }
        return jsonify({ list: videos });
    }
    let base;
    if (/^https?:\/\//i.test(tid)) base = tid.replace(/\/+$/, '');
    else base = (HOST.replace(/\/$/, '') + '/' + tid.replace(/^\/+/, '')).replace(/\/+$/, '');
    const url = page === 1 ? (base + '/') : (base + '/' + page + '/');
    const html = await getText(url);
    return jsonify({ list: parseArticles(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = String(ext.id || '');
    if (!raw) return jsonify({ list: [] });
    const url = /^https?:\/\//i.test(raw) ? raw : HOST.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
    const html = await getText(url);
    const plist = [];
    const dre = /class="dplayer"[^>]*data-config='([^']+)'/gi;
    let m;
    let c = 0;
    while ((m = dre.exec(html)) !== null) {
        c++;
        try {
            const cfg = JSON.parse(m[1]);
            const vu = (cfg && cfg.video && cfg.video.url) || '';
            if (vu) plist.push('视频' + c + '$' + vu);
        } catch (e) {}
    }
    if (!plist.length) {
        const lre = /<a[^>]*href="([^"]+)"[^>]*>([^<]*(?:点击观看|观看|播放|视频|第一弹|第二弹|第三弹)[^<]*)<\/a>/gi;
        let i = 0;
        while ((m = lre.exec(html)) !== null) {
            i++;
            let href = m[1].trim();
            const name = m[2].replace(/点击观看[：:]/, '').replace(/点击观看/, '').trim() || ('视频' + i);
            if (!/^https?:\/\//i.test(href)) {
                href = HOST.replace(/\/$/, '') + (href.startsWith('/') ? href : '/' + href);
            }
            plist.push(name + '$' + href);
        }
    }
    const vod = {
        vod_play_from: '818黑料网',
        vod_play_url: plist.length ? plist.join('#') : ('未找到视频源$' + url),
    };
    return jsonify({ list: buildGroups(vod) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').trim();
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    // 媒体直链 parse:0 直出；网页 URL 为嗅探型降级（见文件头注）
    return jsonify({ urls: [id], headers: [H()] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = page === 1
        ? (HOST + 'search/' + encodeURIComponent(wd) + '/')
        : (HOST + 'search/' + encodeURIComponent(wd) + '/' + page + '/');
    const html = await getText(url);
    return jsonify({ list: parseArticles(html) });
}
