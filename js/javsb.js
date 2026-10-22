// JAVSB - XPTV csp 格式（csp_javsb）
// 转换自 mira-cat nodejs/src/spider/video/javsb.js（py_javsb，2026-10-22 现行版第七轮）
// 站点 https://jav.sb
// 依赖：javsb-hls Worker（https://javsb-hls.li768435813.workers.dev，用户已部署）
// 播放全链走 Worker /v：Worker 内算签取 raw 列表、分片改写、/p 竞速与
// KV 只读命中（via=kv）都在 Worker 内部完成，模块侧只调 /v 端点做校验取数；
// 模块内无任何写库/回写逻辑（KV 只读查）。
// 降级/待验项：
// 1)猫版的列表/详情多通道竞速（jina/markdown.new/allorigins 三路
// 并行 + 粘性层 + markdown 宽限期）与 Worker 多轮竞速，在 XPTV 版全部改为
// 串行依次尝试：粘性层先行，其余通道按猫版层序逐个试，首个通过内容校验的
// 即用。req/fetch 双传输在 XPTV 合并为 $fetch（通道集合不变）。
// 不用 setTimeout/setInterval（规范禁忌），猫版的阶段预算/延时随之去掉，
// 单请求时长由 $fetch 自身控制。
// 2) 猫版详情预热（detail 后台启动 Worker 取数、进程内状态机）不移植：
// XPTV 不依赖跨调用全局状态；改为 getPlayinfo 内串行校验一轮，
// 校验全灭时按猫版第七轮兜底直接返回未校验的全链 Worker 地址
// （播放器自取 /v 本身即新一轮取数，严格优于回 jav.sb 本域必死地址）。
// 3) Worker /v 第二击带 &cb=2 绕 Worker 240s 边缘缓存（同 REX 版口径）。
// 4) 详情出线映射：猫版 detail 只出一条「正片」，play 内部再分直链/全链
// 两形态；XPTV 版在 getTracks 映射为两个 group——「直链」(seg=direct，
// 分片保持 18av.mov 原始直链) 与「全链」(分片经 Worker /s)，
// track.ext 带 hash 与 form，getPlayinfo 按 form 校验出线。
// 5) 封面全宿主直连（og:image / data-src 原地址），不加任何 /img 代理分支。
// 6) 官方取流 A/B（sign 算签 + token 两步）仅在 JAVSB_WORKER 未配置时
// 才走（同猫版结构，现行常量已配置故不触发）；嗅探兜底（播放器页/
// 详情页 URL 直出）待真机验 XPTV 是否嗅探非媒体 URL。
// 7) 会话 Cookie 罐：$fetch 不回响应头时罐为空操作（仅直连层回放，同猫版）。
const HOST = 'https://jav.sb';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const REFERER = HOST + '/';
const JINA = 'https://r.jina.ai/';
const MDNEW = 'https://markdown.new/';
const ALLORIGINS = 'https://api.allorigins.win/raw?url=';
const JAVSB_WORKER = 'https://javsb-hls.li768435813.workers.dev';
const PLAYER_UA = 'AppleCoreMedia/1.0.0.20L563 (iPhone; U; CPU OS 17_5 like Mac OS X; zh_cn)';

const CATS = [
{ type_id: 'new', type_name: '最近更新'},
{ type_id: 'Censored', type_name: '日本有码'},
{ type_id: 'Uncensored', type_name: '日本无码'},
{ type_id: 'FC2-PPV', type_name: 'FC2-PPV'},
{ type_id: 'Mosaic_Removed', type_name: '无码破解'},
{ type_id: 'CHN_SUB', type_name: '中文字幕'},
{ type_id: 'MGS', type_name: 'MGS'},
{ type_id: 'Adult_IDOL', type_name: '写真'},
{ type_id: 'Asian_Amateur', type_name: '国产'},
{ type_id: 'Western_Porn', type_name: '欧美'},
{ type_id: 'rank_hits', type_name: '热门影片'},
{ type_id: 'rank_score', type_name: '评分最高'},
];

const appConfig = {
ver: 1,
title: 'JAVSB',
site: HOST,
tabs: CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id}})),
};

