// 韩国BJ - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/hanbj.js（py_hanbj）
// 站点 https://ww1.koreanbj.club，无站外依赖；纯正则解析（无 cheerio）。
// 播放：详情页 embed（VOE 系）六层混淆解包 → m3u8/mp4 直出为主链（parse:0 等价）；
// 解不出直链的 embed 按猫版 parse:1 嗅探——XPTV 无嗅探位，降级为回 embed URL，
// 文件头标注「嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL」。
// 猫版 b64d 用 Node Buffer，XPTV 改 createCryptoJS() 的 enc.Base64 解码（等价）。
const CryptoJS = createCryptoJS();

const HOST = 'https://ww1.koreanbj.club';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CHANNELS = {
  home: { name: '最新', path: '/' },
  'korean-bj': { name: 'Korean BJ', path: '/category/korean-bj/' },
  pandatv: { name: 'PandaTV', path: '/category/pandatv/' },
  onlyfans: { name: 'OnlyFans', path: '/category/onlyfans/' },
  amateur: { name: 'Amateur', path: '/category/amateur-porn/' },
  kpop: { name: 'Kpop Deepfake', path: '/category/kpop-deepfake/' },
  twitch: { name: 'Twitch', path: '/category/twitch/' },
  premium: { name: 'Premium', path: '/category/premium/' },
  stripchat: { name: 'Stripchat', path: '/category/stripchat/' },
  fantrie: { name: 'Fantrie', path: '/category/fantrie/' },
  nude: { name: 'Nude', path: '/category/nude/' },
  pov: { name: 'POV', path: '/category/pov/' },
};

const appConfig = {
    ver: 1,
    title: '韩国BJ',
    site: HOST,
    tabs: Object.keys(CHANNELS).map((k) => ({ name: CHANNELS[k].name, ext: { tid: k } })),
};

function t(v) {
  return String(v == null ? '' : v).trim();
}

function headers(referer) {
  return {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Referer': referer || HOST + '/',
  };
}

function absUrl(u, base) {
  const raw = t(u).replace(/\\\//g, '/').replace(/&amp;/g, '&');
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('//')) return 'https:' + raw;
  try {
    return new URL(raw, base || HOST).toString();
  } catch (e) {
    return raw;
  }
}

async function getText(url, referer) {
  try {
    const { data } = await $fetch.get(url, { headers: headers(referer) });
    const s = typeof data === 'string' ? data : String(data || '');
    if (s) return s;
  } catch (e) { /* ignore */ }
  return '';
}

function parseList(html) {
  const videos = [];
  if (!html) return videos;
  const seen = new Set();
  const blocks = html.match(/(?:<article[^>]*)?class="[^"]*loop-video[^"]*"[\s\S]{0,1200}/gi) || [];
  for (const block of blocks) {
    const lm = block.match(/href="(https?:\/\/[^"]+\/video\/[^"]+|\/video\/[^"]+)"[^>]*(?:title="([^"]*)")?/i);
    if (!lm) continue;
    const vodId = absUrl(lm[1].split('?')[0]);
    if (!vodId || seen.has(vodId)) continue;
    seen.add(vodId);
    let name = t(lm[2]);
    if (!name) {
      const tm = block.match(/title="([^"]+)"/);
      name = tm ? t(tm[1]) : vodId.replace(/\/$/, '').split('/').pop();
    }
    name = name.replace(/\s*[–\-]\s*KoreanBJ.*$/i, '').replace(/&#8211;/g, '-').replace(/&amp;/g, '&').trim();
    let pic = '';
    const imgRe = /(?:data-src|src)="([^"]+)"/gi;
    let pm;
    while ((pm = imgRe.exec(block)) !== null) {
      const p = pm[1];
      if (/placeholder/i.test(p)) continue;
      if (/\.(jpg|jpeg|png|webp)/i.test(p) || /upload/i.test(p)) {
        pic = absUrl(p);
        break;
      }
    }
    videos.push({
      vod_id: vodId,
      vod_name: name.replace(/\s+/g, ' ').slice(0, 120),
      vod_pic: pic,
      vod_remarks: 'KoreanBJ',
      ext: { id: vodId },
    });
  }
  return videos;
}

// ---------- VOE 解包 (对齐猫版) ----------
function rot13(s) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function b64d(x) {
  try {
    let s = String(x).replace(/[^A-Za-z0-9+/=]/g, '');
    s += '='.repeat((-s.length % 4 + 4) % 4);
    return CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return '';
  }
}

