// MissAV(XPTV版) - XPTV csp 格式 (csp_missav_xptv)
// 转换自 mira-cat nodejs/src/spider/video/missav_xptv.js（py_missav_xptv）；该猫蜘蛛本就是 XPTV 源转入，本模块按原契约回转。
// 站点 https://missav.fans（源内注释：missav.ai 不通，用户已确认 missav.fans 可用）；播放为 surrit CDN 的 playlist.m3u8 多清晰度直链，无站外依赖。
// cheerio 经 createCheerio() 取得（本地 harness 已验写法，运行时待真机验）。
const cheerio = createCheerio();

const HOST = 'https://missav.fans';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

const M3U8_PREFIXES = [
    'https://surrit.mrstcdn.store/',
    'https://surrit.com/',
];
const M3U8_SUFFIX = '/playlist.m3u8';

const appConfig = {
    ver: 1,
    title: 'MissAV(XPTV版)',
    site: HOST,
    tabs: [
        { name: '中文字幕', ext: { tid: 'dm265/cn/chinese-subtitle' } },
        { name: '最近更新', ext: { tid: 'dm513/cn/new' } },
        { name: '新作上市', ext: { tid: 'dm509/cn/release' } },
        { name: '无码流出', ext: { tid: 'dm561/cn/uncensored-leak' } },
        { name: 'VR', ext: { tid: 'dm2091/cn/genres/VR' } },
        { name: '今日热门', ext: { tid: 'dm242/cn/today-hot' } },
        { name: '本周热门', ext: { tid: 'dm168/cn/weekly-hot' } },
        { name: '本月热门', ext: { tid: 'dm207/cn/monthly-hot' } },
        { name: 'SIRO', ext: { tid: 'dm23/cn/siro' } },
        { name: 'LUXU', ext: { tid: 'dm20/cn/luxu' } },
        { name: 'GANA', ext: { tid: 'dm17/cn/gana' } },
        { name: 'PRESTIGE PREMIUM', ext: { tid: 'dm14/cn/maan' } },
        { name: 'S-CUTE', ext: { tid: 'dm23/cn/scute' } },
        { name: 'ARA', ext: { tid: 'dm19/cn/ara' } },
        { name: 'FC2', ext: { tid: 'dm95/cn/fc2' } },
        { name: 'HEYZO', ext: { tid: 'dm628/cn/heyzo' } },
        { name: '东京热', ext: { tid: 'dm29/cn/tokyohot' } },
        { name: '一本道', ext: { tid: 'dm58345/cn/1pondo' } },
        { name: 'Caribbeancom', ext: { tid: 'dm124158/cn/caribbeancom' } },
        { name: 'Caribbeancompr', ext: { tid: 'dm1442/cn/caribbeancompr' } },
        { name: '10musume', ext: { tid: 'dm58632/cn/10musume' } },
        { name: 'pacopacomama', ext: { tid: 'dm668/cn/pacopacomama' } },
        { name: 'Gachinco', ext: { tid: 'dm135/cn/gachinco' } },
        { name: 'XXX-AV', ext: { tid: 'dm26/cn/xxxav' } },
        { name: '人妻斩', ext: { tid: 'dm24/cn/marriedslash' } },
        { name: '顽皮 4610', ext: { tid: 'dm19/cn/naughty4610' } },
        { name: '顽皮 0930', ext: { tid: 'dm22/cn/naughty0930' } },
        { name: '麻豆传媒', ext: { tid: 'dm34/cn/madou' } },
        { name: 'TWAV AV', ext: { tid: 'dm17/cn/twav' } },
        { name: 'Furuke AV', ext: { tid: 'dm15/cn/furuke' } },
        { name: '有码', ext: { tid: 'cn/censored' } },
        { name: '无码', ext: { tid: 'cn/uncensored' } },
    ],
};

function headers(referer) {
    const h = { 'User-Agent': UA };
    if (referer) h['Referer'] = referer;
    return h;
}

async function getHtml(url, referer) {
    try {
        const { data } = await $fetch.get(url, { headers: headers(referer) });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function cleanText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function absUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return HOST + (u.startsWith('/') ? u : '/' + u);
}

function parseCards(html) {
    const cards = [];
    if (!html || html.includes('Just a moment...')) return cards;
    const $ = cheerio.load(html);
    $('.thumbnail').each((_, e) => {
        const el = $(e);
        const href = el.find('.text-secondary').attr('href') || '';
        const title = cleanText(el.find('.text-secondary').text());
        if (!href || !title) return;
        const cover = absUrl(el.find('.w-full').attr('data-src'));
        const remarks = cleanText(el.find('.left-1').text());
        const duration = cleanText(el.find('.right-1').text());
        const url = absUrl(href);
        cards.push({
            vod_id: url,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: [remarks, duration].filter(Boolean).join(' '),
            ext: { id: url },
        });
    });
    return cards;
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = String(ext.tid || 'dm265/cn/chinese-subtitle');
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = `${HOST}/${tid}?page=${page}&sort=released_at`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const detailUrl = absUrl(String(ext.id || ''));
    const tracks = [];
    if (detailUrl) {
        const html = await getHtml(detailUrl);
        const match = html.match(/surrit(?:\.com|\.mrstcdn\.store)\\\/([^"\\]+)\\\/seek\\\/_0\.jpg/);
        if (match && match[1]) {
            const uuid = match[1];
            for (const prefix of M3U8_PREFIXES) {
                try {
                    const { data } = await $fetch.get(prefix + uuid + M3U8_SUFFIX, { headers: headers(detailUrl) });
                    const lines = String(data || '').split('\n');
                    const qs = [];
                    lines.filter((line) => line.includes('/video.m3u8')).forEach((line) => {
                        const name = line.replace('/video.m3u8', '').trim() || '正片';
                        qs.unshift({ name, pan: '', ext: { url: `${prefix}${uuid}/${line.trim()}` } });
                    });
                    if (qs.length) {
                        for (const q of qs) tracks.push(q);
                        tracks.push({ name: '自动', pan: '', ext: { url: prefix + uuid + M3U8_SUFFIX } });
                        break;
                    }
                } catch (e) { /* 换下一个域名重试 */ }
            }
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
        headers: [{ 'User-Agent': UA, Referer: HOST + '/' }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    const wd = String(ext.text || '').trim();
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${HOST}/cn/search/${encodeURIComponent(wd)}?page=${page}`;
    const html = await getHtml(url);
    return jsonify({ list: parseCards(html) });
}
