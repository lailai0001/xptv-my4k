// 绯夜 - XPTV csp 格式 (csp_feiye)
// 转换自 mira-cat nodejs/src/spider/video/feiye.js（py_feiye），站点 https://feiyechengren.pages.dev（AppleCMS JSON API，三线路 /api/ /api2/ /api3/）。
// 猫源取数含原生 fetch 通道的超时辅助：XPTV 版按规范删除该延时逻辑，只用 $fetch 串行逐线路兜底（api→api2→api3）。
// 播放为 AppleCMS 直链（vod_play_url 原样拆集），parse:0 直出。
const SITE = 'https://feiyechengren.pages.dev';
const BASES = [
    SITE + '/api/',
    SITE + '/api2/',
    SITE + '/api3/',
];
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1';

const appConfig = {
    ver: 1,
    title: '绯夜',
    site: SITE,
    tabs: [
        { name: '全部', ext: { tid: '' } },
        { name: '精品推荐', ext: { tid: '20' } },
        { name: '主播秀色', ext: { tid: '22' } },
        { name: '日本有码', ext: { tid: '23' } },
        { name: '日本无码', ext: { tid: '24' } },
        { name: '中文字幕', ext: { tid: '25' } },
        { name: '童颜巨乳', ext: { tid: '26' } },
        { name: '性感人妻', ext: { tid: '27' } },
        { name: '强奸乱伦', ext: { tid: '28' } },
        { name: '丝袜OL', ext: { tid: '33' } },
        { name: '自拍偷拍', ext: { tid: '35' } },
        { name: '日本片商', ext: { tid: '36' } },
        { name: '网曝系列', ext: { tid: '56' } },
        { name: '麻豆传媒', ext: { tid: '57' } },
        { name: '国产乱伦', ext: { tid: '61' } },
        { name: '国产丝袜', ext: { tid: '62' } },
        { name: '国产SM', ext: { tid: '63' } },
        { name: '探花嫖娼', ext: { tid: '65' } },
    ],
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

async function getJson(params) {
    const qs = Object.entries(params)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const headers = {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: SITE + '/',
    };
    for (const base of BASES) {
        const url = base + '?' + qs;
        try {
            const { data } = await $fetch.get(url, { headers });
            let d = data;
            if (typeof d === 'string') {
                try { d = JSON.parse(d); } catch (e) { continue; }
            }
            if (d && d.code === 1) return d;
        } catch (e) { /* 换下一线路 */ }
    }
    return null;
}

function parseVod(v) {
    if (!v) return null;
    const id = t(v.vod_id);
    if (!id) return null;
    return {
        vod_id: id,
        vod_name: t(v.vod_name) || '未命名',
        vod_pic: t(v.vod_pic),
        vod_remarks: t(v.vod_remarks || v.vod_time || ''),
        ext: { id },
    };
}

function parseList(d) {
    const list = [];
    if (!d) return list;
    const arr = Array.isArray(d.list) ? d.list : [];
    for (const v of arr) {
        const item = parseVod(v);
        if (item) list.push(item);
    }
    return list;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const params = { ac: 'videolist', pg: page };
    if (tid) params.t = tid;
    const d = await getJson(params);
    return jsonify({ list: parseList(d) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    const groups = [];
    if (id) {
        const d = await getJson({ ac: 'detail', ids: id });
        if (d && Array.isArray(d.list) && d.list[0]) {
            const v = d.list[0];
            const fromRaw = t(v.vod_play_from) || '绯夜';
            const urlRaw = t(v.vod_play_url);
            const froms = fromRaw.split('$$$');
            const urlGroups = urlRaw.split('$$$');
            urlGroups.forEach((grp, gi) => {
                const flag = froms[gi] || froms[0] || '绯夜';
                const tracks = [];
                grp.split('#').filter(Boolean).forEach((seg) => {
                    const idx = seg.indexOf('$');
                    if (idx < 0) return;
                    const name = seg.slice(0, idx) || '播放';
                    const playId = seg.slice(idx + 1);
                    if (!playId) return;
                    tracks.push({ name, pan: '', ext: { id: playId, flag } });
                });
                if (tracks.length) groups.push({ title: flag, tracks });
            });
        }
    }
    if (!groups.length) groups.push({ title: '绯夜', tracks: [] });
    return jsonify({ list: groups });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id || ext.url || '');
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (!/^https?:\/\//i.test(id)) return jsonify({ urls: [id], headers: [] });
    return jsonify({
        urls: [id],
        headers: [{ Referer: SITE + '/', 'User-Agent': UA }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const d = await getJson({ ac: 'videolist', wd, pg: page });
    return jsonify({ list: parseList(d) });
}
