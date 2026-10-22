// Uu视频 - XPTV csp 格式（csp_uuvideo）
// 转换自 mira-cat nodejs/src/spider/video/uu_video.js（py_uuvideo，636 行）
// 站点: https://nfu.rftsln9.com（入口 https://utv2.cc）
// API: https://aa3.aa36jn.com:52000 等 4 台（见 API_HOSTS，逐字沿用猫版）
// 依赖 Worker: uu-proxy（https://uu-proxy.li768435813.workers.dev，用户已部署）——
//   仅相对路径播放 id 走 Worker /uuvideo 代理（同猫版 play 分支）；封面走官方
//   签名接口直链，不经 Worker。
// 降级/待验项:
// 1) $fetch.post 待真机验：指纹登录（POST /api-user/v2/login/fingerprint）、
//    封面批量签名（POST /api/v2/home/user/cdn/sign）、PoW 验证 POST 均走
//    $fetch.post(url, body, {headers})，线格式（JSON 字符串 body /
//    form-urlencoded body、Content-Type、Authorization Bearer）逐字保持
//    猫侧格式；XPTV 仓内两源未用过 POST、运行时未证实，待真机验。
// 2) 猫版 play 的 parse:1 嗅探兜底（WORKER_HOST 为空时相对路径回
//    API_HOSTS[0]+路径 的源页 URL）: XPTV 契约无嗅探位，降级为
//    urls:[该源页 URL] 直出并标注嗅探型播放、待真机验 XPTV 是否嗅探
//    非媒体 URL。现行 WORKER_HOST 已配置，该分支不触发；相对路径实际
//    走 Worker（parse:0 等价）。数字 id 主路为指纹登录取 masterUrl +
//    CDN 拼接的 m3u8 直链（parse:0 直出）。
// 3) 猫版双通道（框架 req 后 fetch 兜底）在 XPTV 合并为 $fetch 单通道；
//    API_HOSTS / CDN 列表等多宿主尝试一律串行依次进行（猫版即串行
//    循环，无竞速；无 setTimeout/setInterval 参与逻辑）。
// 4) PoW/cookie：猫版 ensureCookie（FNV-1a 求解 vv_challenge）在原文件
//    中定义但无任何入口调用（API 直调不需 cookie），XPTV 版为对齐原样
//    保留其逻辑；其 cookie 取自响应头 set-cookie，$fetch 是否回响应头
//    未证实，待真机验——不影响五入口主链。
// 5) 跨调用状态：猫版 _cookie/_accessToken/_imgCdn/_cdnList/_categories
//    进程内缓存在 XPTV 只作机会缓存——每个入口在缓存缺失时于调用内
//    重新拉取/登录重建，不依赖 getConfig→getCards 的跨调用传状态。
// 6) Node 专有件替换：Buffer/TextEncoder/TextDecoder 改纯 JS
//    Base64URL 解码与 UTF-8 编解码（逐字节等价）；XOR 解密（响应 key）
//    与 FNV-1a 逐字沿用猫版算法；URLSearchParams 改手工拼 query。
// 7) 诊断卡：猫版无诊断卡逻辑，无丢弃项；封面照猫版现行官方签名直链。

const HOST = 'https://nfu.rftsln9.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// API 服务器列表（从站点 JS 逆向得到，逐字沿用猫版）
const API_HOSTS = [
    'https://aa3.aa36jn.com:52000',
    'https://zje.zje0cx.com:52000',
    'https://hlo.hlos8o.com:52000',
    'https://iv4.iv4muy.com:51999',
];

// Cloudflare Worker 代理（视频 CDN 代理；封面已改走官方签名直链，不再需要 /uuimg）
// 逐字沿用猫版常量；为空时降级为直连/嗅探（见文件头第 2 条）
const WORKER_HOST = 'https://uu-proxy.li768435813.workers.dev';