function t(v) {
return String(v == null? '': v).trim();
}

function clean(s) {
return t(s)
.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
.replace(/[\u200B-\u200D\uFEFF]/g, '')
.replace(/\s+/g, ' ');
}

function absUrl(u) {
u = t(u);
if (!u) return '';
if (/^https?:\/\//i.test(u)) return u;
if (u.startsWith('//')) return 'https:' + u;
return HOST + (u.startsWith('/')? u: '/' + u);
}

// ---------- 会话 Cookie 罐（仅直连层回放；$fetch 回响应头时才有料） ----------
const cookieJar = new Map();

function jarStore(host, setCookies) {
if (!setCookies) return;
const arr = Array.isArray(setCookies)? setCookies: [setCookies];
const cur = new Map();
const old = cookieJar.get(host);
if (old) for (const p of old.split('; ')) { const i = p.indexOf('='); if (i > 0) cur.set(p.slice(0, i), p.slice(i + 1));}
for (const sc of arr) {
const first = String(sc || '').split(';')[0];
const i = first.indexOf('=');
if (i > 0) cur.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
}
if (cur.size) cookieJar.set(host, [...cur.entries()].map(([k, v]) => `${k}=${v}`).join('; '));
}

function jarHeader(host) {
return cookieJar.get(host) || '';
}

// ---------- 请求头档案（照猫版） ----------
function desktopHeaders(referer) {
return {
'User-Agent': UA,
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
'Referer': referer || REFERER,
};
}

function safariHeaders(referer) {
return {
'User-Agent': UA_IOS,
'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
'Referer': referer || REFERER,
};
}

function jinaHtmlHeaders() {
return { 'User-Agent': UA, 'Accept': '*/*', 'x-return-format': 'html', 'x-respond-with': 'html'};
}

// ---------- 基础传输（$fetch；data 对象/字符串两兼容） ----------
async function fetchRaw(url, headers) {
let host = '';
try { host = new URL(url).host;} catch (e) {}
const h = Object.assign({}, headers || {});
const ck = host? jarHeader(host): '';
if (ck) h['Cookie'] = ck;
const res = await $fetch.get(url, { headers: h});
if (res && res.headers && host) {
try { jarStore(host, res.headers['set-cookie'] || res.headers['Set-Cookie']);} catch (e) {}
}
const data = res? res.data: '';
if (data == null || data === '') return '';
return data;
}

async function fetchText(url, headers) {
const data = await fetchRaw(url, headers);
if (!data) return '';
return typeof data === 'string'? data: JSON.stringify(data);
}

// ---------- 抓取通道（猫版层集合；req/fetch 双传输合并为 $fetch） ----------
// 每层 build(targetUrl) -> {url, headers}
const LAYERS = {
jinaHtml: { build: (u) => ({ url: JINA + u, headers: jinaHtmlHeaders()})},
mdNew: { build: (u) => ({ url: MDNEW + u, headers: { 'User-Agent': UA, 'Accept': '*/*'}})},
allOrigins: { build: (u) => ({ url: ALLORIGINS + encodeURIComponent(u), headers: { 'User-Agent': UA, 'Accept': '*/*'}})},
jinaMd: { build: (u) => ({ url: JINA + u, headers: { 'User-Agent': UA, 'Accept': '*/*'}})},
directReq: { build: (u) => ({ url: u, headers: desktopHeaders()})},
directFetch: { build: (u) => ({ url: u, headers: safariHeaders()})},
};
// 列表/搜索：全层（含 markdown 降级）——猫版层序合并双传输后
const LIST_LAYERS = ['jinaHtml', 'mdNew', 'allOrigins', 'jinaMd', 'directReq', 'directFetch'];
// 详情：必须 HTML（og/播放器），无 markdown 层
const DETAIL_LAYERS = ['jinaHtml', 'allOrigins', 'directReq', 'directFetch'];
// token 接口：不用 allorigins（缓存可能串话）与 markdown 层
const TOKEN_LAYERS = ['jinaHtml', 'directReq', 'directFetch'];

// ---------- 页面缓存（同猫版 TTL） ----------
const pageCache = new Map();
const TTL_LIST = 120000;
const TTL_DETAIL = 300000;

function cacheGet(url, ttl) {
const e = pageCache.get(url);
if (e && Date.now() - e.t < ttl) return e.s;
return '';
}

function cacheSet(url, s) {
pageCache.set(url, { t: Date.now(), s});
if (pageCache.size > 80) pageCache.delete(pageCache.keys().next().value);
}

// ---------- 多通道串行取数（猫版竞速改串行：粘性层先行，其余按序） ----------
const goodLayers = { page: '', token: ''};

async function fetchSerial(url, validate, opts) {
const o = opts || {};
const layerNames = (o.layers || LIST_LAYERS).filter((n) => LAYERS[n]);
const ok = typeof validate === 'function'? validate: (s) =>!!s;
if (o.cacheTtl) {
const cached = cacheGet(url, o.cacheTtl);
if (cached && ok(cached)) return cached;
}
const stickyKey = o.stickyKey || 'page';
const order = [];
const sticky = goodLayers[stickyKey];
if (sticky && layerNames.includes(sticky)) order.push(sticky);
for (const n of layerNames) if (!order.includes(n)) order.push(n);
for (const name of order) {
const built = LAYERS[name].build(url);
let txt = '';
try { txt = await fetchText(built.url, built.headers);} catch (e) { txt = '';}
if (txt && ok(txt)) {
goodLayers[stickyKey] = name;
if (o.cacheTtl) cacheSet(url, txt);
return txt;
}
}
return '';
}

function getListPage(url, validate) {
return fetchSerial(url, validate || isListPage, { layers: LIST_LAYERS, cacheTtl: TTL_LIST});
}

function getDetailPage(url) {
return fetchSerial(url, isDetailPage, { layers: DETAIL_LAYERS, cacheTtl: TTL_DETAIL});
}

// ---------- 内容校验（照猫版口径） ----------
const isListPage = (s) => countCards(s) > 0;
const isDetailPage = (s) => typeof s === 'string' && (s.includes('og:title') || s.includes('/static/player/'));
const isSearchPage = (s) => countCards(s) > 0 || (typeof s === 'string' && s.length > 3000 && s.includes('javtype'));
const isMdPage = (s) => typeof s === 'string' && s.includes('Title: ') && s.includes('Markdown Content:');
const isPlaylist = (s) => typeof s === 'string' && s.includes('#EXTM3U');

function mdTitle(md) {
const m = String(md || '').match(/^Title:\s*(.+)$/m);
if (!m) return '';
return clean(m[1]).replace(/\s*[-|–—]\s*JAVSB\s*$/i, '').trim();
}

function parseJsonLoose(s) {
if (!s) return null;
if (typeof s === 'object') return s;
try { return JSON.parse(s);} catch (e) {}
const m = String(s).match(/\{[\s\S]*\}/);
if (m) { try { return JSON.parse(m[0]);} catch (e) {}}
return null;
}

// ---------- 列表解析（HTML + markdown 双形态，照猫版） ----------
function countCards(html) {
return parseCards(html).length;
}

function parseCards(html) {
const s = String(html || '');
if (s.includes('<div class="thumbnail group">')) return parseCardsHtml(s);
return parseCardsMd(s);
}

function parseCardsHtml(html) {
const out = [];
const seen = new Set();
const parts = String(html || '').split('<div class="thumbnail group">');
for (let i = 1; i < parts.length; i++) {
const chunk = parts[i].slice(0, 4000);
const hrefM = chunk.match(/href="(\/jav\/[^"]+\.html)"/);
if (!hrefM) continue;
const id = HOST + hrefM[1];
if (seen.has(id)) continue;
seen.add(id);
let pic = '';
const imgM = chunk.match(/<img[^>]+data-src="([^"]+)"/) || chunk.match(/<img[^>]+src="([^"]+)"/);
if (imgM &&!/loading\.png/i.test(imgM[1])) pic = absUrl(imgM[1]);
let name = '';
const altM = chunk.match(/<img[^>]+alt="([^"]*)"/);
if (altM) name = clean(altM[1]);
if (!name) {
const tm = chunk.match(/class="text-secondary group-hover:text-primary"[^>]*>([^<]+)</);
if (tm) name = clean(tm[1]);
}
let remarks = '';
const dm = chunk.match(/bg-opacity-75">([^<]+)</);
if (dm) remarks = clean(dm[1]);
out.push({ vod_id: id, vod_name: name || hrefM[1], vod_pic: pic, vod_remarks: remarks, ext: { id: id}});
}
return out;
}

