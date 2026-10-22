// PPPHub - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/ppp.js（py_ppp，该猫源本身即由 XPTV 版转入）
// 站点 https://ppp.porn/pp1，分类在 getConfig 内运行时抓 /categories/（失败回退空表，同猫版）；
// 播放为详情页 <script> 内 m3u8 直链直出。
// 已知缺陷（猫源现行行为，原样保留不修）：search 的 URL 拼在 HOST（含 /pp1 前缀）之下，
// 站方搜索实际不在 /pp1 前缀下，会 404/无结果；分类与详情不受影响。
const cheerio = createCheerio();

const HOST = 'https://ppp.porn/pp1';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';

const appConfig = {
    ver: 1,
    title: 'PPPHub',
    site: HOST,
    tabs: [],
};

function headers(referer) {
    return {
        'User-Agent': UA,
        'Referer': referer || HOST + '/',
    };
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

async function fetchHtml(url, referer) {
    try {
        const { data } = await $fetch.get(url, { headers: headers(referer) });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

// 从 /categories/ 解析分类卡片（同猫版 fetchTabs）
async function fetchTabs() {
    const html = await fetchHtml(`${HOST}/categories/`, 'https://ppp.porn/pp1/');
    if (!html) return [];
    const $ = cheerio.load(html);
    const list = [];
    $('section.padding-bottom-xl .card-cat-v2').each((_, e) => {
        const title = $(e).find('.card-cat-v2__title').text().trim();
        const count = $(e).find('.card-cat-v2__count').text().trim();
        const name = count ? `${title}(${count})` : title;
        const href = $(e).find('a').attr('href') || '';
        if (!href || !name) return;
        list.push({ name, ext: { href } });
    });
    return list;
}

// 分类列表与搜索结果共用条目解析（同猫版 parseItems）
function parseItems($, selector) {
    const cards = [];
    $(`${selector} .item`).each((_, element) => {
        const title = $(element).find('h4 a').text().trim();
        const cover = $(element).find('img').attr('data-src') || '';
        const href = $(element).find('h4 a').attr('href') || '';
        const duration = $(element).find('.card-video__duration').text().trim();
        if (!title || !href) return;
        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: duration,
            ext: { id: href },
        });
    });
    return cards;
}

// 从详情页 <script> 中提取 m3u8 地址（宽松模式保留完整查询串，同猫版）
function extractM3u8($) {
    let m3u8Url = null;
    $('script').each((_, script) => {
        if (m3u8Url) return;
        const content = $(script).html() || '';
        if (!content.includes('.m3u8')) return;
        let m = content.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
        if (!m) m = content.match(/https?:\/\/[\w./-]+\.m3u8/);
        if (m && m[0]) m3u8Url = m[0];
    });
    return m3u8Url;
}

async function getConfig() {
    let tabs = [];
    try {
        tabs = await fetchTabs();
    } catch (e) { /* 回退空表，同猫版 CLASSES=[] */ }
    const cfg = { ver: appConfig.ver, title: appConfig.title, site: appConfig.site, tabs };
    return jsonify(cfg);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const href = String(ext.href || '');
    const url = `${absUrl(href)}?mode=async&function=get_block&block_id=list_videos_common_videos_list&sort_by=post_date&from=${page}`;
    const html = await fetchHtml(url);
    let list = [];
    if (html) {
        const $ = cheerio.load(html);
        list = parseItems($, '#list_videos_common_videos_list_items');
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vid = String(ext.id || '');
    const url = absUrl(vid);
    if (!url) return jsonify({ list: [] });
    const html = await fetchHtml(url);
    if (!html) return jsonify({ list: [] });
    const $ = cheerio.load(html);
    const m3u8Url = extractM3u8($);
    const tracks = [];
    if (m3u8Url) {
        tracks.push({ name: '播放', pan: '', ext: { id: m3u8Url, flag: 'PPPHub' } });
    }
    return jsonify({ list: [{ title: 'PPPHub', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    // track.ext.id 即 m3u8 直链（猫版 play 兼容 JSON 串形态，此处一并保留）
    const raw = String(ext.id || ext.url || '');
    let url = raw;
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
        try {
            const obj = JSON.parse(trimmed);
            url = obj.url || (obj.ext && obj.ext.url) || raw;
        } catch (e) { /* ignore */ }
    }
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const wd = String(ext.text || '').trim();
    if (!wd) return jsonify({ list: [] });
    // 已知缺陷：该 URL 位于 /pp1 前缀下，站方搜索会 404（猫源现行行为，原样保留，见文件头）
    const text = encodeURIComponent(wd);
    const url = `${HOST}/search/${text}/?mode=async&function=get_block&block_id=list_videos_videos_list_search_result&q=${text}&category_ids=&sort_by=&from_videos=${page}&from_albums=${page}`;
    const html = await fetchHtml(url);
    let list = [];
    if (html) {
        const $ = cheerio.load(html);
        list = parseItems($, '#list_videos_videos_list_search_result_items');
    }
    return jsonify({ list });
}
