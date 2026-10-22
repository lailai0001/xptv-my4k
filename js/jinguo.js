// 禁果短剧 - XPTV csp 格式（csp_jinguo）
// 转换自 mira-cat nodejs/src/spider/video/jinguo.js（py_jinguo），站点 https://jinguoduanju.app
// 取数：先 POST /api/v1/auth/device（JSON 对象 body，同猫侧线格式）换设备 token，再 Bearer GET 各接口。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
const API_BASE = 'https://jinguoduanju.app';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';

let _token = '';
let _deviceId = '';

const CATS = [
    ['heat', '热度'], ['latest', '最新'], ['landing', '首页推荐'], ['nav_all', '全部'],
    ['nav_original', '原创精品'], ['nav_single', '单体作品'], ['nav_anime', '动漫改编'], ['nav_movie', '影视改编'],
    ['len_multi', '多集'], ['len_single', '单集'],
    ['tag_mogai', '魔改'], ['tag_dushi', '都市'], ['tag_zhichang', '职场'], ['tag_qihuan', '奇幻'],
    ['tag_guzhuang', '古装'], ['tag_dongman', '动漫'], ['tag_tianchong', '甜宠'], ['tag_nuelian', '虐恋'], ['tag_chuanyue', '穿越'],
];

const CAT_QUERY = {
    heat: { sort: 'heat' },
    latest: { sort: 'latest' },
    nav_all: { sort: 'latest', navigationId: 2 },
    nav_original: { sort: 'latest', navigationId: 7 },
    nav_single: { sort: 'latest', navigationId: 3 },
    nav_anime: { sort: 'latest', navigationId: 6 },
    nav_movie: { sort: 'latest', navigationId: 5 },
    len_multi: { sort: 'latest', length: 'multi' },
    len_single: { sort: 'latest', length: 'single' },
    tag_mogai: { sort: 'latest', _tagFilter: '魔改' },
    tag_dushi: { sort: 'latest', _tagFilter: '都市' },
    tag_zhichang: { sort: 'latest', _tagFilter: '职场' },
    tag_qihuan: { sort: 'latest', _tagFilter: '奇幻' },
    tag_guzhuang: { sort: 'latest', _tagFilter: '古装' },
    tag_dongman: { sort: 'latest', _tagFilter: '动漫' },
    tag_tianchong: { sort: 'latest', _tagFilter: '甜宠' },
    tag_nuelian: { sort: 'latest', _tagFilter: '虐恋' },
    tag_chuanyue: { sort: 'latest', _tagFilter: '穿越' },
};

const appConfig = {
    ver: 1,
    title: '禁果短剧',
    site: API_BASE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function randDevice() {
    const hex = '0123456789abcdef';
    let s = '';
    for (let i = 0; i < 32; i++) s += hex[(Math.random() * 16) | 0];
    return s;
}

function asObj(data) {
    if (typeof data === 'string') {
        try { return JSON.parse(data); } catch (e) { return null; }
    }
    return data || null;
}

async function ensureToken() {
    if (_token) return _token;
    if (!_deviceId) _deviceId = randDevice();
    const { data } = await $fetch.post(API_BASE + '/api/v1/auth/device', {
        deviceId: 'h5:' + _deviceId,
        channelCode: '',
        attributionToken: '',
    }, {
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': UA,
            'Referer': API_BASE + '/',
            'Origin': API_BASE,
        },
    });
    const d = asObj(data);
    _token = t(d && d.token);
    if (!_token) throw new Error('设备登录失败');
    return _token;
}

async function apiGet(path, query) {
    await ensureToken();
    let url = API_BASE + '/api/v1' + path;
    const parts = [];
    for (const k of Object.keys(query || {})) {
        const v = query[k];
        if (v == null || v === '') continue;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(String(v)));
    }
    if (parts.length) url += '?' + parts.join('&');
    const { data } = await $fetch.get(url, {
        headers: {
            'Accept': 'application/json',
            'User-Agent': UA,
            'Referer': API_BASE + '/',
            'Origin': API_BASE,
            'Authorization': 'Bearer ' + _token,
        },
    });
    const d = asObj(data);
    if (d && d.status === 401) {
        _token = '';
        return apiGet(path, query);
    }
    return d;
}