function parseCardsMd(text) {
const s = String(text || '');
const dur = new Map();
const durRe = /\[(\d+:\d{2}:\d{2})\]\((https:\/\/jav\.sb\/jav\/[^)\s]+\.html)\)/g;
let m;
while ((m = durRe.exec(s))!== null) {
if (!dur.has(m[2])) dur.set(m[2], m[1]);
}
const out = [];
const seen = new Set();
const push = (url, title) => {
const name = clean(title || '');
if (!url || seen.has(url)) return;
if (!name || /^\d+:\d{2}:\d{2}$/.test(name)) return;
seen.add(url);
out.push({ vod_id: url, vod_name: name, vod_pic: '', vod_remarks: dur.get(url) || '', ext: { id: url}});
};
const imgRe = /!\[Image \d+: ([^\]]+)\]\([^)]*\)\]\((https:\/\/jav\.sb\/jav\/[^)\s]+\.html)\)/g;
while ((m = imgRe.exec(s))!== null) push(m[2], m[1]);
const linkRe = /\[([^\]]+)\]\((https:\/\/jav\.sb\/jav\/[^)\s]+\.html)\)/g;
while ((m = linkRe.exec(s))!== null) push(m[2], m[1]);
return out;
}

function catUrl(cat, page) {
const id = cat.type_id;
if (id === 'new') {
return page > 1? `${HOST}/label/new/by/time/page/${page}.html`: `${HOST}/label/new/by/time.html`;
}
if (id === 'rank_hits' || id === 'rank_score') {
const by = id === 'rank_hits'? 'hits_week': 'score';
return page > 1? `${HOST}/label/rank/by/${by}/page/${page}.html`: `${HOST}/label/rank/by/${by}.html`;
}
return page > 1? `${HOST}/javtype/${id}-${page}.html`: `${HOST}/javtype/${id}.html`;
}

