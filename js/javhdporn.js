// JAVHDPorn - XPTV csp 格式 (csp_javhdporn)
// 转换自 mira-cat nodejs/src/spider/video/javhdporn.js (py_javhdporn, 站点 https://www.javhdporn.net)
// 依赖: pornfhd-fetch Worker (https://pornfhd-fetch.li768435813.workers.dev) 的 /get、/post 通道;
//       铸造库只读查库 (GET /cast?u=<watch页URL>) —— 本模块只有查库, 无任何写库逻辑。
// 播放链 (照猫版 2026-10-22 现行版): 查库命中用库内 paths 走 embed 解密直出; 未命中回退
//       模块内现铸 (POST /api/play/, data-ver 切盐分支), POST 经 Worker /post 为主、
//       $fetch.post 直连为辅 —— $fetch.post 待真机验 (本地 harness 已验线格式可通)。
//       现铸也失败时降级回 watch 页 URL (XPTV 无嗅探位, 待真机验 XPTV 是否嗅探非媒体 URL)。
// 猫版的多通道竞速与延时重试一律改串行; 诊断卡/诊断集名丢弃; 猫版清晰度分组呈现
//       (1080p/720p/480p 分组 + 组内降序) 映射为 getTracks 的线路组 (每档一个 group)。
// resolveLines 结果带进程内备忘 (仅提速, 取不到备忘时完整重铸, 不依赖跨调用状态)。

const HOST = 'https://www.javhdporn.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = HOST + '/';
// 自有取页跳板 pornfhd-fetch (用户自有 Cloudflare Worker, 第一通道)
const OWN_FETCH = 'https://pornfhd-fetch.li768435813.workers.dev';

// 分类: 照猫版 CATS (2026-10-21 逐类实测站方计数, 2026-10-22 复核 slug 未变)
const CATS = [
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'decensored', type_name: '无码破解' },
  { type_id: 'uncensored/fc2-ppv', type_name: 'FC2 PPV' },
  { type_id: 'chinese-subtitle', type_name: '中文字幕' },
  { type_id: 'censored/english-subtitle', type_name: '英文字幕' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'decensored/uncensored-leaked', type_name: '无码流出' },
  { type_id: 'uncensored/tokyo-hot', type_name: 'Tokyo Hot' },
  { type_id: 'subtitle-indonesia', type_name: '印尼字幕' },
  { type_id: 'censored/subthai', type_name: '泰文字幕' },
];

const appConfig = {
    ver: 1,
    title: 'JAVHDPorn',
    site: HOST,
    tabs: CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(x) {
  return x === undefined || x === null ? '' : String(x).trim();
}

function clean(s) {
  return t(String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8230;/g, '…')
    .replace(/&#\d+;/g, ''));
}

// ---------------- $fetch 薄封装 (data 对象/字符串两兼容) ----------------
async function sfGet(url, headers) {
  try {
    const r = await $fetch.get(url, { headers: headers || {} });
    return { status: (r && typeof r.status === 'number') ? r.status : 200, data: r ? r.data : '' };
  } catch (e) {
    return { status: 0, data: '' };
  }
}

async function sfPost(url, bodyStr, headers) {
  try {
    const r = await $fetch.post(url, bodyStr, { headers: headers || {} });
    return { status: (r && typeof r.status === 'number') ? r.status : 200, data: r ? r.data : '' };
  } catch (e) {
    return { status: 0, data: '' };
  }
}

// 正文文本: 字符串原样; 对象 (JSON 已被运行时解析时) 序列化回文本
function dataText(data) {
  if (typeof data === 'string') return data;
  if (data === null || data === undefined) return '';
  if (typeof data === 'object') {
    try { return JSON.stringify(data); } catch (e) { return ''; }
  }
  return String(data);
}

// ---------------- 解析 (严格层 + 宽松层, 照猫版) ----------------
function parseCardsStrict(html) {
  const out = [];
  const seen = new Set();
  const blocks = String(html || '').split('<article');
  for (const b of blocks) {
    if (!b.includes('thumb-block')) continue;
    const hrefM = b.match(/href="(https:\/\/www\.javhdporn\.net\/video\/[^"]+\/)"/);
    if (!hrefM) continue;
    const url = hrefM[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const titleM = b.match(/<a[^>]+class="archive-entry"[^>]+title="([^"]+)"/) ||
                   b.match(/title="([^"]{4,})"/);
    const name = titleM ? clean(titleM[1]) : url.split('/video/')[1].replace(/\//g, '');
    let pic = '';
    const lazyM = b.match(/data-lazy-src="(https:[^"]+)"/);
    if (lazyM) pic = lazyM[1].replace('pics.pornfhd.com/s/', 'pics.pornfhd.com/');
    const durM = b.match(/class="duration"[^>]*>(?:<[^>]+>)*\s*([0-9:]+)/);
    const badgeM = b.match(/class="hd-video"[^>]*>([^<]+)</);
    out.push({
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: durM ? durM[1] : (badgeM ? clean(badgeM[1]) : ''),
    });
  }
  return out;
}

