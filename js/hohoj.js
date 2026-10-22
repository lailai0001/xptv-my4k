// HoHoJ - XPTV csp 格式（csp_hohoj）
// 转换自 mira-cat nodejs/src/spider/video/hohoj.js（py_hohoj）。站点 https://hohoj.tv（自建站）。
// 播放：主链为详情页 embed 页内 videoSrc m3u8 直出（parse:0 等价）；embed 解析失败时猫版落 parse:1 嗅探 embed 页，
// XPTV 无嗅探位，降级为回 embed 页 URL —— 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// 取数由猫版 req+fetch 双通道收敛为 $fetch 单通道。

const SITE = 'https://hohoj.tv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const SECTIONS = [
    { type_id: 's_latest', type_name: '最新', type: 'all', order: 'latest' },
    { type_id: 's_popular', type_name: '熱門', type: 'all', order: 'popular' },
    { type_id: 's_censored', type_name: '有碼', type: 'censored', order: 'latest' },
    { type_id: 's_uncensored', type_name: '無碼', type: 'uncensored', order: 'latest' },
    { type_id: 's_chinese', type_name: '中文字幕', type: 'chinese', order: 'latest' },
    { type_id: 's_europe', type_name: '歐美', type: 'europe', order: 'latest' },
];

const MAIN_CTG = [
    [1, '絲襪美腿'], [2, '強姦凌辱'], [3, '主奴調教'], [4, '制服誘惑'],
    [5, '多P群交'], [6, '角色劇情'], [7, '出軌'], [8, '亂倫'],
    [9, '巨乳美乳'], [10, '潮吹放尿'], [11, '走後門'], [12, '內射受孕'],
];

// 详情页收割的真标签 (id, 名称)，猫版抽验 /ctg 页均有 24 条/页
const TAGS = [
    [1, 'DMM獨家'], [2, '中出'], [4, '單體作品'], [5, '戲劇'], [6, '數位馬賽克'],
    [8, '高畫質'], [10, '口交'], [11, '巨乳'], [13, '乳交'], [18, '人妻'],
    [19, '成熟的女人'], [21, '已婚婦女'], [26, '白人'], [28, '凌辱'], [31, '自慰'],
    [34, '苗條'], [39, 'OL'], [40, '通姦'], [46, '打手槍'], [47, '深喉'],
    [54, '婆婆'], [61, '連褲襪'], [64, '業餘'], [65, '痴女'], [69, '女教師'],
    [73, '淫語'], [75, '乳房'], [91, '按摩棒'], [93, '處女'], [100, '無毛'],
    [103, '混血'], [108, '1080p'], [111, '吞精'], [116, '角色扮演'], [119, '69'],
    [120, '舔陰'], [123, '手淫'], [126, '口內射精'], [129, '美腿'], [136, '美人'],
    [138, '60fps'], [139, 'AV女優'], [141, '美臀'], [163, '肛交'], [181, '4K'],
    [193, '野外'], [197, '按摩'], [223, '黑髮'], [224, '教師'], [249, '國外進口'],
    [270, '女職員'], [281, '無套'], [286, '束縛'], [330, '浴衣和服'],
];

// 首页精选女優 (id, 名称)
const MODELS = [
    [404, '素人'], [41, '三上悠亞'], [43, '波多野結衣'], [93, '北野未奈'],
    [990, '凪光'], [44, '篠田優'], [342, 'JULIA'], [586, '河北彩花'],
    [19, '楓可憐'], [1002, '森澤佳奈'], [63, '深田詠美'], [47, '飯岡加奈子'],
];

const CATS = [
    ...SECTIONS.map(s => ({ ...s, kind: 'search' })),
    ...MAIN_CTG.map(([id, name]) => ({ type_id: 'c_' + id, type_name: name, kind: 'main', cid: id })),
    ...TAGS.map(([id, name]) => ({ type_id: 't_' + id, type_name: name, kind: 'tag', cid: id })),
    ...MODELS.map(([id, name]) => ({ type_id: 'm_' + id, type_name: name, kind: 'model', cid: id })),
];

