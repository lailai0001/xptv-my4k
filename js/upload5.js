// 蜜桃 - XPTV csp 格式（csp_upload5）
// 转换自 mira-cat nodejs/src/spider/video/upload5.js（py_upload5）。站点 https://honeypeach.cc（honeypeach API + PoW 握手 + HMAC 签名）。
// @@ 线路重解机制原样保留：vod_id / playId 均为 mod@@id@@src@@sub（playId 再带集号段）复合串，
// getTracks 原样透传、getPlayinfo 按段重解（照猫版 detail/play 的 split('@@') 逻辑搬运）。
// 会话状态：猫版用模块级 sess 缓存 sid/skey（握手成本高、带过期校验）；XPTV 规范禁跨调用全局状态，
// 本版改为每次入口调用内现握手（signedGet 内闭包缓存、401/限流换设备重握手逻辑照猫版），单次调用内多次请求共用一次握手。
// detail 的 15 秒超时竞速（猫版用 setTimeout+Promise.race）按规范禁忌去掉，改串行直取。
// 播放：非 missav 模块走 /api/play 直出（parse:0 等价）；missav 模块主链直解 missav.fans 页内 uuid 拼 720p m3u8 直出，
// 解析失败时猫版落 parse:1 嗅探 missav 页，XPTV 无嗅探位，降级为回 missav 页 URL ——
// 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// play 末尾的 HEAD 跟跳（猫版用原生 fetch HEAD）$fetch 无 HEAD 接口，跳过该步直返 API 地址，待真机验。
// 2026-10-22 本地验证状态：站方握手 PoW 被持续拒收——按猫版算法逐字复刻的独立脚本多次尝试（换 dev 3 次 + 同 dev 连解 5 轮）
// 均只拿到新 challenge、从未下发 sid/skey（响应无 Set-Cookie），harness 因此 cards/search 全 0；模块逻辑为猫版忠实移植，
// 定性为站方/出口 IP 侧状态，待真机或换网络环境再验。
const CryptoJS = createCryptoJS();

const HOST = 'https://honeypeach.cc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// ---------------- PoW: FNV-1a 32bit, 与服务端握手算法一致（同猫版） ----------------
function hpHash(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
}

function hpPow(chal, nonce) {
    let h = hpHash(chal + ':' + nonce);
    for (let r = 0; r < 4; r++) {
        const hex = h.toString(16).padStart(8, '0').slice(-8);
        h = hpHash(hex + chal);
    }
    return h.toString(16).padStart(8, '0').slice(-8);
}

function hpSolve(chal, bits) {
    const want = '0'.repeat(bits >> 2);
    for (let n = 0; n < 20000000; n++) {
        const nx = n.toString(16);
        if (hpPow(chal, nx).startsWith(want)) return chal + '.' + nx;
    }
    return '';
}

function rnd(n) {
    n = n || 10;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += chars.charAt((Math.random() * chars.length) | 0);
    return s;
}

function newDev() {
    return rnd(12) + Date.now().toString(16);
}

// ---------------- 分类（同猫版 CLASSES；XPTV 无 filters 位，筛选器不进 tabs，分类用默认三元组取数） ----------------
const CLASSES = [
    { type_id: 'video_new', type_name: '最近更新' },
    { type_id: 'video_release', type_name: '新作上市' },
    { type_id: 'video_chinese', type_name: '中文字幕' },
    { type_id: 'video_madou', type_name: '麻豆传媒' },
    { type_id: 'video_uncensored', type_name: '无码流出' },
    { type_id: 'video_hot', type_name: '热门视频' },
    { type_id: 'video_fc2', type_name: 'FC2' },
    { type_id: 'video_heyzo', type_name: 'HEYZO' },
    { type_id: 'video_tokyohot', type_name: '东京热' },
    { type_id: 'video_1pondo', type_name: '一本道' },
    { type_id: 'video_caribbean', type_name: '加勒比' },
    { type_id: 'video_todayhot', type_name: '今日热门' },
    { type_id: 'video_weeklyhot', type_name: '本周热门' },
    { type_id: 'duanju', type_name: '蜜桃短剧' },
    { type_id: 'duanju_chiguo', type_name: '赤果短剧' },
    { type_id: 'duanju_zhenren', type_name: '真人短剧' },
    { type_id: 'duanju_ai', type_name: 'AI成人短剧' },
    { type_id: 'duanju_rank', type_name: '短剧排行' },
    { type_id: 'caibian', type_name: '擦边短剧' },
    { type_id: 'shortv', type_name: '蜜桃动漫' },
    { type_id: 'heiliao', type_name: '黑料吃瓜' },
    { type_id: 'guochan', type_name: '国产精品' },
];

