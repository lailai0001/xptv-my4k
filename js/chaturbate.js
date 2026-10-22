// Chaturbate - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/chaturbate.js（py_chaturbate）
// 站点 https://chaturbate.com，公开 API（GET×3：roomlist 列表 / chatvideocontext 上下文 / 房间页兜底），
// 只收游客可看的公开房（current_show='public' 且无密码），不伪造任何凭证。
// 播放：LL-HLS 主列表直出。猫版 play 走本地 /proxy/master 代理把主列表裁到最高档（播放器直返主列表
// 会从低档起播），XPTV 无本地代理位，无法移植，getPlayinfo 直返 hls_source 主列表，待真机验画质表现。
const HOST = 'https://chaturbate.com';
const API = HOST + '/api/ts/roomlist/room-list/';
const CTX_API = HOST + '/api/chatvideocontext/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const REFERER = HOST + '/';
const PAGE_SIZE = 90;

// 分类 type_id 编码 —— all | g:{gender} | r:{region} | gr:{gender}:{region} |
// new | gaming | exhib | age:{from}:{to} | tag:{hashtag}（同猫版 48 分类）
const CATS = [
    { tid: 'all', name: '推荐' },
    { tid: 'g:f', name: '女生' },
    { tid: 'g:m', name: '男生' },
    { tid: 'g:c', name: '情侣' },
    { tid: 'g:t', name: '跨性别' },
    { tid: 'r:AS', name: '亚洲' },
    { tid: 'r:NA', name: '北美' },
    { tid: 'r:SA', name: '南美' },
    { tid: 'r:ER', name: '欧洲·俄罗斯' },
    { tid: 'r:O', name: '其他地区' },
    { tid: 'gr:f:AS', name: '亚洲女生' },
    { tid: 'new', name: '新人' },
    { tid: 'gaming', name: '游戏' },
    { tid: 'exhib', name: '展示' },
    { tid: 'age:18:22', name: '18-21岁' },
    { tid: 'age:20:31', name: '20-30岁' },
    { tid: 'age:30:51', name: '30-50岁' },
    { tid: 'age:50:100', name: '成熟50+' },
    { tid: 'tag:lovense', name: '标签·互动玩具' },
    { tid: 'tag:bigboobs', name: '标签·巨乳' },
    { tid: 'tag:squirt', name: '标签·潮吹' },
    { tid: 'tag:asian', name: '标签·亚洲' },
    { tid: 'tag:anal', name: '标签·肛交' },
    { tid: 'tag:bigass', name: '标签·大屁股' },
    { tid: 'tag:skinny', name: '标签·瘦' },
    { tid: 'tag:natural', name: '标签·天然' },
    { tid: 'tag:feet', name: '标签·恋足' },
    { tid: 'tag:latina', name: '标签·拉丁' },
    { tid: 'tag:milf', name: '标签·熟女' },
    { tid: 'tag:smalltits', name: '标签·小胸' },
    { tid: 'tag:blonde', name: '标签·金发' },
    { tid: 'tag:cum', name: '标签·射精' },
    { tid: 'tag:bigcock', name: '标签·大屌' },
    { tid: 'tag:hairy', name: '标签·多毛' },
    { tid: 'tag:deepthroat', name: '标签·深喉' },
    { tid: 'tag:petite', name: '标签·娇小' },
    { tid: 'tag:bigtits', name: '标签·大胸' },
    { tid: 'tag:fuckmachine', name: '标签·炮机' },
    { tid: 'tag:brunette', name: '标签·棕发' },
    { tid: 'tag:ebony', name: '标签·黑珍珠' },
    { tid: 'tag:redhead', name: '标签·红发' },
    { tid: 'tag:mature', name: '标签·熟龄' },
    { tid: 'tag:muscle', name: '标签·肌肉' },
    { tid: 'tag:goth', name: '标签·哥特' },
    { tid: 'tag:cosplay', name: '标签·角色扮演' },
    { tid: 'tag:bdsm', name: '标签·BDSM' },
    { tid: 'tag:twink', name: '标签·小鲜肉' },
    { tid: 'tag:blowjob', name: '标签·口交' },
];