function voeDecode(html) {
  try {
    const m = String(html || '').match(/<script[^>]*type=["']application\/json["'][^>]*>(.*?)<\/script>/s);
    if (!m) return {};
    const blk = t(m[1]);
    let raw = blk;
    try {
      const j = JSON.parse(blk);
      raw = Array.isArray(j) && j.length ? String(j[0]) : blk;
    } catch (e) {
      raw = blk;
    }
    let s = String(raw);
    for (const k of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) {
      s = s.split(k).join('_');
    }
    s = s.split('_').join('');
    let tt = b64d(rot13(s));
    tt = [...tt].map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).join('');
    tt = b64d([...tt].reverse().join(''));
    const cfg = JSON.parse(tt);
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch (e) {
    return {};
  }
}

function extractEmbedUrls(html, pageUrl) {
  const urls = [];
  const seen = new Set();
  const add = (u) => {
    u = absUrl(u, pageUrl);
    if (!u || seen.has(u) || !u.startsWith('http')) return;
    if (/koreanbj\.club/i.test(u) && /\/video\//i.test(u) && !/\/e\//i.test(u)) return;
    if (/googletag|\/ads\/|placeholder|\/trailers\/|test-videos/i.test(u)) return;
    if (/\.webm$/i.test(u)) return;
    seen.add(u);
    urls.push(u);
  };
  const h = String(html || '');
  let m;
  const re1 = /"contentURL"\s*:\s*"([^"]+)"/g;
  while ((m = re1.exec(h)) !== null) add(m[1].replace(/\\\//g, '/'));
  const re2 = /iframe\.setAttribute\(\s*['"]src['"]\s*,\s*['"]([^'"]+)['"]/g;
  while ((m = re2.exec(h)) !== null) add(m[1]);
  const re3 = /<iframe[^>]+(?:src|data-src)=["']([^"']+)/gi;
  while ((m = re3.exec(h)) !== null) add(m[1]);
  const re4 = /https?:\/\/(?:[a-z0-9\-]+\.)?(?:voe|io\d+storege|streamtape|filemoon)[^"'\s<>]+/gi;
  while ((m = re4.exec(h)) !== null) add(m[0]);
  return urls;
}

async function resolveVoe(embedUrl, referer) {
  const html = await getText(embedUrl, referer || HOST + '/');
  if (!html) return { m3u8: '', direct: '' };
  const hits = html.match(/https?:\/\/[^\s"'<>\\]+\.m3u8[^\s"'<>\\]*/g) || [];
  if (hits.length && !/test-videos/i.test(hits[0])) return { m3u8: hits[0], direct: '' };
  const jw = html.match(/jwplayer\([^)]*\)\.setup\(\{\s*file:\s*"([^"]+)"/i);
  if (jw) {
    const f = jw[1].replace(/\\\//g, '/');
    if (/^https?:\/\//i.test(f)) return { m3u8: f, direct: '' };
  }
  const cfg = voeDecode(html);
  const src = t(cfg.source);
  if (/\.m3u8/i.test(src)) return { m3u8: src, direct: '' };
  const dau = t(cfg.direct_access_url);
  if (/^https?:\/\//i.test(dau)) return { m3u8: '', direct: dau };
  if (/^https?:\/\//i.test(src)) return { m3u8: '', direct: src };
  return { m3u8: '', direct: '' };
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
  const tid = t(ext.tid) || 'home';
  const pg = Math.max(1, parseInt(ext.page, 10) || 1);
  const info = CHANNELS[tid] || CHANNELS.home;
  const path = info.path;
  let url;
  if (path === '/') {
    url = pg === 1 ? HOST + '/' : HOST + '/page/' + pg + '/';
  } else {
    url = HOST + path;
    if (pg > 1) url = url.replace(/\/$/, '') + '/page/' + pg + '/';
  }
  let html = await getText(url);
  if (!html) html = await getText(url);
  return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
  ext = argsify(ext);
  let url = t(ext.id);
  if (!url) return jsonify({ list: [] });
  if (!/^https?:\/\//i.test(url)) url = absUrl(url);
  const html = await getText(url);
  if (!html) {
    return jsonify({ list: [{ title: 'KoreanBJ', tracks: [{ name: '原页', pan: '', ext: { id: url, flag: 'KoreanBJ' } }] }] });
  }
  const embeds = extractEmbedUrls(html, url);
  const plays = [];
  for (const emb of embeds) {
    const r = await resolveVoe(emb, url);
    if (r.m3u8) plays.push(['HLS', r.m3u8]);
    if (r.direct) plays.push(['MP4', r.direct]);
    if (!r.m3u8 && !r.direct) plays.push(['Embed', emb]);
  }
  if (!plays.length) plays.push(['原页', url]);
  const seen = new Set();
  const uniq = [];
  for (const pr of plays) {
    if (seen.has(pr[1])) continue;
    seen.add(pr[1]);
    uniq.push(pr[0] + '$' + pr[1]);
  }
  return jsonify({ list: buildGroups('KoreanBJ', uniq.join('#')) });
}

async function getPlayinfo(ext) {
  ext = argsify(ext);
  let id = t(ext.id);
  const flag = t(ext.flag);
  if (!id) return jsonify({ urls: [], headers: [] });
  if (/\$/.test(id)) id = id.split('$').pop().trim();
  const header = { 'User-Agent': UA, Referer: HOST + '/' };
  if (/^\/\//.test(id)) id = 'https:' + id;

  if (/\.(m3u8|mp4)(\?|$)/i.test(id) || /master\.txt/i.test(id) || /^hls$/i.test(flag)) {
    if (/cloudwindow-route|ugc-cdn/i.test(id)) {
      header.Referer = 'https://jeremyparticipantanything.com/';
    }
    return jsonify({ urls: [id], headers: [header] });
  }

  if (/^https?:\/\//i.test(id) && (/\/e\//i.test(id) || /embed/i.test(id))) {
    const r = await resolveVoe(id, HOST + '/');
    if (r.m3u8) {
      header.Referer = id;
      return jsonify({ urls: [r.m3u8], headers: [header] });
    }
    if (r.direct) {
      header.Referer = id;
      return jsonify({ urls: [r.direct], headers: [header] });
    }
    // 嗅探降级：回 embed URL（同猫版 parse:1）
    return jsonify({ urls: [id], headers: [header] });
  }

  // 嗅探降级：回源 URL（同猫版 parse:1）
  return jsonify({ urls: [id], headers: [header] });
}

async function search(ext) {
  ext = argsify(ext);
  const wd = t(ext.text);
  const pg = Math.max(1, parseInt(ext.page, 10) || 1);
  if (!wd) return jsonify({ list: [] });
  const kw = encodeURIComponent(wd);
  const url = pg === 1 ? HOST + '/?s=' + kw : HOST + '/page/' + pg + '/?s=' + kw;
  const html = await getText(url);
  return jsonify({ list: parseList(html) });
}
