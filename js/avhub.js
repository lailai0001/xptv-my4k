// AvHub - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/avhub.js（py_avhub）
// 站点 https://avhub360.com（GET×3：列表/详情/搜索），封面走 bagua-img-proxy Worker 解密
// （封面原图为 AES-128-CBC 加密图，解密在 Worker 内完成，模块侧只做域名镜像替换+拼代理地址，同猫版）。
// 降级项：猫版播放走本地 /proxy/m3u8 代理（修正 m3u8 的 text/plain Content-Type + fangzhou 型
// /media 抽奖重抽最多 5 次），XPTV 无本地代理位，无法移植；getPlayinfo 直返 /media/{code} 地址
// （302 跳 m3u8 或 200 直出 m3u8），待真机验 XPTV 播放器对该地址的跟随与 CT 容忍度。
const SITE = 'https://avhub360.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const REFERER = SITE + '/';
const IMG_PROXY = 'https://bagua-img-proxy.li768435813.workers.dev/img?url=';

// 分类：first = 第1页路径；tpl = 第2页起路径模板（{p} 为页码）
const CATS = [
    { tid: 'new', name: '最新发布', first: '/new', tpl: '/new/{p}' },
    { tid: 'today', name: '今日热门', first: '/popular/today', tpl: '/popular/today/{p}' },
    { tid: 'popular', name: '热门', first: '/popular', tpl: '/popular/week/{p}' },
    { tid: 'theme:3', name: '中文字幕', first: '/theme/detail/3', tpl: '/theme/detail/3/update/{p}' },
    { tid: 'theme:11', name: '高清无码', first: '/theme/detail/11/hot', tpl: '/theme/detail/11/hot/{p}' },
    { tid: 'theme:58', name: 'AI短剧', first: '/theme/detail/58', tpl: '/theme/detail/58/update/{p}' },
    { tid: 'tag:171', name: '少女', first: '/tags/171', tpl: '/tags/171/latest/{p}' },
    { tid: 'tag:182', name: '中出', first: '/tags/182', tpl: '/tags/182/latest/{p}' },
    { tid: 'tag:170', name: '巨乳', first: '/tags/170', tpl: '/tags/170/latest/{p}' },
    { tid: 'tag:172', name: '颜射', first: '/tags/172', tpl: '/tags/172/latest/{p}' },
    { tid: 'tag:231', name: '人妻', first: '/tags/231', tpl: '/tags/231/latest/{p}' },
    { tid: 'tag:167', name: '短发', first: '/tags/167', tpl: '/tags/167/latest/{p}' },
    { tid: 'tag:146', name: '丝袜', first: '/tags/146', tpl: '/tags/146/latest/{p}' },
    { tid: 'tag:179', name: '口爆', first: '/tags/179', tpl: '/tags/179/latest/{p}' },
    { tid: 'tag:212', name: '出轨', first: '/tags/212', tpl: '/tags/212/latest/{p}' },
    { tid: 'tag:201', name: '3P', first: '/tags/201', tpl: '/tags/201/latest/{p}' },
    { tid: 'tag:181', name: '乳交', first: '/tags/181', tpl: '/tags/181/latest/{p}' },
    { tid: 'tag:164', name: '美腿', first: '/tags/164', tpl: '/tags/164/latest/{p}' },
    { tid: 'tag:169', name: '熟女', first: '/tags/169', tpl: '/tags/169/latest/{p}' },
    { tid: 'tag:189', name: '痴女', first: '/tags/189', tpl: '/tags/189/latest/{p}' },
    { tid: 'tag:151', name: '校服', first: '/tags/151', tpl: '/tags/151/latest/{p}' },
    { tid: 'tag:176', name: '潮吹', first: '/tags/176', tpl: '/tags/176/latest/{p}' },
    { tid: 'tag:185', name: '调教', first: '/tags/185', tpl: '/tags/185/latest/{p}' },
    { tid: 'tag:180', name: '口交', first: '/tags/180', tpl: '/tags/180/latest/{p}' },
    { tid: 'tag:197', name: '多P', first: '/tags/197', tpl: '/tags/197/latest/{p}' },
    { tid: 'tag:199', name: '凌辱', first: '/tags/199', tpl: '/tags/199/latest/{p}' },
    { tid: 'tag:178', name: '接吻', first: '/tags/178', tpl: '/tags/178/latest/{p}' },
    { tid: 'tag:217', name: 'NTR', first: '/tags/217', tpl: '/tags/217/latest/{p}' },
    { tid: 'tag:149', name: '渔网', first: '/tags/149', tpl: '/tags/149/latest/{p}' },
];

