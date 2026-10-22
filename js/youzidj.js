// 柚子短剧 - XPTV csp 格式（csp_youzidj）
// 转换自 mira-cat nodejs/src/spider/video/youzidj.js（py_youzidj），站点 https://youzidj.com
// 播放主链（同猫版）：POST /api/account/bootstrap 建访客会话（JSON 对象 body）→
// POST /api/playback/{videoId}?mode=native 换 m3u8，两步都靠响应 Set-Cookie（eden_account / eden_play_*）。
// 注意：$fetch 是否回传响应头/Set-Cookie 未证实——取不到 Cookie 时按猫版兜底回集页面 URL 走嗅探。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
// 嗅探型播放降级：回源页 URL，待真机验
const SITE = 'https://youzidj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const GENRES = [
    ['cultivation', '修仙'], ['wealthy-family', '豪门'], ['urban', '都市'], ['costume', '古装'],
    ['family-ethics', '家庭伦理'], ['martial-arts', '武侠'], ['campus', '校园'],
];

const TAGS = [
    ['romance', '情感'], ['yu-jie', '御姐'], ['ni-xi', '逆袭'], ['tiao-jiao', '调教'], ['shu-nu', '熟女'],
    ['ren-qi', '人妻'], ['hou-gong', '后宫'], ['tou-qing', '偷情'], ['qi-huan', '奇幻'], ['xi-tong', '系统'],
    ['nu-pu', '女仆'], ['luo-li', '萝莉'], ['lu-mao', '绿帽'], ['xuan-yi', '悬疑'], ['mu-zi', '母子'],
    ['jiao-shi', '教师'], ['apocalypse', '末日'], ['chong-sheng', '重生'], ['chuan-yue', '穿越'],
    ['fu-nu', '父女'], ['jie-di', '姐弟'],
];

const CATS = [['all', '全部短剧']]
    .concat(GENRES.map(([slug, name]) => ['g_' + slug, name]))
    .concat(TAGS.map(([slug, name]) => ['t_' + slug, name]));

const appConfig = {
    ver: 1,
    title: '柚子短剧',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

let accountPair = '';

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
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
    for (let i = 0; i < 2; i++) {
        try {
            const { data, status } = await $fetch.get(url, { headers: headers });
            if ((status === undefined || status === 200) && typeof data === 'string' && data) return data;
        } catch (e) {}
    }
    return '';
}

// POST JSON 接口：返回 { status, data, setCookie[] }；setCookie 尽力从响应头各形态里取（运行时未证实回传）
async function postJson(url, referer, cookie) {
    const headers = {
        'User-Agent': UA,
        'Referer': referer || REFERER,
        'Origin': SITE,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    };
    if (cookie) headers['Cookie'] = cookie;
    try {
        const r = await $fetch.post(url, {}, { headers: headers });
        let data = r.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
        let sc = [];
        const h = r.headers || r.header || {};
        const raw = h['set-cookie'] || h['Set-Cookie'] || (typeof h.getSetCookie === 'function' ? h.getSetCookie() : null) || (typeof h.get === 'function' ? h.get('set-cookie') : null);
        if (raw) sc = Array.isArray(raw) ? raw : [raw];
        return { status: r.status || 200, data: data, setCookie: sc };
    } catch (e) {
        return { status: 0, data: null, setCookie: [] };
    }
}

function pickCookie(setCookie, namePrefix) {
    for (const line of setCookie || []) {
        const m = String(line).match(new RegExp('^(' + namePrefix + '[^=]*)=([^;]+)'));
        if (m) return { name: m[1], value: m[2], pair: m[1] + '=' + m[2] };
    }
    return null;
}