const appConfig = {
    ver: 1,
    title: 'HoHoJ',
    site: SITE,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/\s+/g, ' ');
}

async function getHtml(url) {
    const headers = { 'User-Agent': UA, 'Referer': REFERER, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };
    try {
        const { data, status } = await $fetch.get(url, { headers });
        if ((status === undefined || status === 200) && typeof data === 'string' && data) return data;
        if (typeof data === 'string' && data) return data;
    } catch (e) {}
    return '';
}

// 解析列表卡片 (列表页/搜索通用)，与猫版 parseCards 同逻辑，card 追加 ext
function parseCards(html) {
    const out = [];
    const seen = new Set();
    const blocks = String(html || '').split('<div class="video-item ');
    for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const idM = b.match(/href="\/video\?id=(\d+)"/);
        if (!idM) continue;
        const id = idM[1];
        if (seen.has(id)) continue;
        seen.add(id);
        let pic = '';
        const picM = b.match(/<img[^>]+src="(https?:\/\/[^"]+\/media\/video\/[^"]+)"/);
        if (picM) pic = picM[1];
        let title = '';
        const tM = b.match(/video-item-title[^>]*>([^<]+)</);
        if (tM) title = clean(tM[1]);
        if (!title) {
            const altM = b.match(/<img[^>]+alt="([^"]*)"/);
            if (altM) title = clean(altM[1]);
        }
        let remarks = '';
        const vM = b.match(/fa-eye"[^>]*><\/i>\s*<span[^>]*>([^<]+)<\/span>/);
        if (vM) remarks = clean(vM[1]) + ' 播放';
        out.push({ vod_id: id, vod_name: title || id, vod_pic: pic, vod_remarks: remarks, ext: { id } });
    }
    return out;
}

function catOf(tid) {
    return CATS.find(c => c.type_id === String(tid)) || CATS[0];
}

function catUrl(cat, page) {
    page = Math.max(1, page || 1);
    if (cat.kind === 'search') return `${SITE}/search?type=${cat.type}&order=${cat.order}&p=${page}`;
    if (cat.kind === 'main') return `${SITE}/main_ctg?id=${cat.cid}&p=${page}`;
    if (cat.kind === 'tag') return `${SITE}/ctg?id=${cat.cid}&p=${page}`;
    return `${SITE}/model?id=${cat.cid}&p=${page}`;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid) || 's_latest';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = catOf(tid);
    const html = await getHtml(catUrl(cat, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    const idm = id.match(/id=(\d+)/) || id.match(/^(\d+)$/);
    if (idm) id = idm[1];
    if (!id) return jsonify({ list: [] });
    // 猫版 detail 校验详情页可达后产出单集「正片${id}」；此处同口径
    const html = await getHtml(`${SITE}/video?id=${id}`);
    if (!html) return jsonify({ list: [] });
    const tracks = [{ name: '正片', pan: '', ext: { id, flag: '正片' } }];
    return jsonify({ list: [{ title: '正片', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (id.includes('$')) id = id.split('$').pop().trim();
    const idm = id.match(/id=(\d+)/) || id.match(/^(\d+)$/) || id.match(/(\d+)/);
    if (!idm) return jsonify({ urls: [], headers: [] });
    const vid = idm[1];
    const eurl = `${SITE}/embed?id=${vid}`;
    const html = await getHtml(eurl);
    if (html) {
        const m = html.match(/videoSrc\s*=\s*"(https?:\/\/[^"]+?\.m3u8)"/) || html.match(/<video[^>]+src="(https?:\/\/[^"]+?\.m3u8)"/);
        if (m) {
            const url = m[1].replace(/ /g, '%20');
            return jsonify({ urls: [url], headers: [{ 'User-Agent': UA, 'Referer': eurl }] });
        }
    }
    // 兜底（猫版 parse:1 嗅探 embed 页）: XPTV 无嗅探位，降级回 embed 页 URL
    return jsonify({ urls: [eurl], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${SITE}/search?text=${encodeURIComponent(wd)}&p=${page}`;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
