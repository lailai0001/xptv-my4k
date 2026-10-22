// JavGG - XPTV csp 格式（csp_javgg）
// 转换自 mira-cat nodejs/src/spider/video/javgg.js（py_javgg）。站点 https://javgg.net（备用 https://javgg.co）。
// 依赖 Worker：javgg-vidhide（https://javgg-vidhide.li768435813.workers.dev）—— vidhide 系全链代理，
// getPlayinfo 返回 Worker /v 产出的 URL 原样直出（playForm=worker 主链之一）。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）：playmate/vidara 的 POST JSON 逐字保持猫侧线格式。
// 嗅探型播放降级：回源页 URL，待真机验 —— 猫版 parse:1 嗅探（vidhide 无 Worker 时 / f4 / other / 无线路时回详情页）
// 在 XPTV 无嗅探位，降级为 urls:[embed/详情页 URL]。
// 猫版竞速（bestWithin/settleWithin + setTimeout 宽限/预算）按规范改串行：playmate/vidara 按优先级顺序逐个试；
// 线路收集 3 个 dooplayer API 改 Promise.all 并行（无 setTimeout 参与逻辑）。
// 猫版 Buffer base64url 改 createCryptoJS() 的 enc.Base64/Utf8 对应件（等价）。
const CryptoJS = createCryptoJS();

const SITE = 'https://javgg.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = SITE + '/';
const VIDHIDE_WORKER = 'https://javgg-vidhide.li768435813.workers.dev';

const CATS = [
  { type_id: 'latest', type_name: '最新', kind: 'path', url: '/new-post/' },
  { type_id: 'trending', type_name: '热门', kind: 'path', url: '/trending/' },
  { type_id: 'english-subtitle', type_name: '英字幕', kind: 'search', kw: 'english subtitle' },
  { type_id: 'chinese-subtitle', type_name: '中字幕', kind: 'search', kw: 'chinese subtitle' },
  { type_id: 'uncensored', type_name: '无码', kind: 'path', url: '/genre/uncensored/' },
  { type_id: 'hd-uncensored', type_name: '高清无码', kind: 'path', url: '/genre/hd-uncensored/' },
  { type_id: 'minimal-mosaic', type_name: '减码', kind: 'path', url: '/genre/minimal-mosaic/' },
  { type_id: 'digital-mosaic', type_name: '有码', kind: 'path', url: '/genre/digital-mosaic/' },
  { type_id: 'genre-4k', type_name: '4K', kind: 'path', url: '/genre/4k/' },
  { type_id: 'genre-3p', type_name: '3P', kind: 'path', url: '/genre/3p/' },
];

const appConfig = {
    ver: 1,
    title: 'JavGG',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }

