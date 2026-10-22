// JavHD - XPTV csp 格式（csp_javhd）
// 转换自 mira-cat nodejs/src/spider/video/javhd.js（py_javhd），站点 https://javhd.icu
// 列表/详情 GET 直抓；播放 POST https://{host}/api/stream（JSON 对象 body，同猫侧线格式）换 m3u8。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
const SITE = 'https://javhd.icu';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
    ['latest', '最新'], ['censored', '有码'], ['jav-hd-uncen', '无码'],
    ['jav-hd-engsub', '英字'], ['jav-hd-uncensored-leaked', '无码流出'],
];

const appConfig = {
    ver: 1,
    title: 'JavHD',
    site: SITE,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function clean(s) {
    return t(s)
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ');
}

function fixUrl(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

async function getHtml(url) {
    const headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
        'Referer': REFERER,
    };
    for (let i = 0; i < 2; i++) {
        try {
            const { data, status } = await $fetch.get(url, { headers });
            const tx = typeof data === 'string' ? data : '';
            if ((status === undefined || status === 200) && tx) return tx;
        } catch (e) {}
    }
    return '';
}

async function postJson(url, body, referer) {
    try {
        const { data, status } = await $fetch.post(url, body, {
            headers: {
                'User-Agent': UA,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Referer': referer || REFERER,
                'Origin': SITE,
            },
        });
        if ((status === undefined || status === 200) && data) {
            return typeof data === 'string' ? JSON.parse(data) : data;
        }
    } catch (e) {}
    return null;
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<div class="item-img">\s*<a href="(https?:\/\/javhd\.icu\/video\/[^"]+\/)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const durl = m[1];
        if (seen.has(durl)) continue;
        seen.add(durl);
        const win = html.slice(m.index, m.index + 2000);
        const imgTag = (win.match(/<img[^>]+>/) || [''])[0];
        const srcM = imgTag.match(/\ssrc="([^"]+)"/);
        const altM = imgTag.match(/\salt="([^"]*)"/);
        const pic = srcM ? srcM[1] : '';
        let title = altM ? altM[1] : '';
        if (!title) {
            const h3M = win.match(/class="post-title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/);
            if (h3M) title = h3M[1];
        }
        const name = clean(title) || durl.split('/video/')[1].replace(/\/$/, '');
        out.push({
            vod_id: durl,
            vod_name: name,
            vod_pic: fixUrl(pic),
            vod_remarks: '',
            ext: { id: durl },
        });
    }
    return out;
}

function catUrl(tid, page) {
    let base;
    if (tid === 'latest') base = SITE + '/';
    else base = SITE + '/categories/' + encodeURIComponent(tid) + '/';
    if (page > 1) return base + 'page/' + page + '/';
    return base;
}

function extractPlayer(html) {
    const m = html.match(/<iframe[^>]+src="(https?:\/\/[^"/]+)\/e\/([A-Za-z0-9]+)"[^>]*>/);
    if (m) return { host: m[1], filecode: m[2] };
    const m2 = html.match(/(https?:\/\/[^"/\s]+)\/e\/([A-Za-z0-9]{6,})/);
    if (m2) return { host: m2[1], filecode: m2[2] };
    return null;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'latest');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const html = await getHtml(catUrl(tid, page));
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ list: [] });
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/video/' + id.replace(/^\//, ''));
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    const titleM = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    const name = titleM ? clean(titleM[1]) : durl.split('/video/')[1].replace(/\/$/, '');
    const durM = html.match(/(\d+)\s*min/i);
    const remarks = durM ? durM[1] + '分钟' : '';
    const tracks = [{ name: remarks || '正片', pan: '', ext: { id: durl, flag: 'JavHD' } }];
    // name 仅用于与猫版 detail 对齐的解析校验，不进 track（集名保持干净）
    void name;
    return jsonify({ list: [{ title: 'JavHD', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(id)) {
        return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': REFERER }] });
    }
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/video/' + id.replace(/^\//, ''));
    const html = await getHtml(durl);
    if (!html) return jsonify({ urls: [], headers: [] });
    const player = extractPlayer(html);
    if (!player) return jsonify({ urls: [], headers: [] });
    const apiUrl = player.host.replace(/\/$/, '') + '/api/stream';
    const resp = await postJson(apiUrl, { filecode: player.filecode, device: 'web', codecs: ['h264'] }, durl);
    const streamUrl = resp && resp.streaming_url && /^https?:\/\//.test(resp.streaming_url) ? resp.streaming_url : '';
    if (!streamUrl) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [streamUrl],
        headers: [{ 'User-Agent': UA, 'Referer': player.host + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/?s=' + encodeURIComponent(wd);
    if (page > 1) url = SITE + '/page/' + page + '/?s=' + encodeURIComponent(wd);
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
