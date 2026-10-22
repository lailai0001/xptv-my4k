// 吉利猫 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/jilimao.js（py_jilimao）
// 站点 https://jlm100.cc（苹果CMS）。注：2026-10-22 实测 jlm100.cc 全站 301 跳转 gckgg.com，
// $fetch 跟随重定向后数据正常（同猫版 req 跟随重定向），HOST 仍按猫版写 jlm100.cc，待真机验重定向跟随。
// 播放：play 阶段回播放页解析 const source / m3u8 / mp4 直出为主链；解不出时猫版落 parse:1 嗅探——
// XPTV 无嗅探位，降级为回播放页 URL，文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
// 搜索：猫版 search 为空桩（恒返回空）；XPTV 版按苹果CMS 标准路径 /index.php/vod/search/wd/{wd}.html
// 补实（2026-10-22 实测有结果，卡片解析同列表），与猫版的差异在此注明。
const HOST = 'https://jlm100.cc';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const FALLBACK_CATS = [
  { type_id: '46', type_name: '日韩自拍' },
  { type_id: '43', type_name: '色情主播' },
  { type_id: '44', type_name: '国产av' },
  { type_id: '59', type_name: '乱伦侵犯' },
  { type_id: '47', type_name: '日本无码' },
  { type_id: '50', type_name: '无码字幕' },
  { type_id: '49', type_name: '色情动漫' },
  { type_id: '48', type_name: '有码字幕' },
  { type_id: '51', type_name: '欧美av' },
  { type_id: '52', type_name: '18禁重口味' },
  { type_id: '53', type_name: '偷拍偷窥' },
  { type_id: '54', type_name: '网爆吃瓜' },
  { type_id: '55', type_name: '传媒a片' },
  { type_id: '56', type_name: '探花约炮' },
  { type_id: '57', type_name: '三级伦理' },
  { type_id: '58', type_name: 'av解说' },
];

const appConfig = {
    ver: 1,
    title: '吉利猫',
    site: HOST,
    tabs: FALLBACK_CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function unesc(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function absUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return HOST + (u.startsWith('/') ? u : '/' + u);
}

async function getText(url, retries) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Referer': HOST + '/',
  };
  const n = retries || 2;
  for (let i = 0; i < n; i++) {
    try {
      const { data } = await $fetch.get(url, { headers });
      const s = typeof data === 'string' ? data : '';
      if (s.length > 1000) return s;
      if (s) return s;
    } catch (e) { /* retry */ }
  }
  return '';
}

function parseList(html) {
  const results = [];
  if (!html) return results;
  const blocks = html.match(/<li>\s*<div class="video-item">([\s\S]*?)<\/li>/g) || [];
  const seen = new Set();
  for (const b of blocks) {
    const m = b.match(/href="[^"]*?\/vod\/play\/id\/(\d+)\.html"/);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const img = b.match(/<img[^>]*data-src="([^"]+)"[^>]*alt="([^"]*)"/);
    let title = img ? unesc(img[2]) : '';
    if (!title) {
      const tt = b.match(/class="line-clamp-[^"]*"[^>]*>\s*([^<]+?)\s*<\/a>/);
      title = tt ? unesc(tt[1]) : '';
    }
    if (!title) continue;
    let pic = img ? absUrl(img[1]) : '';
    if (!pic) {
      const p2 = b.match(/og:image" content="([^"]+)"/);
      pic = p2 ? absUrl(p2[1]) : '';
    }
    const rem = b.match(/rounded-large text-white">([^<]+)<\/div>/);
    results.push({
      vod_id: m[1],
      vod_name: title.slice(0, 120),
      vod_pic: pic,
      vod_remarks: rem ? rem[1].trim() : '',
      ext: { id: m[1] },
    });
  }
  return results;
}

async function getCategories() {
  const html = await getText(HOST + '/index.php/label/sort.html');
  const cats = [];
  if (html) {
    const parts = html.split(/<h2[^>]*>([^<]+)<\/h2>/);
    for (let i = 1; i < parts.length; i += 2) {
      if (parts[i].trim() !== '视频类别') continue;
      const subs = parts[i + 1].matchAll(/href="\/index\.php\/vod\/type\/id\/(\d+)\.html"[^>]*>([^<]+)</g);
      for (const s of subs) {
        cats.push({ type_id: s[1], type_name: unesc(s[2]) });
      }
      break;
    }
  }
  return cats.length >= 5 ? cats : FALLBACK_CATS;
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
  try {
    const cats = await getCategories();
    return jsonify({
      ver: 1,
      title: '吉利猫',
      site: HOST,
      tabs: cats.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
  } catch (e) {
    return jsonify(appConfig);
  }
}

async function getCards(ext) {
  ext = argsify(ext);
  const tid = String(ext.tid || '46');
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const html = await getText(`${HOST}/index.php/vod/type/id/${tid}/page/${page}.html`);
  return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let vid = String(ext.id || '').trim();
  if (!vid) return jsonify({ list: [] });
  const vm = vid.match(/\/vod\/(?:play|detail)\/id\/(\d+)\.html/);
  if (vm) vid = vm[1];
  else { const dm = vid.match(/(\d+)/); vid = dm ? dm[1] : vid; }
  const playPage = `${HOST}/index.php/vod/play/id/${vid}.html`;
  return jsonify({ list: buildGroups('吉利猫', `播放$${playPage}`) });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = String(ext.id || '').trim();
  if (!id) return jsonify({ urls: [], headers: [] });
  if (/\$/.test(id)) id = id.split('$').pop().trim();
  const url = /^https?:\/\//i.test(id) ? id : absUrl(id);
  const header = { 'User-Agent': UA, 'Referer': HOST + '/' };
  if (/\.m3u8|\.mp4/i.test(url)) {
    return jsonify({ urls: [url], headers: [header] });
  }
  const html = await getText(url);
  if (html) {
    let m = html.match(/const\s+source\s*=\s*['"]([^'"]+)['"]/);
    if (m) {
      return jsonify({ urls: [absUrl(m[1])], headers: [header] });
    }
    m = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/);
    if (m) {
      return jsonify({ urls: [m[1]], headers: [header] });
    }
    m = html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/);
    if (m) {
      return jsonify({ urls: [m[1]], headers: [header] });
    }
  }
  // 嗅探降级：回播放页 URL（同猫版 parse:1）
  return jsonify({ urls: [url], headers: [{ 'User-Agent': UA }] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = String(ext.text || '').trim();
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  if (!wd) return jsonify({ list: [] });
  // 苹果CMS 标准搜索路径（猫版为空桩，此处补实，见文件头注）
  const url = page > 1
    ? `${HOST}/index.php/vod/search/page/${page}/wd/${encodeURIComponent(wd)}.html`
    : `${HOST}/index.php/vod/search/wd/${encodeURIComponent(wd)}.html`;
  const html = await getText(url);
  return jsonify({ list: parseList(html) });
}