const appConfig = {
    ver: 1,
    title: 'Chaturbate',
    site: HOST,
    tabs: CATS.map((c) => ({ name: c.name, ext: { tid: c.tid } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }

async function fetchText(url) {
    try {
        const { data, status } = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Accept': '*/*', 'Referer': REFERER },
        });
        if (data != null && (status === 200 || status === undefined)) {
            return typeof data === 'string' ? data : JSON.stringify(data);
        }
        if (typeof data === 'string' && data) return data;
    } catch (e) { /* 换通道2 */ }
    try {
        const { data } = await $fetch.get('https://r.jina.ai/' + url, { headers: { 'User-Agent': UA } });
        if (data != null) return typeof data === 'string' ? data : String(data);
    } catch (e) { /* ignore */ }
    return '';
}

async function fetchJson(url) {
    try {
        const { data } = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER },
        });
        if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) { /* 换通道2 */ }
    const raw = await fetchText(url);
    if (raw) { try { return JSON.parse(raw); } catch (e) { /* ignore */ } }
    return null;
}

function roomToVod(r) {
    const marks = [];
    if (r.is_new) marks.push('新人');
    if (r.is_gaming) marks.push('游戏');
    const remarks = `${r.num_users || 0}人观看${marks.length ? ' · ' + marks.join(' · ') : ''}`;
    return {
        vod_id: t(r.username),
        vod_name: t(r.username),
        vod_pic: t(r.img),
        vod_remarks: remarks,
        ext: { id: t(r.username) },
    };
}

async function getRoomsPage(params, page) {
    const offset = (page - 1) * PAGE_SIZE;
    const pairs = [['limit', String(PAGE_SIZE)], ['offset', String(offset)]];
    for (const k of Object.keys(params || {})) {
        const v = params[k];
        if (v !== '' && v != null) pairs.push([k, String(v)]);
    }
    const qs = pairs.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
    const d = await fetchJson(`${API}?${qs}`);
    if (!d || !Array.isArray(d.rooms)) return { list: [], total: 0 };
    const list = d.rooms
        .filter((r) => r && r.username && r.current_show === 'public' && !r.has_password)
        .map(roomToVod);
    return { list, total: d.total_count || 0 };
}

function parseTid(tid) {
    const s = t(tid) || 'all';
    const p = s.split(':');
    switch (p[0]) {
        case 'g': return { genders: p[1] || 'f' };
        case 'r': return { regions: p[1] || 'AS' };
        case 'gr': return { genders: p[1] || 'f', regions: p[2] || 'AS' };
        case 'age': return { from_age: p[1] || '18', to_age: p[2] || '100' };
        case 'tag': return { hashtags: p.slice(1).join(':') };
        case 'new': return { new_cams: '1' };
        case 'gaming': return { gaming: '1' };
        case 'exhib': return { exhib: '1' };
        default: return {};
    }
}

// 取房间播放信息：主通道 chatvideocontext JSON，兜底房间页 initialRoomDossier（同猫版）
async function getDossier(username) {
    const j = await fetchJson(CTX_API + encodeURIComponent(username) + '/');
    if (j && typeof j === 'object' && ('room_status' in j || 'hls_source' in j)) {
        return {
            room_status: t(j.room_status),
            room_title: t(j.room_title),
            num_viewers: j.num_viewers || 0,
            hls_source: t(j.hls_source),
        };
    }
    const html = await fetchText(`${HOST}/${encodeURIComponent(username)}/`);
    if (!html) return null;
    const m = html.match(/initialRoomDossier\s*=\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return null;
    try {
        const d = JSON.parse(JSON.parse('"' + m[1] + '"'));
        return {
            room_status: t(d.room_status),
            room_title: t(d.room_title),
            num_viewers: d.num_viewers || 0,
            hls_source: t(d.hls_source),
        };
    } catch (e) { return null; }
}

function cleanId(raw) {
    const s = t(raw);
    return s.includes('$') ? s.split('$').pop() : s;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const params = parseTid(ext.tid);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const { list } = await getRoomsPage(params, page);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const username = cleanId(ext.id);
    if (!username) return jsonify({ list: [] });
    // 猫版 detail 恒产出一个 track（play 时再守卫房间状态），此处原样保留
    return jsonify({
        list: [{ title: 'Chaturbate', tracks: [{ name: '直播', pan: '', ext: { id: username, flag: 'Chaturbate' } }] }],
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': REFERER };
    const username = cleanId(ext.id);
    if (!username) return jsonify({ urls: [], headers: [header] });
    const d = await getDossier(username);
    // 只有公开房才有游客流；hidden/private 等状态 hls_source 为空，如实空返（同猫版）
    if (!d || d.room_status !== 'public' || !t(d.hls_source)) {
        return jsonify({ urls: [], headers: [header] });
    }
    // LL-HLS 主列表直出（猫版的本地裁档代理无法移植，见文件头）
    return jsonify({ urls: [t(d.hls_source)], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const { list } = await getRoomsPage({ keywords: wd }, page);
    return jsonify({ list });
}
