// 野果短剧 - XPTV csp 格式（csp_yeguo）
// 转换自 mira-cat nodejs/src/spider/video/yeguo.js（py_yeguo），站点 https://yeguodj.com
// API https://www.yeguodj.com/api.php，POST JSON 对象 body（同猫侧线格式），响应 data 为 AES-128-CBC 加密串，
// 用 createCryptoJS() 解密（代 Node crypto）。封面 bagua-img-proxy 前缀原样保留。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
const CryptoJS = createCryptoJS();

const API_BASE = 'https://www.yeguodj.com/api.php';
const SITE = 'https://yeguodj.com';
const COVER_PROXY = 'https://huangguo.wulii.de5.net';
const IMG_WORKER = 'https://bagua-img-proxy.li768435813.workers.dev';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const API_KEY = '2acf7e91e9864673';
const API_IV = '1c29882d3ddfcfd6';

const CATS = [
    ['home', '首页推荐'], ['rank', '排行榜'], ['yuanchuang', '野果原创'], ['zhenren', '真人短剧'],
    ['mogai', '魔改漫剧'], ['manju', '漫剧'], ['aiduanju', 'AI短剧'], ['wanghong', '网红改编'],
    ['jinji', '禁忌伦理'], ['zhichang', '职场反差'],
];

const appConfig = {
    ver: 1,
    title: '野果短剧',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function aesDecrypt(b64) {
    const key = CryptoJS.enc.Utf8.parse(API_KEY);
    const iv = CryptoJS.enc.Utf8.parse(API_IV);
    const decrypted = CryptoJS.AES.decrypt(String(b64), key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
}

async function apiPost(path, body) {
    const { data } = await $fetch.post(API_BASE + path, body || {}, {
        headers: {
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': SITE + '/',
            'Origin': SITE,
        },
    });
    let d = data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) {} }
    if (!d) throw new Error('空响应: ' + path);
    if (typeof d.data === 'string' && d.data.length > 20) {
        d.data = JSON.parse(aesDecrypt(d.data));
    }
    return d;
}

function unwrap(d) {
    if (!d) return {};
    const x = d.data != null ? d.data : d;
    if (x && x.data != null && typeof x.data === 'object') return x.data;
    return x;
}

function proxiedCover(url) {
    url = t(url);
    if (!url) return '';
    if (/^https?:\/\/pic\.jtzatly\.cn\//i.test(url)) {
        return IMG_WORKER + '/img?url=' + encodeURIComponent(url);
    }
    if (/pic\.wlwvch\.cn|pic\.zdmhyg\.cn|pic\.wirqed\.cn|imgpublic\.ycomesc\.live/i.test(url)) {
        return COVER_PROXY + '/?url=' + encodeURIComponent(url);
    }
    return url;
}

function toCard(it) {
    if (!it) return null;
    const id = t(it.video_id != null ? it.video_id : it.id);
    if (!id || !/^\d+$/.test(id)) return null;
    const title = t(it.title || it.video_title || it.name);
    if (!title) return null;
    const ep = it.episode_count || it.episodes || '';
    const remark = ep ? '更新至' + ep + '集' : t(it.update_status || '');
    const vodId = 'yeguo:' + id;
    return {
        vod_id: vodId,
        vod_name: title,
        vod_pic: proxiedCover(t(it.cover || it.cover_img || it.pic || '')),
        vod_remarks: remark,
        ext: { id: vodId },
    };
}

function listFrom(data) {
    const inner = unwrap({ data: data });
    const arr = (inner && inner.list) || (inner && inner.top_list) || (Array.isArray(inner) ? inner : []);
    const out = [];
    const seen = {};
    for (const it of arr) {
        const v = toCard(it);
        if (!v || seen[v.vod_id]) continue;
        seen[v.vod_id] = 1;
        out.push(v);
    }
    return out;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'home');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    try {
        let d;
        if (id === 'home') {
            if (page > 1) {
                d = await apiPost('/api/theater/exploreList', { page: page - 1, limit: 24 });
                return jsonify({ list: listFrom(d.data) });
            }
            d = await apiPost('/api/home/homePage', {});
            const inner = unwrap(d);
            let list = (inner && inner.top_list) || [];
            const mods = (inner && inner.modules && inner.modules.list) || [];
            for (const m of mods) {
                if (m && Array.isArray(m.list)) list = list.concat(m.list);
                else if (m && (m.video_id || m.id)) list.push(m);
            }
            return jsonify({ list: listFrom({ list: list }) });
        } else if (id === 'rank') {
            d = await apiPost('/api/theater/videoRank', { page: page, limit: 24 });
        } else if (id === 'yuanchuang') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, theme: 7 });
        } else if (id === 'zhenren') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, theme: 8 });
        } else if (id === 'mogai') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, theme: 9 });
        } else if (id === 'wanghong') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, theme: 10 });
        } else if (id === 'jinji') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, setting: 23 });
        } else if (id === 'zhichang') {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24, setting: 24 });
        } else {
            d = await apiPost('/api/theater/exploreList', { page: page, limit: 24 });
        }
        return jsonify({ list: listFrom(d.data) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').replace(/^yeguo:/, '').split('||')[0].split(':')[0];
    if (!id || !/^\d+$/.test(id)) return jsonify({ list: [] });
    let tracks = [];
    try {
        const d = await apiPost('/api/playlet/detail', {
            video_id: Number(id), id: Number(id), episode_id: '0', related_limit: '0',
        });
        let info = unwrap(d);
        if (info.video_id == null && info.data) info = info.data;
        const eps = Array.isArray(info.episodes) ? info.episodes : [];
        const seen = {};
        const epItems = [];
        for (const ep of eps) {
            if (!ep) continue;
            const eid = t(ep.id || ep.episode_id || '');
            const n = Number(ep.sort || ep.episode || 0) || 0;
            if (!eid || !/^\d+$/.test(eid) || n < 1 || seen[eid]) continue;
            seen[eid] = 1;
            epItems.push({ n: n, eid: eid, title: t(ep.title || '第' + n + '集') });
        }
        epItems.sort((a, b) => a.n - b.n);
        tracks = epItems.map((e) => ({
            name: e.title,
            pan: '',
            ext: { id: JSON.stringify({ videoId: id, episodeId: e.eid, ep: String(e.n) }), flag: '野果' },
        }));
    } catch (e) {
        tracks = [];
    }
    return jsonify({ list: [{ title: '野果', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    let payload = null;
    try { payload = JSON.parse(id); } catch (e) {}
    if (!payload || !payload.videoId) return jsonify({ urls: [], headers: [] });
    try {
        const d = await apiPost('/api/playlet/play', {
            video_id: Number(payload.videoId) || payload.videoId,
            playlet_id: Number(payload.videoId) || payload.videoId,
            episode_id: Number(payload.episodeId) || payload.episodeId,
        });
        let info = unwrap(d);
        if (info.video_url == null && info.data) info = info.data;
        const url = t(info.video_url || info.video_url_h265 || '');
        if (!url) return jsonify({ urls: [], headers: [] });
        return jsonify({
            urls: [url],
            headers: [{ 'User-Agent': UA, 'Referer': SITE + '/', 'Origin': SITE }],
        });
    } catch (e) {
        return jsonify({ urls: [], headers: [] });
    }
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!kw) return jsonify({ list: [] });
    try {
        const d = await apiPost('/api/search/result', { keyword: kw, page: page, tab: 'video' });
        return jsonify({ list: listFrom(d.data) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}
