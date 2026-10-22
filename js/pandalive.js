// PandaLive - XPTV csp 格式（csp_pandalive）
// 转换自 mira-cat nodejs/src/spider/video/pandalive.js（py_pandalive）。
// 站点 https://5721004.xyz（数据端点），直播列表 list.json + list.m3u 两次 GET 直出流，无站外依赖。
const HOST = 'https://5721004.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = {
    'User-Agent': UA,
    'Referer': 'https://www.pandalive.co.kr/',
    'Origin': 'https://www.pandalive.co.kr',
};
const PAGE_SIZE = 30;

const appConfig = {
    ver: 1,
    title: 'PandaLive',
    site: HOST,
    tabs: [
        { name: '🐼 PandaTV', ext: { tid: 'pandalive' } },
    ],
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

async function fetchJsonData() {
    try {
        const { data } = await $fetch.get(`${HOST}/player/list.json`, { headers: HEADERS });
        const obj = typeof data === 'object' && data ? data : JSON.parse(String(data || '{}'));
        const rawList = obj.list || [];
        return rawList.map((item) => {
            const userId = item.userId || '';
            const nick = item.userNick || '未知主播';
            const title = item.title || '无标题';
            const isAdult = !!item.isAdult;
            const isPw = !!item.isPw;
            const vType = item.type || '';
            return {
                vod_id: `live_${userId}`,
                vod_name: `📺 ${nick}`,
                vod_pic: item.thumbUrl || 'https://tupian.li/images/2024/03/30/660769b1ba623.png',
                vod_remarks: `👤 ${item.user || 0} ${isAdult ? '🔞' : ''}`,
                vod_content: title,
                vod_actor: userId,
                _isAdult: isAdult,
                _isPw: isPw,
                _type: vType,
                _user_count: item.user || 0,
                _score: item.totalScoreCnt || 0,
                _bookmark: item.bookmarkCnt || 0,
            };
        });
    } catch (e) {
        return [];
    }
}

function cleanCard(v) {
    return {
        vod_id: v.vod_id,
        vod_name: v.vod_name,
        vod_pic: v.vod_pic,
        vod_remarks: v.vod_remarks,
        vod_content: v.vod_content,
        vod_actor: v.vod_actor,
        ext: { id: v.vod_id },
    };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const filtered = await fetchJsonData();
    filtered.sort((a, b) => b._user_count - a._user_count);
    const start = (page - 1) * PAGE_SIZE;
    const pageList = start < filtered.length ? filtered.slice(start, start + PAGE_SIZE) : [];
    return jsonify({ list: pageList.map(cleanCard) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const firstId = t(ext.id);
    const userId = firstId.replace(/^live_/, '');
    if (!userId) return jsonify({ list: [] });
    let streamUrl = '';
    try {
        const { data } = await $fetch.get(`${HOST}/player/list.m3u`, { headers: HEADERS });
        const text = typeof data === 'string' ? data : String(data || '');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(`,${userId},`) && i + 1 < lines.length) {
                streamUrl = t(lines[i + 1]);
                break;
            }
        }
        if (!streamUrl) {
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(userId) && i + 1 < lines.length) {
                    streamUrl = t(lines[i + 1]);
                    break;
                }
            }
        }
    } catch (e) {}
    const proxies = [
        'https://hubu.515355.xyz/proxy/?',
        'https://flank.515355.xyz/proxy/',
        'https://uae2.515355.xyz/proxy/',
        'https://pol.515355.xyz/proxy/',
        'https://f00.515355.xyz/proxy/',
        'https://ce2.515355.xyz/proxy/?',
    ];
    const tracks = [{ name: '直连', pan: '', ext: { id: streamUrl, flag: 'PandaLive' } }];
    proxies.forEach((p, i) => tracks.push({ name: `代理${i + 1}`, pan: '', ext: { id: `${p}${streamUrl}`, flag: 'PandaLive' } }));
    return jsonify({ list: [{ title: 'PandaLive', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = t(ext.id);
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [url], headers: [HEADERS] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text).toLowerCase();
    if (!wd) return jsonify({ list: [] });
    const all = await fetchJsonData();
    const res = all
        .filter((v) => v.vod_name.toLowerCase().includes(wd) || v.vod_actor.toLowerCase().includes(wd))
        .slice(0, 50)
        .map(cleanCard);
    return jsonify({ list: res });
}