// ---------- 详情解析（照猫版） ----------
function og(html, prop) {
const m = String(html || '').match(new RegExp(`<meta property="og:${prop}" content="([^"]*)"`));
return m? clean(m[1]): '';
}

// 播放器 iframe 与 file hash：猫版宽松正则（两种 src 形态任一）
function extractPlayer(html) {
const m = String(html || '').match(/src="(\/static\/player\/videojs\.html\?[^"]+)"/) ||
String(html || '').match(/src="(https?:\/\/jav\.sb\/static\/player\/videojs\.html\?[^"]+)"/);
if (!m) return { playerUrl: '', hash: ''};
const playerUrl = absUrl(m[1].replace(/&amp;/g, '&'));
const hm = playerUrl.match(/[?&]src=([0-9a-zA-Z]+)/);
return { playerUrl, hash: hm? hm[1]: ''};
}

// ---------- 官方取流（猫版第五轮 sign 算法；仅 WORKER 未配置时走） ----------
const SIGN_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
function javsbSign(plain) {
let digits = [0];
for (let i = 0; i < plain.length; i++) {
let carry = (plain.charCodeAt(i) ^ 123) & 0xff;
for (let j = 0; j < digits.length; j++) {
const v = digits[j] * 256 + carry;
digits[j] = v % 62;
carry = Math.floor(v / 62);
}
while (carry > 0) { digits.push(carry % 62); carry = Math.floor(carry / 62);}
}
while (digits.length > 1 && digits[digits.length - 1] === 0) digits.pop();
let out = '';
for (let j = digits.length - 1; j >= 0; j--) out += SIGN_ALPHABET[digits[j]];
return out;
}

