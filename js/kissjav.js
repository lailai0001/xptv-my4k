// KissJAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/kissjav.js（py_kissjav）
// 站点 https://kissjav.li（GET×1），无站外依赖；
// 详情页 video_url 为 Base64 编码的 mp4 直链：猫版用 Node Buffer 解码，
// XPTV 版改用 CryptoJS.enc.Base64.parse + enc.Utf8 对应件解码（本地 harness 已验）。
const CryptoJS = createCryptoJS();

const SITE = 'https://kissjav.li';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const appConfig = {
    ver: 1,
    title: 'KissJAV',
    site: SITE,
    tabs: [
        { name: '最新', ext: { tid: 'latest' } },
        { name: '热门', ext: { tid: 'popular' } },
        { name: 'KVIP', ext: { tid: 'vip' } },
        { name: 'JVIP', ext: { tid: 'jvip' } },
        { name: 'Korean Porn', ext: { tid: 'korean-porn' } },
        { name: 'Korean BJ', ext: { tid: 'korean-bj' } },
        { name: 'FC2PPV', ext: { tid: 'fc2ppv' } },
        { name: 'Uncensored', ext: { tid: 'jav' } },
        { name: 'MyFans', ext: { tid: 'myfans' } },
        { name: 'IPCAM', ext: { tid: 'ipcam' } },
        { name: 'Toilet', ext: { tid: 'toilet' } },
        { name: 'VoyeurJP', ext: { tid: 'voyeur-jp' } },
    ],
};

function t(v) { return String(v == null ? '' : v).trim(); }

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

function fixPic(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

async function getHtml(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
        'Referer': REFERER,
    };
    try {
        const { data } = await $fetch.get(url, { headers });
        const s = typeof data === 'string' ? data : '';
        if (s.length > 1000) return s;
        if (data) return typeof data === 'string' ? data : '';
    } catch (e) { /* ignore */ }
    return '';
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

// 详情页 URL 必须带 slug（无 slug 返回 404），故 vod_id 存完整详情 URL
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\s[^>]*href="(https?:\/\/kissjav\.li\/video\/\d+\/[^"]*\/)"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const durl = m[1];
        const idm = durl.match(/\/video\/(\d+)\//);
        const vid = idm ? idm[1] : durl;
        if (seen.has(vid)) continue;
        seen.add(vid);
        const win = html.slice(m.index, m.index + 1500);
        let titleM = m[0].match(/title="([^"]*)"/);
        if (!titleM) titleM = win.match(/title="([^"]*)"/);
        const imgM = win.match(/data-original="([^"]+)"/) || win.match(/<img[^>]+src="([^"]+)"/);
        out.push({
            vod_id: durl,
            vod_name: titleM ? clean(titleM[1]) : 'KissJAV ' + vid,
            vod_pic: imgM ? fixPic(imgM[1]) : '',
            vod_remarks: '',
            ext: { id: durl },
        });
    }
    return out;
}

function catUrl(tid, page) {
    let base;
    if (tid === 'latest') base = SITE + '/latest-updates/';
    else if (tid === 'popular') base = SITE + '/most-popular/?sort_by=video_viewed';
    else base = SITE + '/categories/' + encodeURIComponent(tid) + '/';
    if (page > 1) {
        if (tid === 'popular') return base + '&page=' + page;
        return base + page + '/';
    }
    return base;
}

// 从详情页提取 video_url Base64 并解码（CryptoJS 对应件，代 Node Buffer）
function extractMp4(html) {
    const m = html.match(/video_url:\s*'([A-Za-z0-9+/=]+)'/);
    if (!m) return '';
    try {
        const dec = CryptoJS.enc.Base64.parse(m[1]).toString(CryptoJS.enc.Utf8);
        if (/^https?:\/\//.test(dec)) return dec;
    } catch (e) { /* ignore */ }
    return '';
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
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/video/' + id.replace(/\D/g, '') + '/');
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });

    let remarks = '';
    const durM = html.match(/itemprop="duration"[^>]*content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/);
    if (durM) {
        const h = durM[1] ? parseInt(durM[1], 10) : 0;
        const mi = durM[2] ? parseInt(durM[2], 10) : 0;
        const se = durM[3] ? parseInt(durM[3], 10) : 0;
        remarks = h ? `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${mi}:${String(se).padStart(2, '0')}`;
    }

    const mp4 = extractMp4(html);
    const flags = mp4 ? ['MP4'] : ['KissJAV'];
    const urls = [`${remarks || '正片'}$${durl}`];
    return jsonify({ list: buildGroups(flags.join('$$$'), urls.join('$$$')) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': REFERER };
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [header] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/video/' + id.replace(/\D/g, '') + '/');
    // 实时请求详情页解析 Base64（token 可能变化，同猫版）
    const html = await getHtml(durl);
    if (!html) return jsonify({ urls: [], headers: [header] });
    const mp4 = extractMp4(html);
    if (!mp4) return jsonify({ urls: [], headers: [header] });
    return jsonify({ urls: [mp4], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search/' + encodeURIComponent(wd) + '/';
    if (page > 1) url += page + '/';
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
