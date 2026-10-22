// JavHD.Today - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/javhdtoday.js（py_javhdtoday）
// 站点 https://javhd.today/cn/，无站外依赖。注意与 JavHD（javhd.icu）是不同站点。
// 播放（同猫版优先级）：embed 各 server 页 ?json=1 取源——embed_server3（vidara m3u8 直链）
// > embed_server9（streamtape MP4）> embed.php（站方代理 HLS）> f4 系 api/play 降级，均为直出；
// 全部失败时猫版落 parse:1 嗅探首个 player——XPTV 无嗅探位，降级为回该 player URL，
// 文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
// 注意：vidara/streamtape 源只带 UA 不带 Referer（带 Referer 会被限速），同猫版。
// 猫版 b64dec 用 Node Buffer，XPTV 改 createCryptoJS() 的 enc.Base64 解码（等价）。
// 搜索已知限制（同猫版）：搜索页为 JS 动态渲染，服务端 HTML 无卡片，search 可能为空。
const CryptoJS = createCryptoJS();

const SITE = 'https://javhd.today';
const CN = SITE + '/cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = CN + '/';

const SORT_CATS = [
  { type_id: 'recent', type_name: '最新上传' },
  { type_id: 'popular', type_name: '最受欢迎' },
  { type_id: 'rated', type_name: '高评分' },
  { type_id: 'discussed', type_name: '热议' },
  { type_id: 'downloaded', type_name: '下载最多' },
  { type_id: 'longest', type_name: '最长' },
  { type_id: 'watched', type_name: '观看最多' },
];

const TAG_CATS = [
  { type_id: 'tag:uncensored-jav', type_name: '无码流出', slug: 'uncensored-jav' },
  { type_id: 'tag:chinese-subtitle', type_name: '中文字幕', slug: 'chinese-subtitle' },
  { type_id: 'tag:jav-sub', type_name: '英文字幕', slug: 'jav-sub' },
  { type_id: 'tag:big-tits', type_name: '巨乳', slug: 'big-tits' },
  { type_id: 'tag:creampie', type_name: '中出', slug: 'creampie' },
  { type_id: 'tag:reducing-mosaic', type_name: '减少马赛克', slug: 'reducing-mosaic' },
  { type_id: 'tag:married-woman', type_name: '已婚女人', slug: 'married-woman' },
  { type_id: 'tag:beautiful-girl', type_name: '美少女', slug: 'beautiful-girl' },
  { type_id: 'tag:mature-woman', type_name: '成熟女性', slug: 'mature-woman' },
];

const CATS = [...SORT_CATS, ...TAG_CATS];
const LIMIT = 28;

const appConfig = {
    ver: 1,
    title: 'JavHD.Today',
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

function b64dec(s) {
  s = t(s);
  if (!s) return '';
  try {
    return CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8);
  } catch (e) { return ''; }
}

async function getHtml(url, referer) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
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

async function getJson(url, referer) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json',
    'Referer': referer || REFERER,
  };
  try {
    const { data } = await $fetch.get(url, { headers });
    if (data) {
      if (typeof data === 'string') { try { return JSON.parse(data); } catch (e) { return null; } }
      return data;
    }
  } catch (e) { /* ignore */ }
  return null;
}

function parseCards(html) {
  const out = [];
  const seen = new Set();
  const re = /<li[^>]*id="video-(\d+)"[^>]*>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const vid = m[1];
    const card = m[2];
    const am = card.match(/<a[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*class="thumbnail"/)
      || card.match(/<a[^>]*class="thumbnail"[^>]*href="([^"]+)"[^>]*title="([^"]*)"/)
      || card.match(/<a[^>]*href="([^"]+)"[^>]*>/);
    if (!am) continue;
    const durl = fixUrl(am[1]);
    if (seen.has(durl)) continue;
    seen.add(durl);
    let title = am[2] ? clean(am[2]) : '';
    if (!title) {
      const tm = card.match(/<span class="video-title">([\s\S]*?)<\/span>/);
      if (tm) title = clean(tm[1]);
    }
    const im = card.match(/<img[^>]+src="([^"]+)"/);
    const rm = card.match(/<span class="video-overlay[^"]*"[^>]*>\s*HD\s*([\d:]+)/);
    out.push({
      vod_id: durl,
      vod_name: title || ('视频 ' + vid),
      vod_pic: im ? fixUrl(im[1]) : '',
      vod_remarks: rm ? rm[1].trim() : '',
      ext: { id: durl },
    });
  }
  return out;
}

