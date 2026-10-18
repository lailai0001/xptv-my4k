// 51吃瓜 - XPTV csp 格式
// 转换自 CatPawOpen py_51chigua，站点 https://bus.yutwjhms.cc
// 封面为 AES-128-CBC 加密，走 Cloudflare Worker 解密代理
const cheerio = createCheerio();

const IMG_PROXY = 'https://51chigua.li768435813.workers.dev/img?url=';
function proxyImgUrl(imgUrl) {
    if (!imgUrl) return imgUrl;
    if (imgUrl.includes('pic.ndhixj.cn')) {
        return IMG_PROXY + encodeURIComponent(imgUrl);
    }
    return imgUrl;
}

const appConfig = {
    ver: 1,
    title: '51吃瓜',
    site: 'https://bus.yutwjhms.cc',
    tabs: [
        { name: '今日吃瓜', ext: { url: '/category/wpcz/' } },
        { name: '热门大瓜', ext: { url: '/category/rdsj/' } },
        { name: '必看大瓜', ext: { url: '/category/bkdg/' } },
        { name: '吃瓜榜单', ext: { url: '/category/mrdg/' } },
        { name: '51剧场', ext: { url: '/category/51djc/' } },
        { name: 'AI成人短剧', ext: { url: '/category/cbdj/' } },
        { name: '成人视频', ext: { url: '/category/ysyl/' } },
        { name: '国产视频', ext: { url: '/category/gcjq/' } },
        { name: '探花精选', ext: { url: '/category/thjx/' } },
        { name: '网黄合集', ext: { url: '/category/whhj/' } },
        { name: '网红黑料', ext: { url: '/category/whhl/' } },
        { name: '明星爆料', ext: { url: '/category/whmx/' } },
        { name: '学生校园', ext: { url: '/category/xsxy/' } },
        { name: '海外吃瓜', ext: { url: '/category/hwcg/' } },
        { name: '人人吃瓜', ext: { url: '/category/rrcg/' } },
        { name: '领导干部', ext: { url: '/category/ldcg/' } },
        { name: '伦理道德', ext: { url: '/category/lldd/' } },
        { name: '骚男骚女', ext: { url: '/category/snsn/' } },
        { name: '软萌甜妹', ext: { url: '/category/jpll/' } },
        { name: '竞技吃瓜', ext: { url: '/category/sjb/' } },
        { name: '吃瓜看戏', ext: { url: '/category/qubk/' } },
        { name: '擦边撩骚', ext: { url: '/category/dcbq/' } },
        { name: '性爱技巧', ext: { url: '/category/zzs/' } },
        { name: '每日大赛', ext: { url: '/category/mrds/' } },
        { name: '原创博主', ext: { url: '/category/yczq/' } },
        { name: '吃瓜新闻', ext: { url: '/category/cgxw/' } },
    ],
};

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function headers() {
    return { 'User-Agent': UA, Referer: appConfig.site + '/' };
}

function clean(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ').trim();
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return appConfig.site + (u.startsWith('/') ? u : '/' + u);
}

async function httpGet(url) {
    try {
        const { data } = await $fetch.get(url, { headers: headers() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseList(html) {
    const result = [];
    const seen = new Set();
    if (!html) return result;
    const articleRe = /<article\b[\s\S]*?<\/article>/g;
    let am;
    while ((am = articleRe.exec(html)) !== null) {
        const block = am[0];
        const hm = block.match(/href="\/archives\/(\d+)\//);
        if (!hm) continue;
        const vid = hm[1];
        if (seen.has(vid)) continue;
        seen.add(vid);
        const tm = block.match(/post-card-title"[^>]*>([\s\S]*?)<\/h2>/);
        const name = tm ? clean(tm[1]) : '';
        if (!name) continue;
        let pic = '';
        const pm = block.match(/<img[^>]+src="([^"]+)"/);
        if (pm) pic = absUrl(pm[1]);
        let remarks = '';
        const dm = block.match(/<time[^>]*>([^<]+)<\/time>/);
        if (dm) remarks = clean(dm[1]);
        result.push({
            vod_id: vid,
            vod_name: name,
            vod_pic: proxyImgUrl(pic),
            vod_remarks: remarks,
            ext: { url: `${appConfig.site}/archives/${vid}/` },
        });
    }
    return result;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = ext.page || 1;
    const base = (ext.url || '/category/wpcz/').replace(/\/$/, '');
    const url = page <= 1 ? `${appConfig.site}${base}/` : `${appConfig.site}${base}/${page}/`;
    const html = await httpGet(url);
    const cards = parseList(html);
    return jsonify({ list: cards });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const detailUrl = ext.url || '';
    const html = await httpGet(detailUrl);
    const tracks = [];
    const seen = new Set();
    if (html) {
        const pat = /class="dplayer"[^>]*data-video_title="([^"]*)"[^>]*data-config='(\{[\s\S]*?\})'/g;
        let dm;
        while ((dm = pat.exec(html)) !== null) {
            const epName = clean(dm[1]) || '正片';
            try {
                const cfg = JSON.parse(dm[2]);
                const vurl = cfg.video || cfg.url || cfg.src || '';
                if (vurl && !seen.has(vurl)) {
                    seen.add(vurl);
                    tracks.push({ name: epName, pan: '', ext: { url: vurl } });
                }
            } catch (e) {}
        }
        if (!tracks.length) {
            const vm = [...html.matchAll(/"(https?:\/\/[^"]+\.(?:m3u8|mp4)[^"]*)"/g)].map((x) => x[1]);
            for (const v of vm) {
                if (!seen.has(v)) {
                    seen.add(v);
                    tracks.push({ name: '正片', pan: '', ext: { url: v } });
                }
            }
        }
    }
    return jsonify({
        list: [{ title: '在线播放', tracks }],
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = ext.url || '';
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: appConfig.site + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const kw = encodeURIComponent(ext.text || '');
    const page = ext.page || 1;
    if (!kw) return jsonify({ list: [] });
    const url = page <= 1
        ? `${appConfig.site}/search/${kw}/`
        : `${appConfig.site}/search/${kw}/${page}/`;
    const html = await httpGet(url);
    const cards = parseList(html);
    return jsonify({ list: cards });
}
