// Pornhub - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/pornhub.js（py_pornhub，压缩版 py 转写），
// 本模块为其去压缩等价版。站点 https://cn.pornhub.com，无站外依赖；
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const Oc = 'https://cn.pornhub.com';
const HM = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const appConfig = {
    ver: 1,
    title: 'Pornhub',
    site: Oc,
    tabs: [
        { name: 'Home', ext: { o: '' } },
        { name: 'Newest', ext: { o: 'cm' } },
        { name: 'Most Viewed', ext: { o: 'mv' } },
        { name: 'Hottest', ext: { o: 'ht' } },
        { name: 'Top Rated', ext: { o: 'tr' } },
        { name: 'Longest', ext: { o: 'lg' } },
    ],
};

async function G5(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': HM } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function parseCards(html) {
    const list = [];
    if (!html) return list;
    const $ = cheerio.load(html);
    $('li.videoBox').each((i, el) => {
        const d = $(el).find('.phimage a.img').attr('href');
        const f = $(el).find('.title a').attr('title');
        const m = $(el).find('.phimage a.img img').attr('src') || $(el).find('.phimage a.img img').attr('data-mediumthumb') || '';
        const p = $(el).find('.views').text().trim() || '';
        const b = $(el).find('.duration').text().trim() || '';
        if (!d || !f) return;
        list.push({
            vod_id: d,
            vod_name: f,
            vod_pic: m,
            vod_remarks: p,
            vod_duration: b,
            ext: { id: d },
        });
    });
    return list;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const o = ext.o || '';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    let url = `${Oc}/video?`;
    if (o) url += `o=${o}`;
    if (page > 1) url += (o ? '&' : '') + `page=${page}`;
    const html = await G5(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = String(ext.id || '');
    const tracks = [];
    if (id) {
        const html = await G5(Oc + id);
        let videoUrl = '';
        const m = html.match(/var flashvars_.* = \{(.*?)\};/);
        if (m && m[1]) {
            try {
                const defs = JSON.parse('{' + m[1] + '}').mediaDefinitions.filter((x) => x.format === 'hls');
                if (defs.length > 0) videoUrl = defs[defs.length - 1].videoUrl;
            } catch (e) {}
        }
        if (videoUrl) {
            tracks.push({ name: '播放', pan: '', ext: { url: videoUrl } });
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = String(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [url],
        headers: [{ 'User-Agent': HM, origin: Oc, referer: Oc + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${Oc}/video/search?search=${encodeURIComponent(wd)}&page=${page}`;
    const html = await G5(url);
    return jsonify({ list: parseCards(html) });
}