// 各分类默认 cat 三元组 code|src|sub（同猫版 DEFAULT_CAT）
const DEFAULT_CAT = {
    video_new: 'new|missav|',
    video_release: 'release|missav|',
    video_chinese: 'chinese-subtitle|missav|',
    video_madou: 'madou|missav|',
    video_uncensored: 'uncensored-leak|missav|',
    video_hot: 'monthly-hot|missav|',
    video_fc2: 'fc2|missav|',
    video_heyzo: 'heyzo|missav|',
    video_tokyohot: 'tokyohot|missav|',
    video_1pondo: '1pondo|missav|',
    video_caribbean: 'caribbeancom|missav|',
    video_todayhot: 'today-hot|missav|',
    video_weeklyhot: 'weekly-hot|missav|',
    duanju: 'tuijian|huangguo|0',
    duanju_chiguo: 'chiguo|huangguo|0',
    duanju_zhenren: 'zhenren|huangguo|0',
    duanju_ai: 'duanju|huangguo|0',
    duanju_rank: 'rank|huangguo|0',
    caibian: '0|huangdou|0',
    shortv: 'all|dongman|0',
    heiliao: '0|huangdou|0',
    guochan: '||',
};

const SRC_MAP = {
    video: 'missav', shortv: 'dongman', chiguo: 'chiguo', pengran: 'pengran',
    tuijian: 'huangguo', duanju: 'huangguo', manju: 'huangguo', huanlian: 'huangguo',
    mogai: 'huangguo', rank: 'huangguo',
};

const appConfig = {
    ver: 1,
    title: '蜜桃',
    site: HOST,
    tabs: CLASSES.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

async function fetchJson(url, extraHeaders) {
    try {
        const { data } = await $fetch.get(url, {
            headers: Object.assign({ 'User-Agent': UA, Accept: 'application/json' }, extraHeaders || {}),
        });
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (e) { return {}; }
        }
        return data || {};
    } catch (e) {
        return {};
    }
}

async function fetchText(url, headers) {
    try {
        const { data } = await $fetch.get(url, { headers });
        return typeof data === 'string' ? data : '';
    } catch (e) {
        return '';
    }
}

// 会话工厂：每次入口调用新建（无跨调用全局状态），闭包内缓存 sid/skey 供本次调用内复用
function createSession() {
    const sess = { sid: '', skey: '', exp: 0 };

    async function ensureHandshake() {
        const now = Math.floor(Date.now() / 1000);
        if (sess.sid && sess.skey && now < sess.exp - 60) return true;
        for (let attempt = 0; attempt < 3; attempt++) {
            const dev = newDev();
            let d = await fetchJson(HOST + '/api/handshake?dev=' + encodeURIComponent(dev));
            if (d && d.need_chal) {
                const tok = hpSolve(String(d.need_chal), parseInt(d.bits || '16', 10));
                if (!tok) continue;
                d = await fetchJson(HOST + '/api/handshake?dev=' + encodeURIComponent(dev) + '&c=' + encodeURIComponent(tok));
            }
            if (d && d.sid && d.skey) {
                sess.sid = String(d.sid);
                sess.skey = String(d.skey);
                sess.exp = parseInt(d.exp || '0', 10);
                return true;
            }
        }
        return false;
    }

    async function signedGet(path, params) {
        if (!(await ensureHandshake())) return {};
        const qs = new URLSearchParams(params || {}).toString();
        const bodyHash = CryptoJS.SHA256('').toString(CryptoJS.enc.Hex);
        const ts = String(Math.floor(Date.now() / 1000));
        const nonce = rnd(8) + Date.now().toString(16);
        const canon = ['GET', path, qs, bodyHash, ts, nonce, sess.sid].join('\n');
        const sig = CryptoJS.HmacSHA256(canon, CryptoJS.enc.Hex.parse(sess.skey)).toString(CryptoJS.enc.Hex);
        const url = HOST + path + (qs ? '?' + qs : '');
        const res = await fetchJson(url, {
            'X-Hp-Sid': sess.sid,
            'X-Hp-Ts': ts,
            'X-Hp-Nonce': nonce,
            'X-Hp-Sign': sig,
            Referer: HOST + '/',
        });
        if (res && res.code === 401) {
            sess.sid = '';
            sess.skey = '';
            if (await ensureHandshake()) return signedGet(path, params);
        }
        const errMsg = String((res && (res.err || res.msg)) || '').toLowerCase();
        const limited = res && (res.code === 429 || errMsg.includes('rl_sid') || errMsg.includes('rl_dev') ||
            errMsg.includes('rl_ip') || errMsg.includes('rate') || errMsg.includes('limit') ||
            errMsg.includes('toomany') || errMsg.includes('busy'));
        if (limited) {
            sess.sid = '';
            sess.skey = '';
            if (await ensureHandshake()) return signedGet(path, params);
        }
        return res;
    }

    return { signedGet };
}