async function tryOfficialStream(hash) {
const key = javsbSign(`${hash}@${Math.floor(Date.now() / 1000)}`);
// 路 A：raw 形态一步取列表本体校验，返回地址本身
const rawUrl = `${HOST}/save_m3u8_cache.php?file=${encodeURIComponent(hash)}&raw=1&sign=${key}`;
try {
const txt = await fetchSerial(rawUrl, isPlaylist, {
layers: ['directFetch', 'directReq', 'jinaHtml'], stickyKey: 'token',
});
if (txt) return rawUrl;
} catch (e) {}
// 路 B：token -> save -> m3u8_file
const hasToken = (s) => { const j = parseJsonLoose(s); return!!(j && j.token);};
const hasFile = (s) => { const j = parseJsonLoose(s); return!!(j && j.m3u8_file);};
let token = '', ts = '';
try {
const txt = await fetchSerial(`${HOST}/token.php?file=${encodeURIComponent(hash)}`, hasToken, {
layers: TOKEN_LAYERS, stickyKey: 'token',
});
const j = parseJsonLoose(txt);
token = t(j && j.token); ts = t(j && j.ts);
} catch (e) {}
if (!token) return '';
try {
const url = `${HOST}/save_m3u8_cache.php?file=${encodeURIComponent(hash)}&token=${encodeURIComponent(token)}&ts=${encodeURIComponent(ts)}&sign=${key}`;
const txt = await fetchSerial(url, hasFile, { layers: TOKEN_LAYERS, stickyKey: 'token'});
const j = parseJsonLoose(txt);
const f = t(j && j.m3u8_file);
if (f && /m3u8/i.test(f)) return absUrl(f) + (f.includes('sign=')? '': `&sign=${key}`);
} catch (e) {}
return '';
}

// ---------- Worker 取流（串行校验；KV 命中时 /v 秒出） ----------
function workerUrlFor(hash, form) {
const base = `${JAVSB_WORKER}/v?hash=${encodeURIComponent(hash)}`;
return form === 'direct'? base + '&seg=direct': base;
}

async function fetchWorkerPl(url) {
try {
const txt = await fetchText(url, { 'User-Agent': UA, 'Accept': '*/*'});
if (txt && isPlaylist(txt)) return txt;
} catch (e) {}
return '';
}

// 分片探针：取首分片查 0x47 同步字（在 App 内跑 = 设备出口实测，同猫版）
async function probeSegment(segUrl) {
if (!segUrl) return false;
try {
const txt = await fetchText(segUrl, { 'User-Agent': PLAYER_UA, 'Range': 'bytes=0-1023', 'Accept': '*/*'});
return!!txt && txt.charCodeAt(0) === 0x47;
} catch (e) { return false;}
}

// 串行校验出线：按所选形态校验 -> 另一形态 -> &cb=2 第二击 -> 未校验全链兜底
async function resolveWorkerUrl(hash, form) {
const directUrl = workerUrlFor(hash, 'direct');
const proxyUrl = workerUrlFor(hash, 'proxy');
if (form === 'direct') {
const pl = await fetchWorkerPl(directUrl);
if (pl) {
const seg = pl.split('\n').map((x) => x.trim()).find((x) => x &&!x.startsWith('#'));
if (seg && (await probeSegment(seg))) return directUrl;
const pl2 = await fetchWorkerPl(proxyUrl);
if (pl2) return proxyUrl;
} else {
const pl2 = await fetchWorkerPl(proxyUrl);
if (pl2) return proxyUrl;
}
} else {
const pl = await fetchWorkerPl(proxyUrl);
if (pl) return proxyUrl;
// 直链形态也试一轮（Worker 内共用同一份 raw 取数与缓存）
const pld = await fetchWorkerPl(directUrl);
if (pld) {
const seg = pld.split('\n').map((x) => x.trim()).find((x) => x &&!x.startsWith('#'));
if (seg && (await probeSegment(seg))) return directUrl;
}
}
// 第二击：&cb=2 绕 Worker 240s 边缘缓存
const cbUrl = proxyUrl + '&cb=2';
const pl3 = await fetchWorkerPl(cbUrl);
if (pl3) return cbUrl;
// 校验全灭兜底：未校验全链地址（同猫版第七轮）
return proxyUrl;
}

// ---------- 五入口 ----------
async function getConfig() {
return jsonify(appConfig);
}

