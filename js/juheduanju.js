// 聚合短剧 - XPTV csp 格式（csp_juheduanju）
// 转换自 mira-cat nodejs/src/spider/video/juheduanju.js（py_juheduanju，964 行）。
// 子源构成（7 个，逐个照搬猫版清单与分发逻辑，未合并/删减）：
//   橙果 chengguo（https://chengguodj.com，Nuxt 页解析 + POST /api/v1/channels 翻页）
//   七星 qixing（https://app.whjzjx.cn，AES-128-ECB 加密登录换 token 后 API 取数）
//   星芽 xingya（https://app.whjzjx.cn / https://u.shytkjgs.com，表单登录换 token 后 API 取数）
//   狂飙 kuangbiao（https://ai.dramarush.tv，tRPC feed.browse / episode.watch）
//   酷我 kuwo（http://wapi.kuwo.cn/openapi/v1/shortplay）
//   剧屋 juwu（https://www.juwu.tv，MacCMS provide/vod 接口）
//   围观 weiguan（https://api.drama.9ddm.com，POST 搜索/列表）
// 降级/待验项：
//   - POST 取数走 $fetch.post(url, body, {headers}) 逐字保持猫版线格式（JSON/表单字符串），
//     $fetch.post 在 XPTV 仓内未证实存在，文件头标注「POST 待真机验」：涉及橙果翻页、
//     七星/星芽登录与搜索、围观列表/搜索。
//   - 猫版 play 的 parse:1 嗅探兜底：XPTV 无嗅探位，取不到直链时对橙果回播放页 URL、
//     狂飙回 watch 页 URL 作 urls（待真机验 XPTV 是否嗅探非媒体 URL），其余子源回空。
//   - 子源「狂飙」猫版有会话门禁（已知限制）：逻辑照搬，XPTV 无状态下表现待真机验，
//     可能需要会话才能取数/播放。
//   - 跨调用状态：猫版七星 token / 星芽 headers 全局缓存已去掉，改为每次调用内重新登录重建。
//   - 猫版双通道（req + fetch 竞速/超时 AbortController+setTimeout）改 $fetch 单通道串行；
//     聚合搜索猫版 Promise.all 并发改串行逐子源执行。
//   - Node crypto AES-ECB 改 CryptoJS（本地比对输出与 Node 一致）；橙果封面 base64url
//     代理改纯 JS 编码（无 Buffer）。
const CryptoJS = createCryptoJS();

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/* 各子源站点与分类（猫版 home class=子源、filters=子源内分类，摊平为 tabs） */
const CG_SITE = 'https://chengguodj.com';
const CG_CATS = [
  { type_id: 'yuanchuang', type_name: '原创' },
  { type_id: 'mogai', type_name: '魔改' },
  { type_id: 'manju', type_name: '漫剧' },
  { type_id: 'zhenren', type_name: '真人' },
  { type_id: 'aiduanju', type_name: 'AI短剧' },
  { type_id: 'browse', type_name: '全部' },
];
const QX_SITE = 'https://app.whjzjx.cn';
const QX_AUTH = 'https://u.shytkjgs.com';
const QX_CATS = [
  { type_id: '1', type_name: '剧场' },
  { type_id: '3', type_name: '新剧' },
  { type_id: '2', type_name: '热播' },
  { type_id: '7', type_name: '星选' },
  { type_id: '5', type_name: '阳光' },
];
const XY_SITE = 'https://app.whjzjx.cn';
const XY_AUTH = 'https://u.shytkjgs.com';
const XY_CATS = [
  { type_id: 'juchang', type_name: '剧场', cid: '1' },
  { type_id: 'reboduanju', type_name: '热播剧', cid: '2' },
  { type_id: 'huiyuan', type_name: '会员专享', cid: '8' },
  { type_id: 'xingxuan', type_name: '星选好剧', cid: '7' },
  { type_id: 'xinju', type_name: '新剧', cid: '3' },
  { type_id: 'yangguang', type_name: '阳光剧场', cid: '5' },
];
const KB_SITE = 'https://ai.dramarush.tv';
const KB_CATS = [
  { type_id: 't-5jxcit', type_name: '短剧', q: { categorySlug: 't-5jxcit' }, mode: 'all', rounds: 1 },
  { type_id: 'normal_short', type_name: '正规短剧', q: { contentKind: 'SHORT_DRAMA' }, mode: 'normal', rounds: 6 },
  { type_id: 'adult_short', type_name: '成人短剧', q: { tagSlug: 'adult' }, mode: 'adult', rounds: 6 },
];
const KW_SITE = 'http://wapi.kuwo.cn/openapi/v1/shortplay';
const KW_CATS = [
  { type_id: '10', type_name: '猜你想看' },
  { type_id: '11', type_name: '土味爱情' },
  { type_id: '12', type_name: '更多精彩' },
  { type_id: '13', type_name: '霸道总裁的人生' },
  { type_id: '14', type_name: '赘婿当道' },
  { type_id: '15', type_name: '漫漫追妻路' },
  { type_id: '16', type_name: '家庭情感' },
];
const JW_SITE = 'https://www.juwu.tv';
const JW_CATS = [
  { type_id: '1', type_name: '短剧' },
  { type_id: '2', type_name: '情色电影' },
];
const WG_SITE = 'https://api.drama.9ddm.com';
const WG_CATS = [{ type_id: 'all', type_name: '全部' }];

const PLAT_LIST = [
  { key: 'chengguo', name: '橙果', cats: CG_CATS },
  { key: 'qixing', name: '七星', cats: QX_CATS },
  { key: 'xingya', name: '星芽', cats: XY_CATS },
  { key: 'kuangbiao', name: '狂飙', cats: KB_CATS },
  { key: 'kuwo', name: '酷我', cats: KW_CATS },
  { key: 'juwu', name: '剧屋', cats: JW_CATS },
  { key: 'weiguan', name: '围观', cats: WG_CATS },
];

