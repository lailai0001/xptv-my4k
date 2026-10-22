// 57吃瓜 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/chigua57.js（py_chigua57）
// 站点 https://57cg4.com；依赖 Worker：57chigua 封面代理
//   （https://57chigua.li768435813.workers.dev/img?url= ，封面解密/透传，调用原样搬自猫版）。
// 未证实/降级项：无嗅探降级；播放为详情页 m3u8/mp4 直链直出（playForm=direct）。
const HOST = 'https://57cg4.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://57chigua.li768435813.workers.dev/img?url=';

const CLASSES = [
    { type_id: 'hot', type_name: '热门' },
    { type_id: 'home', type_name: '首页最新' },
    { type_id: 'jrcg', type_name: '今日吃瓜' },
    { type_id: 'mrds', type_name: '每日大赛' },
    { type_id: 'wanghong', type_name: '网红黑料' },
    { type_id: 'video', type_name: '网黄合集' },
    { type_id: 'cheating', type_name: '出轨劈腿' },
    { type_id: 'live', type_name: '直播擦边' },
    { type_id: 'aichengduanju', type_name: '成人AI短剧' },
    { type_id: 'society', type_name: '社会事件' },
    { type_id: 'star', type_name: '明星八卦' },
];

const appConfig = {
    ver: 1,
    title: '57吃瓜',
    site: HOST,
    tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function headers() {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function cleanTitle(title) {
    const raw = decodeHtml(title);
    if (!raw) return '';
    const prefixes = [
        'AI成人短剧', '成人AI短剧', '每日大赛', '今日吃瓜', '网红黑料',
        '网黄合集', '出轨劈腿', '直播擦边', '社会事件', '明星八卦',
        '热门事件', '热门', '每日大',
    ];
    let out = raw, changed = true;
    while (changed) {
        changed = false;
        out = t(out);
        for (const p of prefixes) {
            if (out.indexOf(p) === 0) {
                out = out.slice(p.length).replace(/^[\s\-_|｜·:：]+/, '');
                changed = true;
                break;
            }
        }
    }
    out = t(out);
    return out || raw;
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

function proxyImgUrl(imgUrl) {
    if (!imgUrl) return '';
    if (/workers\.dev/i.test(imgUrl)) return imgUrl;
    return IMG_PROXY + encodeURIComponent(imgUrl);
}

function listUrl(cat, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    cat = t(cat) || 'hot';
    if (cat === 'home' || cat === '') {
        return page <= 1 ? HOST + '/' : HOST + '/page/' + page + '/';
    }
    const path = HOST + '/' + cat + '/';
    return page > 1 ? path + '?page=' + page : path;
}

function parseList(html) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    const re = /<a[^>]+href="\/events\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        const body = m[0];
        let im = body.match(/(?:src|data-src|data-original)=["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (!im) im = body.match(/(?:src|data-src)=["'](\/[^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
        if (!im) continue;
        seen.add(id);
        let title = '';
        let tm = body.match(/alt=["']([^"']{2,200})["']/i)
            || body.match(/title=["']([^"']{2,200})["']/i)
            || body.match(/<h[123][^>]*>([^<]{2,200})<\/h/i);
        if (tm) title = cleanTitle(tm[1]);
        if (!title) title = '事件 ' + id;
        const cover = absUrl(im[1]);
        out.push({
            vod_id: id,
            vod_name: title,
            vod_pic: proxyImgUrl(cover),
            vod_remarks: '',
            ext: { id: id },
        });
    }
    return out;
}

function extractPlay(html) {
    const sources = [];
    const seen = new Set();
    function add(url, name) {
        url = t(url);
        if (!url || seen.has(url)) return;
        if (!/^https?:\/\//i.test(url)) return;
        seen.add(url);
        sources.push({ name: name || '播放', url });
    }
    const m3 = html.match(/https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*/gi) || [];
    m3.forEach((u) => add(u, 'HLS'));
    const mp = html.match(/https?:\/\/[^"'\s<>]+\.mp4[^"'\s<>]*/gi) || [];
    mp.forEach((u) => add(u, 'MP4'));
    const fields = html.match(/["'](?:url|play_url|playUrl|src|file|video)["']\s*:\s*["'](https?:\/\/[^"']+)["']/gi) || [];
    fields.forEach((f) => {
        const um = f.match(/https?:\/\/[^"']+/);
        if (um) {
            const u = um[0];
            if (/\.m3u8/i.test(u)) add(u, 'HLS');
            else if (/\.mp4/i.test(u)) add(u, 'MP4');
        }
    });
    return sources;
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
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const id = String(ext.tid || 'hot');
    const html = await getHtml(listUrl(id, page));
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = ext.id;
    let vid = String(raw || '').match(/events\/(\d+)/)?.[1] || String(raw || '').replace(/[^0-9]/g, '');
    if (!vid) vid = String(raw || '');
    if (!vid) return jsonify({ list: [] });
    const pageUrl = `${HOST}/events/${vid}/`;
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
    return jsonify({ list: buildGroups('57吃瓜', eps.join('#')) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.id || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = `${HOST}/search/?q=${encodeURIComponent(wd)}`;
    if (page > 1) url += `&page=${page}`;
    const html = await getHtml(url);
    return jsonify({ list: parseList(html) });
}