function catUrl(tid, page) {
  if (tid.startsWith('tag:')) {
    const cat = TAG_CATS.find(c => c.type_id === tid) || TAG_CATS[0];
    return `${CN}/${cat.slug}/?ajax=1&page=${page}`;
  }
  const sort = SORT_CATS.some(c => c.type_id === tid) ? tid : 'recent';
  let url = `${CN}/${sort}/`;
  if (page > 1) url += `${page}/`;
  return url;
}

function isTagCat(tid) {
  return String(tid).startsWith('tag:');
}

function extractEmbed(html) {
  const m = html.match(/<iframe[^>]+src="([^"]*\/cn\/embed\/\d+\/?)"/);
  return m ? fixUrl(m[1]) : '';
}

function extractPlayers(embedHtml) {
  const out = [];
  const re = /<div class="server-option[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(embedHtml)) !== null) {
    const end = embedHtml.indexOf('>', m.index);
    const tag = embedHtml.slice(m.index, end + 1);
    const nameM = tag.match(/data-name="([^"]*)"/);
    const name = nameM ? nameM[1] : '';
    const embedsM = tag.match(/data-embeds="([^"]+)"/);
    const embedM = tag.match(/data-embed="([^"]+)"/);
    if (embedsM) {
      const dec = b64dec(embedsM[1]);
      try {
        const arr = JSON.parse(dec);
        if (Array.isArray(arr)) arr.forEach(u => out.push({ name, url: u }));
      } catch (e) { /* ignore */ }
    } else if (embedM) {
      const dec = b64dec(embedM[1]);
      if (/^https?:\/\//.test(dec)) out.push({ name, url: dec });
    }
  }
  return out;
}

