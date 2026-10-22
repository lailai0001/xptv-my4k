// KanAV - XPTV csp 格式 (csp_kanav)
// 转换自 mira-cat nodejs/src/spider/video/kanav.js（py_kanav，源自 XPTV kanav.js），站点 https://kanav.ad（文件头注 kanav.info，实际 HOST 为 kanav.ad）。
// cheerio 经 createCheerio() 取得；播放地址解密 player_aaaa（Base64+decodeURIComponent）经 createCryptoJS() 的 enc.Base64 完成，与猫源 CryptoJS 用法一致。
const cheerio = createCheerio();
const CryptoJS = createCryptoJS();

const HOST = 'https://kanav.ad';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2_1 like Mac OS X)AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';

const appConfig = {
    ver: 1,
    title: 'KanAV',
    site: HOST,
    tabs: [
        { name: '中文字幕', ext: { tid: '1' } },
        { name: '日韩有码', ext: { tid: '2' } },
        { name: '日韩无码', ext: { tid: '3' } },
        { name: '国产AV', ext: { tid: '4' } },
        { name: '自拍泄密', ext: { tid: '30' } },
        { name: '探花约炮', ext: { tid: '31' } },
        { name: '主播录制', ext: { tid: '32' } },
        { name: '动漫番剧', ext: { tid: '20' } },
    ],
};

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

async function getHtml(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseCards(html) {
    const cards = [];
    if (!html) return cards;
    const $ = cheerio.load(html);
    $('.post-list .col-md-3').each((_, element) => {
        const videoItem = $(element).find('.video-item');
        const entryTitle = $(element).find('.entry-title');
        const vodUrl = entryTitle.find('a').attr('href') || '';
        const vodName = entryTitle.find('a').text().trim();
        if (!vodUrl || !vodName) return;
        const vodPic = absUrl(videoItem.find('.featured-content-image a img').attr('data-original') || '');
        const remark = videoItem.find('span.model-view-left').text().trim();
        const duration = videoItem.find('span.model-view').text().trim();
        cards.push({
            vod_id: vodUrl,
            vod_name: vodName,
            vod_pic: vodPic,
            vod_remarks: remark || duration,
            ext: { id: vodUrl },
        });
    });
    return cards;
}

function decryptPlayUrl(html) {
    let raw = '';
    try {
        const $ = cheerio.load(html);
        raw = $('script:contains(player_aaaa)').text().replace('var player_aaaa=', '').trim().replace(/;\s*$/, '');
    } catch (e) {}
    if (!raw || raw.indexOf('{') !== 0) {
        const m = String(html || '').match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
        if (m) raw = m[1];
    }
    const obj = JSON.parse(raw);
    const encodedUrl = obj.url || '';
    return decodeURIComponent(CryptoJS.enc.Base64.parse(encodedUrl).toString(CryptoJS.enc.Utf8));
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '1');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = `${HOST}/index.php/vod/type/id/${tid}/page/${page}.html`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vid = String(ext.id || '');
    const tracks = [];
    if (vid) {
        const html = await getHtml(absUrl(vid));
        if (html) {
            try {
                const playUrl = decryptPlayUrl(html);
                if (playUrl) tracks.push({ name: '播放', pan: '', ext: { url: playUrl } });
            } catch (e) {}
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.url || ext.id || '').trim();
    let url = id;
    try {
        const o = JSON.parse(id);
        if (o && o.url) url = String(o.url);
    } catch (e) {
        if (id.includes('$')) url = id.split('$').pop().trim();
    }
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, referer: 'https://kanav.ad/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${HOST}/index.php/vod/search/by/time_add/page/${page}/wd/${encodeURIComponent(wd)}.html`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}