function b64urlEncode(s) {
    return CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(String(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
    try {
        let b = String(s).replace(/-/g, '+').replace(/_/g, '/');
        while (b.length % 4) b += '=';
        return CryptoJS.enc.Base64.parse(b).toString(CryptoJS.enc.Utf8);
    } catch (e) { return ''; }
}

function clean(s) {
    return t(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&ndash;/g, '-').replace(/&mdash;/g, '-').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}
function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

async function getTextInner(url, headers, minLen) {
    const h = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': REFERER, ...(headers || {}) };
    const need = minLen || 500;
    try {
        const { data, status } = await $fetch.get(url, { headers: h });
        if ((status === undefined || status === 200) && data) {
            const txt = typeof data === 'string' ? data : JSON.stringify(data);
            if (txt && txt.length >= need) return txt;
        }
    } catch (e) {}
    return '';
}
async function getText(url, headers, minLen) {
    let txt = await getTextInner(url, headers, minLen);
    if (txt) return txt;
    if (url.includes('javgg.net')) {
        txt = await getTextInner(url.replace('javgg.net', 'javgg.co'), headers, minLen);
        if (txt) return txt;
    }
    return '';
}

async function postJson(url, body, headers) {
    const h = { 'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Referer': REFERER, ...(headers || {}) };
    try {
        const { data, status } = await $fetch.post(url, body, { headers: h });
        if ((status === undefined || status === 200) && data) {
            return typeof data === 'string' ? JSON.parse(data) : data;
        }
    } catch (e) {}
    return null;
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const push = (durl, pic, name) => {
        if (!durl || seen.has(durl)) return;
        seen.add(durl);
        out.push({ vod_id: durl, vod_name: name || durl, vod_pic: pic || '', vod_remarks: '', ext: { id: durl } });
    };
    let m;
    const re1 = /<article[^>]*class="[^"]*item movies[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
    while ((m = re1.exec(html)) !== null) {
        const card = m[1];
        const linkM = card.match(/<a[^>]*href="(https?:\/\/javgg\.(net|co)\/jav\/[^"]+\/)"/);
        if (!linkM) continue;
        const imgM = card.match(/<img[^>]*data-src="([^"]+)"/) || card.match(/<img[^>]*src="([^"]+)"/);
        const titleM = card.match(/<div class="titlecontent">([\s\S]*?)<\/div>/);
        const codeM = card.match(/<h3><a[^>]*>([^<]+)<\/a><\/h3>/);
        push(linkM[1], imgM ? fixUrl(imgM[1]) : '', titleM ? clean(titleM[1]) : (codeM ? clean(codeM[1]) : ''));
    }
    const re2 = /<div class="result-item">([\s\S]*?)<\/article>/g;
    while ((m = re2.exec(html)) !== null) {
        const card = m[1];
        const linkM = card.match(/<a[^>]*href="(https?:\/\/javgg\.(net|co)\/jav\/[^"]+\/)"/);
        if (!linkM) continue;
        const imgM = card.match(/<img[^>]*src="([^"]+)"/);
        const titleM = card.match(/<div class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);
        push(linkM[1], imgM ? fixUrl(imgM[1]) : '', titleM ? clean(titleM[1]) : '');
    }
    return out;
}

function catUrl(tid, page) {
    const cat = CATS.find(c => c.type_id === tid) || CATS[0];
    if (cat.kind === 'search') {
        let base = SITE + '/?s=' + encodeURIComponent(cat.kw);
        if (page > 1) base += '&paged=' + page;
        return base;
    }
    let base = SITE + cat.url;
    if (page > 1) base += 'page/' + page + '/';
    return base;
}

function classifyEmbed(embedUrl) {
    let host = '';
    try { host = new URL(embedUrl).hostname; } catch (e) { return null; }
    if (host.includes('playmate')) return { embedUrl, prio: 1, kind: 'playmate' };
    if (host.includes('shadowbyte') || host.includes('dstyladsg') || host.includes('vidara')) return { embedUrl, prio: 2, kind: 'vidara' };
    if (host.includes('earnvidjavgg') || host.includes('vidhide') || host.includes('streamhg')) return { embedUrl, prio: 3, kind: 'vidhide' };
    if (host.includes('f4jav') || host.includes('f4scdn') || /\/e\/[A-Za-z0-9]+/.test(embedUrl)) return { embedUrl, prio: 4, kind: 'f4' };
    return { embedUrl, prio: 99, kind: 'other' };
}

