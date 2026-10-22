// XNXX - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/xnxx.js（py_xnxx）
// 多镜像域名兜底: xnxx.health 可能被墙, 依次尝试（猫版用跨调用全局 activeHost 缓存,
// XPTV 禁跨调用全局状态，改每次调用内串行探测，行为等价）。
// 播放：详情页 setVideoUrlHigh 直出最高档 mp4/m3u8 为主链（猫版 detail 已解析直链、play parse:0）；
// detail 解不出直链时猫版整条丢弃、无 track；play 落 parse:1 的仅剩非媒体 URL 入参——
// XPTV 无嗅探位，降级为回源 URL，文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
// 已知缺陷（原样 port、未顺手修）：猫侧分类/搜索翻页用 ?p=N 参数已被站方废掉（猫源存量问题），
// 第 2 页起可能与第 1 页重复或无效，待真机/后续点名再修。
const HOSTS = [
  'https://xnxx.health',
  'https://www.xnxx.health',
  'https://xnxx.com',
  'https://www.xnxx.com',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const FALLBACK_CATS = [
  { type_id: 'teen', type_name: 'Teen' },
  { type_id: 'milf', type_name: 'MILF' },
  { type_id: 'big+ass', type_name: 'Big Ass' },
  { type_id: 'big+tits', type_name: 'Big Tits' },
  { type_id: 'amateur', type_name: 'Amateur' },
  { type_id: 'anal', type_name: 'Anal' },
  { type_id: 'asian', type_name: 'Asian' },
  { type_id: 'bbw', type_name: 'BBW' },
  { type_id: 'bdsm', type_name: 'BDSM' },
  { type_id: 'blonde', type_name: 'Blonde' },
  { type_id: 'blowjob', type_name: 'Blowjob' },
  { type_id: 'brunette', type_name: 'Brunette' },
  { type_id: 'casting', type_name: 'Casting' },
  { type_id: 'creampie', type_name: 'Creampie' },
  { type_id: 'cumshot', type_name: 'Cumshot' },
  { type_id: 'deepthroat', type_name: 'Deepthroat' },
  { type_id: 'ebony', type_name: 'Ebony' },
  { type_id: 'fetish', type_name: 'Fetish' },
  { type_id: 'gangbang', type_name: 'Gangbang' },
  { type_id: 'hardcore', type_name: 'Hardcore' },
  { type_id: 'interracial', type_name: 'Interracial' },
  { type_id: 'japanese', type_name: 'Japanese' },
  { type_id: 'latina', type_name: 'Latina' },
  { type_id: 'lesbian', type_name: 'Lesbian' },
  { type_id: 'mature', type_name: 'Mature' },
  { type_id: 'pov', type_name: 'POV' },
  { type_id: 'public', type_name: 'Public' },
  { type_id: 'redhead', type_name: 'Redhead' },
  { type_id: 'shemale', type_name: 'Shemale' },
  { type_id: 'squirt', type_name: 'Squirt' },
  { type_id: 'threesome', type_name: 'Threesome' },
];

const appConfig = {
    ver: 1,
    title: 'XNXX',
    site: HOSTS[0],
    tabs: FALLBACK_CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function stripTags(s) {
  return String(s || '').replace(/<[^>]+>/g, '').trim();
}

async function fetchOne(url) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  try {
    const { data } = await $fetch.get(url, { headers });
    const s = typeof data === 'string' ? data : '';
    if (s.length > 1000) return s;
    if (s) return s;
  } catch (e) { /* next host */ }
  return '';
}

// 返回 {html, host}：host 为本次命中的镜像（仅调用内使用，不跨调用保存）
async function getText(path) {
  for (const h of HOSTS) {
    const s = await fetchOne(h + path);
    if (s) return { html: s, host: h };
  }
  return { html: '', host: HOSTS[0] };
}

function absUrl(u, host) {
  u = String(u || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  const h = host || HOSTS[0];
  if (u.startsWith('//')) return 'https:' + u;
  return h + (u.startsWith('/') ? u : '/' + u);
}

function parseList(html, host) {
  const videos = [];
  if (!html) return videos;
  const blocks = html.match(/<div[^>]*class="[^"]*thumb-block[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g)
    || html.match(/<div[^>]*class="[^"]*thumb-block[^"]*"[^>]*>[\s\S]{0,3000}/g) || [];
  const seen = new Set();
  for (const b of blocks) {
    const am = b.match(/<a[^>]*href="(\/video-[^"]+|\/search-video[^"]*)"/i);
    if (!am) continue;
    const href = am[1];
    if (seen.has(href)) continue;
    seen.add(href);
    let pic = '';
    const im = b.match(/(?<![\w-])src="([^"]+)"/i) || b.match(/data-src="([^"]+)"/i);
    if (im) pic = absUrl(im[1], host);
    const tm = b.match(/title="([^"]{2,200})"/i);
    const name = tm ? tm[1].trim() : href.split('/').pop().replace(/-/g, ' ');
    const dm = b.match(/class="[^"]*duration[^"]*"[^>]*>([^<]+)</i);
    videos.push({
      vod_id: href,
      vod_name: name.slice(0, 120),
      vod_pic: pic,
      vod_remarks: dm ? dm[1].trim() : '',
      ext: { id: href },
    });
    if (videos.length >= 60) break;
  }
  return videos;
}

function extractVideoUrl(html) {
  const patterns = [
    /setVideoUrlHigh\(['"]([^'"]+)['"]\)/,
    /setVideoUrlLow\(['"]([^'"]+)['"]\)/,
    /setVideoUrl\(['"]([^'"]+)['"]\)/,
    /"url"\s*:\s*"([^"]+\.mp4[^"]*)"/,
    /"url"\s*:\s*"([^"]+\.m3u8[^"]*)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1].replace(/\\\//g, '/');
  }
  const m = html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/);
  return m ? m[0] : '';
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
    const { html } = await getText('/');
    let cats = [];
    if (html) {
      const seen = new Set();
      const re = /<a[^>]*href="\/tags\/([^"]+)"[^>]*>([^<]{2,40})<\/a>/gi;
      let m;
      while ((m = re.exec(html)) !== null && cats.length < 40) {
        const tid = m[1].replace(/\/$/, '');
        const name = stripTags(m[2]);
        if (!tid || !name || seen.has(tid)) continue;
        seen.add(tid);
        cats.push({ type_id: tid, type_name: name });
      }
    }
    if (cats.length < 5) cats = FALLBACK_CATS;
    return jsonify({
      ver: 1,
      title: 'XNXX',
      site: HOSTS[0],
      tabs: cats.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
    });
  } catch (e) {
    return jsonify(appConfig);
  }
}

