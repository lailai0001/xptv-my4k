// GetAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/getav.js（py_getav）
// 站点 https://getav.me，无站外依赖；纯正则解析（无 cheerio）。
// 搜索页卡片版式与分类页不同（2026-10-22 实测：标题在 img alt、无 title 属性的第二锚点），
// 猫版两套正则在搜索页均 0 命中，parseCards 增第三兜底（img alt 型）仅在前两套为空时触发。
// 播放：详情页内嵌 videoSources 多清晰度 worldstatic m3u8 直出（parse:0 等价）；
// 无 videoSources 时猫版落 parse:1 嗅探视频页——XPTV 无嗅探位，降级为回视频页 URL，
// 文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
const HOST = 'https://getav.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const CATS = {
    'new': { path: '/zh/new-releases', name: '最新' },
    'hot': { path: '/zh/hot', name: '热门' },
    'uncensored': { path: '/zh/uncensored', name: '无码' },
    'censored': { path: '/zh/censored', name: '有码' },
    'subtitle': { path: '/zh/subtitle', name: '字幕' },
    'series': { path: '/zh/series', name: '系列' },
    'studios': { path: '/zh/studios', name: '片商' },
};

const appConfig = {
    ver: 1,
    title: 'GetAV',
    site: HOST,
    tabs: Object.keys(CATS).map((k) => ({ name: CATS[k].name, ext: { tid: k } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    s = t(s);
    if (!s) return '';
    return s
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

async function fetchHtml(path) {
    const url = path.startsWith('http') ? path : HOST + path;
    const headers = {
        'User-Agent': UA,
        'Referer': HOST + '/zh',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data } = await $fetch.get(url, { headers });
            const s = typeof data === 'string' ? data : String(data || '');
            if (s.length > 500) return s;
        } catch (e) { /* retry */ }
    }
    return '';
}

function parseCards(html) {
    const list = [];
    const seen = {};
    if (!html) return list;
    const cardRe = /<div class="group cursor-pointer[\s\S]*?<a[^>]*href="(\/zh\/videos\/[\w\-]+)"[^>]*>([\s\S]*?)<\/a>\s*<a[^>]*href="\/zh\/videos\/[\w\-]+"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = cardRe.exec(html))) {
        const href = m[1];
        const imgBlock = m[2];
        const titleBlock = m[3];
        if (seen[href]) continue;
        const tm = titleBlock.match(/title="([^"]+)"/i);
        const title = tm ? decodeHtml(tm[1]) : '';
        if (!title) continue;
        seen[href] = 1;
        let pic = '';
        const im = imgBlock.match(/<img[^>]*src="([^"]+)"/i);
        if (im) {
            pic = im[1].replace(/&amp;/g, '&');
            if (pic.startsWith('//')) pic = 'https:' + pic;
        }
        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: '',
            ext: { id: href },
        });
    }
    if (!list.length) {
        const re = /<a href="(\/zh\/videos\/[\w\-]+)">([\s\S]*?)<\/a>/gi;
        while ((m = re.exec(html))) {
            const href = m[1];
            const inner = m[2];
            if (seen[href]) continue;
            const tm = inner.match(/title="([^"]+)"/i);
            const title = tm ? decodeHtml(tm[1]) : '';
            if (!title) continue;
            seen[href] = 1;
            let pic = '';
            const im = inner.match(/<img[^>]*src="([^"]+)"/i);
            if (im) pic = im[1].replace(/&amp;/g, '&');
            list.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: '', ext: { id: href } });
        }
    }
    // Fallback 3: 搜索页新版式——<a href><div...><img src alt="完整标题">
    if (!list.length) {
        const re3 = /<a[^>]*href="(\/zh\/videos\/[\w\-]+)"[^>]*>(?:(?!<a )[\s\S])*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]+)"/gi;
        while ((m = re3.exec(html))) {
            const href = m[1];
            if (seen[href]) continue;
            const title = decodeHtml(m[3]);
            if (!title) continue;
            seen[href] = 1;
            let pic = m[2].replace(/&amp;/g, '&');
            if (pic.startsWith('//')) pic = 'https:' + pic;
            list.push({ vod_id: href, vod_name: title, vod_pic: pic, vod_remarks: '', ext: { id: href } });
        }
    }
    return list;
}

