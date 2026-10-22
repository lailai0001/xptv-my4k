// 17RIP - XPTV csp 格式（csp_rip17）
// 转换自 mira-cat nodejs/src/spider/video/rip17.js（py_rip17）。站点 https://17rip.com（MacCMS，dsn2 模板）。
// 播放：主链为播放页 SSR 内嵌 player_aaaa 的 url 直出 m3u8（parse:0 等价）；解析失败时猫版落 parse:1 嗅探播放页，
// XPTV 无嗅探位，降级为回播放页 URL —— 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// encrypt=2 的 Base64 解码由 Node Buffer 改为 CryptoJS.enc.Base64 对应件。
const CryptoJS = createCryptoJS();

const SITE = 'https://17rip.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
    { type_id: '1', type_name: '日韩' },
    { type_id: '2', type_name: '国产' },
    { type_id: '3', type_name: '欧美' },
    { type_id: '4', type_name: '动漫' },
    { type_id: '5', type_name: '网曝门' },
    { type_id: '33', type_name: 'OnlyFans' },
    { type_id: '6', type_name: '人妻熟女' },
    { type_id: '7', type_name: '日本无码' },
    { type_id: '8', type_name: '美乳巨乳' },
    { type_id: '9', type_name: '强制侵犯' },
    { type_id: '10', type_name: '制服诱惑' },
    { type_id: '11', type_name: '绝色佳人' },
    { type_id: '12', type_name: '风俗泡泡浴' },
    { type_id: '20', type_name: '家庭乱伦' },
    { type_id: '21', type_name: '少女萝莉' },
    { type_id: '22', type_name: 'SM调教' },
    { type_id: '23', type_name: '绝顶潮吹' },
    { type_id: '24', type_name: '魔镜系列' },
    { type_id: '25', type_name: '时间停止' },
    { type_id: '26', type_name: '催眠洗脑' },
    { type_id: '27', type_name: '漫改系列' },
    { type_id: '28', type_name: '电车痴汉' },
    { type_id: '29', type_name: '淫欲痴女' },
    { type_id: '34', type_name: 'AV解说' },
    { type_id: '37', type_name: 'AI换脸' },
    { type_id: '13', type_name: '网红主播' },
    { type_id: '14', type_name: '国产传媒' },
    { type_id: '15', type_name: '探花系列' },
    { type_id: '16', type_name: '国产自拍' },
    { type_id: '35', type_name: '其他' },
    { type_id: '30', type_name: '欧美精品' },
    { type_id: '32', type_name: '3D动漫' },
    { type_id: '36', type_name: '三级电影' },
];

const appConfig = {
    ver: 1,
    title: '17RIP',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

function stripTags(s) {
    return clean(String(s || '').replace(/<[^>]+>/g, ' '));
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

// 解析网格卡片 (分类通用: public-list-box)，与猫版同逻辑，card 追加 ext
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const blocks = String(html || '').split('public-list-box');
    for (let i = 1; i < blocks.length; i++) {
        const win = blocks[i].slice(0, 2500);
        const dm = win.match(/href="\/voddetail\/(\d+)\.html"/);
        if (!dm) continue;
        const id = dm[1];
        if (seen.has(id)) continue;
        seen.add(id);
        let title = '';
        const tm = win.match(/public-list-exp"[^>]*title="([^"]*)"/) || win.match(/<img[^>]+alt="([^"]*)"/);
        if (tm) title = clean(tm[1]);
        let pic = '';
        const pm = win.match(/data-src="([^"]+)"/);
        if (pm) pic = fixUrl(pm[1]);
        let remarks = '';
        const rm = win.match(/public-list-prb[^>]*>([\s\S]{0,80}?)<\/span>/);
        if (rm) remarks = stripTags(rm[1]);
        if (!remarks) {
            const rp = win.match(/public-prt[^>]*>([^<]*)</);
            if (rp) remarks = clean(rp[1]);
        }
        out.push({ vod_id: id, vod_name: title || id, vod_pic: pic, vod_remarks: remarks, ext: { id } });
    }
    return out;
}

// 解析搜索页卡片 (detail 式横排: vod-detail ... search-list)，与猫版同逻辑
function parseSearchCards(html) {
    const out = [];
    const seen = new Set();
    const blocks = String(html || '').split('search-list');
    for (let i = 1; i < blocks.length; i++) {
        const win = blocks[i].slice(0, 3500);
        const dm = win.match(/href="\/voddetail\/(\d+)\.html"/);
        if (!dm) continue;
        const id = dm[1];
        if (seen.has(id)) continue;
        seen.add(id);
        let title = '';
        const tm = win.match(/slide-info-title[^>]*>([^<]*)</);
        if (tm) title = clean(tm[1]);
        if (!title) {
            const am = win.match(/<img[^>]+alt="([^"]*)"/);
            if (am) title = clean(am[1]);
        }
        let pic = '';
        const pm = win.match(/data-src="([^"]+)"/);
        if (pm) pic = fixUrl(pm[1]);
        let remarks = '';
        const rm = win.match(/slide-info-remarks[^>]*>([^<]*)</);
        if (rm) remarks = clean(rm[1]);
        out.push({ vod_id: id, vod_name: title || id, vod_pic: pic, vod_remarks: remarks, ext: { id } });
    }
    return out;
}

