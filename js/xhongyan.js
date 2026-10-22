// X红颜 - XPTV csp 格式（csp_xhongyan）
// 转换自 mira-cat nodejs/src/spider/video/xhongyan.js（py_xhongyan）。站点 https://xhongyan.com（MacCMS）。
// 播放：主链为播放页 player_data 的 url 直出（猫版还跟一次 302 拿 CDN 直链；$fetch.get 默认跟随跳转且不暴露最终地址，
// XPTV 版直返站方签名 mp4 地址、由播放器跟跳，待真机验）；解析失败时猫版落 parse:1 嗅探播放页，
// XPTV 无嗅探位，降级为回播放页 URL —— 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// encrypt=2 的 Base64 解码由 Node Buffer 改为 CryptoJS.enc.Base64 对应件。
const CryptoJS = createCryptoJS();

const SITE = 'https://xhongyan.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
    { type_id: 'new', type_name: '最新更新', kind: 'label', slug: 'new' },
    { type_id: 'hot', type_name: '热门推荐', kind: 'label', slug: 'hot' },
    { type_id: '1', type_name: 'onlyfans', kind: 'type' },
    { type_id: '2', type_name: '网黄', kind: 'type' },
    { type_id: '3', type_name: '品牌', kind: 'type' },
    { type_id: '4', type_name: '业余', kind: 'type' },
];

const appConfig = {
    ver: 1,
    title: 'X红颜',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ');
}

function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return SITE + (u.startsWith('/') ? u : '/' + u);
}

async function getHtml(url) {
    const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    try {
        const { data, status } = await $fetch.get(url, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && data) return data;
        if (typeof data === 'string' && data) return data;
    } catch (e) {}
    return '';
}

// 解析列表卡片 (分类/搜索通用)，与猫版 parseCards 同逻辑（含 hot 页无 img 兜底分支），card 追加 ext
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const s = String(html || '');
    const re = /<a\s[^>]*href="(?:https?:\/\/xhongyan\.com)?\/index\.php\/vod\/play\/id\/(\d+)\/sid\/\d+\/nid\/1\.html"[^>]*>/gi;
    let m;
    while ((m = re.exec(s)) !== null) {
        const id = m[1];
        if (seen.has(id)) continue;
        seen.add(id);
        const win = s.slice(m.index, m.index + 1800);
        let pic = '';
        const dsM = win.match(/data-src="([^"]+)"/);
        if (dsM) pic = fixUrl(dsM[1]);
        if (!pic) {
            const srcM = win.match(/<img[^>]+src="(\/upload\/[^"]+)"/);
            if (srcM) pic = fixUrl(srcM[1]);
        }
        if (!pic) {
            const bgM = win.match(/background-image:\s*url\((?:&quot;|"|')?([^&"')]+)(?:&quot;|"|')?\)/);
            if (bgM) pic = fixUrl(bgM[1]);
        }
        let title = '';
        const altM = win.match(/<img[^>]+alt="([^"]*)"/);
        if (altM) title = clean(altM[1]);
        if (!title) {
            const ttM = win.match(/<span class="title">([^<]+)<\/span>/);
            if (ttM) title = clean(ttM[1]);
        }
        let remarks = '';
        const tm = win.match(/videoBox-time"[^>]*>([^<]+)</);
        if (tm) remarks = clean(tm[1]);
        out.push({ vod_id: id, vod_name: title || id, vod_pic: pic, vod_remarks: remarks, ext: { id } });
    }
    return out;
}

function catOf(tid) {
    return CATS.find(c => c.type_id === String(tid)) || CATS[0];
}

function catUrl(cat, page) {
    page = Math.max(1, page || 1);
    if (cat.kind === 'label') {
        return page > 1 ? `${SITE}/index.php/label/${cat.slug}/page/${page}.html` : `${SITE}/index.php/label/${cat.slug}.html`;
    }
    return page > 1 ? `${SITE}/index.php/vod/type/id/${cat.type_id}/page/${page}.html` : `${SITE}/index.php/vod/type/id/${cat.type_id}.html`;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 'new';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = catOf(tid);
    // 热门推荐站方无分页（猫版同口径）：第 2 页起返回空，避免重复内容
    if (cat.kind === 'label' && cat.slug === 'hot' && page > 1) return jsonify({ list: [] });
    const html = await getHtml(catUrl(cat, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const idm = id.match(/id\/(\d+)/) || id.match(/^(\d+)$/);
    if (idm) id = idm[1];
    const html = await getHtml(`${SITE}/index.php/vod/detail/id/${id}.html`);
    if (!html) return jsonify({ list: [] });
    // 播放源 sid 列表 (详情页 play 链接)，与猫版 detail 同逻辑
    const sids = [...new Set([...html.matchAll(new RegExp(`/vod/play/id/${id}/sid/(\\d+)/nid/1\\.html`, 'g'))].map(x => x[1]))].sort();
    const useSids = sids.length ? sids : ['1'];
    const groups = useSids.map((s, i) => ({
        title: '线路' + (i + 1),
        tracks: [{ name: '正片', pan: '', ext: { id: `${SITE}/index.php/vod/play/id/${id}/sid/${s}/nid/1.html`, flag: '线路' + (i + 1) } }],
    }));
    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const purl = fixUrl(id);
    const sniff = () => jsonify({ urls: [purl], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] });
    const html = await getHtml(purl);
    if (!html) return sniff();
    const dm = html.match(/var\s+player_data\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) || html.match(/var\s+player_data\s*=\s*(\{[^{}]*\})/);
    if (!dm) return sniff();
    let pd = null;
    try { pd = JSON.parse(dm[1]); } catch (e) {}
    if (!pd || !pd.url) return sniff();
    let raw = String(pd.url);
    const enc = parseInt(pd.encrypt, 10) || 0;
    try {
        if (enc === 1) raw = unescape(raw);
        else if (enc === 2) raw = unescape(CryptoJS.enc.Base64.parse(raw).toString(CryptoJS.enc.Utf8));
    } catch (e) {}
    // 猫版此处跟一次 302 换 CDN 直链；$fetch 不暴露跳转后地址，直返签名地址由播放器跟跳
    return jsonify({ urls: [fixUrl(raw)], headers: [{ 'User-Agent': UA, 'Referer': purl }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const enc = encodeURIComponent(wd);
    const url = page > 1 ? `${SITE}/index.php/vod/search/page/${page}/wd/${enc}.html` : `${SITE}/index.php/vod/search/wd/${enc}.html`;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
