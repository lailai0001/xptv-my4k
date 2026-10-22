// porn吃瓜网 - XPTV csp 格式（csp_porncgw）
// 转换自 mira-cat nodejs/src/spider/video/porncgw.js（py_porncgw）。站点 https://porncgw.com。
// 封面 pic.drleao.cn 为 AES 加密图，猫版的 bagua-img-proxy Worker 前缀原样保留。
// 播放：主链为详情/分集页 SSR JSON 内嵌已签名 videoSrc 直出（parse:0 等价）；取不到时猫版落 parse:1 嗅探页面本身，
// XPTV 无嗅探位，降级为回页面 URL —— 嗅探型播放降级：回源页 URL，待真机验 XPTV 是否嗅探非媒体 URL。
// 猫版搜索的 searchBaseCache 跨调用缓存按规范禁忌去掉：page>1 时重新请求搜索入口读跳转后 tag 基址再拼页（无跨调用状态）。
const cheerio = createCheerio();

const HOST = 'https://porncgw.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';

// 站内导航 21 个分类（同猫版）；最新更新 = 首页无服务端分页，只出第一页
const CATS = [
    { type_id: 'latest', type_name: '最新更新', path: '/' },
    { type_id: 'list', type_name: '短视频', path: '/list/' },
    { type_id: 'long-video', type_name: '长视频', path: '/long-video/' },
    { type_id: 'today', type_name: '今日吃瓜', path: '/today/' },
    { type_id: 'recommend', type_name: '推荐吃瓜', path: '/recommend/' },
    { type_id: 'hot-cgbd', type_name: '吃瓜榜单', path: '/hot/cgbd/' },
    { type_id: 'hot-whhl', type_name: '网红黑料', path: '/hot/whhl/' },
    { type_id: 'hot-snsf', type_name: '熟女少妇', path: '/hot/snsf/' },
    { type_id: 'hot-xsxy', type_name: '学生校园', path: '/hot/xsxy/' },
    { type_id: 'ent-cgtq', type_name: '出轨偷情', path: '/entertainment/cgtq/' },
    { type_id: 'ent-zplc', type_name: '自拍流出', path: '/entertainment/zplc/' },
    { type_id: 'door-jiudian', type_name: '酒店', path: '/door/jiudian/' },
    { type_id: 'door-chezhen', type_name: '车震', path: '/door/chezhen/' },
    { type_id: 'shrd-ylbg', type_name: '娱乐八卦', path: '/shrd/ylbg/' },
    { type_id: 'shrd-wybl', type_name: '网友爆料', path: '/shrd/wybl/' },
    { type_id: 'ntxl', type_name: '女同系列', path: '/ntxl/' },
    { type_id: 'omxl', type_name: '欧美系列', path: '/omxl/' },
    { type_id: 'jqyy', type_name: '剧情演绎', path: '/jqyy/' },
    { type_id: 'yzcm', type_name: '亚洲传媒', path: '/yzcm/' },
    { type_id: 'ai-aidj', type_name: 'AI短剧', path: '/ai/aidj/' },
    { type_id: 'ai-aimj', type_name: 'AI漫剧', path: '/ai/AImj/' },
];

const appConfig = {
    ver: 1,
    title: 'porn吃瓜网',
    site: HOST,
    tabs: CATS.map(c => ({ name: c.type_name, ext: { tid: c.type_id } })),
};

function t(v) {
    return String(v == null ? '' : v).trim();
}

function decodeHtml(s) {
    return t(s)
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

function headers(referer) {
    return {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': referer || HOST + '/',
    };
}

async function getHtml(url, referer) {
    try {
        const { data } = await $fetch.get(url, { headers: headers(referer) });
        if (typeof data === 'string' && data) return data;
        if (data) return String(data);
    } catch (e) {}
    return '';
}

function absUrl(u) {
    u = t(u);
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.indexOf('//') === 0) return 'https:' + u;
    if (u.charAt(0) === '/') return HOST + u;
    return HOST + '/' + u;
}

// 封面统一走 Worker 解密（原样保留猫版拼法）
function proxyCover(imgUrl) {
    imgUrl = absUrl(decodeHtml(imgUrl));
    if (!imgUrl) return '';
    if (imgUrl.indexOf('bagua-img-proxy') >= 0) return imgUrl;
    return IMG_PROXY + encodeURIComponent(imgUrl);
}

