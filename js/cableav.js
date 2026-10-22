// CableAV - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/cableav.js（py_cableav）
// 站点 https://cableav.video（GET×1），无站外依赖；
// 播放：详情页 dplayer iframe 的 video 参数即 m3u8 直链，getPlayinfo 实时解析直出。
const SITE = 'https://cableav.video';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const appConfig = {
    ver: 1,
    title: 'CableAV',
    site: SITE,
    tabs: [
        { name: '最新发布', ext: { tid: 'latest' } },
        { name: '国产新片', ext: { tid: 'guochanxinpian' } },
        { name: '国产AV', ext: { tid: 'guochanav' } },
        { name: '探花大神', ext: { tid: 'tanhadashen' } },
        { name: '玩偶姐姐', ext: { tid: 'wanoujiejie' } },
        { name: '日韩无码', ext: { tid: 'rihanwuma' } },
        { name: '日韩有码', ext: { tid: 'rihanyouma' } },
        { name: '日本无码', ext: { tid: 'ribenwuma' } },
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

function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    if (/^https?:\/\//.test(u)) return u;
    return SITE + '/' + u;
}

async function getHtml(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
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

// 卡片：封面必须取 data-src（src 是 placeholder），同猫版
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\s[^>]*href="(\/info-\d+\.html)"[^>]*title="([^"]*)"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const durl = fixUrl(m[1]);
        if (seen.has(durl)) continue;
        seen.add(durl);
        const win = html.slice(m.index, m.index + 2000);
        let pic = '';
        const dsrcM = win.match(/<img[^>]+data-src="([^"]+)"/);
        if (dsrcM) pic = dsrcM[1];
        else {
            const srcM = win.match(/<img[^>]+src="([^"]+)"/);
            if (srcM && !srcM[1].includes('placeholder')) pic = srcM[1];
        }
        out.push({
            vod_id: durl,
            vod_name: clean(m[2]) || durl,
            vod_pic: fixUrl(pic),
            vod_remarks: '',
            ext: { id: durl },
        });
    }
    return out;
}

function catUrl(tid, page) {
    const valid = appConfig.tabs.some((x) => x.ext.tid === tid);
    const slug = valid ? tid : 'latest';
    if (page > 1) return `${SITE}/${slug}-${page}.html`;
    return `${SITE}/${slug}.html`;
}

// 从详情页提取 dplayer iframe 的 video 参数（m3u8 直链）
function extractM3u8(html) {
    const m = html.match(/<iframe[^>]+src="\/index\/data\/dplayer\.html\?video=([^"]+)"/);
    if (!m) return '';
    try {
        const url = decodeURIComponent(m[1]);
        if (/^https?:\/\/[^/]+\/.*\.m3u8/.test(url)) return url;
    } catch (e) { /* ignore */ }
    const m2 = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    return m2 ? m2[1] : '';
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
    const durl = /^https?:\/\//.test(id) ? id : fixUrl('/info-' + id.replace(/\D/g, '') + '.html');
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    return jsonify({ list: buildGroups('CableAV', `正片$${durl}`) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': REFERER };
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [header] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(id)) {
        return jsonify({ urls: [id], headers: [header] });
    }
    const durl = /^https?:\/\//.test(id) ? id : fixUrl('/info-' + id.replace(/\D/g, '') + '.html');
    const html = await getHtml(durl);
    if (!html) return jsonify({ urls: [], headers: [header] });
    const m3u8 = extractM3u8(html);
    if (!m3u8) return jsonify({ urls: [], headers: [header] });
    return jsonify({ urls: [m3u8], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search.html?k=' + encodeURIComponent(wd);
    if (page > 1) url = SITE + '/search-' + wd + '-' + page + '.html';
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
