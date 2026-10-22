// JavMobile - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/javmobile.js（py_javmobile）
// 站点 https://javmobile.net，无站外依赖；纯正则解析（无 cheerio）。
// 播放：详情页 SOURCES → Server1 upload18 的 window.PLAYER_CONFIG.m3u8（helvid 直链）为主链、
// Server2 audinifer 解 pack 混淆取 m3u8 为兜底（均为 parse:0 等价直出）；两路都解不出时
// 猫版落 parse:1 嗅探 embed 页——XPTV 无嗅探位，降级为回 embed 页 URL，
// 文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
// 降级项：猫版 helvid m3u8 走本地 /proxy/m3u8 代理改写（修正 MEDIA-SEQUENCE:1 等兼容问题），
// XPTV 无本地代理位，无法移植，getPlayinfo 直返 helvid 原始 m3u8，待真机验 iOS 端 seek/起播表现。
// 注意：取 helvid token 必须用手机 UA（token 按设备签发），同猫版。
const SITE = 'https://javmobile.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const REFERER = SITE + '/';

const CATS = [
  { type_id: 'latest', type_name: '最新' },
  { type_id: 'censored', type_name: '有码' },
  { type_id: 'uncensored', type_name: '无码' },
  { type_id: 'uncensored-leaked', type_name: '破解无码' },
  { type_id: 'chinese-av', type_name: '国产' },
  { type_id: 'amateur', type_name: '素人' },
  { type_id: 'english-subtitle', type_name: '英字' },
  { type_id: 'actresses', type_name: '女优' },
];

const appConfig = {
    ver: 1,
    title: 'JavMobile',
    site: SITE,
    tabs: CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
  return String(v == null ? '' : v).trim();
}

function clean(s) {
  return t(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

function fixUrl(u) {
  u = t(u);
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return SITE + u;
  return u;
}

async function getHtml(url, referer, ua) {
  const headers = {
    'User-Agent': ua || UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
    'Referer': referer || REFERER,
  };
  try {
    const { data } = await $fetch.get(url, { headers });
    const s = typeof data === 'string' ? data : '';
    if (s.length > 1000) return s;
    if (s) return s;
  } catch (e) { /* ignore */ }
  return '';
}

function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<article\s[^>]*class="[^"]*loop-post[^"]*"[^>]*>([\s\S]*?)<\/article>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const card = m[1];
    const am = card.match(/<a\s[^>]*href="(https?:\/\/javmobile\.net\/[^"]+\/)"/);
    if (!am) continue;
    const durl = am[1];
    if (seen.has(durl)) continue;
    seen.add(durl);
    let title = '';
    const tm = card.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/);
    if (tm) title = clean(tm[1]);
    let pic = '';
    const im = card.match(/<img[^>]+src="([^"]+)"/);
    if (im) pic = fixUrl(im[1]);
    out.push({
      vod_id: durl,
      vod_name: title || durl.split('/').filter(Boolean).pop(),
      vod_pic: pic,
      vod_remarks: '',
      ext: { id: durl },
    });
  }
  return out;
}

function catUrl(tid, page) {
  let base;
  if (tid === 'latest' || !tid) base = SITE + '/';
  else base = SITE + '/' + tid + '/';
  if (page > 1) base += 'page/' + page + '/';
  return base;
}

