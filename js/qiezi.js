// 茄子精品 - XPTV csp 格式（csp_qiezi）
// 转换自 mira-cat nodejs/src/spider/video/qiezi.js（py_qiezi）。站点 https://oxh.qzjp4.beer（苹果CMS）
// 根路径 / 被劫持为导航页，必须走 /cn/home/web/index.php 子路径；播放为详情页 player_data 中的 m3u8 直链。
// 注意：猫版 search 本就是空桩（未实现、恒返回空），XPTV 版如实保留，待站点搜索路由证实后再补。
const HOST = 'https://oxh.qzjp4.beer';
const BASE = '/cn/home/web/index.php';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CATEGORIES = [
    ['20', '美女写真'], ['21', '国产精品'], ['22', '无码专区'], ['23', '中文字幕'], ['24', '强奸乱伦'],
    ['25', '人妻熟女'], ['26', '亚洲情色'], ['27', '制服丝袜'], ['28', 'SM捆绑'], ['29', '自淫系列'],
    ['30', '三级伦理'], ['31', '网红主播'], ['32', '探花约炮'], ['33', '传媒大片'], ['34', '动漫卡通'],
];

const appConfig = {
    ver: 1,
    title: '茄子精品',
    site: HOST,
    tabs: CATEGORIES.map(([tid, name]) => ({ name, ext: { tid } })),
};

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

// 猫版双通道（框架 req + 原生 fetch）在此收敛为 $fetch 单通道串行重试 2 次
async function getText(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': HOST + BASE,
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data, status } = await $fetch.get(url, { headers });
            const tx = typeof data === 'string' ? data : String(data || '');
            if ((status === undefined || status === 200) && tx.length > 1000) return tx;
        } catch (e) {}
    }
    return '';
}

function parseList(html) {
    const videos = [];
    if (!html) return videos;
    const items = html.match(/<li class="fed-list-item[^"]*">([\s\S]*?)<\/li>/g) || [];
    const seen = new Set();
    for (const item of items) {
        const im = item.match(/vod\/play\/id\/(\d+)/);
        if (!im) continue;
        const vodId = im[1];
        if (seen.has(vodId)) continue;
        seen.add(vodId);
        let name = '';
        let tm = item.match(/<a[^>]*class="fed-list-title[^"]*"[^>]*title="([^"]+)"/);
        if (tm) name = tm[1].trim();
        if (!name) {
            tm = item.match(/<a[^>]*class="fed-list-title[^"]*"[^>]*>([\s\S]*?)<\/a>/);
            if (tm) name = stripTags(tm[1]);
        }
        if (!name || name.length < 3) continue;
        let pic = '';
        const pm = item.match(/data-original="([^"]+\.(?:jpg|jpeg|png))"/i);
        if (pm) pic = absUrl(pm[1]);
        const rm = item.match(/fed-list-remarks[^>]*>([^<]*)</);
        videos.push({
            vod_id: vodId,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: rm ? rm[1].trim() : '',
            ext: { id: vodId },
        });
    }
    return videos;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '20');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url = `${HOST}${BASE}/vod/type/id/${tid}.html`;
    if (page > 1) url = `${HOST}${BASE}/vod/type/id/${tid}/page/${page}.html`;
    const html = await getText(url);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vodId = String(ext.id || '').trim();
    if (!vodId) return jsonify({ list: [] });
    const html = await getText(`${HOST}${BASE}/vod/play/id/${vodId}/sid/1/nid/1.html`);
    if (!html || html.length < 1000) return jsonify({ list: [] });
    let m3u8 = '';
    let m = html.match(/var\s+player_data\s*=\s*(\{.*?\})/s);
    if (m) {
        const um = m[1].match(/"url"\s*:\s*"([^"]+)"/);
        if (um) m3u8 = um[1].replace(/\\\//g, '/');
    }
    if (!m3u8) {
        const all = html.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g) || [];
        for (const u of all) {
            if (!/sharer|balecao/i.test(u)) { m3u8 = u; break; }
        }
    }
    if (!m3u8) return jsonify({ list: [] });
    const tracks = [{ name: '第1集', pan: '', ext: { id: m3u8, flag: '茄子精品' } }];
    return jsonify({ list: [{ title: '茄子精品', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').trim();
    if (/\$/.test(id)) id = id.split('$').pop().trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': HOST + BASE }] });
}

async function search(ext) {
    ext = argsify(ext);
    // 猫版未实现搜索（恒空），如实保留
    return jsonify({ list: [] });
}
