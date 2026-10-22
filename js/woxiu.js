// 我秀直播 - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/woxiu.js（py_woxiu）
// 站点 https://www.woxiu.com（PC 端接口，GET×2：JSON 接口 + 搜索 HTML），无站外依赖；
// 播放为直播 HLS/FLV 直链直出。猫版双通道（req→fetch）在 XPTV 统一走 $fetch。
const PC_HOST = 'https://www.woxiu.com';
const PC_API = PC_HOST + '/index.php?action=Index/Main&do=';
const LIVE_API = PC_HOST + '/index.php?action=M/Live&do=LiveInfo&room_id=';
const SEARCH_URL = PC_HOST + '/index.php?action=Search&q=';
const UA = 'Mozilla/5.0 (Linux; Android 11; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const FLV_HOST = 'https://bplay.xiuimg.com';
const HLS_RE = /\/vshow\/([^/]+)\/playlist\.m3u8/i;

const PC_DO = {
    grade_all: 'ApiZhuboGradeNew',
    grade_4: 'ApiZhuboGradeNew&gtype=4',
    grade_3: 'ApiZhuboGradeNew&gtype=3',
    grade_2: 'ApiZhuboGradeNew&gtype=2',
    grade_1: 'ApiZhuboGradeNew&gtype=1',
    game: 'ApiGameRoom',
};

const appConfig = {
    ver: 1,
    title: '我秀直播',
    site: PC_HOST,
    tabs: [
        { name: '全部主播', ext: { tid: 'grade_all' } },
        { name: '巨星', ext: { tid: 'grade_4' } },
        { name: '明星', ext: { tid: 'grade_3' } },
        { name: '钻石', ext: { tid: 'grade_2' } },
        { name: '红心', ext: { tid: 'grade_1' } },
        { name: '游戏主播', ext: { tid: 'game' } },
    ],
};

function t(v) { return String(v == null ? '' : v).trim(); }

function toInt(v, d) {
    const n = parseInt(String(v).trim(), 10);
    return isNaN(n) ? (d || 0) : n;
}

function fixPic(url) {
    url = t(url).replace(/\\\//g, '/');
    if (!url) return '';
    if (url.startsWith('//')) url = 'https:' + url;
    return url;
}

async function getJson(url, referer) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': referer || (PC_HOST + '/'),
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data } = await $fetch.get(url, { headers });
            if (data) {
                if (typeof data === 'object') return data;
                try { return JSON.parse(String(data)); } catch (e) { /* retry */ }
            }
        } catch (e) { /* retry */ }
    }
    return {};
}

async function getText(url, referer) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': referer || (PC_HOST + '/'),
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data } = await $fetch.get(url, { headers });
            const s = typeof data === 'string' ? data : String(data || '');
            if (s.length > 500) return s;
        } catch (e) { /* retry */ }
    }
    return '';
}

// 猫 detail 的 vod_play_from/vod_play_url → 线路组/tracks（playId 原样透传）
function buildGroups(playFrom, playUrl) {
    const froms = String(playFrom || '').split('$$$').map((s) => s.trim()).filter(Boolean);
    const urlGroups = String(playUrl || '').split('$$$');
    const groups = [];
    const n = Math.max(froms.length, urlGroups.length);
    for (let i = 0; i < n; i++) {
        const title = froms[i] || '在线播放';
        const tracks = [];
        const seg = urlGroups[i] || '';
        if (seg) {
            for (const ep of seg.split('#')) {
                if (!ep) continue;
                const idx = ep.indexOf('$');
                const name = idx >= 0 ? ep.slice(0, idx) : ep;
                const pid = idx >= 0 ? ep.slice(idx + 1) : ep;
                tracks.push({ name: name || '播放', pan: '', ext: { id: pid, flag: title } });
            }
        }
        if (tracks.length) groups.push({ title, tracks });
    }
    return groups;
}

function cardPc(j) {
    const rid = t(j.room_id);
    if (!rid) return null;
    const online = toInt(j.online) === 1;
    const count = toInt(j.count);
    const remark = online ? ('👥 ' + (count > 0 ? count : '直播中')) : '未开播';
    return {
        vod_id: 'woxiu:' + rid,
        vod_name: t(j.name) || ('房间' + rid),
        vod_pic: fixPic(j.room_img || j.index_img),
        vod_remarks: remark,
        ext: { id: 'woxiu:' + rid },
    };
}

