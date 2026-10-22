// 123AV - XPTV csp 格式 (csp_av123)
// 转换自 mira-cat nodejs/src/spider/video/av123.js（py_av123），站点 https://123av.com，无站外依赖、无嗅探（GET×2：详情页 + /stream 接口换 m3u8）。
// detail 阶段逐线路串行 resolve 到 m3u8（同猫源）；resolve 不到时 track 带 embed 地址，getPlayinfo 再实时 resolve。
const HOST = 'https://123av.com';
const LANG = 'cn';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36';

const appConfig = {
    ver: 1,
    title: '123AV',
    site: HOST,
    tabs: [
        { name: '新发布', ext: { tid: 'new' } },
        { name: '热门', ext: { tid: 'hot' } },
        { name: '最近更新', ext: { tid: 'recent' } },
        { name: '有码', ext: { tid: 'censored' } },
        { name: '无码', ext: { tid: 'uncensored' } },
        { name: '无码泄露', ext: { tid: 'uncensored-leaked' } },
        { name: '类别', ext: { tid: 'genres' } },
        { name: '女演员', ext: { tid: 'actresses' } },
        { name: '制作商', ext: { tid: 'makers' } },
        { name: '系列', ext: { tid: 'series' } },
    ],
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function reqHeaders() {
    return {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        Referer: HOST + '/' + LANG + '/',
    };
}

async function fetchHtml(path) {
    const url = path.startsWith('http') ? path : HOST + path;
    try {
        const { data } = await $fetch.get(url, { headers: reqHeaders() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function cfBlocked(html) {
    return html.indexOf('Just a moment') >= 0 || html.indexOf('cf-browser-verification') >= 0;
}

function hiResCover(url) {
    url = t(url);
    if (!url) return '';
    return url.replace(/\/s360\//, '/s1080/');
}

function parseList(html) {
    const items = [];
    const seen = {};
    const re = /<a class="card__link" href="(\/(?:cn|en)\/v\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html))) {
        const link = m[1];
        if (seen[link]) continue;
        seen[link] = 1;
        let title = t(m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' '));
        if (!title) title = link.split('/').pop();
        let pic = '';
        let dur = '';
        const windowStart = Math.max(0, m.index - 1200);
        const chunk = html.slice(windowStart, m.index + 20);
        const im = chunk.match(/class="card__img"[^>]+src="([^"]+)"|src="([^"]+)"[^>]+class="card__img"/);
        if (im) pic = im[1] || im[2] || '';
        if (!pic) {
            const im2 = chunk.match(/(?:src|data-src)="(https?:\/\/[^"]+\/(?:s360|s500|s1080)\/[^"]+)"/i);
            if (im2) pic = im2[1];
        }
        const dm = chunk.match(/class="card__dur"[^>]*>([^<]+)</);
        if (dm) dur = t(dm[1]);
        items.push({
            vod_id: 'javxx:' + link,
            vod_name: title,
            vod_pic: hiResCover(pic),
            vod_remarks: dur,
            ext: { id: 'javxx:' + link },
        });
    }
    if (!items.length) {
        const re2 = /href="(\/(?:cn|en)\/v\/[^"]+)"[\s\S]{0,400}?class="card__img"[^>]+src="([^"]+)"/gi;
        while ((m = re2.exec(html))) {
            if (seen[m[1]]) continue;
            seen[m[1]] = 1;
            items.push({
                vod_id: 'javxx:' + m[1],
                vod_name: m[1].split('/').pop(),
                vod_pic: hiResCover(m[2]),
                vod_remarks: '',
                ext: { id: 'javxx:' + m[1] },
            });
        }
    }
    if (!items.length) {
        const re3 = /class="card__cover"[^>]*href="(\/(?:cn|en)\/v\/[^"]+)"[\s\S]{0,500}?class="card__img"[^>]+src="([^"]+)"/gi;
        while ((m = re3.exec(html))) {
            if (seen[m[1]]) continue;
            seen[m[1]] = 1;
            items.push({
                vod_id: 'javxx:' + m[1],
                vod_name: m[1].split('/').pop(),
                vod_pic: hiResCover(m[2]),
                vod_remarks: '',
                ext: { id: 'javxx:' + m[1] },
            });
        }
    }
    return items;
}

function unescapeJsonish(s) {
    s = String(s || '');
    s = s.replace(/\\u0022/g, '"').replace(/\\u0027/g, "'");
    s = s.replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>');
    let prev;
    do {
        prev = s;
        s = s.replace(/\\\//g, '/');
    } while (s !== prev);
    return s;
}

function extractEmbeds(html) {
    const embeds = [];
    const m = html.match(/player\(\s*JSON\.parse\(\s*(['"])([\s\S]*?)\1\s*\)/);
    if (m) {
        const s = unescapeJsonish(m[2]);
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) {
                arr.forEach((it) => {
                    if (it && it.url) {
                        const u = unescapeJsonish(String(it.url));
                        let nm = t(it.name);
                        if (!nm || /^\d+$/.test(nm)) nm = '线路' + (embeds.length + 1);
                        embeds.push({ name: nm, url: u });
                    }
                });
            }
        } catch (e) {}
    }
    if (!embeds.length) {
        const em2 = html.match(/https?:\/\/[^"'\\\s]+\/e\/[A-Za-z0-9]+/g) || [];
        em2.forEach((u, i) => {
            embeds.push({ name: '线路' + (i + 1), url: unescapeJsonish(u) });
        });
    }
    return embeds;
}

function playHeadersForEmbed(embedUrl) {
    embedUrl = t(embedUrl);
    let origin = 'https://jav-master-52.site';
    const m = embedUrl.match(/^(https?:\/\/[^/]+)/);
    if (m) origin = m[1];
    return {
        'User-Agent': UA,
        Referer: origin + '/',
        Origin: origin,
        Accept: '*/*',
    };
}

async function resolveStream(embedUrl) {
    embedUrl = t(embedUrl);
    if (!embedUrl) return '';
    const idm = embedUrl.match(/\/e\/([A-Za-z0-9]+)/);
    if (!idm) return '';
    const eid = idm[1];
    const originM = embedUrl.match(/^(https?:\/\/[^/]+)/);
    const origin = originM ? originM[1] : '';
    const streamApi = origin + '/stream?id=' + encodeURIComponent(eid);
    try {
        const { data } = await $fetch.get(streamApi, {
            headers: {
                'User-Agent': UA,
                Accept: 'application/json, text/plain, */*',
                Referer: embedUrl,
                Origin: origin,
            },
        });
        let body = data;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { return ''; }
        }
        return t((body && body.media && body.media.stream) || (body && body.stream) || '');
    } catch (e) {
        return '';
    }
}

function parsePath(vodId) {
    let link = t(vodId);
    if (link.indexOf('javxx:') === 0) link = link.slice(6);
    if (link.indexOf('http') === 0) {
        const m = link.match(/https?:\/\/[^/]+(\/.*)/);
        if (m) link = m[1];
    }
    return link;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'new');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const path = '/' + LANG + '/' + tid;
    const urlPath = page > 1 ? path.replace(/\/$/, '') + '?page=' + page : path;
    const html = await fetchHtml(urlPath);
    if (!html || cfBlocked(html)) return jsonify({ list: [] });
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const path = parsePath(ext.id || '');
    const tracks = [];
    if (path) {
        const html = await fetchHtml(path);
        if (html && !cfBlocked(html)) {
            const embeds = extractEmbeds(html);
            let streamUrl = '';
            let embedOrigin = '';
            let usedEmbed = null;
            for (const e of embeds) {
                const s = await resolveStream(e.url);
                if (s) {
                    streamUrl = s;
                    const om = String(e.url).match(/^(https?:\/\/[^/]+)/);
                    embedOrigin = om ? om[1] : '';
                    usedEmbed = e;
                    break;
                }
            }
            if (streamUrl) {
                tracks.push({ name: '播放', pan: '', ext: { url: streamUrl, origin: embedOrigin, flag: '123AV' } });
            } else {
                for (const e of embeds) {
                    tracks.push({ name: e.name, pan: '', ext: { embed: e.url, flag: '123AV' } });
                }
            }
            void usedEmbed;
        }
    }
    return jsonify({ list: [{ title: '123AV', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    // 已 resolve 的 m3u8
    if (ext.url) {
        const url = t(ext.url);
        const origin = t(ext.origin);
        const header = origin
            ? { 'User-Agent': UA, Referer: origin + '/', Origin: origin, Accept: '*/*' }
            : { 'User-Agent': UA, Referer: HOST + '/' + LANG + '/' };
        return jsonify({ urls: url ? [url] : [], headers: [header] });
    }
    const embedUrl = t(ext.embed || ext.id || '');
    if (!embedUrl) return jsonify({ urls: [], headers: [] });
    if (/\.m3u8(\?|$)/i.test(embedUrl)) {
        return jsonify({
            urls: [embedUrl],
            headers: [{ 'User-Agent': UA, Referer: HOST + '/' + LANG + '/' }],
        });
    }
    const stream = await resolveStream(embedUrl);
    if (!stream) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [stream], headers: [playHeadersForEmbed(embedUrl)] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const path = '/' + LANG + '/search?keyword=' + encodeURIComponent(wd) + (page > 1 ? '&page=' + page : '');
    const html = await fetchHtml(path);
    if (!html || cfBlocked(html)) return jsonify({ list: [] });
    return jsonify({ list: parseList(html) });
}