async function resolveF4(embedUrl, referer) {
  const html = await getHtml(embedUrl, referer);
  if (!html) return '';
  const vidM = html.match(/data-video-id="([a-f0-9-]+)"/);
  if (!vidM) return '';
  const vid = vidM[1];
  const apiM = html.match(/data-api="([^"]+)"/);
  let host = 'https://f4scdn.com';
  try { host = new URL(embedUrl).origin; } catch (e) { /* ignore */ }
  const playApi = apiM
    ? (apiM[1].startsWith('/') ? host + apiM[1] : apiM[1])
    : `${host}/api/play/${vid}`;
  const srcUrl = `${playApi}?ab=0&r=${encodeURIComponent(referer || REFERER)}`;
  const j = await getJson(srcUrl, embedUrl);
  if (j && j.src && /^https?:\/\//.test(j.src)) return { url: j.src, origin: host };
  if (j && j.url && /^https?:\/\//.test(j.url)) return { url: j.url, origin: host };
  return '';
}

async function resolveServerJson(playerUrl, referer) {
  const pM = String(playerUrl).match(/[?&]p=([^&]+)/);
  if (!pM) return '';
  let host = '';
  let page = 'embed.php';
  try {
    const u = new URL(playerUrl);
    host = u.origin;
    page = u.pathname.split('/').pop() || 'embed.php';
  } catch (e) { return ''; }
  const token = pM[1];
  const apiUrl = `${host}/${page}?json=1&next=0&p=${encodeURIComponent(token)}`;
  const j = await getJson(apiUrl, referer);
  if (!j || !j.success) return '';
  if (j.src && typeof j.src === 'string') {
    const src = j.src.startsWith('http') ? j.src : host + j.src;
    return { kind: 'hls', url: src, playerUrl };
  }
  if (j.media && typeof j.media === 'string') {
    const src = j.media.startsWith('http') ? j.media : host + j.media;
    return { kind: 'mp4', url: src, playerUrl };
  }
  return '';
}

async function resolveSelfPlayer(playerUrl, referer) {
  const r = await resolveServerJson(playerUrl, referer);
  return r && r.kind === 'hls' ? { url: r.url, playerUrl: r.playerUrl, host: new URL(playerUrl).origin } : '';
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
  const tid = t(ext.tid) || 'recent';
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const url = catUrl(tid, page);
  if (isTagCat(tid)) {
    const j = await getJson(url, REFERER);
    if (!j || !j.html) return jsonify({ list: [] });
    return jsonify({ list: parseCards(j.html) });
  }
  const html = await getHtml(url);
  return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
  ext = argsify(ext);
  const id = t(ext.id);
  if (!id) return jsonify({ list: [] });
  const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);
  return jsonify({ list: buildGroups('JavHD.Today', `正片$${durl}`) });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = t(ext.id);
  if (!id) return jsonify({ urls: [], headers: [] });
  if (id.includes('$')) id = id.split('$').pop().trim();
  if (/\.m3u8(\?|$)/i.test(id)) {
    return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] });
  }
  const durl = /^https?:\/\//.test(id) ? id : fixUrl(id);

  const html = await getHtml(durl);
  if (!html) return jsonify({ urls: [], headers: [] });
  const embedUrl = extractEmbed(html);
  if (!embedUrl) return jsonify({ urls: [], headers: [] });

  const embedHtml = await getHtml(embedUrl, durl);
  if (!embedHtml) return jsonify({ urls: [], headers: [] });
  const players = extractPlayers(embedHtml);
  if (!players.length) return jsonify({ urls: [], headers: [] });

  const findServer = (pageRe) => players.find(p => /javhdz\.today\//i.test(p.url) && pageRe.test(p.url));
  const s3 = findServer(/embed_server3\.php/i);
  if (s3) {
    const r = await resolveServerJson(s3.url, embedUrl);
    if (r && r.kind === 'hls' && r.url) {
      return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA }] });
    }
  }
  const s9 = findServer(/embed_server9\.php/i);
  if (s9) {
    const r = await resolveServerJson(s9.url, embedUrl);
    if (r && r.kind === 'mp4' && r.url) {
      return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA }] });
    }
    if (r && r.kind === 'hls' && r.url) {
      return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA }] });
    }
  }
  const mainSelf = findServer(/\/embed\.php(\?|$)/i);
  const selfPlayers = mainSelf ? [mainSelf] : players.filter(p => /javhdz\.today\/embed\.php/i.test(p.url));
  for (const sp of selfPlayers) {
    const r = await resolveSelfPlayer(sp.url, embedUrl);
    if (r && r.url) {
      return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA, 'Referer': r.playerUrl }] });
    }
  }

  const f4 = players.find(p => /f4\w*\.com|f4scdn/i.test(p.url));
  if (f4) {
    const r = await resolveF4(f4.url, durl);
    if (r && r.url) {
      return jsonify({ urls: [r.url], headers: [{ 'User-Agent': UA, 'Referer': f4.url, 'Origin': r.origin }] });
    }
  }
  // 嗅探降级：回首个 player URL（同猫版 parse:1）
  const first = players[0];
  return jsonify({ urls: [first.url], headers: [{ 'User-Agent': UA, 'Referer': durl }] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = t(ext.text);
  if (!wd) return jsonify({ list: [] });
  // 搜索页为 JS 动态渲染，服务端拿不到结果（同猫版，见文件头注）
  const url = `${CN}/search/video/?s=${encodeURIComponent(wd)}`;
  const html = await getHtml(url);
  if (!html) return jsonify({ list: [] });
  return jsonify({ list: parseCards(html) });
}