// 降级硬编码分类（2026-10-19 从 API 实测，已剔除隐藏的 4 个分类，逐字沿用猫版）
const FALLBACK_CATS = [
    { type_id: '268', type_name: '热门' },
    { type_id: '262', type_name: '国产' },
    { type_id: '263', type_name: '日本AV' },
    { type_id: '343', type_name: 'AV无码' },
    { type_id: '344', type_name: 'AV中字' },
    { type_id: '264', type_name: '欧美' },
    { type_id: '267', type_name: '动漫' },
    { type_id: '341', type_name: '三级' },
    { type_id: '342', type_name: 'AI换脸' },
    { type_id: '358', type_name: '麻豆' },
    { type_id: '356', type_name: '擦边短剧' },
    { type_id: '347', type_name: '黑料' },
    { type_id: '266', type_name: '传媒' },
    { type_id: '345', type_name: '女主播' },
];

const appConfig = {
    ver: 1,
    title: 'Uu视频',
    site: HOST,
    tabs: FALLBACK_CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

// ---------- 纯 JS Base64URL / UTF-8（代 Buffer/TextEncoder/TextDecoder） ----------
const B64REV = {};
(function () {
    const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < alpha.length; i++) B64REV[alpha[i]] = i;
})();

function b64urlDecode(s) {
    const b64 = String(s == null ? '' : s).replace(/-/g, '+').replace(/_/g, '/');
    const out = [];
    let acc = 0, bits = 0;
    for (let i = 0; i < b64.length; i++) {
        const ch = b64[i];
        if (ch === '=') break;
        const v = B64REV[ch];
        if (v == null) continue;
        acc = (acc << 6) | v; bits += 6;
        if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
    }
    return new Uint8Array(out);
}

function utf8Bytes(str) {
    const out = [];
    const s = String(str == null ? '' : str);
    for (let i = 0; i < s.length; i++) {
        let cp = s.codePointAt(i);
        if (cp > 0xffff) i++;
        if (cp < 0x80) out.push(cp);
        else if (cp < 0x800) { out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)); }
        else if (cp < 0x10000) { out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
        else { out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)); }
    }
    return new Uint8Array(out);
}

function utf8Text(bytes) {
    let out = '';
    let i = 0;
    while (i < bytes.length) {
        const b = bytes[i];
        if (b < 0x80) { out += String.fromCharCode(b); i += 1; }
        else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) { out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2; }
        else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) { out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3; }
        else if ((b & 0xf8) === 0xf0 && i + 3 < bytes.length) { const cp = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f); out += String.fromCodePoint(cp); i += 4; }
        else { out += String.fromCharCode(b); i += 1; }
    }
    return out;
}

// FNV-1a 哈希（与站点 JS 完全一致，逐字沿用猫版）
function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

// XOR 解密 API 响应（逐字沿用猫版算法；key 为空时等价直通，同猫版
// TextEncoder().encode('') 时 keyBytes[i % 0] 为 undefined、异或 0 的行为）
function xorDecrypt(dataB64, keyStr) {
    const dataBytes = b64urlDecode(dataB64);
    const keyBytes = utf8Bytes(keyStr || '');
    const out = new Uint8Array(dataBytes.length);
    for (let i = 0; i < dataBytes.length; i++) {
        out[i] = keyBytes.length ? (dataBytes[i] ^ keyBytes[i % keyBytes.length]) : dataBytes[i];
    }
    const text = utf8Text(out);
    try {
        return JSON.parse(text);
    } catch (e) {
        return text;
    }
}