function toCard(it) {
    if (!it || !it.id) return null;
    let cover = it.coverUrl || it.cover || '';
    if (cover && !/^https?:\/\//i.test(cover)) {
        cover = API_BASE + (cover.startsWith('/') ? cover : '/' + cover);
    }
    const ep = it.episodeCount || '';
    let remark = ep ? '全' + ep + '集' : '';
    const tags = Array.isArray(it.tags) ? it.tags.join(' · ') : '';
    if (tags) remark = remark ? remark + ' · ' + tags : tags;
    const vodId = 'jgdj:' + it.id;
    return {
        vod_id: vodId,
        vod_name: t(it.title) || String(it.id),
        vod_pic: cover,
        vod_remarks: remark,
        ext: { id: vodId },
    };
}

async function loadDramas(query, page) {
    page = Math.max(1, parseInt(page, 10) || 1);
    const q = Object.assign({ sort: 'latest' }, query || {});
    const tagFilter = q._tagFilter || '';
    delete q._tagFilter;
    let list = await apiGet('/dramas', q);
    if (!Array.isArray(list)) list = [];
    if (tagFilter) {
        list = list.filter((it) => Array.isArray(it.tags) && it.tags.some((x) => String(x) === tagFilter));
    }
    const PAGE_SIZE = 24;
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE).map(toCard).filter(Boolean);
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = String(ext.tid || 'latest');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    try {
        if (id === 'landing') {
            const data = await apiGet('/landing', {});
            const list = (data && data.dramas) || [];
            const PAGE_SIZE = 24;
            const sliced = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
            return jsonify({ list: sliced.map(toCard).filter(Boolean) });
        }
        const q = CAT_QUERY[id] || { sort: 'latest' };
        return jsonify({ list: await loadDramas(q, page) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = String(ext.id || '').replace(/^jgdj:/, '');
    if (!id) return jsonify({ list: [] });
    let tracks = [];
    try {
        const data = await apiGet('/dramas/' + encodeURIComponent(id), {});
        const eps = (data && data.episodes) || [];
        tracks = eps.map((ep, i) => {
            const n = ep.number || i + 1;
            const epId = ep.id || '';
            const title = t(ep.title || '第' + n + '集');
            const payload = JSON.stringify({ dramaId: id, episodeId: String(epId), epNum: String(n) });
            return { name: title, pan: '', ext: { id: payload, flag: '禁果' } };
        });
        if (!tracks.length) {
            const payload = JSON.stringify({ dramaId: id, episodeId: '', epNum: '1' });
            tracks = [{ name: '第1集', pan: '', ext: { id: payload, flag: '禁果' } }];
        }
    } catch (e) {
        tracks = [];
    }
    return jsonify({ list: [{ title: '禁果', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    let payload = null;
    try { payload = JSON.parse(id); } catch (e) {}
    if (!payload || !payload.dramaId) return jsonify({ urls: [], headers: [] });
    try {
        let episodeId = t(payload.episodeId);
        if (!episodeId) {
            const data = await apiGet('/dramas/' + encodeURIComponent(payload.dramaId), {});
            const eps = (data && data.episodes) || [];
            for (const ep of eps) {
                if (String(ep.number) === String(payload.epNum) || String(ep.id) === String(payload.epNum)) {
                    episodeId = t(ep.id);
                    break;
                }
            }
            if (!episodeId && eps.length) episodeId = t(eps[0].id);
        }
        if (!episodeId) return jsonify({ urls: [], headers: [] });
        const playData = await apiGet('/episodes/' + encodeURIComponent(episodeId) + '/play', {});
        const url = t(playData && playData.videoUrl);
        if (!url) return jsonify({ urls: [], headers: [] });
        return jsonify({
            urls: [url],
            headers: [{ 'User-Agent': UA, 'Referer': API_BASE + '/', 'Origin': API_BASE }],
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
        let list = await apiGet('/dramas', { sort: 'latest', q: kw });
        if (!Array.isArray(list)) list = [];
        const PAGE_SIZE = 24;
        const sliced = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        return jsonify({ list: sliced.map(toCard).filter(Boolean) });
    } catch (e) {
        return jsonify({ list: [] });
    }
}
