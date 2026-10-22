// 91成人短剧 - XPTV csp 格式（csp_91duanju）
// 转换自 mira-cat nodejs/src/spider/video/91duanju.js（py_91duanju），站点 https://91crdj.com
// 列表/详情/播放页 GET 直抓，播放页正则提取 m3u8 直出；提取不到时回播放页 URL 走嗅探兜底（同猫版 parse:1）。
// 封面 bagua-img-proxy 前缀原样保留。
// 嗅探型播放降级：回源页 URL，待真机验
const HOST = 'https://91crdj.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev';

const CATS = [
    ['duanju', '成人短剧'], ['manju', '成人漫剧'], ['zhenrenju', '真人剧'], ['shipin', '成人视频'],
    ['manhua', '成人漫画'], ['xiaoshuo', '成人小说'], ['paihang', '热播榜'], ['biaoqian', '标签榜'],
    ['biaoqian/ntr', 'NTR'], ['biaoqian/fancha', '反差'], ['biaoqian/cabian', '擦边'],
];

const appConfig = {
    ver: 1,
    title: '91成人短剧',
    site: HOST,
    tabs: CATS.map(([tid, name]) => ({ name, ext: { tid } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function proxyCover(url) {
    const u = t(url);
    if (!u || !u.startsWith('http')) return u;
    return IMG_PROXY + '/img?url=' + encodeURIComponent(u);
}

function isVideoFormat(url) {
    const low = String(url || '').toLowerCase();
    return ['.m3u8', '.mp4', '.flv', '.ts'].some((k) => low.includes(k));
}

async function fetchHtml(url, referer) {
    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9',
                'Referer': referer || HOST + '/',
            },
        });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseList(html) {
    const items = [];
    if (!html) return items;
    const seen = {};
    const cardRe = /<a[^>]*\bclass\s*=\s*["'][^"']*\bcard\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = cardRe.exec(html))) {
        const tag = m[0];
        const block = m[1];
        const hm = tag.match(/href\s*=\s*["']([^"']+)["']/i);
        if (!hm) continue;
        const href = t(hm[1]);
        let p = href;
        try {
            const u = new URL(href, HOST);
            p = u.pathname;
        } catch (e) {}
        const seg = p.split('/').filter(Boolean);
        if (seg.length < 2) continue;
        const channel = seg[0];
        const vid = seg[1];
        if (seen[vid]) continue;

        let title = '';
        for (const attr of ['data-track-item-name', 'alt', 'title']) {
            const tm = (tag + block).match(new RegExp(attr + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
            if (tm && t(tm[1])) {
                title = t(tm[1]);
                break;
            }
        }
        if (!title) {
            const tm = block.match(/<span[^>]*class="[^"]*p-title[^"]*"[^>]*>([\s\S]*?)<\/span>/);
            if (tm) title = t(tm[1].replace(/<[^>]+>/g, ''));
        }
        if (!title) title = vid;

        let cover = '';
        for (const attr of ['data-original', 'data-src', 'data-echo', 'data-url']) {
            const im = block.match(new RegExp(attr + '\\s*=\\s*["\']([^"\']+)["\']', 'i'));
            if (im) {
                cover = t(im[1]);
                break;
            }
        }
        if (!cover) {
            const im = block.match(/<img[^>]*?(?<![\w-])src\s*=\s*["']([^"']+)["']/i);
            if (im) cover = t(im[1]);
        }
        const low = cover.toLowerCase();
        if (['data:', 'load.gif', 'loading.gif', 'placeholder'].some((b) => low.includes(b))) cover = '';
        if (cover.startsWith('//')) cover = 'https:' + cover;
        else if (cover.startsWith('/')) cover = HOST + cover;

        let remarks = '';
        const rm = block.match(/<span[^>]*class="[^"]*(?:badge|eps-flag)[^"]*"[^>]*>([\s\S]*?)<\/span>/);
        if (rm) remarks = t(rm[1].replace(/<[^>]+>/g, ''));

        seen[vid] = 1;
        const vodId = channel + '|' + p;
        items.push({
            vod_id: vodId,
            vod_name: title,
            vod_pic: proxyCover(cover),
            vod_remarks: remarks,
            ext: { id: vodId },
        });
    }
    return items;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'duanju');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = page > 1 ? HOST + '/' + tid + '/page/' + page + '/' : HOST + '/' + tid + '/';
    const html = await fetchHtml(url, HOST + '/');
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const rawStr = t(ext.id);
    if (!rawStr) return jsonify({ list: [] });
    let path = rawStr;
    if (rawStr.includes('|')) {
        path = rawStr.split('|').slice(1).join('|');
    }
    const url = path.startsWith('http') ? path : HOST + path;
    const html = await fetchHtml(url, HOST + '/');
    if (!html) return jsonify({ list: [] });

    const playUrls = [];
    const seen = {};
    const basePath = path.replace(/\/$/, '');
    const epRe = /href=["']([^"']+)["'][^>]*>\s*(\d+)\s*</g;
    let em;
    while ((em = epRe.exec(html))) {
        let href = t(em[1]);
        const epNo = t(em[2]);
        if (basePath && href.includes(basePath)) {
            if (href.startsWith('/')) href = HOST + href;
            if (seen[href]) continue;
            seen[href] = 1;
            playUrls.push('第' + epNo + '集$' + href);
        }
    }
    if (!playUrls.length) {
        const pmRe = /href=["']([^"']*(?:\/play\/|-\d+-\d+\.html)[^"']*)["']/g;
        while ((em = pmRe.exec(html))) {
            let href = t(em[1]);
            if (href.startsWith('/')) href = HOST + href;
            else if (!href.startsWith('http')) continue;
            if (seen[href]) continue;
            seen[href] = 1;
            playUrls.push('播放$' + href);
        }
    }
    const tracks = playUrls.map((s) => {
        const idx = s.indexOf('$');
        return {
            name: idx >= 0 ? s.slice(0, idx) : s,
            pan: '',
            ext: { id: idx >= 0 ? s.slice(idx + 1) : s, flag: '91成人短剧' },
        };
    });
    return jsonify({ list: [{ title: '91成人短剧', tracks: tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const raw = t(ext.id);
    if (!raw) return jsonify({ urls: [], headers: [] });
    if (isVideoFormat(raw)) {
        return jsonify({ urls: [raw], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
    }
    const html = await fetchHtml(raw, HOST + '/');
    if (!html) {
        return jsonify({ urls: [raw], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
    }
    let m3u8Url = '';
    let m = html.match(/"current"\s*:\s*\{[^{}]*"src"\s*:\s*"([^"]+)"/);
    if (m) m3u8Url = m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
    if (!m3u8Url) {
        for (const v of ['player_aaaa', 'player_data']) {
            const vm = html.match(new RegExp(v + '\\s*=\\s*(\\{[^;]*\\})'));
            if (vm) {
                try {
                    const data = JSON.parse(vm[1]);
                    m3u8Url = data.url || data.link || '';
                    if (m3u8Url) break;
                } catch (e) {}
            }
        }
    }
    if (!m3u8Url) {
        const um = html.match(/(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)[^\s"'<>\\]*)/);
        if (um) m3u8Url = um[1];
    }
    if (m3u8Url) {
        if (m3u8Url.startsWith('//')) m3u8Url = 'https:' + m3u8Url;
        else if (m3u8Url.startsWith('/')) m3u8Url = HOST + m3u8Url;
        return jsonify({ urls: [m3u8Url], headers: [{ 'User-Agent': UA, 'Referer': raw }] });
    }
    return jsonify({ urls: [raw], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = HOST + '/search/?q=' + encodeURIComponent(wd);
    if (page > 1) url += '&page=' + page;
    const html = await fetchHtml(url);
    return jsonify({ list: parseList(html) });
}