const QUALITY_ORDER = ['raw_1080p', 'raw_720p', 'raw_480p', 'raw_240p'];
const QUALITY_NAME = { raw_1080p: '1080P', raw_720p: '720P', raw_480p: '480P', raw_240p: '240P' };

function parseVideoSources(html) {
    const tracks = [];
    if (!html) return tracks;
    const m = html.match(/\\"videoSources\\":\[(.*?)\],\\"/s);
    if (!m) return tracks;
    const seen = {};
    const re = /\\"type\\":\\"([^"\\]+)\\",\\"url\\":\\"([^"\\]+)/g;
    let mm;
    while ((mm = re.exec(m[1])) !== null) {
        const type = mm[1];
        if (seen[type]) continue;
        seen[type] = 1;
        tracks.push({ type, url: mm[2].replace(/\\u0026/g, '&') });
    }
    tracks.sort((a, b) => {
        const ia = QUALITY_ORDER.indexOf(a.type);
        const ib = QUALITY_ORDER.indexOf(b.type);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return tracks;
}

// 猫 detail 的 vod_play_from/vod_play_url → 线路组/tracks（playId 原样透传）
function buildGroups(playFrom, playUrl) {
    const froms = String(playFrom || '').split('$$$').map((s) => s.trim()).filter(Boolean);
    const urlGroups = String(playUrl || '').split('$$$');
    const groups = [];
    const n = Math.max(froms.length, urlGroups.length);
    for (let i = 0; i < n; i++) {
        const title = froms[i] || '在线播放';
        const tracks = [];
        const seg = urlGroups[i] || '';
        if (seg) {
            for (const ep of seg.split('#')) {
                if (!ep) continue;
                const idx = ep.indexOf('$');
                const name = idx >= 0 ? ep.slice(0, idx) : ep;
                const pid = idx >= 0 ? ep.slice(idx + 1) : ep;
                tracks.push({ name: name || '播放', pan: '', ext: { id: pid, flag: title } });
            }
        }
        if (tracks.length) groups.push({ title, tracks });
    }
    return groups;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'new');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = CATS[tid] || CATS['new'];
    const html = await fetchHtml(`${cat.path}?page=${page}`);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    let groups = [];
    if (id) {
        const html = await fetchHtml(id);
        if (html) {
            const tracks = parseVideoSources(html);
            let playUrl;
            if (tracks.length) {
                playUrl = tracks.map((tr) => `${QUALITY_NAME[tr.type] || tr.type}$${tr.url}`).join('#');
            } else {
                playUrl = `播放$${id}`;
            }
            groups = buildGroups('GetAV', playUrl);
        }
    }
    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (/\$/.test(id)) id = id.split('$').pop().trim();
    const header = { Referer: HOST + '/zh', 'User-Agent': UA };
    if (/^https?:\/\//i.test(id) && /worldstatic\.com/i.test(id)) {
        return jsonify({ urls: [id], headers: [header] });
    }
    // 嗅探降级：回视频页 URL（同猫版 parse:1）
    const pageUrl = id.startsWith('http') ? id : HOST + id;
    return jsonify({ urls: [pageUrl], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const html = await fetchHtml(`/zh/search?q=${encodeURIComponent(wd)}&page=${page}`);
    let list = parseCards(html);
    if (!list.length) {
        const html2 = await fetchHtml(`/zh/search/${encodeURIComponent(wd)}?page=${page}`);
        list = parseCards(html2);
    }
    return jsonify({ list });
}
