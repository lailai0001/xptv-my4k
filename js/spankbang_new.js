// Eporner - XPTV csp 格式 (csp_spankbang_new)
// 转换自 mira-cat nodejs/src/spider/video/spankbang_new.js（py_spankbang_new，文件名沿用 spankbang，内容实为 Eporner）。
// 站点 https://www.eporner.com，无站外依赖。播放只保留 720P 及以下 mp4 直链（同猫源：高清多为 AV1，iOS 播不了）。
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const HOST = 'https://www.eporner.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'Eporner',
    site: HOST,
    tabs: [
        { name: '日本', ext: { tid: '/cat/japanese/' } },
        { name: '肛交', ext: { tid: '/cat/anal/' } },
        { name: 'POV', ext: { tid: '/cat/pov-porn/' } },
        { name: '印度', ext: { tid: '/cat/indian/' } },
        { name: 'MILF', ext: { tid: '/cat/milf/' } },
        { name: 'Hentai', ext: { tid: '/cat/hentai/' } },
        { name: 'BBW', ext: { tid: '/cat/bbw/' } },
        { name: '菲律宾', ext: { tid: '/cat/pinay/' } },
        { name: '业余', ext: { tid: '/cat/amateur/' } },
        { name: '亚洲', ext: { tid: '/cat/asian/' } },
        { name: '少女', ext: { tid: '/cat/teen/' } },
        { name: '巨乳', ext: { tid: '/cat/big-tits/' } },
        { name: '口交', ext: { tid: '/cat/blowjob/' } },
        { name: '内射', ext: { tid: '/cat/creampie/' } },
        { name: '3P', ext: { tid: '/cat/threesome/' } },
        { name: '女同', ext: { tid: '/cat/lesbian/' } },
        { name: '按摩', ext: { tid: '/cat/massage/' } },
        { name: '黑人', ext: { tid: '/cat/ebony/' } },
        { name: '拉丁', ext: { tid: '/cat/latina/' } },
    ],
};

function reqHeaders(referer) {
    return {
        'User-Agent': UA,
        Referer: referer || HOST + '/',
        Cookie: 'age_verified=1',
    };
}

async function getHtml(url) {
    try {
        const { data } = await $fetch.get(url, { headers: reqHeaders() });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseList(html) {
    const list = [];
    if (!html) return list;
    const $ = cheerio.load(html);
    $('div.mb.hdy').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('p.mbtit a').first();
        const href = $a.attr('href') || '';
        const title = $a.text().trim() || $el.find('div.mbimg img').attr('alt') || '';
        if (!href || !title) return;
        const pic = $el.find('div.mbimg img').attr('src') || '';
        const quality = $el.find('div.mvhdico span').text().trim() || '';
        const duration = $el.find('div.mvtime').text().trim() || '';
        list.push({
            vod_id: href,
            vod_name: title,
            vod_pic: pic.startsWith('http') ? pic : (pic ? 'https:' + pic : ''),
            vod_remarks: [quality, duration].filter(Boolean).join(' '),
            ext: { id: href },
        });
    });
    return list;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || '/cat/japanese/');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url = HOST + tid;
    if (page > 1) url += page + '/';
    const html = await getHtml(url);
    return jsonify({ list: parseList(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const vid = String(ext.id || '').trim();
    const tracks = [];
    if (vid) {
        const url = vid.startsWith('http') ? vid : HOST + vid;
        let html = '';
        try {
            const { data } = await $fetch.get(url, { headers: reqHeaders(HOST + '/') });
            html = typeof data === 'string' ? data : String(data || '');
        } catch (e) {}
        if (html) {
            const quals = [];
            const seen = {};
            const re = /(\/dload\/[^"']+\.mp4)/g;
            let m;
            while ((m = re.exec(html)) !== null) {
                const dl = m[1];
                if (seen[dl]) continue;
                seen[dl] = 1;
                const qm = dl.match(/\/(\d+)\/[^/]*-(\d+)p/);
                const qnum = qm ? parseInt(qm[2], 10) : 0;
                if (qnum > 720) continue;
                const q = qm ? qm[2] + 'P' : 'MP4';
                quals.push({ q: qnum, name: q, url: HOST + dl });
            }
            quals.sort((a, b) => b.q - a.q);
            for (const x of quals) tracks.push({ name: x.name, pan: '', ext: { id: x.url, flag: 'Eporner' } });
        }
    }
    return jsonify({ list: [{ title: 'Eporner', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.id || ext.url || '').trim();
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: HOST + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    let url = `${HOST}/tag/${encodeURIComponent(wd)}/`;
    if (page > 1) url += page + '/';
    const html = await getHtml(url);
    return jsonify({ list: parseList(html) });
}
