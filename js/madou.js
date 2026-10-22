// 麻豆社 - XPTV csp 格式 (csp_madou)
// 转换自 mira-cat nodejs/src/spider/video/madou.js（py_madou，压缩版 py 转写），本模块为其去压缩等价版。
// 站点 https://madou.club，无站外依赖；分类由首页 .sitenav 现拉（getConfig 动态生成，失败回退静态兜底）。
// 播放：详情页 iframe 页内 var token / var m3u8 拼直链（猫源取 body script 第 6 个脚本再正则，本模块对整页正则等价提取）。
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const HOST = 'https://madou.club';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const SKIP_NAV = ['首页', '其他', '热门标签', '筛选'];

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

async function getText(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseCards(html) {
    const list = [];
    if (!html) return list;
    const $ = cheerio.load(html);
    $('.excerpts-wrapper article').each((_, el) => {
        const d = $(el).find('a').attr('href');
        const f = $(el).find('h2').text();
        const m = $(el).find('img').attr('data-src');
        const p = $(el).find('.post-view').text().trim();
        if (!d || !f) return;
        list.push({ vod_id: d, vod_name: f, vod_pic: m || '', vod_remarks: p, ext: { id: d } });
    });
    return list;
}

async function getConfig() {
    let tabs = [];
    const html = await getText(HOST);
    if (html) {
        const $ = cheerio.load(html);
        $('.sitenav a').each((_, el) => {
            const name = $(el).text().trim();
            const href = $(el).attr('href');
            if (!name || !href || SKIP_NAV.includes(name)) return;
            tabs.push({ name, ext: { tid: absUrl(href) } });
        });
    }
    if (!tabs.length) tabs = [{ name: '首页', ext: { tid: HOST } }];
    return jsonify({ ver: 1, title: '麻豆社', site: HOST, tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || HOST);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url = absUrl(tid);
    if (page > 1) url = url.replace(/\/$/, '') + '/page/' + page;
    const html = await getText(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    const tracks = [];
    if (id) {
        const html = await getText(absUrl(id));
        if (html) {
            const $ = cheerio.load(html);
            const iframe = $('.article-content iframe').attr('src') || '';
            if (iframe) {
                const iframeUrl = absUrl(iframe);
                const om = iframeUrl.match(/^(https?:\/\/[^\/]+)/);
                const origin = om ? om[1] : HOST;
                const inner = await getText(iframeUrl);
                const tm = inner.match(/var token = "(.+?)";/);
                const mm = inner.match(/var m3u8 = '(.+?)';/);
                if (tm && mm) {
                    const playUrl = origin + mm[1] + '?token=' + tm[1];
                    tracks.push({ name: '播放', pan: '', ext: { url: playUrl } });
                }
            }
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || ext.id || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${HOST}/page/${page}?s=${encodeURIComponent(wd)}`;
    const html = await getText(url);
    return jsonify({ list: parseCards(html) });
}