function parseCardsLoose(html) {
  const out = [];
  const seen = new Set();
  const h = String(html || '');
  const re = /<a\b[^>]*?href\s*=\s*["']((?:https?:\/\/(?:www\.)?javhdporn\.net)?\/video\/[^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(h)) !== null) {
    let url = m[1];
    if (url.startsWith('/')) url = HOST + url;
    url = url.replace(/^http:\/\//, 'https://');
    if (seen.has(url)) continue;
    seen.add(url);
    const tag = m[0];
    const win = h.slice(m.index, m.index + 1800);
    let name = '';
    const tm = tag.match(/title\s*=\s*"([^"]+)"/) || tag.match(/title\s*=\s*'([^']+)'/);
    if (tm) name = clean(tm[1]);
    if (!name) {
      const altM = win.match(/<img[^>]+alt="([^"]{4,})"/);
      if (altM) name = clean(altM[1]);
    }
    if (!name) {
      const txtM = win.match(/<header class="entry-header">\s*<span>([^<]{4,})<\/span>/);
      if (txtM) name = clean(txtM[1]);
    }
    if (!name) name = url.split('/video/')[1].replace(/\//g, '');
    let pic = '';
    const lazyM = win.match(/data-lazy-src="(https:[^"]+)"/);
    if (lazyM) pic = lazyM[1].replace('pics.pornfhd.com/s/', 'pics.pornfhd.com/');
    if (!pic) {
      const wpM = win.match(/data-wpsrc="(https:[^"]+)"/);
      if (wpM) pic = wpM[1];
    }
    if (!pic) {
      const srcM = win.match(/<img[^>]+src="(https:[^"]+)"/);
      if (srcM && !srcM[1].startsWith('data:')) pic = srcM[1];
    }
    const durM = win.match(/class="duration"[^>]*>(?:<[^>]+>)*\s*([0-9:]+)/);
    const badgeM = win.match(/class="hd-video"[^>]*>([^<]+)</);
    out.push({
      vod_id: url,
      vod_name: name,
      vod_pic: pic,
      vod_remarks: durM ? durM[1] : (badgeM ? clean(badgeM[1]) : ''),
    });
  }
  return out;
}

// 合并: 严格层优先, 宽松层补漏
function parseCards(html) {
  const strict = parseCardsStrict(html);
  const byUrl = new Map(strict.map((c) => [c.vod_id, c]));
  for (const c of parseCardsLoose(html)) {
    if (!byUrl.has(c.vod_id)) byUrl.set(c.vod_id, c);
  }
  return [...byUrl.values()];
}

function toCard(c) {
  return {
    vod_id: c.vod_id,
    vod_name: c.vod_name,
    vod_pic: c.vod_pic,
    vod_remarks: c.vod_remarks,
    ext: { id: c.vod_id },
  };
}

// ---------------- 抓取层 (串行多通道, 照猫版通道序) ----------------
const BROWSER_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
  'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

function isShellPage(s) {
  return /Attention Required|Just a moment|cf-challenge|Checking your browser/i.test(s || '');
}
function validListPage(html) {
  return !!html && !isShellPage(html) && parseCards(html).length > 0;
}
function validDetailPage(html) {
  return !!html && !isShellPage(html) && html.length > 4000 &&
    (/property="og:(title|image)"/.test(html) || html.includes('videojs.html') || html.includes('data-mpu'));
}
function validFor(kind, html) {
  return kind === 'detail' ? validDetailPage(html) : validListPage(html);
}

const OWN_HOST_RE = /(^|\.)(javhdporn\.net|bestjavporn\.com|pornfhd\.com)$/i;