function catUrl(tid, page) {
    page = Math.max(1, page || 1);
    return page > 1 ? `${SITE}/vodshow/${tid}--------${page}---.html` : `${SITE}/vodshow/${tid}-----------.html`;
}

// 猫版 detail 的 vod_play_from/vod_play_url → 分组 tracks（$$$ 分组、# 分集、首个 $ 拆名与 playId）
function buildGroups(fromStr, urlStr) {
    const froms = String(fromStr || '').split('$$$');
    const groups = [];
    String(urlStr || '').split('$$$').forEach((g, gi) => {
        const tracks = [];
        g.split('#').forEach(part => {
            if (!part) return;
            const idx = part.indexOf('$');
            const name = idx >= 0 ? part.slice(0, idx) : '正片';
            const pid = idx >= 0 ? part.slice(idx + 1) : part;
            tracks.push({ name: name || '正片', pan: '', ext: { id: pid, flag: froms[gi] || froms[0] || '' } });
        });
        if (tracks.length) groups.push({ title: froms[gi] || ('线路' + (gi + 1)), tracks });
    });
    return groups;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || '1';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getHtml(catUrl(tid, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const idm = id.match(/voddetail\/(\d+)\.html/) || id.match(/^(\d+)$/);
    if (idm) id = idm[1];
    const html = await getHtml(`${SITE}/voddetail/${id}.html`);
    if (!html) return jsonify({ list: [] });

    // 线路: anthology-tab 标签与 anthology-list-box 一一对应 (顺序即 sid 顺序)，与猫版同逻辑
    const tabNames = [...html.matchAll(/anthology-tab[\s\S]*?<\/div>\s*<\/div>/g)].length
        ? [...html.matchAll(/<a class="swiper-slide"[^>]*>([\s\S]*?)<\/a>/g)].map(x => stripTags(x[1]).replace(/资源\s*$/, '').trim())
        : [];
    const boxes = [...html.matchAll(/anthology-list-box[^"]*"[^>]*>([\s\S]*?)(?=anthology-list-box|<\/div>\s*<\/div>\s*<script>\$\("\.anthology-tab|$)/g)].map(x => x[1]);
    const fromArr = [];
    const urlArr = [];
    boxes.forEach((box, bi) => {
        const eps = [...box.matchAll(/<a[^>]+href="(\/vodplay\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
        if (!eps.length) return;
        const parts = eps.map(e => `${stripTags(e[2]) || '正片'}$${fixUrl(e[1])}`);
        fromArr.push(tabNames[bi] || ('线路' + (fromArr.length + 1)));
        urlArr.push(parts.join('#'));
    });
    if (!fromArr.length) {
        const all = [...html.matchAll(new RegExp(`/vodplay/${id}-(\\d+)-(\\d+)\\.html`, 'g'))];
        if (all.length) {
            const sids = [...new Set(all.map(x => x[1]))].sort();
            sids.forEach((s, i) => {
                fromArr.push('线路' + (i + 1));
                urlArr.push(`正片$${SITE}/vodplay/${id}-${s}-1.html`);
            });
        }
    }
    return jsonify({ list: buildGroups(fromArr.join('$$$'), urlArr.join('$$$')) });
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
    const dm = html.match(/var\s+player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) || html.match(/var\s+player_aaaa\s*=\s*(\{[^{}]*\})/);
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
    return jsonify({ urls: [fixUrl(raw)], headers: [{ 'User-Agent': UA, 'Referer': purl }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const enc = encodeURIComponent(wd);
    const url = page > 1 ? `${SITE}/vodsearch/${enc}----------${page}---.html` : `${SITE}/vodsearch/${enc}-------------.html`;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseSearchCards(html) : [] });
}
