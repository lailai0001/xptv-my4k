// 每日大赛 - XPTV csp 格式（csp_mrds）
// 转换自 mira-cat nodejs/src/spider/video/mrds.js（py_mrds）。站点 https://www.mrds66.com (WordPress)
// 封面走 bagua-img-proxy 代理前缀拼接（原样保留）；播放为详情页 data-config 中的直链（原画/H265）。
const BASE = 'https://www.mrds66.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';

const CATS = [
    ['latest', '最新更新'], ['mrds', '每日大赛'], ['ztds', '主题大赛'], ['rstt', '热搜吃瓜'],
    ['xazd', '校园学生'], ['blyp', '必撸大赛'], ['fctg', '反差泄密'], ['mhds', '网红黑料'],
    ['lqdp', '猎奇重口'], ['jdsj', 'AV看片'], ['mxwh', '明星大赛'], ['smdh', '动漫之家'],
    ['dypd', '影视国漫'], ['mtds', 'cos写真'], ['ysds', '声控ASMR'], ['czds', '寸止挑战'],
    ['hjds', '混剪PMV'], ['tgds', '原创投稿'], ['omjp', '欧美精品'], ['qwcs', '全网参赛'],
    ['aijc', 'AI剧场'],
];

const appConfig = {
    ver: 1,
    title: '每日大赛',
    site: BASE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
}

async function fetchHtml(url) {
    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': BASE + '/' },
        });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseArticles(html) {
    const items = [];
    if (!html) return items;
    const seen = {};
    const re = /<article\b[^>]*>([\s\S]*?)<\/article>/gi;
    let m;
    while ((m = re.exec(html))) {
        const block = m[1];
        const lm = /<a[^>]*href="(\/archives\/\d+\/?)"[^>]*>/.exec(block);
        if (!lm) continue;
        const link = BASE + lm[1];
        if (seen[link]) continue;
        seen[link] = 1;
        let title = '';
        const hm = /<h2 class="post-card-title"[^>]*>([\s\S]*?)<\/h2>/i.exec(block);
        if (hm) {
            const raw = hm[1];
            const cut = raw.search(/<div/i);
            title = t((cut >= 0 ? raw.slice(0, cut) : raw).replace(/<[^>]*>/g, ' '));
        }
        if (!title) continue;
        let cover = '';
        const cm = /loadBannerDirect\('([^']+)'/.exec(block);
        if (cm) cover = IMG_PROXY + encodeURIComponent(cm[1].replace(/([^:])\/{2,}/g, '$1/'));
        items.push({
            vod_id: link,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: '',
            ext: { id: link },
        });
    }
    return items;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'latest');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = id === 'latest'
        ? (page <= 1 ? BASE + '/' : BASE + '/page/' + page + '/')
        : (page <= 1 ? BASE + '/category/' + id + '/' : BASE + '/category/' + id + '/' + page + '/');
    const html = await fetchHtml(url);
    return jsonify({ list: parseArticles(html) });
}

function extractVideo(html) {
    const m = /data-config=(["'])([\s\S]*?)\1/.exec(html);
    if (!m) return null;
    try {
        const cfg = JSON.parse(m[2]);
        const out = {};
        if (cfg.video && cfg.video.url) out.url = cfg.video.url;
        if (cfg.video_h265 && cfg.video_h265.url) out.h265 = cfg.video_h265.url;
        return out.url ? out : null;
    } catch (e) { return null; }
}

async function getTracks(ext) {
    ext = argsify(ext);
    const url = String(ext.id || '');
    if (!/^https?:\/\//i.test(url)) return jsonify({ list: [] });
    const html = await fetchHtml(url);
    const video = extractVideo(html);
    const tracks = [];
    if (video && video.url) {
        tracks.push({ name: '原画', pan: '', ext: { id: video.url, flag: '每日大赛' } });
        if (video.h265) tracks.push({ name: 'H265', pan: '', ext: { id: video.h265, flag: '每日大赛' } });
    }
    return jsonify({ list: tracks.length ? [{ title: '每日大赛', tracks }] : [] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '');
    const m = id.match(/\$?(https?:\/\/[^\s$#]+)/);
    const url = m ? m[1] : (/^https?:\/\//i.test(id) ? id : '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': BASE + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!kw) return jsonify({ list: [] });
    const url = page <= 1
        ? BASE + '/search/' + encodeURIComponent(kw) + '/'
        : BASE + '/search/' + encodeURIComponent(kw) + '/' + page + '/';
    const html = await fetchHtml(url);
    return jsonify({ list: parseArticles(html) });
}