async function getCards(ext) {
  ext = argsify(ext);
  const tid = String(ext.tid || 'teen');
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  const url = page === 1 ? `/search/${tid}` : `/search/${tid}?p=${page}`;
  const { html, host } = await getText(url);
  return jsonify({ list: parseList(html, host) });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let href = String(ext.id || '').trim();
  if (!href) return jsonify({ list: [] });
  if (!href.startsWith('/')) href = '/' + href;
  const { html } = await getText(href);
  if (!html) return jsonify({ list: [] });
  const vurl = extractVideoUrl(html);
  if (!vurl) return jsonify({ list: [] });
  return jsonify({ list: buildGroups('XNXX', `默认$${vurl}`) });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = String(ext.id || '').trim();
  if (!id) return jsonify({ urls: [], headers: [] });
  if (/\$/.test(id)) id = id.split('$').pop().trim();
  if (/\.m3u8|\.mp4/i.test(id)) {
    return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': HOSTS[0] }] });
  }
  // 嗅探降级：回源 URL（同猫版 parse:1）
  return jsonify({ urls: [id], headers: [{ 'User-Agent': UA }] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = String(ext.text || '').trim();
  const page = Math.max(1, parseInt(ext.page, 10) || 1);
  if (!wd) return jsonify({ list: [] });
  const url = page === 1 ? `/search/${encodeURIComponent(wd)}` : `/search/${encodeURIComponent(wd)}?p=${page}`;
  const { html, host } = await getText(url);
  return jsonify({ list: parseList(html, host) });
}