function extractSources(html) {
  const m = html.match(/var\s+SOURCES\s*=\s*\[(.*?)\];/s);
  if (!m) return [];
  const urls = [];
  const re = /"(https?:\\?\/\\?\/[^"]+)"/g;
  let x;
  while ((x = re.exec(m[1])) !== null) {
    urls.push(x[1].replace(/\\\//g, '/'));
  }
  return urls;
}

// Server1: upload18 播放页 -> window.PLAYER_CONFIG.m3u8（手机 UA 取 token，同猫版，含 1 次重试）
async function resolveUpload18(embedUrl) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const html = await getHtml(embedUrl, REFERER, MOBILE_UA);
    if (!html || !html.includes('window.PLAYER_CONFIG')) continue;
    const m = html.match(/window\.PLAYER_CONFIG\s*=\s*(\{.*?\});/s);
    if (!m) continue;
    try {
      const cfg = JSON.parse(m[1]);
      const url = t(cfg.m3u8).replace(/\\\//g, '/');
      if (/^https?:\/\/[^/]*helvid\.com\/m\//.test(url)) return url;
      if (/^https?:\/\//.test(url) && url.includes('.m3u8')) return url;
    } catch (e) { /* ignore */ }
  }
  return '';
}

// Server2: audinifer embed 页 -> 解 pack 混淆 JS 取 m3u8（同猫版）
function unpackAudinifer(html) {
  const m = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('((?:[^'\\]|\\.)*)',(\d+),(\d+),'((?:[^'\\]|\\.)*)'\.split\('\|'\)\)/);
  if (!m) return '';
  let p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const a = parseInt(m[2], 10);
  const c = parseInt(m[3], 10);
  const k = m[4].split('|');
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const tok = (n) => {
    let s = '';
    while (n > 0) { s = chars[n % a] + s; n = Math.floor(n / a); }
    return s || '0';
  };
  for (let i = c - 1; i >= 0; i--) {
    if (k[i]) {
      const re = new RegExp('\\b' + tok(i) + '\\b', 'g');
      p = p.replace(re, k[i]);
    }
  }
  const um = p.match(/https?:\/\/[^\s"']+\.m3u8[^\s"']*/);
  return um ? um[0] : '';
}

async function resolveAudinifer(embedUrl) {
  const html = await getHtml(embedUrl, REFERER);
  if (!html) return '';
  return unpackAudinifer(html);
}

// 解析播放地址（实时解析，token 时效约 30 分钟，同猫版优先级）
async function resolvePlay(durl) {
  const html = await getHtml(durl);
  if (!html) return { url: '', parse: 0, referer: '' };
  const sources = extractSources(html);
  for (const s of sources) {
    if (/upload18\.org/i.test(s)) {
      const m3u8 = await resolveUpload18(s);
      if (m3u8) return { url: m3u8, parse: 0, referer: s };
    }
  }
  for (const s of sources) {
    if (/audinifer\.com/i.test(s)) {
      const m3u8 = await resolveAudinifer(s);
      if (m3u8) return { url: m3u8, parse: 0, referer: s };
      return { url: s, parse: 1, referer: s };
    }
  }
  if (sources.length) return { url: sources[0], parse: 1, referer: sources[0] };
  return { url: '', parse: 0, referer: '' };
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
  const tid = t(ext.tid) || 'latest';
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const html = await getHtml(catUrl(tid, page));
  return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const id = t(ext.id);
  if (!id) return jsonify({ list: [] });
  const durl = /^https?:\/\//.test(id) ? id : (SITE + '/' + id.replace(/^\/+|\/+$/g, '') + '/');
  return jsonify({ list: buildGroups('JavMobile', `正片$${durl}`) });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = t(ext.id);
  if (!id) return jsonify({ urls: [], headers: [] });
  if (id.includes('$')) id = id.split('$').pop().trim();
  if (/\.m3u8|\.mp4/i.test(id) && /^https?:\/\//i.test(id)) {
    return jsonify({ urls: [id], headers: [{ 'User-Agent': MOBILE_UA, 'Referer': REFERER }] });
  }
  const durl = /^https?:\/\//.test(id) ? id : (SITE + '/' + id.replace(/^\/+|\/+$/g, '') + '/');
  const r = await resolvePlay(durl);
  if (!r.url) return jsonify({ urls: [], headers: [] });
  const referer = r.referer || REFERER;
  // parse:0 直出媒体 URL；parse:1 时 r.url 为 embed 页——嗅探降级回该 URL（见文件头注）
  return jsonify({ urls: [r.url], headers: [{ 'User-Agent': MOBILE_UA, 'Referer': referer }] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = t(ext.text);
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  if (!wd) return jsonify({ list: [] });
  let url = SITE + '/?s=' + encodeURIComponent(wd);
  if (page > 1) url = SITE + '/page/' + page + '/?s=' + encodeURIComponent(wd);
  const html = await getHtml(url);
  return jsonify({ list: html ? parseCards(html) : [] });
}
