// Taiav - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/taiav.js（py_taiav）；该猫蜘蛛本就转自 XPTV 源，
// 本模块按原 XPTV 契约回转。站点 https://taiav.com（JSON API），无站外依赖。
const HOST = 'https://taiav.com';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1.1 Mobile/15E148 Safari/604.1';
const PAGE_SIZE = 12;

const appConfig = {
    ver: 1,
    title: 'Taiav',
    site: HOST,
    tabs: [
        { name: '网红主播', ext: { tip: 'category', class: '网红主播' } },
        { name: '国产AV', ext: { tip: 'category', class: '国产AV' } },
        { name: '有码', ext: { tip: 'category', class: '有码' } },
        { name: '无码', ext: { tip: 'category', class: '无码' } },
        { name: '中文字幕', ext: { tip: 'category', class: '中文字幕' } },
        { name: 'Onlyfans', ext: { tip: 'tag', class: 'Onlyfans' } },
        { name: 'Korean Bj', ext: { tip: 'tag', class: 'Korean Bj' } },
        { name: '探花', ext: { tip: 'tag', class: '探花' } },
        { name: '自拍', ext: { tip: 'tag', class: '自拍' } },
        { name: '无码破解', ext: { tip: 'tag', class: '无码破解' } },
        { name: '主播', ext: { tip: 'tag', class: '主播' } },
        { name: '偷拍', ext: { tip: 'tag', class: '偷拍' } },
        { name: '制服', ext: { tip: 'tag', class: '制服' } },
        { name: '人妻', ext: { tip: 'tag', class: '人妻' } },
    ],
};

async function getJson(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        if (typeof data === 'string') {
            const s = data.trim();
            if (!s) return null;
            try { return JSON.parse(s); } catch (e) { return null; }
        }
        return data;
    } catch (e) {
        return null;
    }
}

function parseCards(arr) {
    const list = [];
    if (!Array.isArray(arr)) return list;
    for (const e of arr) {
        if (!e || !e._id) continue;
        const vid = String(e._id);
        const name = String(e.originalname || '').trim();
        if (!name) continue;
        const posterUrl = e.poster2 && e.poster2.url ? String(e.poster2.url) : '';
        const pic = posterUrl ? (posterUrl.startsWith('http') ? posterUrl : HOST + posterUrl) : '';
        const duration = String(e.duration || '').trim();
        list.push({
            vod_id: vid,
            vod_name: name,
            vod_pic: pic,
            vod_remarks: duration ? `HD·${duration}` : 'HD',
            ext: { id: vid },
        });
    }
    return list;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tip = ext.tip || 'category';
    const cls = ext.class || '';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = `${HOST}/api/getcontents?page=${page}&size=${PAGE_SIZE}&${tip}=${encodeURIComponent(cls)}&type=movie,tv`;
    const data = await getJson(url);
    return jsonify({ list: parseCards(data) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vid = String(ext.id || '').trim();
    const tracks = [];
    if (vid) {
        const url = `${HOST}/api/getmovie?type=1280&id=${encodeURIComponent(vid)}`;
        const playlist = await getJson(url);
        const m3u8 = playlist && playlist.m3u8 ? String(playlist.m3u8) : '';
        if (m3u8) {
            const playurl = m3u8.startsWith('http') ? m3u8 : HOST + m3u8;
            tracks.push({ name: '播放', pan: '', ext: { url: playurl } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Origin: HOST }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const size = 48;
    const url = `${HOST}/api/getcontents?page=${page}&size=${size}&q=${encodeURIComponent(wd)}&type=movie,tv`;
    const data = await getJson(url);
    return jsonify({ list: parseCards(data) });
}
