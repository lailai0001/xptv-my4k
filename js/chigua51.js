// 51吃瓜 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/chigua51.js（py_51chigua，现行猫版为准）
// 站点 https://bus.qkvsednb.cc；封面走 51chigua Worker 只做封面解密（调用原样保留）；
// 播放为详情页内 m3u8/mp4 直链直出。
const HOST = 'https://bus.qkvsednb.cc';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IMG_PROXY = 'https://51chigua.li768435813.workers.dev/img?url=';

const CLASSES = [
    { tid: 'wpcz', name: '今日吃瓜' },
    { tid: 'rdsj', name: '热门大瓜' },
    { tid: 'bkdg', name: '必看大瓜' },
    { tid: 'mrdg', name: '吃瓜榜单' },
    { tid: '51djc', name: '51剧场' },
    { tid: '51hd', name: '往期活动' },
    { tid: 'cbdj', name: 'AI成人短剧' },
    { tid: 'ysyl', name: '成人视频' },
    { tid: 'gcjq', name: '国产视频' },
    { tid: 'thjx', name: '探花精选' },
    { tid: 'whhj', name: '网黄合集' },
    { tid: 'whhl', name: '网红黑料' },
    { tid: 'whmx', name: '明星爆料' },
    { tid: 'xsxy', name: '学生校园' },
    { tid: 'hwcg', name: '海外吃瓜' },
    { tid: 'rrcg', name: '人人吃瓜' },
    { tid: 'ldcg', name: '领导干部' },
    { tid: 'lldd', name: '伦理道德' },
    { tid: 'snsn', name: '骚男骚女' },
    { tid: 'jpll', name: '软萌甜妹' },
    { tid: 'sjb', name: '竞技吃瓜' },
    { tid: 'qubk', name: '吃瓜看戏' },
    { tid: 'dcbq', name: '擦边撩骚' },
    { tid: 'zzs', name: '性爱技巧' },
    { tid: 'mrds', name: '每日大赛' },
    { tid: 'yczq', name: '原创博主' },
    { tid: 'cgxw', name: '吃瓜新闻' },
];

const appConfig = {
    ver: 1,
    title: '51吃瓜',
    site: HOST,
    tabs: CLASSES.map((c) => ({ name: c.name, ext: { tid: c.tid } })),
};

/** 所有站点 CDN 图片（pic.*.cn）走 Worker 解密代理（同猫版） */
function proxyImgUrl(imgUrl) {
    if (!imgUrl) return '';
    if (/workers\.dev/i.test(imgUrl)) return imgUrl;
    if (/pic\.[a-z0-9]+\.cn/i.test(imgUrl)) {
        return IMG_PROXY + encodeURIComponent(imgUrl);
    }
    return imgUrl;
}

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': HOST + '/',
    };
}

async function getHtml(url) {
    try {
        const { data } = await $fetch.get(url, { headers: headers() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function t(v) { return String(v == null ? '' : v).trim(); }

function decodeHtml(s) {
    return t(s)
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

function listUrl(cat, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    cat = t(cat) || 'wpcz';
    const base = `${HOST}/category/${cat}/`;
    return page > 1 ? `${base}${page}/` : base;
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

/** 解析文章列表：post-card 结构，封面在 loadBannerDirect('URL',...)（同猫版） */
function parseList(html) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const blocks = html.split('<div class="post-card"');
    for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const am = b.match(/\/archives\/(\d+)\//);
        let vid = am ? am[1] : '';
        if (!vid || seen.has(vid)) continue;

        let title = '';
        const tm = b.match(/class="post-card-title"[^>]*>([\s\S]*?)<\/h2>/);
        if (tm) title = decodeHtml(tm[1].replace(/<[^>]+>/g, '')).trim();
        if (!title) continue;
        seen.add(vid);

        let pic = '';
        const pm = b.match(/loadBannerDirect\('([^']+)'/);
        if (pm) pic = pm[1];
        if (!pic) {
            const im = b.match(/<img[^>]+src="([^"]+)"/);
            if (im) pic = absUrl(im[1]);
        }

        let remarks = '';
        const dm = b.match(/datePublished"[^>]*content="([^"]+)"/) || b.match(/(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/);
        if (dm) remarks = dm[1].slice(0, 10);

        out.push({
            vod_id: vid,
            vod_name: title.slice(0, 80),
            vod_pic: proxyImgUrl(pic),
            vod_remarks: remarks,
            ext: { id: vid },
        });
    }
    return out;
}

/** 从详情页提取播放地址（同猫版 extractPlay） */
function extractPlay(html) {
    const sources = [];
    const seen = new Set();
    function add(url, name) {
        url = t(url).replace(/\\\//g, '/');
        if (!url || seen.has(url)) return;
        if (!/^https?:\/\//i.test(url)) return;
        seen.add(url);
        sources.push({ name: name || '播放', url });
    }
    (html.match(/https?:(?:\\?\/\\?\/)[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || []).forEach((u) => add(u, 'HLS'));
    (html.match(/https?:(?:\\?\/\\?\/)[^"'\s<>]+\.mp4[^"'\s<>]*/gi) || []).forEach((u) => add(u, 'MP4'));
    const fields = html.match(/["'](?:url|play_url|playUrl|src|file|videoUrl)["']\s*:\s*["'](https?:(?:\\?\/\\?\/)[^"']+)["']/gi) || [];
    fields.forEach((f) => {
        const um = f.match(/https?:(?:\\?\/\\?\/)[^"']+/);
        if (um) {
            const u = um[0];
            if (/\.m3u8/i.test(u)) add(u, 'HLS');
            else if (/\.mp4/i.test(u)) add(u, 'MP4');
        }
    });
    (html.match(/<source[^>]+src="([^"]+)"/gi) || []).forEach((s) => {
        const um = s.match(/src="([^"]+)"/);
        if (um) add(absUrl(um[1]), '视频');
    });
    return sources;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.tid || 'wpcz').replace(/^\/category\//, '').replace(/\/$/, '');
    const html = await getHtml(listUrl(id, page));
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = ext.id;
    const m = String(raw || '').match(/(\d+)/);
    const vid = m ? m[1] : String(raw || '').trim();
    if (!vid) return jsonify({ list: [] });
    const pageUrl = `${HOST}/archives/${vid}/`;
    const html = await getHtml(pageUrl);
    if (!html) return jsonify({ list: [] });
    const sources = extractPlay(html);
    const eps = [];
    const seen = new Set();
    for (const s of sources) {
        if (seen.has(s.url)) continue;
        seen.add(s.url);
        eps.push(`${String(s.name || '正片').replace(/[$#]/g, '_')}$${s.url}`);
    }
    if (!eps.length) return jsonify({ list: [] });
    return jsonify({ list: buildGroups('51吃瓜', eps.join('#')) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = String(ext.id || '');
    if (url.includes('$') && !url.includes('://')) url = url.split('$').pop().trim();
    return jsonify({
        urls: url ? [url] : [],
        headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${HOST}/search/${encodeURIComponent(wd)}/${page > 1 ? `page/${page}/` : ''}`;
    const html = await getHtml(url);
    return jsonify({ list: parseList(html) });
}
