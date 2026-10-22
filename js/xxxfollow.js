// XXXFollow - XPTV csp 格式 (csp_xxxfollow)
// 转换自 mira-cat nodejs/src/spider/video/xxxfollow.js（py_xxxfollow，压缩版 py 转写），本模块为其去压缩等价版。
// 站点 https://www.xxxfollow.com，无站外依赖。注意：猫源 search 实为 /tag/<关键词> 检索，本模块照原逻辑保留。
// 播放：详情页 window.__PRELOAD_STATE__ 中 post.media 的多清晰度直链（Original/SD/FHD/UHD）。
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const HOST = 'https://www.xxxfollow.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'XXXFollow',
    site: HOST,
    tabs: [
        { name: '最新视频', ext: { tid: '/videos' } },
        { name: '热门视频', ext: { tid: '/most-popular' } },
        { name: 'Teen 18+', ext: { tid: '/tag/teen-18' } },
        { name: 'FastFap', ext: { tid: '/tag/fastfap' } },
        { name: '自慰', ext: { tid: '/tag/masturbation' } },
        { name: '亚洲', ext: { tid: '/tag/asian' } },
        { name: '日本', ext: { tid: '/tag/japanese' } },
        { name: '中国', ext: { tid: '/tag/chinese' } },
    ],
};

async function getText(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA, Referer: HOST } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseCards(html) {
    const list = [];
    if (!html) return list;
    const seen = {};
    const $ = cheerio.load(html);
    $('a[href*="/"]').each((_, el) => {
        const u = $(el).attr('href');
        if (!u || !/\/\d+/.test(u) || u.startsWith('/tag/') || u.startsWith('/search/') || u.startsWith('/support/')) return;
        if (seen[u]) return;
        const d = $(el).find('img').first();
        const f = d.attr('src') || d.attr('data-src');
        if (!f) return;
        seen[u] = 1;
        let m = $(el).text().trim();
        if (!m) m = d.attr('alt') || '';
        m = m ? m.replace(/[\n\t]/g, '').trim() : 'Unknown';
        list.push({ vod_id: u, vod_name: m, vod_pic: f, vod_remarks: '', ext: { id: u } });
    });
    return list;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!tid) return jsonify({ list: [] });
    let url = HOST + tid;
    if (page > 1) url += `?page=${page}`;
    const html = await getText(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    const tracks = [];
    if (id) {
        const url = id.startsWith('http') ? id : HOST + id;
        const html = await getText(url);
        let m = html.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*?\})\s*;/s)
            || html.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*?\})\s*</s)
            || html.match(/window\.__PRELOAD_STATE__\s*=\s*(\{.*\})/s);
        if (m) {
            try {
                const state = JSON.parse(m[1]);
                const key = Object.keys(state).find((k) => k.startsWith('post-'));
                const post = key ? state[key].post : null;
                const media = (post && post.media) || [];
                if (media.length > 0) {
                    const b = media[0];
                    if (b.url) tracks.push({ name: 'Original', pan: '', ext: { id: b.url, flag: 'XXXFollow' } });
                    if (b.sd_url) tracks.push({ name: 'SD', pan: '', ext: { id: b.sd_url, flag: 'XXXFollow' } });
                    if (b.fhd_url) tracks.push({ name: 'FHD', pan: '', ext: { id: b.fhd_url, flag: 'XXXFollow' } });
                    if (b.uhd_url) tracks.push({ name: 'UHD', pan: '', ext: { id: b.uhd_url, flag: 'XXXFollow' } });
                }
            } catch (e) {}
        }
    }
    return jsonify({ list: [{ title: 'XXXFollow', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.id || ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: HOST }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = `${HOST}/tag/${encodeURIComponent(wd)}`;
    if (page > 1) url += `?page=${page}`;
    const html = await getText(url);
    return jsonify({ list: parseCards(html) });
}