async function liveInfo(rid) {
    return getJson(LIVE_API + encodeURIComponent(rid));
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const id = t(ext.tid) || 'grade_all';
    const page = Math.max(1, toInt(ext.page, 1));
    const d = PC_DO[id];
    if (!d) return jsonify({ list: [] });
    const payload = await getJson(PC_API + d + '&page=' + page, PC_HOST + '/');
    const rows = (payload && payload.data) || [];
    const list = [];
    for (const j of rows) {
        const c = cardPc(j);
        if (c) list.push(c);
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id).replace(/^woxiu:/, '');
    if (!id) return jsonify({ list: [] });
    const info = await liveInfo(id);
    let groups = [];
    if (info && t(info.zb_nickname || info.room_id)) {
        const online = toInt(info.online) === 1;
        const stream = t(info.live_stream);
        if (online && stream) {
            groups = buildGroups('高清$$$原画', '直播$' + id + '$hls#直播$' + id + '$flv');
        }
    }
    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': PC_HOST + '/' };
    let id = t(ext.id);
    if (/^https?:\/\//i.test(id)) return jsonify({ urls: [id], headers: [header] });
    const parts = id.split('$').filter(Boolean);
    let rid = '', line = 'hls';
    if (parts.length >= 3) { rid = parts[parts.length - 2]; line = parts[parts.length - 1]; }
    else if (parts.length === 2) { rid = parts[0].replace(/^woxiu:/, ''); line = parts[1]; }
    else if (parts.length === 1) { rid = parts[0].replace(/^woxiu:/, ''); }
    if (!rid) return jsonify({ urls: [], headers: [header] });
    const info = await liveInfo(rid);
    const stream = t(info && info.live_stream);
    if (!stream) return jsonify({ urls: [], headers: [header] });
    let url = stream;
    if (line === 'flv') {
        const m = HLS_RE.exec(stream);
        url = m ? (FLV_HOST + '/vshow/' + m[1] + '.flv') : stream;
    }
    return jsonify({ urls: [url], headers: [header] });
}

function parseSearchCards(html) {
    const cards = [];
    if (!html) return cards;
    const blocks = html.match(/<li>([\s\S]*?)<\/li>/g) || [];
    const seen = new Set();
    for (const b of blocks) {
        const m = b.match(/href="https?:\/\/(?:www|m)\.woxiu\.com\/(\d+)"/);
        if (!m || seen.has(m[1])) continue;
        seen.add(m[1]);
        const rid = m[1];
        let name = '';
        const am = b.match(/alt="([^"]*)"/) || b.match(/<i>([^<]*)<\/i>/);
        if (am) name = am[1].trim();
        const im = b.match(/<img[^>]+src="([^"]+)"/);
        const online = b.indexOf('online_icon') >= 0;
        const hm = b.match(/人气：\s*(\d+)/);
        const remark = online ? ('👥 ' + (hm ? hm[1] : '直播中')) : '未开播';
        cards.push({
            vod_id: 'woxiu:' + rid,
            vod_name: name || ('房间' + rid),
            vod_pic: fixPic(im ? im[1] : ''),
            vod_remarks: remark,
            ext: { id: 'woxiu:' + rid },
        });
    }
    return cards;
}

async function search(ext) {
    ext = argsify(ext);
    const kw = t(ext.text);
    const page = Math.max(1, toInt(ext.page, 1));
    if (!kw) return jsonify({ list: [] });
    const stype = /^\d+$/.test(kw) ? 'roomid' : 'nickname';
    let url = SEARCH_URL + encodeURIComponent(kw) + '&search_type=' + stype;
    if (page > 1) url += '&page=' + page;
    let cards = parseSearchCards(await getText(url, PC_HOST + '/'));
    if (!cards.length && stype === 'roomid') {
        let url2 = SEARCH_URL + encodeURIComponent(kw) + '&search_type=nickname';
        if (page > 1) url2 += '&page=' + page;
        cards = parseSearchCards(await getText(url2, PC_HOST + '/'));
    }
    return jsonify({ list: cards });
}
