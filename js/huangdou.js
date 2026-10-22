// 黄豆短剧 - XPTV csp 格式 (csp_huangdou)
// 转换自 mira-cat nodejs/src/spider/video/huangdou.js（py_huangdou，压缩版）。
// 核查结论：猫版 huangdou.js 的取数助手（$9e/M9e/q9e/mh/H9e/U9e 等）在该文件内未定义、只有调用点，无法逐字转写；
// 本模块按同仓同站点同接口的完整等价实现 huangdou_rex.js（py_huangdou_rex，文件头注 2026-10-14 列表/搜索/详情/播放实测通过）转写，
// 取数全程走其 Cloudflare Worker 反代 https://hd.wulii.de5.net（/navBlock、/navFilter、/list、/detail、/play、/search）。
// 猫压缩版 detail 是按线路模板直拼播放 URL、rex 版是 hd:// 标识 + /play 接口换直链；本模块用 rex 版的 /play 换链（可验证、已实测）。
const PROXY = 'https://hd.wulii.de5.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const PLAY_REFERER = 'https://tideember.cc/home';
const PAGE_SIZE = 18;

const appConfig = {
    ver: 1,
    title: '黄豆短剧',
    site: PROXY,
    tabs: [
        { name: '全部', ext: { code: 'all' } },
        { name: '黄豆原创', ext: { code: 'yuandou' } },
        { name: '魔改短剧', ext: { code: 'mod' } },
        { name: '擦边短剧', ext: { code: 'caibian' } },
        { name: '真人短剧', ext: { code: 'zhenren' } },
        { name: '动漫', ext: { code: 'erciyuan' } },
        { name: '影院', ext: { code: 'aiman' } },
        { name: '贤者', ext: { code: 'zongyi' } },
        { name: '黑料', ext: { code: 'heiliao' } },
    ],
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

async function getJson(path) {
    try {
        const { data } = await $fetch.get(PROXY + path, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
        let d = data;
        if (d == null) return null;
        if (typeof d === 'string') {
            try { d = JSON.parse(d); } catch (e) { return null; }
        }
        if (d && d.status === 'n') return null;
        return d;
    } catch (e) {
        return null;
    }
}

function cleanId(it) {
    it = it || {};
    let rawId = t(it.id).replace(/^rp_/, '').replace(/^up_/, '');
    if (!rawId) rawId = t(it.drama_id).replace(/^up_/, '').replace(/^rp_/, '');
    return rawId;
}

function cleanPic(it) {
    return t(it.img_y || it.img_x || it.img || it.cover || it.pic);
}

function toCard(it) {
    const id = cleanId(it);
    if (!id) return null;
    const title = t(it.name || it.title || it.t) || id;
    const remarks = t(it.update_label || it.corner || (it.episode_count ? '全' + it.episode_count + '集' : ''));
    return {
        vod_id: id,
        vod_name: title,
        vod_pic: cleanPic(it),
        vod_remarks: remarks,
        ext: { id },
    };
}

function pickList(obj) {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    const d = obj.data != null ? obj.data : obj;
    if (Array.isArray(d)) return d;
    if (d && typeof d === 'object') {
        if (Array.isArray(d.list)) return d.list;
        if (Array.isArray(d.items)) return d.items;
    }
    if (Array.isArray(obj.list)) return obj.list;
    return [];
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const code = String(ext.code || 'all');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let list = [];
    if (code === 'yuandou') {
        const nb = await getJson(`/navBlock?code=yuandou&tab=recommend&page=${page}`);
        const blocks = pickList(nb);
        let items = [];
        for (const b of blocks) {
            if (b && Array.isArray(b.items)) items = items.concat(b.items);
            else if (b && (b.id || b.drama_id)) items.push(b);
        }
        list = items.map(toCard).filter(Boolean);
    } else {
        let q = `/list?page=${page}&page_size=${PAGE_SIZE}`;
        if (code && code !== 'all') {
            const nf = await getJson(`/navFilter?code=${encodeURIComponent(code)}`);
            const tabs = pickList(nf);
            const flt = tabs && tabs[0] && tabs[0].filter;
            if (flt && flt.cat_id) q += `&cat_id=${encodeURIComponent(flt.cat_id)}`;
        }
        const obj = await getJson(q);
        list = pickList(obj).map(toCard).filter(Boolean);
    }
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '').replace(/^hd:\/\//, '').replace(/^rp_/, '').replace(/^up_/, '').split('|')[0];
    const tracks = [];
    if (id) {
        const obj = await getJson(`/detail?id=${encodeURIComponent(id)}`);
        const d = (obj && obj.data && typeof obj.data === 'object') ? obj.data : {};
        const eps = Array.isArray(d.episodes) ? d.episodes : [];
        const count = Number(d.episode_count || eps.length || 1) || 1;
        if (eps.length) {
            eps.forEach((ep, i) => {
                const seq = String(t(ep.seq || ep.episode || ep.ep) || (i + 1));
                let epTitle = t(ep.name || ep.title) || seq;
                if (/^\d+$/.test(epTitle)) epTitle = '第' + epTitle + '集';
                if (t(ep.type || 'free') !== 'free' && !/VIP/.test(epTitle)) epTitle += ' [VIP]';
                tracks.push({ name: epTitle, pan: '', ext: { id, seq, flag: '黄豆短剧' } });
            });
        } else {
            for (let n = 1; n <= count; n++) tracks.push({ name: '第' + n + '集', pan: '', ext: { id, seq: String(n), flag: '黄豆短剧' } });
        }
    }
    return jsonify({ list: [{ title: '黄豆短剧', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    // 兼容直接传入 hd://id|seq 或已解析的媒体 URL
    const rawId = t(ext.id || '');
    if (/^https?:\/\//i.test(rawId) && /\.(m3u8|mp4)(\?|$)/i.test(rawId)) {
        return jsonify({ urls: [rawId], headers: [{ 'User-Agent': UA, Referer: PLAY_REFERER, Origin: 'https://tideember.cc' }] });
    }
    const id = t(ext.id || '').replace(/^hd:\/\//, '').split('|')[0];
    const seq = t(ext.seq || '') || (t(ext.id || '').match(/\|(\d+)$/) || [])[1] || '1';
    if (!id) return jsonify({ urls: [], headers: [] });
    const obj = await getJson(`/play?id=${encodeURIComponent(id)}&seq=${encodeURIComponent(seq)}`);
    const pd = (obj && obj.data && typeof obj.data === 'object') ? obj.data : {};
    let url = '';
    if (Array.isArray(pd.lines)) {
        for (const ln of pd.lines) {
            if (ln && t(ln.url)) { url = t(ln.url); break; }
        }
    }
    if (!url) url = t(pd.m3u8 || pd.url);
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: PLAY_REFERER, Origin: 'https://tideember.cc' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const obj = await getJson(`/search?keyword=${encodeURIComponent(wd)}&page=${page}`);
    return jsonify({ list: pickList(obj).map(toCard).filter(Boolean) });
}
