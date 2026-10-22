// JavMost - XPTV csp 格式（csp_javmost）
// 转换自 mira-cat nodejs/src/spider/video/javmost.js（py_javmost），站点 https://www.javmost.ws
// 播放三步：POST /ri3123o235r/（urlencoded 字符串 body + X-Requested-With 头，同猫侧线格式）拿 embed →
// embed 页解析 meta 后 POST JSON 换直链（直出）；解不出直链时回 embed/详情页 URL 走嗅探兜底。
// $fetch.post 待真机验（本地 harness 已实测请求真能通）。
// 嗅探型播放降级：回源页 URL，待真机验
const SITE = 'https://www.javmost.ws';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';

const CATS = [
    ['latest', '最新'], ['all', '全部'], ['censor', '有码'], ['uncensor', '无码'],
    ['search:REDUCING', '无码流出'], ['topview', '小时热门'], ['topdaily', '日热门'],
    ['topweek', '周热门'], ['topmonth', '月热门'],
    ['genre:Big Tits', '巨乳'], ['genre:Creampie', '中出'], ['genre:Married Woman', '人妻'],
    ['genre:School Girls', '学生'], ['genre:Slender', '苗条'], ['genre:Solowork', '独角戏'],
    ['genre:Squirting', '潮吹'], ['genre:Amateur', '素人'], ['genre:Drama', '剧情'], ['genre:Cowgirl', '女上位'],
    ['code:SNIS', 'SNIS系列'], ['code:IPZ', 'IPZ系列'], ['code:JUX', 'JUX系列'], ['code:ABP', 'ABP系列'],
    ['code:SSNI', 'SSNI系列'], ['code:MIDE', 'MIDE系列'], ['code:WANZ', 'WANZ系列'], ['code:STAR', 'STAR系列'],
    ['code:HEYZO', 'HEYZO系列'], ['code:JUC', 'JUC系列'], ['code:JUFD', 'JUFD系列'],
    ['code:LUXU', 'LUXU系列'], ['code:EBOD', 'EBOD系列'], ['code:RBD', 'RBD系列'],
];

const SKIP_SLUGS = new Set([
    'allcategory', 'allcode', 'alldirector', 'allmaker',
    'topview', 'topdaily', 'topweek', 'topweeknew', 'topmonth',
    'pornstar', 'toppornstar', 'votepornstar', 'newpornstar',
    'category', 'tag', 'code', 'search', 'page', '404',
]);

const appConfig = {
    ver: 1,
    title: 'JavMost',
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

function fixPic(u) {
    u = t(u);
    if (!u) return '';
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return SITE + u;
    return u;
}

async function getHtml(url, extraHeaders) {
    const headers = Object.assign({
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
        'Referer': REFERER,
    }, extraHeaders || {});
    for (let i = 0; i < 2; i++) {
        try {
            const { data, status } = await $fetch.get(url, { headers: headers });
            const tx = typeof data === 'string' ? data : (data ? String(data) : '');
            if ((status === undefined || status === 200) && tx) return tx;
        } catch (e) {}
    }
    return '';
}

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\s[^>]*href="(https?:\/\/www\.javmost\.ws\/([A-Za-z0-9\-_]+)\/)"[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const durl = m[1];
        const slug = m[2];
        if (SKIP_SLUGS.has(slug.toLowerCase())) continue;
        if (seen.has(durl)) continue;
        seen.add(durl);
        const win = html.slice(m.index, m.index + 2500);
        const tm = m[0].match(/alt="([^"]+)"/) || win.match(/<h1[^>]*class="card-title[^"]*"[^>]*>([^<]+)</);
        const title = tm ? clean(tm[1]) : slug;
        const im = win.match(/data-src="(https?:\/\/[^"]+)"/) || win.match(/data-src="(\/\/[^"]+)"/);
        out.push({
            vod_id: durl,
            vod_name: title,
            vod_pic: im ? fixPic(im[1]) : '',
            vod_remarks: '',
            ext: { id: durl },
        });
    }
    return out;
}

function catUrl(tid, page) {
    page = Math.max(1, page);
    if (tid.startsWith('tag:')) {
        return SITE + '/tag/' + encodeURIComponent(tid.slice(4)) + '/';
    }
    if (tid.startsWith('search:')) {
        const kw = tid.slice(7);
        if (page <= 1) return SITE + '/search/' + encodeURIComponent(kw) + '/';
        return SITE + '/search/' + encodeURIComponent(kw) + '/page/' + page + '/';
    }
    if (tid.startsWith('genre:')) {
        const slug = tid.slice(6);
        if (page <= 1) return SITE + '/category/' + encodeURIComponent(slug) + '/';
        return SITE + '/category/' + encodeURIComponent(slug) + '/page/' + page + '/';
    }
    if (tid.startsWith('code:')) {
        const code = tid.slice(5);
        if (page <= 1) return SITE + '/code/' + encodeURIComponent(code) + '/';
        return SITE + '/code/' + encodeURIComponent(code) + '/page/' + page + '/';
    }
    if (page <= 1) {
        switch (tid) {
            case 'all': return SITE + '/category/all/';
            case 'censor': return SITE + '/category/censor/';
            case 'uncensor': return SITE + '/category/uncensor/';
            case 'topview': return SITE + '/topview/';
            case 'topdaily': return SITE + '/topdaily/';
            case 'topweek': return SITE + '/topweek/';
            case 'topmonth': return SITE + '/topmonth/';
            default: return SITE + '/';
        }
    }
    switch (tid) {
        case 'latest': return SITE + '/category/all/page/' + page + '/';
        case 'all':
        case 'censor':
        case 'uncensor': return SITE + '/category/' + tid + '/page/' + page + '/';
        case 'topview':
        case 'topdaily':
        case 'topweek':
        case 'topmonth': return SITE + '/' + tid + '/all/page/' + page + '/';
        default: return SITE + '/category/all/page/' + page + '/';
    }
}

