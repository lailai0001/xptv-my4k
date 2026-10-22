// 肉视频 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/rou.js（py_rou）
// 站点 https://rou.video；依赖 Worker：rou-hls（https://rou-hls.li768435813.workers.dev，/v 拆包 PNG 包装 HLS）
//   + 官方镜像 https://rouvb1.xyz（/api 取清单，调用原样搬自猫版）。
// 未证实/降级项：无嗅探降级，播放为 Worker 产出 URL 直出（playForm=worker）；
//   decodeEv 的 Node Buffer base64 已改 CryptoJS.enc.Base64 对应件（本地 harness 已验）。
const cheerio = createCheerio();
const CryptoJS = createCryptoJS();

const HOST = 'https://rou.video';
const API_MIRROR_HOST = 'https://rouvb1.xyz';
const HLS_WORKER = 'https://rou-hls.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

const CLASSES = [
    { type_id: 'https://rou.video/t/國產AV', type_name: '國產AV' },
    { type_id: 'https://rou.video/t/探花', type_name: '探花' },
    { type_id: 'https://rou.video/t/自拍流出', type_name: '自拍流出' },
    { type_id: 'https://rou.video/t/OnlyFans', type_name: 'OnlyFans' },
    { type_id: 'https://rou.video/t/日本', type_name: '日本' },
    { type_id: 'https://rou.video/t/韩国', type_name: '韩国' },
    { type_id: 'https://rou.video/t/欧美', type_name: '欧美' },
    { type_id: 'https://rou.video/t/网红', type_name: '网红' },
    { type_id: 'https://rou.video/t/动漫', type_name: '动漫' },
    { type_id: 'https://rou.video/t/偷拍', type_name: '偷拍' },
    { type_id: 'https://rou.video/t/主播', type_name: '主播' },
    { type_id: 'https://rou.video/t/无码', type_name: '无码' },
];

const appConfig = {
    ver: 1,
    title: '肉视频',
    site: HOST,
    tabs: CLASSES.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function headers() {
    return { 'User-Agent': UA, Referer: HOST + '/' };
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

async function getHtml(url) {
    try {
        const { data } = await $fetch.get(url, { headers: headers() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseCards(html) {
    const cards = [];
    if (!html) return cards;
    const $ = cheerio.load(html);
    $('a.group[href^="/v/"]').each((_, element) => {
        const el = $(element);
        const href = el.attr('href') || '';
        if (!href) return;
        const title = el.find('h3').first().text().trim() || el.find('img').last().attr('alt') || '';
        const cover = el.find('img').first().attr('src') || '';
        const badge = el.find('.relative span').first().text().trim();
        const duration = el.find('.relative .ml-auto').first().text().trim();
        const remarks = [badge, duration].filter(Boolean).join(' · ');
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks,
            ext: { id: href },
        });
    });
    return cards;
}

// 猫版 Buffer.from(ev.d,'base64').toString('binary') 的 CryptoJS 等价：逐字节取 WordArray
function decodeEv(ev) {
    const wa = CryptoJS.enc.Base64.parse(ev.d);
    let decoded = '';
    for (let i = 0; i < wa.sigBytes; i++) {
        const byte = (wa.words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        decoded += String.fromCharCode(byte - ev.k);
    }
    return JSON.parse(decoded);
}

function extractEv(html) {
    let m = html.match(/ev:\$R\[\d+\]=\{d:"((?:[^"\\]|\\.)*)",k:(\d+)\}/);
    if (m) {
        const d = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        return { d, k: parseInt(m[2], 10) };
    }
    const nm = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (nm) {
        try {
            const ev = JSON.parse(nm[1]).props.pageProps.ev;
            if (ev && ev.d) return ev;
        } catch (e) {}
    }
    return null;
}

async function getPlayurl(detailUrl) {
    const html = await getHtml(detailUrl);
    if (!html) return '';
    try {
        const ev = extractEv(html);
        if (!ev) return '';
        return absUrl(decodeEv(ev).videoUrl || '');
    } catch (e) {
        return '';
    }
}

function toWorkerUrl(rawUrl, ref) {
    const u = absUrl(rawUrl);
    if (!u) return '';
    if (u.startsWith(HLS_WORKER)) return u;
    let api = u;
    try {
        const p = new URL(u);
        if (p.pathname.startsWith('/api/hls/')) {
            api = API_MIRROR_HOST + p.pathname + p.search;
            if (!ref) ref = HOST + '/v/' + p.pathname.split('/').pop();
        }
    } catch (e) {}
    return `${HLS_WORKER}/v?u=${encodeURIComponent(api)}&ref=${encodeURIComponent(ref || HOST + '/')}`;
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
    let url = String(ext.tid || CLASSES[0].type_id);
    if (page > 1) url += `?order=createdAt&page=${page}`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    if (!id) return jsonify({ list: [] });
    const url = absUrl(id);
    const rawPlayurl = await getPlayurl(url);
    if (!rawPlayurl) return jsonify({ list: [] });
    const playurl = toWorkerUrl(rawPlayurl, url);
    return jsonify({ list: buildGroups('肉视频', `播放$${playurl}`) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = String(ext.id || '');
    const i = url.lastIndexOf('$');
    if (i >= 0 && !url.includes('://')) url = url.slice(i + 1);
    if (!url) return jsonify({ urls: [], headers: [] });
    let finalUrl;
    if (url.startsWith(HLS_WORKER)) {
        finalUrl = url;
    } else {
        finalUrl = toWorkerUrl(absUrl(url.replace('.jpg', '.m3u8')));
    }
    return jsonify({ urls: [finalUrl], headers: [headers()] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${HOST}/search?q=${encodeURIComponent(wd)}&t=&page=${page}`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}