function buildTabs() {
  const tabs = [];
  for (const p of PLAT_LIST) {
    for (const c of p.cats) {
      tabs.push({
        name: p.cats.length > 1 ? (p.name + '·' + c.type_name) : p.name,
        ext: { plat: p.key, tid: c.type_id },
      });
    }
  }
  return tabs;
}

const appConfig = {
  ver: 1,
  title: '聚合短剧',
  site: CG_SITE,
  tabs: buildTabs(),
};

/* ---------------- 请求工具（$fetch 单通道，data 对象/字符串两兼容） ---------------- */
async function httpGet(url, headers) {
  try {
    const { data } = await $fetch.get(url, { headers: headers || {} });
    if (data !== undefined && data !== null && data !== '') return typeof data === 'string' ? data : '';
  } catch (e) {}
  return '';
}
async function httpGetJson(url, headers) {
  try {
    const { data } = await $fetch.get(url, { headers: headers || {} });
    if (data !== undefined && data !== null && data !== '') {
      if (typeof data === 'object') return data;
      try { return JSON.parse(String(data)); } catch (e) {}
    }
  } catch (e) {}
  return null;
}
function hasHeader(headers, name) {
  const n = name.toLowerCase();
  return Object.keys(headers || {}).some(k => k.toLowerCase() === n);
}
async function httpPostJson(url, body, headers) {
  const h = { ...(headers || {}) };
  if (!hasHeader(h, 'content-type')) h['Content-Type'] = 'application/json';
  try {
    const { data } = await $fetch.post(url, body, { headers: h });
    if (data !== undefined && data !== null && data !== '') {
      if (typeof data === 'object') return data;
      const s = String(data);
      try { return JSON.parse(s); } catch (e) { return s; }
    }
  } catch (e) {}
  return null;
}
async function httpPostForm(url, formStr, headers) {
  const h = { ...(headers || {}) };
  if (!hasHeader(h, 'content-type')) h['Content-Type'] = 'application/x-www-form-urlencoded';
  try {
    const { data } = await $fetch.post(url, formStr, { headers: h });
    if (data !== undefined && data !== null && data !== '') {
      if (typeof data === 'object') return data;
      const s = String(data);
      try { return JSON.parse(s); } catch (e) { return s; }
    }
  } catch (e) {}
  return null;
}
function clean(s) { return String(s || '').replace(/<[^>]+>/g, '').trim(); }
function pick(o) {
  if (!o || typeof o !== 'object') return '';
  for (let i = 1; i < arguments.length; i++) {
    const v = o[arguments[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v);
  }
  return '';
}
function aesEcbB64(keyStr, text) {
  const key = CryptoJS.enc.Utf8.parse(keyStr);
  const enc = CryptoJS.AES.encrypt(text, key, { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 });
  return enc.ciphertext.toString(CryptoJS.enc.Base64);
}
function b64UrlEncode(str) {
  const bytes = [];
  const enc = encodeURIComponent(str);
  for (let i = 0; i < enc.length; i++) {
    if (enc[i] === '%') { bytes.push(parseInt(enc.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(enc.charCodeAt(i));
  }
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += alpha[b0 >> 2];
    out += alpha[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
    out += b1 === undefined ? '=' : alpha[((b1 & 15) << 2) | ((b2 || 0) >> 6)];
    out += b2 === undefined ? '=' : alpha[b2 & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function qs(params) {
  return Object.keys(params).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
}

/* ================= 平台: 橙果 ================= */
function cgHeaders() { return { 'User-Agent': UA, 'Referer': CG_SITE + '/', 'Accept-Language': 'zh-CN,zh;q=0.9' }; }
function cgProxyPic(u) {
  let s = String(u || '').replace(/\\u002F/g, '/').replace(/\\\//g, '/').trim();
  if (!s) return '';
  if (!s.startsWith('http')) s = CG_SITE + (s.startsWith('/') ? s : '/' + s);
  try { return CG_SITE + '/_img/' + b64UrlEncode(s); }
  catch (e) { return s; }
}
function cgResolve(arr, v) {
  if (typeof v === 'number' && v >= 0 && v < arr.length && typeof arr[v] !== 'object') return arr[v];
  return v;
}
function cgParseList(html) {
  const vods = [];
  const seen = new Set();
  const m = html.match(/<script[^>]+id=["']__NUXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/);
  if (!m) return vods;
  try {
    const arr = JSON.parse(m[1].trim());
    for (const item of arr) {
      if (!item || typeof item !== 'object' || !('title' in item)) continue;
      const title = cgResolve(arr, item.title);
      if (!title || typeof title !== 'string') continue;
      let slug = cgResolve(arr, item.slug);
      if (!slug || typeof slug !== 'string') continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      let pic = '';
      let cov = item.cover;
      if (typeof cov === 'number') cov = arr[cov];
      if (cov && typeof cov === 'object') {
        const u = cgResolve(arr, cov.url) || cgResolve(arr, cov.fallback_url);
        if (u && typeof u === 'string') pic = cgProxyPic(u);
      }
      const eps = cgResolve(arr, item.total_episode_count || item.published_episode_count || item.latest_episode_number);
      vods.push({ vod_id: 'chengguo:' + slug, vod_name: title, vod_pic: pic, vod_remarks: eps ? (eps + '集') : '' });
    }
  } catch (e) {}
  return vods;
}
async function cgApiList(channel, page) {
  // 站点改版后 ?page= 参数被忽略,翻页走 POST /api/v1/channels/{channel}?page=
  let j = null;
  try {
    j = await httpPostJson(CG_SITE + '/api/v1/channels/' + encodeURIComponent(channel) + '?page=' + page, {},
      { ...cgHeaders(), 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
  } catch (e) { return null; }
  if (!j || typeof j !== 'object') return null;
  const d = (j.data && typeof j.data === 'object') ? j.data : j;
  const arr = Array.isArray(d) ? d : (Array.isArray(d.list) ? d.list : (Array.isArray(d.items) ? d.items : null));
  if (!arr || !arr.length) return null;
  const vods = [];
  const seen = new Set();
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const title = item.title, slug = item.slug;
    if (!title || typeof title !== 'string' || !slug || typeof slug !== 'string' || seen.has(slug)) continue;
    seen.add(slug);
    let pic = '';
    const cov = item.cover;
    if (cov) {
      const u = (typeof cov === 'object' ? (cov.url || cov.fallback_url) : cov);
      if (u && typeof u === 'string') pic = cgProxyPic(u);
    }
    const eps = item.total_episode_count || item.published_episode_count || item.latest_episode_number;
    vods.push({ vod_id: 'chengguo:' + slug, vod_name: title, vod_pic: pic, vod_remarks: eps ? (eps + '集') : '' });
  }
  if (!vods.length) return null;
  const total = parseInt((d && d.total) || j.total || 0, 10) || 0;
  const hasMore = total > 0 ? (page * arr.length < total) : (arr.length >= 20);
  return { list: vods, hasMore };
}
const cg = {
  cats: CG_CATS,
  async list(cat, page) {
    const ch = cat || 'yuanchuang';
    if (page > 1) {
      const r = await cgApiList(ch, page);
      if (r) return r;
      return { list: [], hasMore: false };
    }
    const html = await httpGet(CG_SITE + '/' + ch, cgHeaders());
    const list = cgParseList(html);
    return { list, hasMore: list.length >= 12 };
  },
  async search(wd) {
    const html = await httpGet(CG_SITE + '/search?q=' + encodeURIComponent(wd), cgHeaders());
    return cgParseList(html);
  },
  async detail(slug) {
    const html = await httpGet(CG_SITE + '/drama/' + encodeURIComponent(slug), cgHeaders());
    if (!html) return null;
    let name = '';
    const tm = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (tm) name = clean(tm[1]);
    if (!name) { const t2 = html.match(/<title>([^<]+)<\/title>/i); if (t2) name = t2[1].split('-')[0].trim(); }
    let desc = '';
    const dm = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (dm) desc = dm[1].trim();
    let pic = '';
    const pm = html.match(/(?:z-image-loader-url|data-cover-fb|data-src|src)="([^"]+)"/i);
    if (pm) pic = cgProxyPic(pm[1]);
    const labels = {};
    const re = new RegExp('<a\\b[^>]*href="/play/' + slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/(\\d+)"[^>]*>([\\s\\S]*?)</a>', 'gi');
    let m;
    while ((m = re.exec(html))) {
      const n = parseInt(m[1], 10);
      if (n > 0 && !labels[n]) labels[n] = clean(m[2]) || ('第' + n + '集');
    }
    const keys = Object.keys(labels).map(Number).sort((a, b) => a - b);
    if (!keys.length) return null;
    const eps = keys.map(n => ({ no: n, name: labels[n], url: 'chengguo://' + slug + '/' + n }));
    return { name: name || slug, pic, desc, eps };
  },
  async play(slug, no) {
    let html = await httpGet(CG_SITE + '/play/' + encodeURIComponent(slug) + '/' + no, cgHeaders());
    if (!html) return '';
    html = html.replace(/\\u0026/g, '&').replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    const m = html.match(/https?:\/\/[^\s"'\\]{10,300}\.m3u8[^\s"'\\]{0,200}/i);
    return m ? m[0] : '';
  },
};

/* ================= 平台: 七星 ================= */
const QX_KEY = 'B@ecf920Od8A4df7';
const QX_UA = 'Mozilla/5.0 (Linux; Android 9; V1938T Build/PQ3A.190705.08211809; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Safari/537.36';
async function qxAuth() {
  // XPTV 无跨调用状态：猫版全局 token 缓存去掉，每次调用内重新登录
  const payload = JSON.stringify({
    device: '2a50580e69d38388c94c93605241fb306', package_name: 'com.jz.xydj',
    android_id: 'ec1280db12795506', install_first_open: true,
    first_install_time: 1752505243345, last_update_time: 1752505243345,
    report_link_url: '', authorization: '', timestamp: Date.now(),
  });
  const body = aesEcbB64(QX_KEY, payload);
  const j = await httpPostForm(QX_AUTH + '/user/v3/account/login', body, {
    'platform': '1', 'user_agent': QX_UA, 'content-type': 'application/json; charset=utf-8',
  });
  const tk = j && j.data && typeof j.data === 'object' ? String(j.data.token || '') : '';
  return tk;
}
function qxH(tk) { return { 'authorization': tk, 'platform': '1', 'version_name': '3.8.3.1', 'User-Agent': QX_UA }; }
function qxCard(item, catName) {
  if (item && typeof item === 'object' && item.theater) item = item.theater;
  const vid = pick(item, 'id'); const name = clean(pick(item, 'title'));
  if (!vid || !name) return null;
  let pic = pick(item, 'cover_url');
  if (pic && !pic.startsWith('http')) pic = QX_SITE + (pic.startsWith('/') ? pic : '/' + pic);
  return {
    vod_id: 'qixing:' + vid, vod_name: name, vod_pic: pic,
    vod_remarks: clean(pick(item, 'play_amount_str', 'score_str')),
    vod_class: catName, vod_content: clean(pick(item, 'introduction')).slice(0, 200),
  };
}
async function qxDetailRaw(vid) {
  const tk = await qxAuth();
  if (!tk) return null;
  const j = await httpGetJson(QX_SITE + '/v2/theater_parent/detail?theater_parent_id=' + encodeURIComponent(vid), qxH(tk));
  if (!j || typeof j.data !== 'object' || !j.data) return null;
  return j.data;
}
const qixing = {
  cats: QX_CATS,
  async list(cat, page) {
    const tk = await qxAuth();
    if (!tk) return { list: [], hasMore: false };
    const j = await httpGetJson(QX_SITE + '/v1/theater/home_page?theater_class_id=' + encodeURIComponent(cat || '1') + '&page_num=' + page + '&page_size=24', qxH(tk));
    const d = (j && j.data && typeof j.data === 'object') ? j.data : {};
    const items = Array.isArray(d.list) ? d.list : [];
    const cn = (QX_CATS.find(c => c.type_id === String(cat)) || {}).type_name || '';
    const list = items.map(it => qxCard(it, cn)).filter(Boolean);
    return { list, hasMore: list.length > 0 && d.is_end !== true };
  },
  async search(wd) {
    const tk = await qxAuth();
    if (!tk) return [];
    const j = await httpPostJson(QX_SITE + '/v3/search', { text: wd }, qxH(tk));
    const items = (j && j.data && j.data.theater && Array.isArray(j.data.theater.search_data)) ? j.data.theater.search_data : [];
    return items.map(it => qxCard(it, '搜索')).filter(Boolean);
  },
  async detail(vid) {
    const d = await qxDetailRaw(vid);
    if (!d) return null;
    const eps = [];
    const seen = new Set();
    for (const raw of (Array.isArray(d.theaters) ? d.theaters : [])) {
      const no = parseInt(pick(raw, 'num'), 10) || (eps.length + 1);
      if (seen.has(no)) continue;
      seen.add(no);
      const src = pick(raw, 'son_video_url');
      if (!src) continue;
      const sn = clean(pick(raw, 'son_title'));
      eps.push({ no, name: (sn && sn !== clean(pick(d, 'title'))) ? ('第' + no + '集 ' + sn) : ('第' + no + '集'), url: 'qixing://' + vid + '/' + no });
    }
    eps.sort((a, b) => a.no - b.no);
    if (!eps.length) return null;
    return { name: clean(pick(d, 'title')) || vid, pic: pick(d, 'cover_url'), desc: clean(pick(d, 'introduction')).slice(0, 400), eps };
  },
  async play(vid, no) {
    const d = await qxDetailRaw(vid);
    if (!d) return '';
    for (const raw of (Array.isArray(d.theaters) ? d.theaters : [])) {
      if ((parseInt(pick(raw, 'num'), 10) || 0) === no) {
        const src = pick(raw, 'son_video_url');
        if (src.startsWith('http')) return src;
      }
    }
    return '';
  },
};

/* ================= 平台: 星芽 ================= */
const XY_DEVICE = '24250683a3bdb3f118dff25ba4b1cba1a';
const XY_UUID = 'randomUUID_914e7a9b-deac-4f80-9247-db56669187df';
const XY_DEVTOKEN = 'WuoRLUg1r08Z1f0IqSv2q1lvfxrYckKavmnAPYLdkT9P1fPFNRt0RuN3DLLFZqApRDdPD3mM2jB6d79CF2LtM*';
const XY_UA = 'Mozilla/5.0 (Linux; Android 9; RMX1931 Build/PQ3A.190605.05081124; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36';
const XY_APP_UA = 'Mozilla/5.0 (Linux; Android 9; RMX1931 Build/PQ3A.190605.05081124; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/91.0.4472.114 Mobile Safari/537.36';
async function xyAuth() {
  // XPTV 无跨调用状态：猫版全局 headers 缓存去掉，每次调用内重新登录重建
  const lh = {
    'User-Agent': 'okhttp/4.10.0', 'Content-Type': 'application/x-www-form-urlencoded',
    'x-app-id': '7', 'platform': '1', 'version_name': '3.3.1', 'app_version': '3.3.1',
    'device_platform': 'android', 'device_id': XY_DEVICE, 'device_type': 'RMX1931',
    'device_brand': 'realme', 'os_version': '9', 'channel': 'default', 'uuid': XY_UUID,
  };
  const form = 'device=' + XY_DEVICE + '&install_first_open=false&first_install_time=1723214205125&last_update_time=1723214205125&report_link_url=';
  const j = await httpPostForm(XY_AUTH + '/user/v1/account/login', form, lh);
  const tk = j && j.data && typeof j.data === 'object' ? String(j.data.token || '').trim() : '';
  if (!tk) return null;
  return { ...lh, 'authorization': tk, 'dev_token': XY_DEVTOKEN, 'user_agent': XY_APP_UA, 'support_h265': '1' };
}
function xyCard(item, catName) {
  const vid = pick(item, 'id'); const name = clean(pick(item, 'title'));
  if (!vid || !name) return null;
  const total = parseInt(pick(item, 'total'), 10) || 0;
  return {
    vod_id: 'xingya:' + vid, vod_name: name, vod_pic: pick(item, 'cover_url'),
    vod_remarks: total > 0 ? ('共' + total + '集') : '', vod_class: catName,
  };
}
async function xyDetailRaw(vid) {
  const h = await xyAuth();
  if (!h) return null;
  const j = await httpGetJson(XY_SITE + '/v2/theater_parent/detail?theater_parent_id=' + encodeURIComponent(vid), h);
  if (!j || typeof j.data !== 'object' || !j.data) return null;
  return j.data;
}
const xingya = {
  cats: XY_CATS,
  async list(cat, page) {
    const h = await xyAuth();
    if (!h) return { list: [], hasMore: false };
    const c = XY_CATS.find(x => x.type_id === String(cat)) || XY_CATS[0];
    const j = await httpGetJson(XY_SITE + '/cloud/v2/theater/home_page?theater_class_id=' + c.cid + '&type=1&class2_ids=0&page_num=' + page + '&page_size=24', h);
    const d = (j && j.data && typeof j.data === 'object') ? j.data : {};
    const arr = Array.isArray(d.list) ? d.list : [];
    const items = arr.map(e => (e && typeof e === 'object' && e.theater) ? e.theater : null).filter(Boolean);
    const list = items.map(it => xyCard(it, c.type_name)).filter(Boolean);
    return { list, hasMore: list.length > 0 && d.is_end !== true };
  },
  async search(wd) {
    const h = await xyAuth();
    if (!h) return [];
    const j = await httpPostJson(XY_SITE + '/v3/search', { text: wd }, { ...h, 'Content-Type': 'application/json' });
    const items = (j && j.data && j.data.theater && Array.isArray(j.data.theater.search_data)) ? j.data.theater.search_data : [];
    return items.map(it => xyCard(it, '搜索')).filter(Boolean);
  },
  async detail(vid) {
    const d = await xyDetailRaw(vid);
    if (!d) return null;
    const eps = [];
    const seen = new Set();
    const title = clean(pick(d, 'title'));
    let idx = 0;
    for (const raw of (Array.isArray(d.theaters) ? d.theaters : [])) {
      idx++;
      const no = parseInt(pick(raw, 'num'), 10) || idx;
      if (seen.has(no)) continue;
      seen.add(no);
      const sn = clean(pick(raw, 'son_title'));
      eps.push({ no, name: (sn && sn !== title) ? ('第' + no + '集 ' + sn) : ('第' + no + '集'), url: 'xingya://' + vid + '/' + no });
    }
    eps.sort((a, b) => a.no - b.no);
    if (!eps.length) return null;
    return { name: title || vid, pic: pick(d, 'cover_url'), desc: clean(pick(d, 'introduction')).slice(0, 400), eps };
  },
  async play(vid, no) {
    const d = await xyDetailRaw(vid);
    if (!d) return '';
    for (const raw of (Array.isArray(d.theaters) ? d.theaters : [])) {
      if ((parseInt(pick(raw, 'num'), 10) || 0) === no) {
        const src = pick(raw, 'son_video_url');
        if (src.startsWith('http')) return src;
      }
    }
    return '';
  },
};

/* ================= 平台: 狂飙（会话门禁为已知限制，逻辑照搬） ================= */
const KB_UA = 'Mozilla/5.0 (Linux; Android 12; Mobile) AppleWebKit/537.36 Chrome/131.0 Safari/537.36';
const KB_PLAY_PREFIX = 'https://raw.shorttv.online/uploads/direct/';
const KB_PAGE = 12, KB_MAX_EP = 80;
function kbH() { return { 'User-Agent': KB_UA, 'Referer': KB_SITE + '/zh/', 'Accept': 'application/json, text/plain, */*' }; }
async function kbTrpc(name, payload) {
  let target = KB_SITE + '/api/trpc/' + name;
  if (payload) target += '?input=' + encodeURIComponent(JSON.stringify({ json: payload })).replace(/%20/g, '+');
  const j = await httpGetJson(target, kbH());
  const out = j && j.result && j.result.data && j.result.data.json;
  return (out && typeof out === 'object') ? out : {};
}
function kbDrama(item) { return (item && item.drama && typeof item.drama === 'object') ? item.drama : (item || {}); }
function kbIsAdult(item) {
  const drama = kbDrama(item);
  const tags = Array.isArray(drama.tags) ? drama.tags : [];
  return tags.some(t => { const n = String((t && t.name) || ''); return n.startsWith('adult-') || n.includes('不伦') || n.includes('偷情'); });
}
function kbCover(drama) {
  for (const k of ['cover', 'poster']) {
    let raw = String(drama[k] || '');
    if (!raw || raw.includes('dc/img/828ed491f008e85d9caef01a.jpg')) continue;
    raw = raw.replace('https://cdn.shorttv.online/lsj/', 'https://raw.shorttv.online/lsj/');
    if (raw.includes('_minimize.')) return raw;
    const qi = raw.indexOf('?');
    let path = raw, q = '';
    if (qi >= 0) { path = raw.slice(0, qi); q = raw.slice(qi); }
    if (path.lastIndexOf('.') > path.lastIndexOf('/')) raw = path.slice(0, path.lastIndexOf('.')) + '_minimize.webp' + q;
    return raw;
  }
  return '';
}
function kbCard(item, catName) {
  const drama = kbDrama(item);
  const vid = String(drama.id || '').trim();
  const name = clean(drama.title);
  if (!vid || !name) return null;
  const total = parseInt(drama.totalEpisodes, 10) || 0;
  return {
    vod_id: 'kuangbiao:' + vid, vod_name: name, vod_pic: kbCover(drama),
    vod_remarks: total > 0 ? (total + '集') : '', vod_class: catName,
    vod_content: clean(drama.description).slice(0, 200),
  };
}
async function kbBrowsePage(spec, page) {
  let cursor = '', target = [], targetNext = '';
  for (let i = 1; i <= page; i++) {
    const data = { limit: KB_PAGE, ...spec.q };
    if (cursor) data.cursor = cursor;
    let out = [], seen = new Set(), next = '';
    for (let r = 0; r < spec.rounds; r++) {
      if (cursor) data.cursor = cursor;
      const body = await kbTrpc('feed.browse', data);
      if (!body) break;
      for (const raw of (Array.isArray(body.items) ? body.items : [])) {
        if (spec.mode === 'adult' && !kbIsAdult(raw)) continue;
        if (spec.mode === 'normal' && kbIsAdult(raw)) continue;
        const drama = kbDrama(raw);
        const k = String(drama.id || '').trim() || clean(drama.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        out.push(raw);
      }
      next = String(body.nextCursor || '').trim();
      if (out.length >= KB_PAGE || !next) break;
      cursor = next;
    }
    if (i === page) { target = out; targetNext = next; }
    cursor = next;
    if (!next) break;
  }
  return { items: target, hasMore: !!targetNext };
}
async function kbEpTable(dramaId, no) {
  const body = await kbTrpc('episode.watch', { dramaId, episodeNumber: no });
  const table = {};
  for (const ep of (Array.isArray(body.episodes) ? body.episodes : [])) {
    const idx = parseInt(ep && ep.index, 10);
    const id = String((ep && ep.id) || '').trim();
    if (idx > 0 && id) table[idx] = id;
  }
  return { body, table };
}
const kuangbiao = {
  cats: KB_CATS,
  async list(cat, page) {
    const spec = KB_CATS.find(x => x.type_id === String(cat)) || KB_CATS[0];
    const { items, hasMore } = await kbBrowsePage(spec, page);
    const list = items.map(it => kbCard(it, spec.type_name)).filter(Boolean);
    return { list, hasMore: list.length > 0 && hasMore };
  },
  async search(wd) {
    const items = await kbBrowsePage(KB_CATS[0], 1);
    return items.map(it => kbCard(it, '搜索')).filter(Boolean).filter(c => c.vod_name.includes(wd)).slice(0, 20);
  },
  async detail(vid) {
    const { body, table } = await kbEpTable(vid, 1);
    const drama = (body && body.drama && typeof body.drama === 'object') ? body.drama : {};
    let total = parseInt(drama.totalEpisodes, 10) || 0;
    if (total < Object.keys(table).length) total = Object.keys(table).length;
    if (total < 1) total = 1;
    if (total > KB_MAX_EP) total = KB_MAX_EP;
    const eps = [];
    for (let i = 1; i <= total; i++) eps.push({ no: i, name: '第' + i + '集', url: 'kuangbiao://' + vid + '/' + i });
    return { name: clean(drama.title) || vid, pic: kbCover(drama), desc: clean(drama.description).slice(0, 400), eps };
  },
  async play(vid, no) {
    const { table } = await kbEpTable(vid, no);
    const epId = table[no];
    if (epId) return KB_PLAY_PREFIX + epId + '/video.mp4';
    // 兜底: 抓 watch 页面
    const url = KB_SITE + '/zh/watch/' + encodeURIComponent(vid) + '/' + no;
    const html = await httpGet(url, { 'User-Agent': KB_UA, 'Referer': url });
    const m = html && html.match(/https?:\/\/[^\s"'\\]+\.(?:m3u8|mp4)[^\s"'\\]*/i);
    return m ? m[0] : '';
  },
};

/* ================= 平台: 酷我 ================= */
const KW_PLAY = 'http://nmobi.kuwo.cn/mobi.s';
const KW_UA = 'okhttp/5.1.0';
function kwH() { return { 'User-Agent': KW_UA, 'Accept': 'application/json' }; }
function kwCard(a) {
  if (!a || typeof a !== 'object') return null;
  const vid = String(a.url || '').trim();
  const name = clean(a.title) || clean(a.subTitle);
  if (!vid || !name) return null;
  let remarks = clean(a.currrentDesc);
  if (!remarks) { const n = parseInt(a.songNum, 10) || 0; if (n > 0) remarks = n + '集全'; }
  return { vod_id: 'kuwo:' + vid, vod_name: name, vod_pic: String(a.img || '').trim(), vod_remarks: remarks, vod_class: '酷我短剧' };
}
const kuwo = {
  cats: KW_CATS,
  async list(cat, page) {
    const j = await httpGetJson(KW_SITE + '/moduleMore?currentPage=' + page + '&moduleId=' + encodeURIComponent(cat || '10') + '&rn=12', kwH());
    const d = (j && j.data && typeof j.data === 'object') ? j.data : {};
    const items = Array.isArray(d.list) ? d.list : [];
    const seen = new Set();
    const out = [];
    for (const a of items) {
      const c = kwCard(a);
      if (c && !seen.has(c.vod_id)) { seen.add(c.vod_id); out.push(c); }
    }
    let hasMore;
    if (d.hasNextPage === true || d.hasNextPage === false) hasMore = d.hasNextPage;
    else if (typeof d.pageNum === 'number' && typeof d.pages === 'number') hasMore = d.pageNum < d.pages;
    else hasMore = out.length >= 12;
    return { list: out, hasMore: out.length > 0 && hasMore };
  },
  async search(wd) {
    const out = [], seen = new Set();
    const wl = wd.toLowerCase();
    for (const c of KW_CATS) {
      for (let pg = 1; pg <= 2 && out.length < 30; pg++) {
        const j = await httpGetJson(KW_SITE + '/moduleMore?currentPage=' + pg + '&moduleId=' + c.type_id + '&rn=12', kwH());
        const items = (j && j.data && Array.isArray(j.data.list)) ? j.data.list : [];
        for (const a of items) {
          const card = kwCard(a);
          if (card && !seen.has(card.vod_id) && card.vod_name.toLowerCase().includes(wl)) { seen.add(card.vod_id); out.push(card); }
        }
        if (!items.length) break;
      }
    }
    return out;
  },
  async detail(vid) {
    const j = await httpGetJson(KW_SITE + '/videoList?albumId=' + encodeURIComponent(vid), kwH());
    const data = (j && typeof j.data === 'object' && j.data) || {};
    const info = (typeof data.shortinfo === 'object' && data.shortinfo) || {};
    const eps = [];
    let i = 0;
    for (const it of (Array.isArray(data.list) ? data.list : [])) {
      i++;
      const pay = (it && typeof it.mvpayinfo === 'object' && it.mvpayinfo) || {};
      const vn = String(pay.vid || '').trim();
      if (!vn || vn === '0') continue;
      eps.push({ no: i, name: clean(it.name) || ('第' + i + '集'), url: 'kuwo://' + vid + '/' + vn });
    }
    if (!eps.length) return null;
    return { name: clean(info.title) || vid, pic: String(info.cover || '').trim(), desc: '', eps };
  },
  async play(vid, epvid) {
    const t = await httpGet(KW_PLAY + '?f=web&type=get_url_by_vid&vid=' + encodeURIComponent(epvid), { 'User-Agent': KW_UA });
    if (!t) return '';
    let m = t.match(/^\s*url=(\S+)\s*$/m);
    let media = m ? m[1].trim() : '';
    if (!media) { const i = t.indexOf('url='); if (i >= 0) media = t.slice(i + 4).split(/[\r\n \t]/)[0].trim(); }
    return (media.startsWith('http')) ? media : '';
  },
};

/* ================= 平台: 剧屋(MacCMS) ================= */
function jwH() { return { 'Referer': JW_SITE + '/', 'User-Agent': UA }; }
function jwCleanPic(pic) {
  const s = String(pic || '').trim();
  if (!s) return '';
  let host = '';
  try { host = (new URL(s).hostname || '').toLowerCase(); } catch (e) { return ''; }
  if (!host) return '';
  for (const ph of ['huangdouhui.tv']) {
    if (host === ph || host.endsWith('.' + ph)) return '';
  }
  return s;
}
function jwCard(it) {
  if (!it || typeof it !== 'object') return null;
  const vid = String(it.vod_id || '').trim();
  if (!vid) return null;
  return {
    vod_id: 'juwu:' + vid, vod_name: String(it.vod_name || ''), vod_pic: jwCleanPic(it.vod_pic),
    vod_remarks: String(it.vod_remarks || ''), vod_class: String(it.vod_class || ''), vod_content: clean(it.vod_content),
  };
}
async function jwQuery(params) {
  const j = await httpGetJson(JW_SITE + '/api.php/provide/vod/?' + qs(params), jwH());
  if (!j || j.code !== 1) return [];
  return Array.isArray(j.list) ? j.list : [];
}
async function jwQueryPage(params) {
  const j = await httpGetJson(JW_SITE + '/api.php/provide/vod/?' + qs(params), jwH());
  if (!j || j.code !== 1) return { items: [], hasMore: false };
  const items = Array.isArray(j.list) ? j.list : [];
  const pg = parseInt(j.page, 10) || 1, pgc = parseInt(j.pagecount, 10) || 1;
  return { items, hasMore: items.length > 0 && pg < pgc };
}
function jwPlayEps(raw) {
  let best = [];
  for (const line of String(raw || '').split('$$$')) {
    const eps = [];
    for (const seg of line.split('#')) {
      const di = seg.indexOf('$');
      if (di < 0) continue;
      const addr = seg.slice(di + 1).trim();
      if (addr) eps.push({ name: seg.slice(0, di).trim(), addr });
    }
    if (eps.length > best.length) best = eps;
  }
  return best;
}
const juwu = {
  cats: JW_CATS,
  async list(cat, page) {
    const { items, hasMore } = await jwQueryPage({ ac: 'detail', t: cat || '1', pg: String(page) });
    return { list: items.map(jwCard).filter(Boolean), hasMore };
  },
  async search(wd) {
    const items = await jwQuery({ ac: 'detail', wd, pg: '1' });
    return items.map(jwCard).filter(Boolean).slice(0, 30);
  },
  async detail(vid) {
    const items = await jwQuery({ ac: 'detail', ids: vid });
    if (!items.length) return null;
    const it = items[0];
    const eps = jwPlayEps(it.vod_play_url).map((e, i) => ({ no: i + 1, name: e.name || ('第' + (i + 1) + '集'), url: 'juwu://' + vid + '/' + (i + 1) }));
    if (!eps.length) return null;
    return { name: String(it.vod_name || ''), pic: jwCleanPic(it.vod_pic), desc: clean(it.vod_content).slice(0, 400), eps };
  },
  async play(vid, no) {
    const items = await jwQuery({ ac: 'detail', ids: vid });
    if (!items.length) return '';
    const eps = jwPlayEps(items[0].vod_play_url);
    const e = eps[no - 1];
    return (e && e.addr.startsWith('http')) ? e.addr : '';
  },
};

/* ================= 平台: 围观 ================= */
const WG_UA = 'okhttp/4.10.0';
function wgH() { return { 'User-Agent': WG_UA, 'Accept': 'application/json, text/plain, */*', 'Origin': WG_SITE, 'Referer': WG_SITE + '/' }; }
function wgCard(it) {
  if (!it || typeof it !== 'object') return null;
  const vid = String(it.oneId || '').trim();
  const name = clean(it.title);
  if (!vid || !name) return null;
  const count = parseInt(it.episodeCount, 10) || 0;
  return {
    vod_id: 'weiguan:' + vid, vod_name: name,
    vod_pic: String(it.vertPoster || it.horizonPoster || '').trim(),
    vod_remarks: count > 0 ? ('共' + count + '集') : '',
    vod_class: '围观', vod_content: clean(it.description).slice(0, 200),
  };
}
async function wgEpisodes(oneId) {
  const j = await httpGetJson(WG_SITE + '/drama/home/shortVideoDetail?version_code=1000&os_type=1&oneId=' + encodeURIComponent(oneId) + '&page=1&pageSize=1000', wgH());
  if (!j || j.data === undefined || j.data === null || j.data === 'null') return [];
  const arr = Array.isArray(j.data) ? j.data : [j.data];
  return arr.filter(e => e && typeof e === 'object');
}
function wgOrder(ep, index) {
  return (parseInt(ep.playOrder, 10) || parseInt(ep.episode, 10) || (index + 1));
}
function wgPlayUrl(ep) {
  let raw = ep.playSetting !== undefined ? ep.playSetting : ep.videoClarityList;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return '';
    try { raw = JSON.parse(t); } catch (e) { return t.startsWith('http') ? t : (String(ep.playUrl || '')); }
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const u = pick(raw, 'super', 'high', 'normal', 'url', 'playUrl');
    if (u.startsWith('http')) return u;
  }
  if (Array.isArray(raw)) {
    let best = null;
    for (const it of raw) {
      if (!it || typeof it !== 'object') continue;
      if (!best) best = it;
      const cl = String(it.clarity || '');
      if (['1080P', '1080p', 'super', '超清'].includes(cl)) best = it;
    }
    if (best) { const u = pick(best, 'url', 'playUrl'); if (u.startsWith('http')) return u; }
  }
  const u = String(ep.playUrl || '');
  return u.startsWith('http') ? u : '';
}
const weiguan = {
  cats: WG_CATS,
  async list(cat, page) {
    const j = await httpPostJson(WG_SITE + '/drama/home/search?version_code=1500&os_type=1',
      { audience: '全部受众', page, pageSize: 30, searchWord: '', subject: '全部主题' }, wgH());
    const arr = (j && Array.isArray(j.data)) ? j.data : [];
    const seen = new Set();
    const out = [];
    for (const it of arr) { const c = wgCard(it); if (c && !seen.has(c.vod_id)) { seen.add(c.vod_id); out.push(c); } }
    return { list: out, hasMore: out.length >= 30 };
  },
  async search(wd) {
    const j = await httpPostJson(WG_SITE + '/drama/home/search?version_code=1500&os_type=1',
      { audience: '全部受众', page: 1, pageSize: 30, searchWord: wd, subject: '全部主题' }, wgH());
    const arr = (j && Array.isArray(j.data)) ? j.data : [];
    return arr.map(wgCard).filter(Boolean).slice(0, 30);
  },
  async detail(vid) {
    const items = await wgEpisodes(vid);
    if (!items.length) return null;
    const first = items[0];
    const eps = [];
    const seen = new Set();
    items.forEach((ep, i) => {
      const order = wgOrder(ep, i);
      if (seen.has(order)) return;
      seen.add(order);
      eps.push({ no: order, name: '第' + order + '集', url: 'weiguan://' + vid + '/' + order });
    });
    eps.sort((a, b) => a.no - b.no);
    if (!eps.length) return null;
    return {
      name: clean(first.title) || vid, pic: String(first.vertPoster || first.horizonPoster || ''),
      desc: clean(pick(first, 'description', 'desc')).slice(0, 400), eps,
    };
  },
  async play(vid, no) {
    const items = await wgEpisodes(vid);
    for (let i = 0; i < items.length; i++) {
      if (wgOrder(items[i], i) === no) return wgPlayUrl(items[i]);
    }
    return '';
  },
};

/* ================= 路由 ================= */
const PLATS = { chengguo: cg, qixing, xingya, kuangbiao, kuwo, juwu, weiguan };
function platCats(key) { return PLATS[key].cats.map(c => ({ type_id: c.type_id, type_name: c.type_name })); }
function splitId(id) {
  const s = String(id || '');
  const i = s.indexOf(':');
  if (i > 0 && PLATS[s.slice(0, i)]) return [s.slice(0, i), s.slice(i + 1)];
  return ['chengguo', s];
}
function parseEpToken(tok) {
  // 形如 qixing://4739/1
  const m = String(tok || '').match(/^([a-z0-9_]+):\/\/(.+)$/);
  if (!m || !PLATS[m[1]]) return null;
  const rest = m[2];
  const cut = rest.lastIndexOf('/');
  if (cut <= 0) return null;
  const no = parseInt(rest.slice(cut + 1), 10);
  if (!no) return null;
  return { plat: m[1], vid: rest.slice(0, cut), no };
}
const PLAY_UA_HEADERS = {
  chengguo: { 'Referer': CG_SITE + '/', 'User-Agent': UA },
  qixing: { 'User-Agent': QX_UA },
  xingya: { 'Referer': XY_SITE + '/', 'User-Agent': 'okhttp/4.10.0' },
  kuangbiao: { 'User-Agent': KB_UA, 'Referer': KB_SITE + '/zh/' },
  kuwo: { 'User-Agent': KW_UA },
  juwu: { 'Referer': JW_SITE + '/', 'User-Agent': UA },
  weiguan: { 'User-Agent': WG_UA, 'Referer': WG_SITE + '/' },
};
function toCard(c) {
  if (!c) return null;
  return { ...c, ext: { id: c.vod_id } };
}

/* ================= 五入口 ================= */
async function getConfig() {
  return jsonify(appConfig);
}

async function getCards(ext) {
  ext = argsify(ext);
  const pkey = PLATS[ext.plat] ? String(ext.plat) : 'chengguo';
  const plat = PLATS[pkey];
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const cats = platCats(pkey);
  const sub = String(ext.tid || cats[0].type_id);
  const valid = cats.some(c => c.type_id === sub) ? sub : cats[0].type_id;
  let list = [];
  try {
    const r = await plat.list(valid, page);
    if (r && typeof r === 'object' && !Array.isArray(r)) list = r.list || [];
    else if (Array.isArray(r)) list = r;
  } catch (e) {}
  return jsonify({ list: list.map(toCard).filter(Boolean) });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const [pkey, vid] = splitId(ext.id);
  if (!vid) return jsonify({ list: [] });
  let d = null;
  try { d = await PLATS[pkey].detail(vid); } catch (e) {}
  if (!d || !d.eps || !d.eps.length) return jsonify({ list: [] });
  const platName = (PLAT_LIST.find(p => p.key === pkey) || {}).name || '聚合短剧';
  const tracks = d.eps.map(e => ({ name: e.name, pan: '', ext: { id: e.url, flag: platName } }));
  return jsonify({ list: [{ title: platName, tracks }] });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = String(ext.id || '').trim();
  if (id.includes('$')) id = id.split('$').pop().trim();
  const ep = parseEpToken(id);
  if (!ep) {
    // 兜底: 直接 http 媒体
    if (/^https?:\/\//i.test(id)) return jsonify({ urls: [id], headers: [{ 'User-Agent': UA }] });
    return jsonify({ urls: [], headers: [] });
  }
  let url = '';
  try { url = await PLATS[ep.plat].play(ep.vid, ep.no); } catch (e) {}
  const header = PLAY_UA_HEADERS[ep.plat] || { 'User-Agent': UA };
  if (url && /^https?:\/\//i.test(url)) {
    return jsonify({ urls: [url], headers: [header] });
  }
  // 猫版 parse:1 嗅探兜底的 XPTV 降级：有网页播放页的子源回源页 URL，其余回空
  let fallback = '';
  if (ep.plat === 'chengguo') fallback = CG_SITE + '/play/' + encodeURIComponent(ep.vid) + '/' + ep.no;
  else if (ep.plat === 'kuangbiao') fallback = KB_SITE + '/zh/watch/' + encodeURIComponent(ep.vid) + '/' + ep.no;
  if (fallback) return jsonify({ urls: [fallback], headers: [header] });
  return jsonify({ urls: [], headers: [] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = String(ext.text || '').trim();
  if (!wd) return jsonify({ list: [] });
  const out = [];
  const seen = new Set();
  // 猫版为 Promise.all 并发聚合，XPTV 版改串行逐子源执行
  for (const k of ['chengguo', 'qixing', 'xingya', 'kuangbiao', 'kuwo', 'juwu', 'weiguan']) {
    let arr = [];
    try { arr = (await PLATS[k].search(wd)) || []; } catch (e) { arr = []; }
    for (const c of arr.slice(0, 10)) {
      if (c && !seen.has(c.vod_id)) { seen.add(c.vod_id); out.push(toCard(c)); }
    }
  }
  return jsonify({ list: out.slice(0, 60) });
}