async function chOwn(url) {
  try {
    if (!OWN_HOST_RE.test(new URL(url).hostname)) return '';
  } catch (e) { return ''; }
  const w = OWN_FETCH + '/get?u=' + encodeURIComponent(url) + '&ref=' + encodeURIComponent(REFERER);
  const r = await sfGet(w, { 'User-Agent': UA });
  return dataText(r.data);
}

async function chDirect(url, referer) {
  const r = await sfGet(url, { ...BROWSER_HEADERS, Referer: referer || REFERER });
  return dataText(r.data);
}

async function chJina(url) {
  const r = await sfGet('https://r.jina.ai/' + url, { 'User-Agent': UA, 'x-respond-with': 'html' });
  return dataText(r.data);
}

async function chAoGet(url) {
  const r = await sfGet('https://api.allorigins.win/get?url=' + encodeURIComponent(url), { 'User-Agent': UA });
  if (r.data && typeof r.data === 'object') {
    return typeof r.data.contents === 'string' ? r.data.contents : '';
  }
  const body = dataText(r.data);
  if (!body) return '';
  try {
    const j = JSON.parse(body);
    return typeof j.contents === 'string' ? j.contents : '';
  } catch (e) { return ''; }
}

async function chAoRaw(url) {
  const r = await sfGet('https://api.allorigins.win/raw?url=' + encodeURIComponent(url), { 'User-Agent': UA });
  return dataText(r.data);
}

async function chCodetabs(url) {
  const r = await sfGet('https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(url), { 'User-Agent': UA });
  return dataText(r.data);
}

// 串行取页: own (自有 Worker) -> 直连 -> jina -> aoGet -> codetabs,
// 第一个通过解析型校验的正文胜出; 全灭回空串。
async function fetchPage(url, kind) {
  const channels = [
    () => chOwn(url),
    () => chDirect(url),
    () => chJina(url),
    () => chAoGet(url),
    () => chCodetabs(url),
  ];
  for (const fn of channels) {
    let body = '';
    try { body = await fn(); } catch (e) { body = ''; }
    if (validFor(kind, body)) return body;
  }
  return '';
}

// ---------------- URL 构造 ----------------
function catUrl(tid, page) {
  const base = `${HOST}/category/${tid}/`;
  return page > 1 ? `${base}page/${page}/` : base;
}
function searchUrl(kw, page) {
  const base = `${HOST}/search/${encodeURIComponent(kw)}/`;
  return page > 1 ? `${base}page/${page}/` : base;
}
function absUrl(u) {
  if (/^https?:\/\//.test(u)) return u;
  return HOST + (u.startsWith('/') ? u : '/' + u);
}

// ---------------- 纯 JS 密码件 (cast.js 反混淆复刻, 照猫版) ----------------
const B64CH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64REV = (() => {
  const o = {};
  for (let i = 0; i < 64; i++) o[B64CH[i]] = i;
  o['-'] = 62; o['_'] = 63;
  return o;
})();

function b64ToBytes(s) {
  const str = String(s || '').replace(/[^A-Za-z0-9+/=_-]/g, '');
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of str) {
    if (ch === '=') break;
    const v = B64REV[ch];
    if (v == null) continue;
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}

function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64CH[a >> 2] + B64CH[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? B64CH[((b & 15) << 2) | (c >> 6)] : '=') +
      (i + 2 < bytes.length ? B64CH[c & 63] : '=');
  }
  return s;
}

function strToB64(str) { // 入参均为 ASCII: 逐字节取 charCode, 与猫版等价
  const s = String(str || '');
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i) & 0xff;
  return bytesToB64(bytes);
}

function bytesToLatin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
}

// 纯 JS UTF-8 解码 (与猫版解码等价)
function bytesToUtf8(bytes) {
  let s = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) { s += String.fromCharCode(b); i += 1; }
    else if (b >= 0xc2 && b < 0xe0) {
      s += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)); i += 2;
    } else if (b >= 0xe0 && b < 0xf0) {
      s += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)); i += 3;
    } else if (b >= 0xf0 && b < 0xf5) {
      const cp = ((b & 7) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const off = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff)); i += 4;
    } else { s += String.fromCharCode(b); i += 1; }
  }
  return s;
}

