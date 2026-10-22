// XVideos - XPTV csp 格式 (csp_xvideos)
// 转换自 mira-cat nodejs/src/spider/video/xvideos.js（py_xvideos，压缩版 py 转写），本模块为其去压缩等价版。
// 站点 https://www.xvideos.com，无站外依赖。频道/明星分类的详情按猫源逻辑展开为该频道视频页列表，
// 播放时再回视频页提取 setVideoHLS/setVideoUrlHigh/setVideoUrlLow（同猫源 play 逻辑）。
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const HOST = 'https://www.xvideos.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';

const appConfig = {
    ver: 1,
    title: 'XVideos',
    site: HOST,
    tabs: [
        { name: '最新', ext: { tid: '/new' } },
        { name: 'AI', ext: { tid: '/tags/ai' } },
        { name: 'ASMR', ext: { tid: '/tags/asmr' } },
        { name: '频道', ext: { tid: '/channels' } },
        { name: '色情明星', ext: { tid: '/pornstars' } },
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

function parseVideoCards($) {
    const list = [];
    $('.thumb-block').each((_, el) => {
        if ($(el).hasClass('thumb-block-profile')) return;
        const u = $(el).find('.thumb a');
        const d = $(el).find('p.title a');
        const f = u.find('img');
        const m = d.attr('href');
        const p = d.attr('title') || d.text().trim();
        const b = f.attr('data-src') || f.attr('src') || '';
        const v = $(el).find('.duration').text().trim();
        if (m && p) list.push({ vod_id: m, vod_name: p, vod_pic: b, vod_remarks: v, ext: { id: m } });
    });
    return list;
}

function parseProfileCards($) {
    const list = [];
    $('div[id*="profile_"], .thumb-block-profile').each((_, el) => {
        const u = $(el).find('a').first();
        let f = $(el).find('.profile-name, .name, .title').first().text().replace(/[\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!f) f = $(el).find('.name, .title').text().trim();
        const m = u.attr('href');
        let p = '';
        const scriptHtml = $(el).find('script').html() || '';
        if (scriptHtml) {
            const v = scriptHtml.match(/src=["'](.*?)["']/);
            if (v) p = v[1];
        }
        if (!p) {
            const img = $(el).find('img').first();
            p = img.attr('src') || img.attr('data-src') || '';
        }
        if (m && f) list.push({ vod_id: m, vod_name: f, vod_pic: p, vod_remarks: '频道/明星', ext: { id: m } });
    });
    return list;
}

function isProfileId(id) {
    return /^\/channels\//.test(id) || /^\/pornstars\//.test(id) || /^\/models\//.test(id) || /^\/profiles\//.test(id)
        || (/^\/[^/]+$/.test(id) && !/\/video\d+/.test(id));
}

function extractMedia(html) {
    const pick = (re) => { const m = html.match(re); return m ? m[1] : ''; };
    return {
        hls: pick(/setVideoHLS\(['"](.*?)['"]\)/),
        high: pick(/setVideoUrlHigh\(['"](.*?)['"]\)/),
        low: pick(/setVideoUrlLow\(['"](.*?)['"]\)/),
    };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!tid) return jsonify({ list: [] });
    let url;
    if (tid === '/new') url = `${HOST}${tid}/${page}`;
    else if (tid === '/channels' || tid === '/pornstars') url = `${HOST}${tid}?p=${page - 1}`;
    else { url = `${HOST}${tid}`; if (page > 1) url += `/${page - 1}`; }
    const html = await getText(url);
    const $ = cheerio.load(html || '');
    const list = (tid === '/channels' || tid === '/pornstars') ? parseProfileCards($) : parseVideoCards($);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    const tracks = [];
    if (id) {
        const url = id.startsWith('http') ? id : HOST + id;
        const html = await getText(url);
        if (html) {
            if (isProfileId(id)) {
                const $ = cheerio.load(html);
                $('.thumb-block').each((_, el) => {
                    const g = $(el).find('p.title a');
                    const href = g.attr('href');
                    const title = g.attr('title') || g.text().trim();
                    if (href && title) tracks.push({ name: title, pan: '', ext: { id: href, flag: 'XVideos' } });
                });
            } else {
                // JSON-LD contentUrl 优先（同猫源 detail）
                try {
                    const $ = cheerio.load(html);
                    const ld = $('script[type="application/ld+json"]').html();
                    if (ld) {
                        const obj = JSON.parse(ld);
                        if (obj && obj.contentUrl) tracks.push({ name: 'MP4', pan: '', ext: { id: obj.contentUrl, flag: 'XVideos' } });
                    }
                } catch (e) {}
                if (!tracks.length) {
                    const media = extractMedia(html);
                    if (media.hls) tracks.push({ name: 'HLS', pan: '', ext: { id: media.hls, flag: 'XVideos' } });
                    if (media.high) tracks.push({ name: 'MP4_High', pan: '', ext: { id: media.high, flag: 'XVideos' } });
                    if (media.low) tracks.push({ name: 'MP4_Low', pan: '', ext: { id: media.low, flag: 'XVideos' } });
                }
            }
        }
    }
    return jsonify({ list: [{ title: 'XVideos', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || ext.url || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    let url = '';
    if (/^https?:\/\//i.test(id) && /\.(m3u8|mp4)(\?|$)/i.test(id)) {
        url = id;
    } else {
        const pageUrl = id.startsWith('http') ? id : HOST + id;
        const html = await getText(pageUrl);
        const media = extractMedia(html || '');
        url = media.hls || media.high || media.low || id;
    }
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
    const url = `${HOST}/?k=${encodeURIComponent(wd)}&p=${page - 1}`;
    const html = await getText(url);
    const $ = cheerio.load(html || '');
    const list = [];
    $('.mozaique .thumb-block').each((_, el) => {
        const u = $(el).find('.thumb a');
        const d = $(el).find('p.title a');
        const f = u.find('img');
        const m = d.attr('href');
        const p = d.attr('title') || d.text().trim();
        const b = f.attr('data-src') || f.attr('src') || '';
        const v = $(el).find('.duration').text().trim();
        if (m && p) list.push({ vod_id: m, vod_name: p, vod_pic: b, vod_remarks: v, ext: { id: m } });
    });
    return jsonify({ list });
}