function extractYwrz(html) {
    const defs = {};
    const re = /(YWRz\w+)\s*=\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        defs[m[1]] = m[2];
    }
    return defs;
}

function formEncode(obj) {
    return Object.keys(obj).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k]))).join('&');
}

async function fetchEmbedUrl(durl, html) {
    const defs = extractYwrz(html);
    if (!defs.YWRzNA || !defs.YWRzMQo) return '';
    const body = formEncode({
        group: defs.YWRzMg || '62',
        part: '1',
        code: defs.YWRzNA,
        code2: defs.YWRzNQ || '',
        code3: defs.YWRzNg || '',
        value: defs.YWRzMQo,
        sound: 'av',
    });
    try {
        const { data, status } = await $fetch.post(SITE + '/ri3123o235r/', body, {
            headers: {
                'User-Agent': UA,
                'Referer': durl,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
        });
        if ((status === undefined || status === 200) && data) {
            const json = typeof data === 'string' ? JSON.parse(data) : data;
            if (json && json.status === 'success' && json.data && json.data[0]) {
                return t(json.data[0]).replace(/\\\//g, '/');
            }
        }
    } catch (e) {}
    return '';
}

async function resolveEmbedDirect(embedUrl, referer) {
    if (!/dooplayer\.com|mostplayer\.com/i.test(embedUrl)) return '';
    const html = await getHtml(embedUrl, {
        'Referer': referer || REFERER,
        'Sec-Fetch-Dest': 'iframe',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'cross-site',
        'Accept-Language': 'en-US,en;q=0.9',
    });
    if (!html || html.length < 200) return '';
    const meta = (n) => {
        const mm = html.match(new RegExp('<meta[^>]+name=["\']?' + n + '["\']?[^>]*content=["\']?([^"\'>\\s]+)', 'i'))
            || html.match(new RegExp('<meta[^>]+content=["\']?([^"\'>\\s]+)["\']?[^>]*name=["\']?' + n + '["\']?', 'i'));
        return mm ? mm[1] : '';
    };
    const token = meta('x-embed-token');
    const api = meta('x-embed-api');
    const et = meta('x-embed-et');
    const sig = meta('x-embed-sig');
    if (!token || !api || !et || !sig) return '';
    const apiUrl = api.replace(/\/?$/, '') + '/' + token;
    let origin = '';
    try { origin = new URL(embedUrl).origin; } catch (e) {}
    try {
        const { data, status } = await $fetch.post(apiUrl, { ref: origin }, {
            headers: {
                'User-Agent': UA,
                'Referer': embedUrl,
                'Content-Type': 'application/json',
                'X-Embed-Auth': '1',
                'X-Embed-ET': et,
                'X-Embed-SIG': sig,
            },
        });
        if ((status === undefined || status === 200) && data) {
            const json = typeof data === 'string' ? JSON.parse(data) : data;
            if (json && json.ok && json.url && /^https?:\/\//.test(json.url)) return json.url;
        }
    } catch (e) {}
    return '';
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
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/' + id.replace(/^\/+|\/+$/g, '') + '/');
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    const tracks = [{ name: '正片', pan: '', ext: { id: durl, flag: 'JavMost' } }];
    return jsonify({ list: [{ title: 'JavMost', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    if (id.includes('$')) id = id.split('$').pop().trim();
    const durl = /^https?:\/\//.test(id) ? id : (SITE + '/' + id.replace(/^\/+|\/+$/g, '') + '/');
    const html = await getHtml(durl);
    let embedUrl = '';
    if (html) embedUrl = await fetchEmbedUrl(durl, html);
    if (embedUrl && /^https?:\/\//.test(embedUrl)) {
        const direct = await resolveEmbedDirect(embedUrl, durl);
        if (direct) {
            let embedOrigin = '';
            try { embedOrigin = new URL(embedUrl).origin; } catch (e) {}
            return jsonify({
                urls: [direct],
                headers: [{ 'User-Agent': UA, 'Referer': embedUrl, 'Origin': embedOrigin }],
            });
        }
        return jsonify({
            urls: [embedUrl],
            headers: [{ 'User-Agent': UA, 'Referer': durl }],
        });
    }
    return jsonify({
        urls: [durl],
        headers: [{ 'User-Agent': UA, 'Referer': REFERER }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search/' + encodeURIComponent(wd) + '/';
    if (page > 1) url += 'page/' + page + '/';
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
