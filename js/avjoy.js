// AVJOY - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/avjoy.js（py_avjoy）
// 站点 https://avjoy.me（GET×1），无站外依赖；
// 播放：media-cdn3 直链（token 实时变化，getPlayinfo 实时重拉详情页解析 <source>，同猫版）。
const SITE = 'https://avjoy.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
    { type_id: 'jav', type_name: 'JAV・日本AV' },
    { type_id: 'china', type_name: 'China・中國' },
    { type_id: 'asian', type_name: 'Asian・アジア' },
    { type_id: 'japan', type_name: 'Japan・日本' },
    { type_id: 'uncensored', type_name: 'Uncensored・無修正' },
    { type_id: 'pornstar', type_name: 'Pornstar·AV女優' },
    { type_id: 'big-tits', type_name: 'Big Tits・巨乳' },
    { type_id: 'amateur', type_name: 'Amateur・素人' },
    { type_id: 'korea', type_name: 'Korea・韓国' },
    { type_id: 'anime', type_name: 'Anime・アニメ' },
    { type_id: 'schoolgirl', type_name: 'Schoolgirl・女子校生' },
    { type_id: 'teen', type_name: 'Teen・少女' },
    { type_id: 'mature', type_name: 'Mature・熟女' },
    { type_id: 'wife', type_name: 'Wife・人妻' },
    { type_id: 'cosplay', type_name: 'Cosplay・コスプレ' },
    { type_id: 'anal', type_name: 'Anal・肛交' },
    { type_id: 'sm', type_name: 'SM' },
];

const TAGS = [
    { type_id: 'tag_中文字幕', type_name: '中文字幕' },
    { type_id: 'tag_口交', type_name: '口交' },
    { type_id: 'tag_潮吹', type_name: '潮吹' },
    { type_id: 'tag_舔穴', type_name: '舔穴' },
    { type_id: 'tag_中出內射', type_name: '中出內射' },
    { type_id: 'tag_國產av', type_name: '國產av' },
    { type_id: 'tag_台灣', type_name: '台灣' },
    { type_id: 'tag_自拍', type_name: '自拍' },
    { type_id: 'tag_無碼破解', type_name: '無碼破解' },
    { type_id: 'tag_探花', type_name: '探花' },
    { type_id: 'tag_swag', type_name: 'swag' },
    { type_id: 'tag_無碼流出', type_name: '無碼流出' },
    { type_id: 'tag_巨乳', type_name: '巨乳' },
    { type_id: 'tag_制服', type_name: '制服' },
];

const appConfig = {
    ver: 1,
    title: 'AVJOY',
    site: SITE,
    tabs: [
        { name: '全部', ext: { tid: '' } },
        ...CATS.map((c) => ({ name: c.type_name, ext: { tid: c.type_id } })),
        ...TAGS.map((c) => ({ name: '🏷 ' + c.type_name, ext: { tid: c.type_id } })),
    ],
};

function t(v) { return String(v == null ? '' : v).trim(); }

function clean(s) {
    return t(s)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
}

async function getHtml(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7',
        'Referer': REFERER,
    };
    try {
        const { data } = await $fetch.get(url, { headers });
        const s = typeof data === 'string' ? data : '';
        if (s.length > 1000) return s;
        if (data) return typeof data === 'string' ? data : '';
    } catch (e) { /* ignore */ }
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

function mainArea(html) {
    let body = html;
    const i = body.indexOf('well-filters');
    if (i > 0) body = body.slice(i);
    const j = body.indexOf('content-right');
    if (j > 0) body = body.slice(0, j);
    return body;
}

function parseCards(html) {
    const body = mainArea(html || '');
    const out = [];
    const seen = new Set();
    const re = /<a href="\/video\/(\d+)\/[^"]*"/g;
    let m;
    while ((m = re.exec(body)) !== null) {
        const vid = m[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const win = body.slice(m.index, m.index + 2600);
        const imgM = win.match(/<img[^>]+src="([^"]+)"/);
        let titleM = win.match(/class="content-title">([^<]+)</);
        if (!titleM) titleM = win.match(/<img[^>]+title="([^"]*)"/);
        const durM = win.match(/class="duration">([\s\S]*?)<\/div>/);
        const viewsM = win.match(/class="content-views">\s*([^<]*?)\s*<\/span>/);
        let remark = durM ? clean(durM[1]) : '';
        const vs = viewsM ? clean(viewsM[1]) : '';
        if (vs) remark = (remark ? remark + ' · ' : '') + vs;
        out.push({
            vod_id: vid,
            vod_name: titleM ? clean(titleM[1]) : 'AVJOY ' + vid,
            vod_pic: imgM ? imgM[1] : '',
            vod_remarks: remark,
            ext: { id: vid },
        });
    }
    return out;
}

function parseSources(html) {
    const items = [];
    const re = /<source\b[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const srcM = tag.match(/src=["']([^"']+)["']/);
        if (!srcM) continue;
        const u = srcM[1];
        const labM = tag.match(/label=["']([^"']*)["']/);
        const resM = tag.match(/res=["']([^"']*)["']/);
        const q = (labM && labM[1]) || (resM ? resM[1] + 'p' : '') || '默認';
        items.push({ codec: u.includes('/av1/') ? 'AV1' : 'H264', q, u });
    }
    const out = [];
    const seen = new Set();
    for (const codec of ['H264', 'AV1']) {
        for (const it of items) {
            if (it.codec !== codec) continue;
            const label = codec === 'H264' ? it.q : it.q + ' AV1';
            if (seen.has(label)) continue;
            seen.add(label);
            out.push({ label, url: it.u });
        }
    }
    return out;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = t(ext.tid);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url;
    if (tid.startsWith('tag_')) {
        const kw = tid.slice(4);
        url = SITE + '/search/videos/' + encodeURIComponent(kw) + '/1';
        if (page > 1) url += '?page=' + page;
    } else if (tid) {
        url = SITE + '/videos/' + encodeURIComponent(tid);
        if (page > 1) url += '?page=' + page;
    } else {
        url = SITE + '/videos';
        if (page > 1) url += '?page=' + page;
    }
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    id = id.replace(/\D/g, '') || '0';
    const html = await getHtml(SITE + '/video/' + id);
    if (!html) return jsonify({ list: [] });

    let remarks = '';
    const durM = html.match(/itemprop="duration" content="PT(?:(\d+)H)?(\d+)M(\d+)S"/);
    if (durM) {
        const h = durM[1], mi = durM[2], se = durM[3];
        remarks = h ? `${h}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` : `${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}`;
    }

    const sources = parseSources(html);
    const flags = [];
    const urls = [];
    for (const s of sources) {
        flags.push(s.label);
        urls.push(`${remarks || '正片'}$${id}`);
    }
    if (!flags.length) {
        flags.push('AVJOY');
        urls.push(`${remarks || '正片'}$${id}`);
    }
    return jsonify({ list: buildGroups(flags.join('$$$'), urls.join('$$$')) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': REFERER };
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [header] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const vid = id.replace(/\D/g, '') || id;
    // token 每次请求都会变，必须实时重新请求详情页（同猫版）
    const html = await getHtml(SITE + '/video/' + vid);
    if (!html) return jsonify({ urls: [], headers: [header] });
    const sources = parseSources(html);
    if (!sources.length) return jsonify({ urls: [], headers: [header] });
    // 猫版 play 不按 flag 选档，恒取 parseSources 排序后的首个（H264 优先）；此处原样保留
    return jsonify({ urls: [sources[0].url], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search/videos/' + encodeURIComponent(wd) + '/1';
    if (page > 1) url += '?page=' + page;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