function rc4(keyStr, data) {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  const kb = [];
  for (let i = 0; i < keyStr.length; i++) kb.push(keyStr.charCodeAt(i) & 0xff);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + kb[i % kb.length]) & 0xff;
    const tmp = S[i]; S[i] = S[j]; S[j] = tmp;
  }
  let a = 0; j = 0;
  const out = new Uint8Array(data.length);
  for (let n = 0; n < data.length; n++) {
    a = (a + 1) & 0xff;
    j = (j + S[a]) & 0xff;
    const tmp = S[a]; S[a] = S[j]; S[j] = tmp;
    out[n] = data[n] ^ S[(S[a] + S[j]) & 0xff];
  }
  return out;
}

// dex(salt, seed, data) = b64decode( RC4( reverse(b64(seed + salt)), b64decode(data) ) )
function dexSalt(salt, seed, data) {
  const key = strToB64(String(seed) + salt).split('').reverse().join('');
  const mid = bytesToLatin1(rc4(key, b64ToBytes(data)));
  return bytesToLatin1(b64ToBytes(mid));
}
function dexSaltUtf8(salt, seed, data) {
  const key = strToB64(String(seed) + salt).split('').reverse().join('');
  const mid = bytesToLatin1(rc4(key, b64ToBytes(data)));
  return bytesToUtf8(b64ToBytes(mid));
}

// 盐表 (cast.js 常量数组实测, 照猫版): 响应恒用主盐; 令牌按 data-ver 分支选盐
const SALT_MAIN = '_0x58fe15';
function tokenSalts(ver) {
  if (ver === '1') return ['QxLUF1bgIAdeQX', SALT_MAIN, 'SyntaxError'];
  if (ver === '2') return ['SyntaxError', SALT_MAIN, 'QxLUF1bgIAdeQX'];
  return [SALT_MAIN, 'SyntaxError', 'QxLUF1bgIAdeQX'];
}
function dexResp(seed, data) { return dexSalt(SALT_MAIN, seed, data); }
function dexRespUtf8(seed, data) { return dexSaltUtf8(SALT_MAIN, seed, data); }

// embed 页 data-config 解密: key = reverse( b64( b64(pathname+search).substr(4,20) + '_0x59a0e4' ) )
function decryptConfig(cfgB64, pathname, search) {
  const arg = strToB64(String(pathname) + String(search)).substring(4, 20);
  const key = strToB64(arg + '_0x59a0e4').split('').reverse().join('');
  const pt = bytesToLatin1(rc4(key, b64ToBytes(cfgB64)));
  const json = JSON.parse(bytesToUtf8(b64ToBytes(pt)));
  const sources = JSON.parse(bytesToUtf8(b64ToBytes(json.src || '')));
  return { json, sources };
}

// ---------------- POST /api/play/ (现铸, 串行通道) ----------------
function validPlayResp(text) {
  // 必须 status === true 才算铸造成功 (站方回 {"status":false} 是假成功)
  if (!text) return false;
  try {
    const j = JSON.parse(text);
    return !!j && typeof j === 'object' && j.status === true;
  } catch (e) { return false; }
}
function sawPlayJson(text) {
  if (!text) return false;
  try {
    const j = JSON.parse(text);
    return !!j && typeof j === 'object' && 'status' in j;
  } catch (e) { return false; }
}