function formatCover(mod, url) {
    if (!url) return '';
    const u = String(url);
    if (mod === 'live' || u.startsWith('/') || u.indexOf('://') === -1) {
        if (u.startsWith('/')) return HOST + u;
        return u;
    }
    return HOST + '/cover/' + mod + '?u=' + encodeURIComponent(u);
}

function parseCatTriple(raw, fallback) {
    const parts = String(raw || fallback || '').split('|');
    return { cat: parts[0] || '', src: parts[1] || '', sub: parts[2] || '' };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const tid = String(ext.tid || 'video_new');
    const def = parseCatTriple(DEFAULT_CAT[tid]);
    const pc = def; // XPTV 无筛选器入参，恒用默认三元组（猫版未选筛选器时的口径）
    const src = pc.src || SRC_MAP[pc.cat] || def.src || '';
    const sub = pc.sub !== '' ? pc.sub : def.sub;
    let apiKey = tid;
    if (tid.startsWith('video_')) apiKey = 'video';
    else if (tid.startsWith('duanju')) apiKey = 'duanju';
    const params = { key: apiKey, cat: pc.cat, page: String(page) };
    if (src) params.src = src;
    if (sub !== '') params.sub = sub;

    const session = createSession();
    const data = await session.signedGet('/api/module', params);
    const rawList = (data && data.list) || [];
    const coverMod = tid === 'duanju' ? src : tid;
    const list = [];
    for (const item of rawList) {
        const itemId = String(item.id || item.code || '');
        if (!itemId) continue;
        const title = String(item.title || itemId).trim();
        const pic = formatCover(coverMod, item.cover_n || item.cover || '');
        const rawRemark = item.remark || item.desc || '';
        const vodId = (tid.startsWith('video_') ? src : tid.startsWith('duanju') ? 'duanju' : tid) + '@@' + itemId + '@@' + src + '@@' + (sub !== '' ? sub : '');
        list.push({
            vod_id: vodId,
            vod_name: title,
            vod_pic: pic,
            vod_remarks: rawRemark ? '蝴蝶影视 | ' + String(rawRemark).trim() : '蝴蝶影视',
            ext: { id: vodId },
        });
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = String(ext.id || '');
    if (!rawId) return jsonify({ list: [] });
    const parts = rawId.split('@@');
    const mod = parts[0];
    const realId = parts[1] || rawId;
    const src = parts[2] || '';
    const sub = parts[3] || '';
    const params = {};
    if (src) params.src = src;
    if (sub) params.sub = sub;
    const session = createSession();
    const data = await session.signedGet('/api/detail/' + mod + '/' + encodeURIComponent(realId), params);
    const tracks = [];
    const det = (data && data.detail) || {};
    if (det && (det.title || det.episodes)) {
        const episodes = det.episodes || [];
        if (episodes.length) {
            for (const epItem of episodes) {
                const epNo = String(epItem.ep || '1');
                let rawName = String(epItem.name || ('第' + epNo + '集'));
                if (/^\d+$/.test(rawName)) rawName = '第' + rawName + '集';
                const epDisplay = epItem.lock ? rawName + '[预告10s]' : rawName;
                tracks.push({ name: epDisplay, pan: '', ext: { id: mod + '@@' + realId + '@@' + epNo + '@@' + src + '@@' + sub, flag: '蜜桃专线' } });
            }
        } else {
            tracks.push({ name: '正片', pan: '', ext: { id: mod + '@@' + realId + '@@1@@' + src + '@@' + sub, flag: '蜜桃专线' } });
        }
    } else {
        tracks.push({ name: '正片', pan: '', ext: { id: mod + '@@' + realId + '@@1@@' + src + '@@' + sub, flag: '蜜桃专线' } });
    }
    return jsonify({ list: [{ title: '蜜桃专线', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '').trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    const parts = id.split('@@');
    const mod = parts[0];
    const realId = parts[1] || id;
    const ep = parts[2] || '1';
    const src = parts[3] || '';
    const sub = parts[4] || '';
    // missav 源：honeypeach 的 play 接口已坏，直接从 missav.fans 解析 m3u8（猫版同逻辑）
    if (mod === 'missav') {
        const missavId = String(realId).toLowerCase();
        const missavUrl = 'https://missav.fans/cn/' + encodeURIComponent(missavId);
        const html = await fetchText(missavUrl, {
            'User-Agent': UA,
            Referer: 'https://missav.fans/',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        });
        const uuidMatch = html.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/);
        if (uuidMatch) {
            const hostMatch = html.match(/https?:\/\/(surrit\.[^\/\\"\']+)/);
            const host = hostMatch ? hostMatch[1].replace(/\\/g, '') : 'surrit.mrstcdn.store';
            const m3u8_720 = `https://${host}/${uuidMatch[0]}/720p/video.m3u8`;
            return jsonify({ urls: [m3u8_720], headers: [{ 'User-Agent': UA, Referer: 'https://missav.fans/' }] });
        }
        // 解析失败回退（猫版 parse:1 嗅探）: XPTV 无嗅探位，降级回 missav 页 URL
        return jsonify({ urls: [missavUrl], headers: [{ 'User-Agent': UA, Referer: 'https://missav.fans/' }] });
    }
    const params = {};
    if (src) params.src = src;
    if (sub) params.sub = sub;
    const session = createSession();
    const data = await session.signedGet('/api/play/' + mod + '/' + encodeURIComponent(realId) + '/' + ep, params);
    let finalUrl = '';
    try {
        const pl = (data && data.play) || {};
        const rawSrc = String(pl.src || '');
        const rawProxy = String(pl.src_proxy || '');
        const candidates = [];
        if (rawProxy) candidates.push(rawProxy);
        if (rawSrc) candidates.push(rawSrc);
        for (const c of candidates) {
            if (c && c.indexOf('preview-r10') === -1) {
                finalUrl = c.startsWith('/') ? HOST + c : c;
                break;
            }
        }
        if (!finalUrl && candidates.length) {
            const c = candidates[0];
            finalUrl = c.startsWith('/') ? HOST + c : c;
        }
    } catch (e) {}
    if (!finalUrl) return jsonify({ urls: [], headers: [] });
    const headers = { 'User-Agent': UA, Referer: HOST + '/' };
    if (finalUrl.indexOf('hembed.com') !== -1 || finalUrl.indexOf('hanime') !== -1) {
        headers.Referer = 'https://hanime1.me/';
    }
    return jsonify({ urls: [finalUrl], headers: [headers] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const searchMods = ['video', 'duanju', 'shortv', 'guochan', 'caibian'];
    const session = createSession();
    const list = [];
    for (const mod of searchMods) {
        const data = await session.signedGet('/api/search', { key: mod, kw: wd, page: String(page) });
        const rawList = (data && data.list) || [];
        for (const item of rawList) {
            const itemId = String(item.id || item.code || '');
            if (!itemId) continue;
            const itemSrc = String(item.src || mod);
            const title = String(item.title || itemId).trim();
            const pic = formatCover(mod === 'duanju' ? itemSrc : mod, item.cover_n || item.cover || '');
            const rawRemark = item.remark || item.desc || '';
            const vodId = mod + '@@' + itemId + '@@' + itemSrc;
            list.push({
                vod_id: vodId,
                vod_name: title,
                vod_pic: pic,
                vod_remarks: rawRemark ? '蝴蝶影视 | ' + String(rawRemark).trim() : '蝴蝶影视',
                ext: { id: vodId },
            });
        }
    }
    return jsonify({ list });
}