async function ensureAccount(force) {
    if (!force && accountPair) return accountPair;
    const r = await postJson(SITE + '/api/account/bootstrap', REFERER, '');
    const c = pickCookie(r.setCookie, 'eden_account');
    if (c) {
        accountPair = c.pair;
        return accountPair;
    }
    return accountPair || '';
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const parts = String(html || '').split('<article class="drama-card');
    for (let i = 1; i < parts.length; i++) {
        const block = parts[i].slice(0, 6000);
        const hm = block.match(/href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+\/)"/);
        if (!hm) continue;
        const url = hm[1];
        if (seen.has(url)) continue;
        seen.add(url);
        let title = '';
        const tm = block.match(/drama-card-title"[^>]*title="([^"]+)"/) || block.match(/drama-card-title"[^>]*>([^<]+)</);
        if (tm) title = clean(tm[1]);
        if (!title) {
            const am = block.match(/<img[^>]+alt="([^"]+?)海报"/);
            if (am) title = clean(am[1]);
        }
        let pic = '';
        const pm = block.match(/(\/catalogue-art\/[0-9a-f\-]+-960\.webp)/);
        if (pm) pic = SITE + pm[1];
        let remarks = '';
        const rm = block.match(/home-card-episodes-long">([^<]+)</);
        if (rm) remarks = clean(rm[1]);
        out.push({
            vod_id: url,
            vod_name: title || url,
            vod_pic: pic,
            vod_remarks: remarks,
            ext: { id: url },
        });
    }
    return out;
}

function catBase(tid) {
    let id = String(tid == null ? '' : tid).trim();
    try { id = decodeURIComponent(id); } catch (e) {}
    if (!id || id === 'all') return SITE + '/dramas/';
    let m = id.match(/^(?:g_|genre:)(.+)$/);
    if (m) return SITE + '/dramas/category/' + m[1] + '/';
    m = id.match(/^(?:t_|tag:)(.+)$/);
    if (m) return SITE + '/tags/' + m[1] + '/';
    const g = GENRES.find((x) => x[0] === id || x[1] === id);
    if (g) return SITE + '/dramas/category/' + g[0] + '/';
    const tg = TAGS.find((x) => x[0] === id || x[1] === id);
    if (tg) return SITE + '/tags/' + tg[0] + '/';
    return SITE + '/dramas/';
}

function findSeason(ld) {
    if (!ld || typeof ld !== 'object') return null;
    if (Array.isArray(ld)) {
        for (const x of ld) { const s = findSeason(x); if (s) return s; }
        return null;
    }
    if (Array.isArray(ld.episode)) return ld;
    if (ld['@graph']) return findSeason(ld['@graph']);
    return null;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'all');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const base = catBase(tid);
    const url = page > 1 ? base + 'page/' + page + '/' : base;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//i.test(id) ? id : SITE + '/dramas/' + id.replace(/^\/+|\/+$/g, '') + '/season-1/';
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    let episodes = [];
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const b of lds) {
        let obj = null;
        try { obj = JSON.parse(b[1]); } catch (e) {}
        const season = findSeason(obj);
        if (!season) continue;
        episodes = (season.episode || []).map((ep) => ({
            n: parseInt(ep.episodeNumber, 10) || 0,
            label: clean(ep.name || ''),
            url: fixUrl(ep.url || ''),
        })).filter((ep) => ep.url);
        if (episodes.length) break;
    }
    if (!episodes.length) {
        const re = /href="(https:\/\/youzidj\.com\/dramas\/[a-z0-9\-]+\/season-\d+-episode-(\d+)\/)"/g;
        const seen = new Set();
        let m;
        while ((m = re.exec(html)) !== null) {
            if (seen.has(m[1])) continue;
            seen.add(m[1]);
            episodes.push({ n: parseInt(m[2], 10) || episodes.length + 1, label: '', url: m[1] });
        }
    }
    episodes.sort((a, b) => a.n - b.n);
    const tracks = episodes.map((ep) => ({
        name: ep.label || ('第' + ep.n + '集'),
        pan: '',
        ext: { id: ep.url, flag: '柚子短剧' },
    }));
    return jsonify({ list: [{ title: '柚子短剧', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const epUrl = fixUrl(id);
    const sniff = () => jsonify({ urls: [epUrl], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] });

    const html = await getHtml(epUrl);
    const vm = html && html.match(/data-video="([0-9a-f\-]{36})"/);
    if (!vm) return sniff();
    const videoId = vm[1];
    const pm = html.match(/data-price="([^"]*)"/);
    const price = pm ? pm[1] : '0';

    let acct = await ensureAccount(false);
    let r = await postJson(SITE + '/api/playback/' + videoId + '?mode=native', epUrl, acct);
    if (r.status === 401 && acct) {
        acct = await ensureAccount(true);
        r = await postJson(SITE + '/api/playback/' + videoId + '?mode=native', epUrl, acct);
    }
    if (r.status === 402 || price !== '0') return sniff();
    const data = r.data && typeof r.data === 'object' ? r.data : null;
    const playCookie = pickCookie(r.setCookie, 'eden_play_');
    if (r.status !== 200 || !data || !data.url || !playCookie) return sniff();
    const cookie = [acct, playCookie.pair].filter(Boolean).join('; ');
    return jsonify({
        urls: [fixUrl(data.url)],
        headers: [{ 'User-Agent': UA, 'Referer': epUrl, 'Cookie': cookie }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    if (page > 1) return jsonify({ list: [] });
    const html = await getHtml(SITE + '/search/?q=' + encodeURIComponent(wd));
    return jsonify({ list: html ? parseCards(html) : [] });
}
