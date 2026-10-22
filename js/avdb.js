// Avdb - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/avdb.js（py_avdb），站点 API https://avdbapi.com/api.php/provide/vod
// 无站外依赖；分类由 API 动态返回，getConfig 现拉、失败回退静态兜底。
const API = 'https://avdbapi.com/api.php/provide/vod';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

const FALLBACK_TABS = [{ name: '全部', ext: { tid: '' } }];

function t(v) {
    return String(v == null ? '' : v).trim();
}

async function fetchJson(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (e) { return null; }
        }
        return data;
    } catch (e) {
        return null;
    }
}

async function fetchText(url, referer) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA, Referer: referer || 'https://avdbapi.com/' } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function toCard(c) {
    return {
        vod_id: String(c.id),
        vod_name: t(c.name),
        vod_pic: c.poster_url || c.pic || '',
        vod_remarks: t(c.tag || ''),
        ext: { id: String(c.id) },
    };
}

async function getConfig() {
    let tabs = FALLBACK_TABS;
    const s = await fetchJson(API);
    if (s && Array.isArray(s.class) && s.class.length) {
        tabs = s.class.map((r) => ({ name: t(r.type_name), ext: { tid: String(r.type_id) } }));
    }
    return jsonify({ ver: 1, title: 'Avdb', site: 'https://avdbapi.com', tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = ext.tid || '';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = `${API}?t=${encodeURIComponent(tid)}&ac=detail&pg=${page}`;
    const n = await fetchJson(url);
    const list = (n && Array.isArray(n.list) ? n.list : []).map(toCard);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const info = await fetchJson(`${API}?ac=detail&ids=${encodeURIComponent(id)}`);
        const item = info && Array.isArray(info.list) && info.list[0] ? info.list[0] : null;
        if (item && item.episodes) {
            try {
                const eps = typeof item.episodes === 'string' ? JSON.parse(item.episodes) : item.episodes;
                const serverData = eps.server_data || eps;
                for (const k of Object.keys(serverData)) {
                    const v = serverData[k];
                    const link = (v && (v.link_embed || v.link)) || '';
                    if (!link) continue;
                    const html = await fetchText(link);
                    if (!html) continue;
                    let m = html.match(/"m3u8"\s*:\s*"((?:https?:)?\\?\/\\?\/[^"]+?\.m3u8[^"]*)"/);
                    if (m && m[1]) {
                        let playUrl = m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                        if (playUrl.startsWith('//')) playUrl = 'https:' + playUrl;
                        tracks.push({ name: t(item.name) || '播放', pan: '', ext: { url: playUrl } });
                        break;
                    }
                    m = html.match(/m3u8\s*:\s*"((\/play\/token_hash\?hash=[^"]+))"/);
                    if (m && m[1]) {
                        try {
                            const playUrl = new URL(link).origin + m[1];
                            tracks.push({ name: t(item.name) || '播放', pan: '', ext: { url: playUrl } });
                        } catch (e) {}
                        break;
                    }
                }
            } catch (e) {}
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = t(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    // 与猫源一致：helvid 分片查 Referer，必须用 avdbapi.com（用 helvid.com 会 403）
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: 'https://avdbapi.com/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${API}?ac=detail&wd=${encodeURIComponent(wd)}&pg=${page}`;
    const n = await fetchJson(url);
    const list = (n && Array.isArray(n.list) ? n.list : []).map(toCard);
    return jsonify({ list });
}
