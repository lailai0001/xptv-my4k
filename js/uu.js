// UU直播破解 - XPTV csp 格式（csp_uu）
// 转换自 mira-cat nodejs/src/spider/video/uu.js（py_uu）。站点 https://cmk.uuzbpj7.hair
// 自定义 CMS，video-item 列表，详情页 /{id}.html 内 const rawUrl 直出 m3u8。
// 注意：猫版 search 本就是空桩（未实现、恒返回空），XPTV 版如实保留，待站点搜索路由证实后再补。
const HOST = 'https://cmk.uuzbpj7.hair';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CATEGORIES = [
    ['20', '韩国美眉'], ['21', '骑兵有码'], ['22', '日韩主播'], ['23', '国产偷拍'], ['24', '欧美激情'],
    ['25', '步兵无码'], ['26', '金发幼齿'], ['27', '三级伦理'], ['28', '岛国中文'], ['29', '岛国无码'],
    ['30', '网红主播'], ['31', '自拍偷拍'],
];

const appConfig = {
    ver: 1,
    title: 'UU直播破解',
    site: HOST,
    tabs: CATEGORIES.map(([tid, name]) => ({ name, ext: { tid } })),
};

function stripTags(s) {
    return String(s || '').replace(/<[^>]+>/g, '').trim();
}

// 猫版双通道（框架 req + 原生 fetch）在此收敛为 $fetch 单通道串行重试 2 次
async function getText(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': HOST + '/',
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data, status } = await $fetch.get(url, { headers });
            const tx = typeof data === 'string' ? data : String(data || '');
            if ((status === undefined || status === 200) && tx.length > 500) return tx;
        } catch (e) {}
    }
    return '';
}

function parseList(html) {
    const videos = [];
    if (!html) return videos;
    const items = html.match(/<div[^>]*class="video-item [^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="video-item |$)/g) || [];
    const seen = new Set();
    for (const item of items) {
        const m = item.match(/href="\/(\d+)\.html"/) || item.match(/data-href="\/(\d+)\.html"/);
        if (!m) continue;
        const vodId = m[1];
        if (seen.has(vodId)) continue;
        seen.add(vodId);
        let name = '';
        const tm = item.match(/class="[^"]*video-item-title[^"]*"[^>]*>([\s\S]*?)<\/(?:div|a|p|h4)>/);
        if (tm) name = stripTags(tm[1]);
        if (!name) {
            const at = item.match(/<a[^>]*title="([^"]+)"/);
            if (at) name = at[1].trim();
        }
        if (!name) continue;
        let pic = '';
        const pm = item.match(/data-original="([^"]+\.(?:jpg|jpeg|png))"/i)
            || item.match(/data-src="([^"]+\.(?:jpg|jpeg|png))"/i)
            || item.match(/<img[^>]*src="([^"]+\.(?:jpg|jpeg|png))"/i);
        if (pm) pic = pm[1];
        videos.push({
            vod_id: vodId,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: '',
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
    let url = `${HOST}/vodtype/${tid}.html`;
    if (page > 1) url = `${HOST}/vodtype/${tid}-${page}.html`;
    const html = await getText(url);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vodId = String(ext.id || '').trim();
    if (!vodId) return jsonify({ list: [] });
    const html = await getText(`${HOST}/${vodId}.html`);
    if (!html || html.length < 1000) return jsonify({ list: [] });
    let m3u8 = '';
    let m = html.match(/(?:const|let|var)\s+rawUrl\s*=\s*['"]([^'"]+)['"]/i);
    if (m) m3u8 = m[1];
    if (!m3u8) {
        m = html.match(/var\s+player_data\s*=\s*(\{.*?\})/s);
        if (m) {
            const um = m[1].match(/"url"\s*:\s*"([^"]+)"/);
            if (um) m3u8 = um[1].replace(/\\\//g, '/');
        }
    }
    if (!m3u8) {
        const all = html.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/g) || [];
        for (const u of all) {
            if (!/sharer|balecao/i.test(u)) { m3u8 = u; break; }
        }
    }
    if (!m3u8) return jsonify({ list: [] });
    const tracks = [{ name: '第1集', pan: '', ext: { id: m3u8, flag: 'UU直播破解' } }];
    return jsonify({ list: [{ title: 'UU直播破解', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').trim();
    if (/\$/.test(id)) id = id.split('$').pop().trim();
    if (!id) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    // 猫版未实现搜索（恒空），如实保留
    return jsonify({ list: [] });
}