const appConfig = {
    ver: 1,
    title: 'AvHub',
    site: SITE,
    tabs: CATS.map((c) => ({ name: c.name, ext: { tid: c.tid, first: c.first, tpl: c.tpl } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }

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
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.7',
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

// 封面解密出图：走 bagua-img-proxy Worker（同猫版）。Worker 域名白名单未放行 image.cpckgr.cn，
// cpckgr 与 pic.jtzatly.cn 是同路径镜像，先换域名再拼 Worker 地址。
function picProxy(pic) {
    pic = t(pic);
    if (!pic) return pic;
    if (/workers\.dev/i.test(pic)) return pic;
    if (!/cpckgr\.cn/i.test(pic)) return pic;
    const swapped = pic.replace(/^[a-z]+:\/\/[^/]*cpckgr\.cn/i, 'https://pic.jtzatly.cn');
    return IMG_PROXY + encodeURIComponent(swapped);
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

function parseCards(html) {
    const out = [];
    const seen = new Set();
    const re = /<a\s[^>]*href="(\/videos\/[A-Za-z0-9\-_]+)"[^>]*data-mv-id[^>]*>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        const code = m[1].replace('/videos/', '');
        if (seen.has(code)) continue;
        seen.add(code);
        const win = html.slice(m.index, m.index + 2500);
        const imgM = win.match(/<img[^>]+>/);
        let pic = '';
        let title = '';
        if (imgM) {
            const tag = imgM[0];
            const ds = tag.match(/data-src="([^"]+)"/);
            const zl = tag.match(/z-image-loader-url="([^"]+)"/);
            const sc = tag.match(/\ssrc="([^"]+)"/);
            pic = (ds && ds[1]) || (zl && zl[1]) || (sc && sc[1]) || '';
            const altM = tag.match(/alt="([^"]*)"/);
            if (altM) title = clean(altM[1]).replace(/\s*\?>+\s*$/, '').trim();
        }
        if (!title) title = code.toUpperCase();
        out.push({
            vod_id: SITE + '/videos/' + code,
            vod_name: title,
            vod_pic: picProxy(fixUrl(pic)),
            vod_remarks: '',
            ext: { id: SITE + '/videos/' + code },
        });
    }
    return out;
}

function codeFromId(id) {
    id = t(id);
    if (!id) return '';
    if (id.includes('$')) id = id.split('$').pop().trim();
    const m = id.match(/\/videos\/([A-Za-z0-9\-_]+)/);
    if (m) return m[1];
    const mm = id.match(/\/media\/([A-Za-z0-9\-_]+)/);
    if (mm) return mm[1];
    return id.replace(/^\/+|\/+$/g, '');
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const cat = CATS.find((c) => c.tid === t(ext.tid)) || CATS[0];
    const url = page > 1 && cat.tpl ? SITE + cat.tpl.replace('{p}', String(page)) : SITE + cat.first;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const code = codeFromId(ext.id);
    if (!code) return jsonify({ list: [] });
    const durl = SITE + '/videos/' + code;
    const html = await getHtml(durl);
    if (!html) return jsonify({ list: [] });
    return jsonify({ list: buildGroups('AvHub', '正片$' + SITE + '/media/' + code) });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const header = { 'User-Agent': UA, 'Referer': REFERER };
    const code = codeFromId(ext.id);
    if (!code) return jsonify({ urls: [], headers: [header] });
    // 猫版此处返回本地 /proxy/m3u8 代理地址由代理实时解析 /media；XPTV 无本地代理位，
    // 直返 /media 地址（见文件头降级说明）。
    return jsonify({ urls: [SITE + '/media/' + code], headers: [header] });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = SITE + '/search/' + encodeURIComponent(wd);
    if (page > 1) url += '/' + page;
    const html = await getHtml(url);
    return jsonify({ list: html ? parseCards(html) : [] });
}