function buildQuery(params) {
    const parts = [];
    for (const k of Object.keys(params || {})) {
        const v = params[k];
        if (v === undefined || v === null) continue;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    return parts.join('&');
}

// ---------- 基础传输（$fetch；data 对象/字符串两兼容） ----------
async function httpGet(url, headers) {
    const h = { 'User-Agent': UA, ...(headers || {}) };
    try {
        const res = await $fetch.get(url, { headers: h });
        const data = res ? res.data : '';
        if (data == null || data === '') return { text: '', headers: (res && res.headers) || {}, status: (res && res.status) || 0 };
        return { text: typeof data === 'string' ? data : JSON.stringify(data), headers: (res && res.headers) || {}, status: (res && res.status) || 0 };
    } catch (e) {
        return { text: '', headers: {}, status: 0 };
    }
}

async function httpPost(url, body, headers) {
    const h = { 'User-Agent': UA, ...(headers || {}) };
    try {
        const res = await $fetch.post(url, body, { headers: h });
        const data = res ? res.data : '';
        if (data == null || data === '') return { text: '', headers: (res && res.headers) || {}, status: (res && res.status) || 0 };
        return { text: typeof data === 'string' ? data : JSON.stringify(data), headers: (res && res.headers) || {}, status: (res && res.status) || 0 };
    } catch (e) {
        return { text: '', headers: {}, status: 0 };
    }
}

// ---------- 机会缓存（缺失即调用内重建，见文件头第 5 条） ----------
let _cookie = '';
let _cookieTime = 0;
const COOKIE_TTL = 25 * 60 * 1000;
let _accessToken = '';
let _tokenTime = 0;
const TOKEN_TTL = 30 * 60 * 1000;
let _imgCdn = null;
let _cdnList = null;
let _categories = null;

// 求解 PoW 并获取 vv_challenge cookie（猫版原样保留；原文件无入口调用）
async function ensureCookie() {
    if (_cookie && Date.now() - _cookieTime < COOKIE_TTL) return _cookie;
    const challengeUrl = `${HOST}/videos/more?blockId=2&blockType=hot`;
    const { text: html } = await httpGet(challengeUrl, { Referer: HOST + '/' });
    if (!html || html.length < 5000 || !html.includes('正在验证')) {
        if (_cookie) return _cookie;
        throw new Error('获取挑战页失败');
    }
    const scriptMatch = html.match(/var _\w+=\["([^"]+)","([A-Za-z0-9_-]+)"\]/);
    if (!scriptMatch) throw new Error('挑战数据提取失败');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const mainScript = scripts.reduce((a, b) => (a.length > b.length ? a : b), '');
    const m2 = mainScript.match(/var _\w+=\["([^"]+)","([A-Za-z0-9_-]+)"\]/);
    if (!m2) throw new Error('主挑战数据提取失败');
    const b64d = m2[1];
    const keyd = m2[2];
    const decoded = b64urlDecode(b64d);
    const keyBytes = utf8Bytes(keyd);
    const arr = new Uint8Array(decoded.length);
    for (let i = decoded.length - 1; i >= 0; i--) {
        arr[i] = keyBytes.length ? (decoded[i] ^ keyBytes[i % keyBytes.length]) : decoded[i];
    }
    const challengeData = JSON.parse(utf8Text(arr));
    const { token, postUrl, returnPath } = challengeData[0];
    const payloadB64 = token.split('.')[0];
    const payload = JSON.parse(utf8Text(b64urlDecode(payloadB64)));
    const { seed, difficulty, maxIterations } = payload;
    const target = '0'.repeat(difficulty);
    let proof = -1;
    for (let i = 0; i < maxIterations; i++) {
        if (fnv1a(`${seed}|${i}`).startsWith(target)) { proof = i; break; }
    }
    if (proof < 0) throw new Error('PoW 求解失败');
    const meta = {
        ua: UA,
        lang: 'zh-CN',
        tz: 'Asia/Shanghai',
        screen: '1920x1080',
        webdriver: false,
        framed: false,
    };
    const proofKey = fnv1a([token, meta.ua, meta.lang, meta.tz, meta.screen, String(proof)].join('|'));
    const powResult = { token, proof, meta, path: returnPath, key: proofKey };
    const body = '__viewChallenge=' + encodeURIComponent(JSON.stringify(powResult));
    const verifyUrl = `${HOST}${postUrl || '/_view/challenge'}`;
    const { headers: rh } = await httpPost(verifyUrl, body, {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Referer': challengeUrl,
        'Cache-Control': 'no-store',
    });
    let cookieStr = '';
    if (rh) {
        const sc = rh['set-cookie'] || rh['Set-Cookie'] || '';
        const scText = Array.isArray(sc) ? sc.join('; ') : String(sc);
        const mCookie = scText.match(/vv_challenge=([^;]+)/);
        if (mCookie) cookieStr = `vv_challenge=${mCookie[1]}`;
    }
    if (!cookieStr) throw new Error('未获取到验证 cookie');
    _cookie = cookieStr;
    _cookieTime = Date.now();
    return _cookie;
}

// 调用 API（API 服务器无需 PoW cookie，直接调用；自动 XOR 解密。串行逐宿主）
async function apiCall(apiPath, params) {
    const query = buildQuery(params || {});
    for (const base of API_HOSTS) {
        const url = `${base}${apiPath}${query ? '?' + query : ''}`;
        try {
            const { text } = await httpGet(url, {
                'Referer': HOST + '/',
                'Accept': 'application/json',
            });
            if (!text) continue;
            const resp = JSON.parse(text);
            if (resp.code !== 200) continue;
            if (!resp.data) return null;
            if (typeof resp.data !== 'string') return resp.data;
            return xorDecrypt(resp.data, resp.key || '');
        } catch (e) {
            continue;
        }
    }
    return null;
}

// 生成随机指纹（逐字沿用猫版：32 位 hex 随机串，服务端接受）
function genFingerprint() {
    const hex = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
    return s;
}

// 指纹登录获取 accessToken（POST，$fetch.post 待真机验，见文件头第 1 条）
async function ensureAccessToken() {
    if (_accessToken && Date.now() - _tokenTime < TOKEN_TTL) return _accessToken;
    const fp = genFingerprint();
    const body = JSON.stringify({ channel: 'tz', fingerPrint: fp });
    for (const base of API_HOSTS) {
        try {
            const { text } = await httpPost(`${base}/api-user/v2/login/fingerprint`, body, {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': HOST + '/',
            });
            if (!text) continue;
            const resp = JSON.parse(text);
            if (resp.code !== 200) continue;
            let data = resp.data;
            if (typeof data === 'string' && data) {
                try { data = xorDecrypt(data, resp.key || ''); } catch (e) { continue; }
            }
            const tk = data && (data.accessToken || data.token);
            if (tk) {
                _accessToken = tk;
                _tokenTime = Date.now();
                return _accessToken;
            }
        } catch (e) { continue; }
    }
    throw new Error('指纹登录失败');
}

// 调用需要鉴权的 API（串行逐宿主；401 清 token 后继续下一宿主，同猫版）
async function apiCallAuth(apiPath, params) {
    const token = await ensureAccessToken();
    const query = buildQuery(params || {});
    for (const base of API_HOSTS) {
        const url = `${base}${apiPath}${query ? '?' + query : ''}`;
        try {
            const { text } = await httpGet(url, {
                'Referer': HOST + '/',
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + token,
            });
            if (!text) continue;
            const resp = JSON.parse(text);
            if (resp.code !== 200) {
                if (resp.code === 401) { _accessToken = ''; }
                continue;
            }
            if (resp.data == null) return null;
            if (typeof resp.data === 'string' && resp.data) {
                return xorDecrypt(resp.data, resp.key || '');
            }
            return resp.data;
        } catch (e) { continue; }
    }
    return null;
}

// 图片 CDN 配置（从站点 API 获取：picUrl + bucket；失败降级同猫版）
async function getImgCdn() {
    if (_imgCdn) return _imgCdn;
    try {
        const data = await apiCall('/api/v2/home/public/cdn/image/index', { channel: 'tz' });
        if (data && Array.isArray(data.list) && data.list.length > 0) {
            const line = data.list.find((l) => l.picVideoUrl || l.picUrl) || data.list[0];
            const pic = String(line.picVideoUrl || line.picUrl || '').replace(/\/+$/, '');
            const bucket = String(line.bucket || '').replace(/^\/+|\/+$/g, '');
            if (pic && bucket) {
                let origin = pic;
                try { origin = new URL(pic).origin; } catch (e) { /* 用原值 */ }
                _imgCdn = { origin, bucket };
                return _imgCdn;
            }
        }
    } catch (e) { /* 降级 */ }
    _imgCdn = { origin: 'https://pps.aiide.online', bucket: 'encryption-ts' };
    return _imgCdn;
}

// 批量签名封面图（POST /api/v2/home/user/cdn/sign，需 accessToken；
// $fetch.post 待真机验。串行逐宿主，同猫版）
async function signImages(thumbs) {
    const result = new Map();
    const uniq = [...new Set((thumbs || []).map(t).filter(Boolean))];
    if (uniq.length === 0) return result;
    const cdn = await getImgCdn();
    const pathMap = new Map();
    const signPaths = [];
    for (const th of uniq) {
        let clean = th;
        try {
            if (/^https?:\/\//i.test(th)) clean = new URL(th).pathname;
        } catch (e) { /* 保持原值 */ }
        clean = String(clean).replace(/^\/+/, '');
        if (clean.startsWith(cdn.bucket + '/')) clean = clean.slice(cdn.bucket.length + 1);
        const sp = clean.endsWith('.js') ? `${cdn.bucket}/${clean}` : `${cdn.bucket}/${clean}.js`;
        pathMap.set(sp, th);
        signPaths.push(sp);
    }
    let token = '';
    try { token = await ensureAccessToken(); } catch (e) { return result; }
    for (const base of API_HOSTS) {
        try {
            const { text } = await httpPost(`${base}/api/v2/home/user/cdn/sign`,
                JSON.stringify({ paths: signPaths }),
                {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Referer': HOST + '/',
                    'Authorization': 'Bearer ' + token,
                });
            if (!text) continue;
            const resp = JSON.parse(text);
            if (resp.code !== 200) {
                if (resp.code === 401) { _accessToken = ''; token = await ensureAccessToken().catch(() => ''); }
                continue;
            }
            if (resp.data == null) continue;
            let data = resp.data;
            if (typeof data === 'string' && data) {
                try { data = xorDecrypt(data, resp.key || ''); } catch (e) { continue; }
            }
            if (data && Array.isArray(data.list)) {
                for (const item of data.list) {
                    const th = pathMap.get(item.path);
                    if (th && item.url) {
                        result.set(th, `${cdn.origin}/${String(item.url).replace(/^\/+/, '')}`);
                    }
                }
                return result;
            }
        } catch (e) { continue; }
    }
    return result;
}

// 获取视频 CDN 列表（站点渠道配置；失败降级硬编码，同猫版）
async function getCdnList() {
    if (_cdnList) return _cdnList;
    try {
        const data = await apiCall('/api/v2/home/public/aed/site/channel', { channel: 'tz' });
        if (data && Array.isArray(data.videoUrlCdns) && data.videoUrlCdns.length > 0) {
            _cdnList = data.videoUrlCdns;
            return _cdnList;
        }
    } catch (e) { /* 降级 */ }
    _cdnList = [
        'https://m338.xn--d9u11dw2l41at78afwi.xn--fiqs8s',
        'https://fqu.fquauf.com:51666',
        'https://vte.vteotx.com:51666',
        'https://i1t.i1tyqh.com:51666',
        'https://tmm.tmmr4x.com:51888',
    ];
    return _cdnList;
}

async function getCategories() {
    if (_categories) return _categories;
    // 用户要求隐藏的分类（2026-10-19）：探花360、新闻357、VR346、其他269
    const HIDDEN = new Set(['360', '357', '346', '269']);
    try {
        const data = await apiCall('/api/v2/home/public/video/cate/list', { type: 'long' });
        if (data && data.list && data.list.length > 0) {
            _categories = data.list
                .map((c) => ({
                    type_id: String(c.id),
                    type_name: c.title || c.name,
                }))
                .filter((c) => !HIDDEN.has(c.type_id));
            return _categories;
        }
    } catch (e) { /* 降级到硬编码 */ }
    _categories = FALLBACK_CATS.slice();
    return _categories;
}

function formatVideo(v) {
    // thumb 是 .enc 加密图，封面地址由 fillPics() 批量签名后填入
    // ext 按 XPTV 契约补 {id: vod_id}（猫版靠 vod_id 直达 detail，XPTV 靠 card.ext 传值）
    return {
        vod_id: String(v.id),
        vod_name: v.title || '',
        vod_pic: '',
        vod_remarks: v.classifyTitles || v.labelTitles || '',
        ext: { id: String(v.id) },
        _thumb: t(v.thumb),
    };
}

// 批量签名并填入封面（列表页调用一次，20 张图一次签名请求）
async function fillPics(list) {
    const thumbs = list.map((v) => v._thumb).filter(Boolean);
    const signed = await signImages(thumbs);
    for (const v of list) {
        if (v._thumb) v.vod_pic = signed.get(v._thumb) || '';
        delete v._thumb;
    }
    return list;
}

// ---------- 五入口 ----------
async function getConfig() {
    let cats = FALLBACK_CATS;
    try {
        const live = await getCategories();
        if (live && live.length) cats = live;
    } catch (e) { /* 静态兜底 */ }
    return jsonify({
        ver: 1,
        title: 'Uu视频',
        site: HOST,
        tabs: cats.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || ext.id || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cats = await getCategories();
    const cat = cats.find((c) => c.type_id === tid) || cats[0];
    // 热门(268) 用 type=hot 接口；其余 type=cate+typeId（逐字沿用猫版 category）
    let params;
    if (cat.type_id === '268') {
        params = { page: String(page), limit: '20', type: 'hot', videoType: 'long' };
    } else {
        params = { page: String(page), limit: '20', type: 'cate', typeId: cat.type_id, videoType: 'long' };
    }
    const data = await apiCall('/api/v2/home/public/video/list', params);
    const total = (data && data.total) || 0;
    if (total > 0 && (page - 1) * 20 >= total) {
        return jsonify({ list: [] });
    }
    const list = data && data.list ? await fillPics(data.list.map(formatVideo)) : [];
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawId = ext.id != null ? ext.id : ext.tid;
    const vodId = String(Array.isArray(rawId) ? rawId[0] : rawId || '').trim();
    if (!vodId) return jsonify({ list: [] });
    const data = await apiCall('/api/v2/home/public/video/long/detail', { id: vodId });
    if (!data) return jsonify({ list: [] });
    // 猫版 detail 产出 vod_play_from='Uu视频'、vod_play_url=`正片$${vodId}`，
    // 按 $$$ 分组 / $ 拆集映射为单组单集，playId 原样进 track.ext
    return jsonify({
        list: [{ title: 'Uu视频', tracks: [{ name: '正片', pan: '', ext: { id: vodId, flag: 'Uu视频' } }] }],
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    // 如果已经是完整 URL，直接返回（猫版 parse:0）
    if (/^https?:\/\//i.test(id)) {
        return jsonify({ urls: [id], headers: [{ Referer: HOST + '/', 'User-Agent': UA }] });
    }
    // 相对路径走 Worker 代理（猫版 parse:0）；WORKER 为空时猫版 parse:1
    // 嗅探兜底降级回源页 URL（见文件头第 2 条，待真机验）
    if (id.startsWith('/')) {
        if (WORKER_HOST) {
            const workerUrl = `${WORKER_HOST}/uuvideo?url=${encodeURIComponent(id)}`;
            return jsonify({ urls: [workerUrl], headers: [{ Referer: HOST + '/', 'User-Agent': UA }] });
        }
        const fullUrl = `${API_HOSTS[0]}${id}`;
        return jsonify({ urls: [fullUrl], headers: [{ Referer: HOST + '/', 'User-Agent': UA }] });
    }
    // 数字 id：走播放地址 API（指纹登录 → masterUrl + CDN 拼接 = m3u8 直链）
    try {
        const playData = await apiCallAuth('/api/v2/home/user/video/play/url', { id });
        if (playData) {
            const relUrl = playData.masterUrl || playData.p720Url || playData.p480Url || '';
            if (relUrl) {
                const cdns = await getCdnList();
                let cdnIdx = 0;
                const cdnIdMatch = String(relUrl).match(/cdnId=(\d+)/);
                if (cdnIdMatch) {
                    const cid = parseInt(cdnIdMatch[1], 10);
                    if (cid >= 0 && cid < cdns.length) cdnIdx = cid;
                }
                const fullUrl = cdns[cdnIdx].replace(/\/$/, '') + relUrl;
                return jsonify({ urls: [fullUrl], headers: [{ Referer: HOST + '/', 'User-Agent': UA }] });
            }
        }
    } catch (e) {
        // 降级：返回空（同猫版）
    }
    return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const data = await apiCall('/api/v2/home/public/video/search', {
        page: String(page), limit: '20', keyword: wd, videoType: 'long',
    });
    const rawList = data && (data.list || data.data) ? (data.list || data.data) : [];
    const list = await fillPics(rawList.map(formatVideo));
    return jsonify({ list });
}