// 串行: Worker /post -> $fetch.post 直连 -> (无任何通道拿到站方 JSON 时) Worker /post 再一发。
// 回 {text, via, stage}: stage 'post-bad'=拿到 JSON 但被拒 / 'post-none'=通道不通。
async function httpPostForm(url, bodyStr, referer) {
  const ref = referer || REFERER;
  const formHeaders = {
    'User-Agent': UA,
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': ref,
    'Origin': HOST,
  };
  const ownPost = async () => {
    const w = OWN_FETCH + '/post?u=' + encodeURIComponent(url) + '&ref=' + encodeURIComponent(ref);
    const r = await sfPost(w, bodyStr, { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' });
    return dataText(r.data);
  };
  const directPost = async () => {
    const r = await sfPost(url, bodyStr, formHeaders);
    return dataText(r.data);
  };
  let sawJson = false;
  const tries = [['own', ownPost], ['direct', directPost]];
  for (const [name, fn] of tries) {
    let text = '';
    try { text = await fn(); } catch (e) { text = ''; }
    if (sawPlayJson(text)) sawJson = true;
    if (validPlayResp(text)) return { text, via: name, stage: 'ok' };
  }
  if (!sawJson) {
    // own 的上游 403 可能是站方对 Workers 出口的间歇拒绝, 无延时再打一发
    let text = '';
    try { text = await ownPost(); } catch (e) { text = ''; }
    if (sawPlayJson(text)) sawJson = true;
    if (validPlayResp(text)) return { text, via: 'own2', stage: 'ok' };
  }
  return { text: '', via: '', stage: sawJson ? 'post-bad' : 'post-none' };
}

// ---------------- 播放解析 ----------------
function extractPlaySeed(html) {
  const postId = (html.match(/id="video-player-area"[^>]*data-video-id="(\d+)"/) || html.match(/data-video-id="(\d+)"/) || [])[1] || '';
  const mpu = (html.match(/data-mpu="([^"]+)"/) || [])[1] || '';
  const ver = (html.match(/id="video-player"[^>]*data-ver="([^"]+)"/) || html.match(/data-ver="([^"]+)"/) || [])[1] || '2';
  return { postId, mpu, ver };
}

// ---------------- 铸造库 (cast-bank, 只读查库) ----------------
// 契约: GET {OWN_FETCH}/cast?u=<watch 页完整 URL> -> 命中 200
// {"paths":[embed 路径数组],"ts":epoch}; 未命中 404。本模块只查库, 不写库。
async function castBankLookup(watchUrl) {
  try {
    const w = OWN_FETCH + '/cast?u=' + encodeURIComponent(watchUrl);
    const r = await sfGet(w, { 'User-Agent': UA });
    if (!r || (r.status && r.status !== 200)) return { hit: false };
    let j = null;
    if (r.data && typeof r.data === 'object') j = r.data;
    else {
      if (!r.data) return { hit: false };
      try { j = JSON.parse(dataText(r.data)); } catch (e) { return { hit: false }; }
    }
    const seen = new Set();
    const arr = (j && Array.isArray(j.paths))
      ? j.paths.filter((p) => {
          if (typeof p !== 'string' || !p.startsWith('//') || seen.has(p)) return false;
          seen.add(p);
          return true;
        })
      : [];
    if (!arr.length) return { hit: false };
    return { hit: true, paths: arr.map((p, i) => ({ lo: i === 0 ? 'main' : 'bak', path: p })) };
  } catch (e) {
    return { hit: false };
  }
}

// 查库优先; 未命中调 /api/play/ 现铸并解出全部线路的 embed 路径。
// 令牌盐按 data-ver 选; 站方回 status:false 时换下一盐重试 (照猫版)。
async function fetchEmbedPaths(postId, mpu, ver, referer) {
  const bank = await castBankLookup(referer);
  if (bank.hit) return { paths: bank.paths, stage: 'ok', via: 'cast-bank', bank: 'hit' };
  let lastStage = 'post-none';
  for (const salt of tokenSalts(ver)) {
    const token = dexSalt(salt, postId, mpu);
    const body = 'sources=' + encodeURIComponent(token) + '&ver=' + encodeURIComponent(ver || '2');
    const r = await httpPostForm(HOST + '/api/play/', body, referer);
    if (!r.text) { lastStage = r.stage || 'post-none'; continue; }
    let resp;
    try { resp = JSON.parse(r.text); } catch (e) { return { paths: [], stage: 'post-bad', via: r.via, bank: 'miss' }; }
    if (!resp || resp.status !== true || !resp.data) { lastStage = 'post-bad'; continue; }
    const paths = [];
    try { paths.push({ lo: t(resp.lo) || 'main', path: dexResp(postId, resp.data) }); } catch (e) { /* 主线解码失败 */ }
    if (resp.reserve) {
      try {
        const arr = JSON.parse(dexRespUtf8(postId, resp.reserve));
        for (const x of arr) {
          if (x && x.data) {
            try { paths.push({ lo: t(x.lo) || 'bak', path: dexResp(postId, x.data) }); } catch (e) { /* 跳过坏备线 */ }
          }
        }
      } catch (e) { /* reserve 整体解码失败: 只用主线 */ }
    }
    return { paths: paths.filter((p) => p.path && p.path.startsWith('//')), stage: 'ok', via: r.via, bank: 'miss' };
  }
  return { paths: [], stage: lastStage, via: '', bank: 'miss' };
}

// embed 取页: 直连优先 (文件令牌绑查看者 IP, 与播放器自洽), 代理只兜底 (照猫版)。
// 串行逐通道试, 正文含 data-config 即胜出。回 {html, winName}。
async function fetchEmbedPage(url, referer) {
  const hdrs = { ...BROWSER_HEADERS, Referer: referer || REFERER };
  const channels = [
    ['direct', async () => dataText((await sfGet(url, hdrs)).data)],
    ['own', async () => chOwn(url)],
    ['jina', async () => chJina(url)],
    ['aoGet', async () => chAoGet(url)],
    ['aoRaw', async () => chAoRaw(url)],
    ['codetabs', async () => chCodetabs(url)],
  ];
  for (const [name, fn] of channels) {
    let body = '';
    try { body = await fn(); } catch (e) { body = ''; }
    if (body && body.includes('data-config="')) return { html: body, winName: name };
  }
  return { html: '', winName: '' };
}

// embed 页 -> {sources, direct, viaName} (direct = 直连取回, 令牌绑设备 IP)
async function resolveEmbed(embedUrl, referer) {
  const r = await fetchEmbedPage(embedUrl, referer);
  if (!r.html) return null;
  const cfg = (r.html.match(/data-config="([^"]+)"/) || [])[1];
  if (!cfg) return null;
  let u;
  try { u = new URL(embedUrl); } catch (e) { return null; }
  try {
    const { sources } = decryptConfig(cfg, u.pathname, u.search);
    if (Array.isArray(sources) && sources.length) {
      return { sources, direct: r.winName === 'direct', viaName: r.winName };
    }
  } catch (e) { /* 解密失败 */ }
  return null;
}

const HOST_PRETTY = [
  [/maxstream/i, 'MaxStream'],
  [/streamhls/i, 'StreamHLS'],
  [/hugstream/i, 'HugStream'],
  [/cloudatacdn|clouddata/i, 'CloudCDN'],
  [/streamtape|tapecontent/i, 'StreamTape'],
  [/pianopic/i, 'PianoPic'],
  [/turbovid|turbo/i, 'TurboVid'],
  [/filemoon|filemoonu/i, 'FileMoon'],
  [/vidhide|earnvid/i, 'VidHide'],
  [/voe/i, 'VOE'],
];
function prettyHost(fileUrl) {
  for (const [re, name] of HOST_PRETTY) if (re.test(fileUrl)) return name;
  try { return new URL(fileUrl).hostname.replace(/^www\./, ''); } catch (e) { return '线路'; }
}
function hostRank(name) {
  if (name === 'MaxStream') return 0;
  if (name === 'CloudCDN') return 1;
  if (name === 'StreamTape') return 2;
  if (name === 'StreamHLS' || name === 'PianoPic') return 9;
  return 5;
}
// 线路出口分组: 直连解出 (令牌绑设备 IP) > hugstream 前置 (master.txt,
// 不绑 IP 只认 Referer) > 借线绑定型 (借线出口解出, 设备点播必 403)。
function lineGroup(ln) {
  if (ln.direct) return 0;
  if (/master\.txt(\?|$)/i.test(ln.parentFile || ln.file || '')) return 1;
  return 2;
}

// ---------------- 清晰度展开 (照猫版高清修复) ----------------
function labelRes(label) {
  const m = t(label).match(/(\d{3,4})\s*p/i);
  return m ? parseInt(m[1], 10) : 0;
}

// 主清单正文 -> 变体表 [{file, q, bw}] (q 降序, 同 q 码率降序)
function parseVariants(body, base) {
  const out = [];
  const lines = String(body || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/#EXT-X-STREAM-INF:([^\r\n]*)/);
    if (!m) continue;
    const bw = parseInt((m[1].match(/BANDWIDTH=(\d+)/) || [])[1] || '0', 10);
    const rm = m[1].match(/RESOLUTION=(\d+)x(\d+)/);
    let q = rm ? parseInt(rm[2], 10) : 0;
    if (!q && bw) q = bw >= 2500000 ? 1080 : (bw >= 1100000 ? 720 : 480);
    let uri = '';
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      const s = lines[j].trim();
      if (s && !s.startsWith('#')) { uri = s; break; }
    }
    if (!uri) continue;
    try { uri = new URL(uri, base).toString(); } catch (e) { continue; }
    out.push({ file: uri, q, bw });
  }
  out.sort((a, b) => (b.q - a.q) || (b.bw - a.bw));
  return out;
}

// 取清单并判形态 (只走直连, 与 embed 同为设备出口, 清单令牌自洽)
async function fetchMasterVariants(file, referer) {
  try {
    const r = await sfGet(file, { 'User-Agent': UA, Referer: referer, Accept: '*/*' });
    if (r.status && (r.status < 200 || r.status >= 300)) return null;
    const body = dataText(r.data);
    if (!body || !body.includes('#EXTM3U')) return null;
    const variants = parseVariants(body, file);
    if (variants.length) return { master: true, variants };
    if (body.includes('#EXTINF')) return { master: false, variants: [] };
    return null;
  } catch (e) { return null; }
}

// 一个 embed 的全部 sources -> 线路表: MP4 单条 (q 取 label); HLS 多档
// 主清单逐档一条 (q 降序); 单档/媒体清单/取不到时按原文件一条。
// v = 该 embed 内的序号 (detail/play 对位用)。
async function expandSources(sources, embedUrl) {
  const out = [];
  for (const s of (sources || [])) {
    if (!s || !s.file) continue;
    const isHls = /hls|m3u8/i.test(s.type || '') || /\.m3u8(\?|$)/i.test(s.file) || /\.txt(\?|$)/i.test(s.file);
    if (!isHls) { out.push({ file: s.file, type: t(s.type), q: labelRes(s.label), parent: s.file }); continue; }
    const mv = await fetchMasterVariants(s.file, embedUrl);
    if (mv && mv.master && mv.variants.length > 1) {
      for (const v of mv.variants) out.push({ file: v.file, type: 'hls', q: v.q, parent: s.file });
    } else if (mv && mv.master && mv.variants.length === 1) {
      out.push({ file: s.file, type: t(s.type), q: mv.variants[0].q || labelRes(s.label), parent: s.file });
    } else {
      out.push({ file: s.file, type: t(s.type), q: labelRes(s.label), parent: s.file });
    }
  }
  out.forEach((e, i) => { e.v = i; });
  return out;
}

// 线路显示宿主: 文件宿主无家族命中时回落 embed 家族名
function displayHost(file, embedUrl) {
  const h = prettyHost(file);
  try {
    if (new URL(file).hostname.replace(/^www\./, '') === h) {
      const eh = prettyHost(embedUrl);
      if (eh && eh !== h) return eh;
    }
  } catch (e) { /* 保持原名 */ }
  return h;
}

// 全链解析: {lines, stage, via, bank} (串行逐 embed 解, 照猫版排序骨架:
// 出口组优先, 组内清晰度降序, 再宿主可靠性与原序)
async function resolveLinesRaw(durl) {
  const html = await fetchPage(durl, 'detail');
  if (!html) return { lines: [], stage: 'page', via: '', bank: '' };
  const { postId, mpu, ver } = extractPlaySeed(html);
  if (!postId || !mpu) return { lines: [], stage: 'seed', via: '', bank: '' };
  const { paths, stage, via, bank } = await fetchEmbedPaths(postId, mpu, ver, durl);
  if (!paths.length) return { lines: [], stage, via, bank };
  const lines = [];
  const list = paths.slice(0, 8);
  for (let idx = 0; idx < list.length; idx++) {
    const p = list[idx];
    const embedUrl = 'https:' + p.path;
    const r = await resolveEmbed(embedUrl, durl);
    if (!r) continue;
    const expanded = await expandSources(r.sources, embedUrl);
    for (const e of expanded) {
      lines.push({ idx, v: e.v, lo: p.lo, embedUrl, file: e.file, parentFile: e.parent, type: e.type, host: displayHost(e.file, embedUrl), q: e.q, direct: !!r.direct });
    }
  }
  lines.sort((a, b) => (lineGroup(a) - lineGroup(b)) || ((b.q || 0) - (a.q || 0)) || (hostRank(a.host) - hostRank(b.host)) || (a.idx - b.idx) || ((a.v || 0) - (b.v || 0)));
  if (!lines.length) return { lines: [], stage: 'embed', via, bank };
  return { lines, stage: 'ok', via, bank };
}

// 进程内备忘: 同一运行期内 getTracks 与紧随的 getPlayinfo 不重复铸造;
// 备忘未命中时完整重铸, 结果不依赖备忘存在。
const _linesMemo = {};
async function resolveLines(durl) {
  const hit = _linesMemo[durl];
  if (hit) return hit;
  const r = await resolveLinesRaw(durl);
  if (r.lines && r.lines.length) _linesMemo[durl] = r;
  return r;
}

// ---------------- 五入口 ----------------
async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  const tid = t(ext.tid || ext.id) || CATS[0].type_id;
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const html = await fetchPage(catUrl(tid, page), 'list');
  const list = html ? parseCards(html).map(toCard) : [];
  return jsonify({ list });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const id = t(ext.id || ext.url);
  if (!id) return jsonify({ list: [] });
  const durl = absUrl(id);
  let rl;
  try { rl = await resolveLines(durl); }
  catch (e) { rl = { lines: [], stage: 'error', via: '', bank: '' }; }
  const lines = rl.lines || [];
  const groups = [];
  if (!lines.length) {
    // 全链失败: 降级一条 watch 页 URL (XPTV 无嗅探位, 待真机验)
    groups.push({
      title: '网页嗅探·兜底',
      tracks: [{ name: '播放', pan: '', ext: { id: durl + '@@sniff', flag: '网页嗅探·兜底' } }],
    });
    return jsonify({ list: groups });
  }
  // 清晰度分组 (照猫版呈现): 每档一个 group (title=档位, 降序),
  // 组内沿用全局序 (出口组 -> 清晰度 -> 宿主优劣 -> 原序);
  // track.ext.id 原样透传猫版 @@idx.v 线路对位约定。
  const qGroups = new Map();
  lines.forEach((ln) => {
    const q = ln.q || 0;
    if (!qGroups.has(q)) qGroups.set(q, []);
    qGroups.get(q).push(ln);
  });
  const qOrder = [...qGroups.keys()].sort((a, b) => b - a);
  for (const q of qOrder) {
    const gname = q ? q + 'p' : '默认';
    const seen = new Map();
    const tracks = qGroups.get(q).map((ln) => {
      let nm = ln.lo && ln.lo !== 'main' ? `${ln.host}·${ln.lo}` : ln.host;
      if (ln.direct) nm += '·直';
      const n = (seen.get(nm) || 0) + 1;
      seen.set(nm, n);
      if (n > 1) nm += '·' + n;
      return { name: nm, pan: '', ext: { id: durl + '@@' + ln.idx + '.' + (ln.v || 0), flag: gname } };
    });
    groups.push({ title: gname, tracks });
  }
  // 直链之外的最后兜底: watch 页 (嗅探降级)
  groups.push({
    title: '网页嗅探·兜底',
    tracks: [{ name: '播放', pan: '', ext: { id: durl + '@@sniff', flag: '网页嗅探·兜底' } }],
  });
  return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = t(ext.id);
  if (!id) return jsonify({ urls: [], headers: [] });
  if (id.includes('$')) id = id.split('$').pop().trim();
  const sniffOnly = id.endsWith('@@sniff');
  if (sniffOnly) id = id.slice(0, -'@@sniff'.length);
  const mm = id.match(/^(https?:\/\/\S+?)@@(\d+)(?:\.(\d+))?$/);
  const durl = mm ? mm[1] : absUrl(id);
  const wantIdx = mm ? parseInt(mm[2], 10) : -1;
  const wantV = mm && mm[3] !== undefined ? parseInt(mm[3], 10) : 0;
  // 现场重铸整链 (令牌时效 + IP 绑定), 借线顶替守卫 (照猫版): 用户
  // 点的线若与最优线同出口组则尊重其选择, 否则回最优线 —— 借线
  // 解出的绑定型令牌在设备上必 403, 点了也是白点。
  let lines = [];
  try { ({ lines } = await resolveLines(durl)); } catch (e) { lines = []; }
  if (!lines.length) {
    // 降级: 回 watch 页 URL (XPTV 无嗅探位, 待真机验)
    return jsonify({ urls: [durl], headers: [{ 'User-Agent': UA, Referer: REFERER }] });
  }
  const tapped = lines.find((l) => l.idx === wantIdx && (l.v || 0) === wantV) || lines.find((l) => l.idx === wantIdx);
  const best = lines[0];
  const pick = (tapped && lineGroup(tapped) <= lineGroup(best)) ? tapped : best;
  return jsonify({ urls: [pick.file], headers: [{ 'User-Agent': UA, Referer: pick.embedUrl }] });
}

async function search(ext) {
  ext = argsify(ext);
  const kw = t(ext.text || ext.wd || ext.keyword);
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  if (!kw) return jsonify({ list: [] });
  const html = await fetchPage(searchUrl(kw, page), 'list');
  const list = html ? parseCards(html).map(toCard) : [];
  return jsonify({ list });
}