async function getCards(ext) {
ext = argsify(ext);
const tid = t(ext.tid || ext.id) || 'new';
const page = Math.max(1, parseInt(ext.page, 10) || 1);
const cat = CATS.find((c) => c.type_id === tid) || CATS[0];
const html = await getListPage(catUrl(cat, page));
return jsonify({ list: html? parseCards(html): []});
}

async function getTracks(ext) {
ext = argsify(ext);
const id = t(ext.id || ext.url);
if (!id) return jsonify({ list: []});
const durl = /^https?:\/\//.test(id)? id: absUrl(id);
const html = await getDetailPage(durl);
if (!html) {
// HTML 全层失败降级：转读 markdown 合成条目（只有标题），play 落嗅探详情页（同猫版）
const md = await fetchSerial(durl, isMdPage, { layers: ['jinaHtml', 'jinaMd', 'mdNew']});
const name = md? mdTitle(md): '';
if (!name) return jsonify({ list: []});
return jsonify({
list: [{ title: 'JAVSB', tracks: [{ name: '正片', pan: '', ext: { id: durl, flag: 'JAVSB'}}]}],
});
}
const { playerUrl, hash} = extractPlayer(html);
if (hash && JAVSB_WORKER) {
// 猫版「全链/直链」双线形态 -> 两个 group（见文件头第 4 条）
return jsonify({
list: [
{ title: '直链', tracks: [{ name: '正片', pan: '', ext: { id: durl, hash: hash, playerUrl: playerUrl, form: 'direct', flag: '直链'}}]},
{ title: '全链', tracks: [{ name: '正片', pan: '', ext: { id: durl, hash: hash, playerUrl: playerUrl, form: 'proxy', flag: '全链'}}]},
],
});
}
return jsonify({
list: [{ title: 'JAVSB', tracks: [{ name: '正片', pan: '', ext: { id: durl, playerUrl: playerUrl, flag: 'JAVSB'}}]}],
});
}

async function getPlayinfo(ext) {
ext = argsify(ext);
let id = t(ext.id);
if (!id) return jsonify({ urls: [], headers: []});
if (id.includes('$')) id = id.split('$').pop().trim();
if (/\.m3u8(\?|$)/i.test(id)) {
return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': REFERER}]});
}
const durl = /^https?:\/\//.test(id)? id: absUrl(id);
let hash = t(ext.hash);
let playerUrl = t(ext.playerUrl);
if (!hash) {
const html = await getDetailPage(durl);
if (html) {
const p = extractPlayer(html);
playerUrl = playerUrl || p.playerUrl;
hash = p.hash;
}
}
const form = t(ext.form) || 'proxy';
if (hash && JAVSB_WORKER) {
const u = await resolveWorkerUrl(hash, form);
return jsonify({ urls: [u], headers: [{ 'User-Agent': UA, 'Referer': REFERER}]});
}
if (hash && playerUrl) {
const direct = await tryOfficialStream(hash);
if (direct) {
return jsonify({ urls: [direct], headers: [{ 'User-Agent': UA, 'Referer': REFERER}]});
}
// 嗅探兜底：官方播放器页（待真机验）
return jsonify({ urls: [playerUrl], headers: [{ 'User-Agent': UA, 'Referer': durl}]});
}
if (playerUrl) {
return jsonify({ urls: [playerUrl], headers: [{ 'User-Agent': UA, 'Referer': durl}]});
}
// 详情都没拿到：嗅探详情页兜底（WebView 与抓取通道相互独立，同猫版）
return jsonify({ urls: [durl], headers: [{ 'User-Agent': UA, 'Referer': REFERER}]});
}

async function search(ext) {
ext = argsify(ext);
const wd = t(ext.text);
const page = Math.max(1, parseInt(ext.page, 10) || 1);
if (!wd) return jsonify({ list: []});
const kw = encodeURIComponent(wd);
const url = page > 1? `${HOST}/vod/search/page/${page}/wd/${kw}.html`: `${HOST}/vod/search.html?wd=${kw}`;
const html = await getListPage(url, isSearchPage);
return jsonify({ list: html? parseCards(html): []});
}