// 解析列表卡片：先用 cheerio 结构化取 article.card（同猫版语义），失败回退猫版正则原文逻辑
function parseCards(html) {
    const out = [];
    const seen = new Set();
    if (!html) return out;
    try {
        const $ = cheerio.load(html);
        $('article.card').each((i, el) => {
            const $el = $(el);
            const href = $el.find('a.card-link').attr('href') || '';
            const path = href.match(/\/(?:video|drama)\/\d+\//) ? href : '';
            if (!path || seen.has(path)) return;
            const img = $el.find('img').attr('data-src') || '';
            if (!img) return;
            seen.add(path);
            let name = $el.attr('data-title') || '';
            if (!name) name = ($el.find('img').attr('alt') || '').replace(/视频封面$/, '');
            name = decodeHtml(name);
            const time = $el.attr('data-time') || '';
            const views = $el.attr('data-views') || '';
            out.push({
                vod_id: path,
                vod_name: name || path,
                vod_pic: proxyCover(img),
                vod_remarks: time || (views && views !== '0' ? views + '播放' : ''),
                ext: { id: path },
            });
        });
        if (out.length) return out;
    } catch (e) {}
    // 回退：猫版正则原文
    const re = /<article[^>]*class="card video-card"[^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        const tag = m[0];
        const end = html.indexOf('</article>', m.index);
        const body = end > m.index ? html.slice(m.index, end) : html.slice(m.index, m.index + 3000);
        const hrefM = body.match(/<a[^>]*class="card-link"[^>]*href="([^"]+)"/i) || body.match(/href="(\/(?:video|drama)\/\d+\/)"/i);
        if (!hrefM) continue;
        const path = hrefM[1];
        if (seen.has(path)) continue;
        const imgM = body.match(/<img[^>]*data-src="([^"]+)"/i);
        if (!imgM) continue;
        seen.add(path);
        const titleM = tag.match(/data-title="([^"]*)"/);
        const timeM = tag.match(/data-time="([^"]*)"/);
        const viewsM = tag.match(/data-views="([^"]*)"/);
        let name = titleM ? decodeHtml(titleM[1]) : '';
        if (!name) {
            const altM = body.match(/<img[^>]*alt="([^"]+)"/i);
            if (altM) name = decodeHtml(altM[1]).replace(/视频封面$/, '');
        }
        const time = timeM ? t(timeM[1]) : '';
        const views = viewsM ? t(viewsM[1]) : '';
        out.push({
            vod_id: path,
            vod_name: name || path,
            vod_pic: proxyCover(imgM[1]),
            vod_remarks: time || (views && views !== '0' ? views + '播放' : ''),
            ext: { id: path },
        });
    }
    return out;
}

function catOf(tid) {
    return CATS.find(c => c.type_id === tid) || CATS[0];
}

function catUrl(cat, page) {
    if (cat.type_id === 'latest' || page <= 1) return HOST + cat.path;
    return HOST + cat.path + page + '/';
}

// 取详情页 SSR JSON 里的字符串字段（同猫版 jsonStr）
function jsonStr(html, key) {
    const m = String(html || '').match(new RegExp('"' + key + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"'));
    if (!m) return '';
    return m[1]
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = catOf(t(ext.tid) || 'latest');
    const html = await getHtml(catUrl(cat, page));
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = Array.isArray(ext.id) ? ext.id[0] : ext.id;
    let path = t(raw);
    const idm = path.match(/\/(video|drama)\/\d+(?:\/\d+)?\//);
    if (idm) path = idm[0];
    if (!/^\/(video|drama)\/\d+\/$/.test(path)) {
        const dm = path.match(/^\/drama\/(\d+)\/\d+\/$/);
        if (dm) path = '/drama/' + dm[1] + '/';
        else return jsonify({ list: [] });
    }
    const html = await getHtml(HOST + path);
    if (!html) return jsonify({ list: [] });
    const tracks = [];
    if (path.indexOf('/drama/') === 0) {
        const id = path.match(/\/drama\/(\d+)\//)[1];
        const nums = new Set();
        const re = new RegExp('href="/drama/' + id + '/(\\d+)/"', 'g');
        let m;
        while ((m = re.exec(html)) !== null) nums.add(parseInt(m[1], 10));
        const eps = [...nums].sort((a, b) => a - b);
        if (!eps.length) eps.push(1);
        for (const n of eps) {
            tracks.push({ name: `第${n}集`, pan: '', ext: { id: `/drama/${id}/${n}/`, flag: 'porn吃瓜网' } });
        }
    } else {
        tracks.push({ name: '正片', pan: '', ext: { id: path, flag: 'porn吃瓜网' } });
    }
    return jsonify({ list: [{ title: 'porn吃瓜网', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let id = t(ext.id);
    if (id.includes('$')) id = id.split('$').pop().trim();
    if (/\.m3u8(\?|$)/i.test(id)) {
        return jsonify({ urls: [id], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
    }
    const mm = id.match(/\/(video|drama)\/\d+(?:\/\d+)?\//);
    const path = mm ? mm[0] : id;
    if (!path || path.charAt(0) !== '/') return jsonify({ urls: [], headers: [] });
    const pageUrl = HOST + path;
    const html = await getHtml(pageUrl, HOST + '/');
    const src = jsonStr(html, 'videoSrc') || jsonStr(html, 'videoSrcHevc');
    if (src && /^https?:\/\//i.test(src)) {
        return jsonify({ urls: [src], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
    }
    // 兜底（猫版 parse:1 嗅探页面本身）: XPTV 无嗅探位，降级回页面 URL
    return jsonify({ urls: [pageUrl], headers: [{ 'User-Agent': UA, 'Referer': HOST + '/' }] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    // 搜索常 301 跳 /tag/{slug}/ 页：$fetch 跟随跳转但不暴露最终地址，
    // 第 1 页直接解析；page>1 时从第 1 页的分页链接反推 tag 基址再拼页（同猫版反推分支，无跨调用缓存）
    if (page > 1) {
        const firstHtml = await getHtml(HOST + '/search/' + encodeURIComponent(wd) + '/');
        const pm = firstHtml.match(/href="(\/tag\/[^/]+\/)\d+\/"/);
        if (pm) {
            const html = await getHtml(HOST + pm[1] + page + '/');
            return jsonify({ list: parseCards(html) });
        }
        return jsonify({ list: parseCards(firstHtml) });
    }
    const html = await getHtml(HOST + '/search/' + encodeURIComponent(wd) + '/');
    return jsonify({ list: parseCards(html) });
}