async function collectEmbeds(postId) {
    const fetchEmbed = async (srv) => {
        try {
            const apiText = await getText(`${SITE}/wp-json/dooplayer/v2/${postId}/movie/${srv}`, { 'Accept': 'application/json' }, 10);
            if (!apiText) return null;
            const embedUrl = t(JSON.parse(apiText).embed_url);
            if (!embedUrl || !/^https?:\/\//.test(embedUrl)) return null;
            return classifyEmbed(embedUrl);
        } catch (e) { return null; }
    };
    const embeds = (await Promise.all([1, 2, 3].map(fetchEmbed))).filter(Boolean);
    embeds.sort((a, b) => a.prio - b.prio);
    return embeds;
}

async function tryVidara(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = u.pathname.split('/').filter(Boolean).pop() || '';
        if (!code) return null;
        const resp = await postJson(u.origin + '/api/stream', { filecode: code, device: 'ios', codecs: ['h265'] }, { 'Referer': embedUrl, 'Origin': u.origin });
        const src = resp && t(resp.streaming_url || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return src;
    } catch (e) { return null; }
}
async function tryPlaymate(embedUrl) {
    try {
        const u = new URL(embedUrl);
        const code = u.pathname.split('/').filter(Boolean).pop() || '';
        if (!code) return null;
        const resp = await postJson(u.origin + '/api/s', { c: code, d: 'web' }, { 'Referer': embedUrl });
        const src = resp && t(resp.sx || resp.src || resp.url);
        if (!src || !/^https?:\/\//.test(src)) return null;
        return src;
    } catch (e) { return null; }
}

async function getConfig() { return jsonify(appConfig); }

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'latest';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getText(catUrl(tid, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/jav/' + id.replace(/^\//, '') + '/');
    const html = await getText(durl);
    if (!html) return jsonify({ list: [] });
    const postM = html.match(/data-post=['"](\d+)['"]/);
    const postId = postM ? postM[1] : '';
    let playId = postId ? postId + '$' + durl : durl;
    if (postId) {
        try {
            const embeds = await collectEmbeds(postId);
            if (embeds && embeds.length) {
                const payload = b64urlEncode(JSON.stringify({ e: embeds.map(e => e.embedUrl) }));
                if (payload) playId += '$@' + payload;
            }
        } catch (e) {}
    }
    return jsonify({ list: [{ title: 'JavGG', tracks: [{ name: '正片', pan: '', ext: { id: playId, flag: 'JavGG' } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    const hdrFor = (ref) => [{ 'User-Agent': UA, 'Referer': ref || REFERER }];
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.startsWith('正片$')) id = id.slice(3);
    if (/\.m3u8(\?|$)/i.test(id)) return jsonify({ urls: [id], headers: hdrFor(REFERER) });
    let fastEmbeds = null;
    const fm = id.match(/\$@([A-Za-z0-9_-]+)$/);
    if (fm) {
        try {
            const payload = JSON.parse(b64urlDecode(fm[1]) || '{}');
            const urls = Array.isArray(payload.e) ? payload.e : [];
            const list = urls.map(u => classifyEmbed(t(u))).filter(Boolean);
            if (list.length && list.some(e => e.kind !== 'other')) fastEmbeds = list;
        } catch (e) {}
        id = id.slice(0, fm.index);
    }
    let postId = '';
    let durl = '';
    const pm = id.match(/^(\d+)\$(https?:\/\/.+)$/);
    if (pm) { postId = pm[1]; durl = pm[2]; }
    else if (/^https?:\/\//.test(id)) {
        durl = id;
        const html0 = await getText(durl);
        const m0 = html0 ? html0.match(/data-post=['"](\d+)['"]/) : null;
        postId = m0 ? m0[1] : '';
    } else { postId = id.replace(/\D/g, ''); }
    if (!postId) return jsonify({ urls: [], headers: [] });
    if (!durl) durl = REFERER;
    const embeds = fastEmbeds || await collectEmbeds(postId);
    // 串行按优先级试 playmate > vidara（猫版竞速改串行）
    const cands = embeds.filter(e => e.kind === 'playmate' || e.kind === 'vidara');
    for (const e of cands) {
        const src = e.kind === 'playmate' ? await tryPlaymate(e.embedUrl) : await tryVidara(e.embedUrl);
        if (src) return jsonify({ urls: [src], headers: hdrFor(durl) });
    }
    const vh = embeds.find(e => e.kind === 'vidhide');
    if (VIDHIDE_WORKER && vh) {
        return jsonify({ urls: [VIDHIDE_WORKER + '/v?u=' + encodeURIComponent(vh.embedUrl) + '&r=' + encodeURIComponent(durl)], headers: hdrFor(durl) });
    }
    const sniff = embeds.find(e => e.kind === 'vidhide') || embeds.find(e => e.kind === 'f4') || embeds.find(e => e.kind === 'other') || embeds[0];
    if (sniff) return jsonify({ urls: [sniff.embedUrl], headers: hdrFor(durl) });
    if (durl && durl !== REFERER) return jsonify({ urls: [durl], headers: hdrFor(REFERER) });
    return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/?s=' + encodeURIComponent(wd);
    if (page > 1) url += '&paged=' + page;
    const html = await getText(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
