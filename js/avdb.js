// Avdb - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/avdb.js（py_avdb），站点 API https://avdbapi.com/api.php/provide/vod
// 无站外依赖；分类由 API 动态返回，getConfig 现拉、失败回退静态兜底。
// 字幕聚合试点（2026-10-23）：getPlayinfo 命中字幕时多带 subs 字段，验证 XPTV 播放器是否渲染该字幕位；详见下方字幕聚合节。
const API = 'https://avdbapi.com/api.php/provide/vod';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/604.1.14 (KHTML, like Gecko)';

const FALLBACK_TABS = [{ name: '全部', ext: { tid: '' } }];

function t(v) {
    return String(v == null ? '' : v).trim();
}

async function fetchJson(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA } });
        if (typeof data === 'string') {
            try { return JSON.parse(data); } catch (e) { return null; }
        }
        return data;
    } catch (e) {
        return null;
    }
}

async function fetchText(url, referer) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA, Referer: referer || 'https://avdbapi.com/' } });
        return typeof data === 'string' ? data : String(data || '');
    } catch (e) {
        return '';
    }
}

function toCard(c) {
    return {
        vod_id: String(c.id),
        vod_name: t(c.name),
        vod_pic: c.poster_url || c.pic || '',
        vod_remarks: t(c.tag || ''),
        ext: { id: String(c.id), name: t(c.name) },
    };
}

// ---------------- 字幕聚合试点 (XPTV 版, 2026-10-23) ----------------
// 本试点只加在 avdb: 验证 XPTV 播放器是否渲染 getPlayinfo 返回的
// subs 字幕位。逻辑与猫源字幕聚合 (Layer A, 已在 MiraPlayer 真机
// 确认可选字幕) 同芯: 按片名/番号并行搜迅雷看看 oracle (首档;
// 「迅雷」与「迅雷看看」实为同一接口) + SubtitleCat (第二档),
// 合并排序 = 来源档位 -> 语言 (简中>繁中>双语>英文>日文>其他)
// -> 番号命中 -> 热度, 只收 .srt/.vtt/.ass/.ssa 直链, 上限 10 条,
// 命中时以 [{name,url,format}] 挂到 getPlayinfo 返回对象。
// XPTV 适配: HTTP 全走 $fetch.get (两源皆 GET, 不依赖未证实的
// $fetch.post); 不用 setTimeout (运行时支持未证实), 时长由单请求
// 超时兜底 (oracle 5s / SubtitleCat 搜索 5s + 字幕页 4s, 两源
// 并行); 不依赖跨调用全局状态 — 片名由 track.ext 从 getTracks
// 带入, 搜索在 getPlayinfo 内一次完成, 失败全静默; 无命中时
// 返回不带 subs 键, 与未接入前逐字一致。SubHD (下载被站方门控
// 403) 与射手 assrt (源站 522 不可达) 不接入, 与猫版口径一致。
// 一处比猫版多的护栏 (照 REX 字幕聚合模块 lai_subtitleagg 的实测
// 结论): oracle 对片名键会模糊召回 (乱码片名里的单个生僻字也能
// 召回无关字幕), 故合并前加相关性闸门 (见 subGate), 保证无真
// 字幕时干净空返 — 否则「无命中逐字一致」不成立。
const SUB_UA = UA;

// subHttp: 与猫版同语义 (状态码不抛错、仅 2xx 给正文), 底层
// $fetch.get; data 已被运行时解析成对象时回序列化成文本。
async function subHttp(url, headers, timeoutMs) {
    try {
        const r = await $fetch.get(url, { headers: headers || {}, timeout: timeoutMs || 10000 });
        const data = r ? r.data : null;
        const body = typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data));
        const status = r && typeof r.status === 'number' ? r.status : (body ? 200 : 0);
        return { status, body: status >= 200 && status < 300 ? body : '' };
    } catch (e) {
        return { status: 0, body: '' };
    }
}

// 番号抽取 (移植自迅雷看看 REX 组件 extractSearchCode 的核心档)
function subExtractCode(text) {
    const s = String(text || '').toUpperCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
    const pats = [
        /\bFC2(?:[- ]?PPV)?[- ]?\d{5,8}\b/,
        /\bCARIB(?:PR)?[- ]?\d{6,8}\b/,
        /\b1PONDO[- ]?\d{6,8}\b/,
        /\bHEYZO[- ]?\d{3,6}\b/,
        /\b[A-Z]{2,10}[- ]\d{2,8}[A-Z]?\b/,
        /\b[A-Z]{2,10}\d{2,8}[A-Z]?\b/,
    ];
    for (const re of pats) {
        const m = s.match(re);
        if (m) return m[0].replace(/\s+/g, '-').replace(/-+/g, '-');
    }
    return '';
}

// 搜索键: 番号 -> 全片名 -> 番号+片名余下词 (与猫版 subKeys 同口径,
// 片名直接取自 track.ext, 不经 detail 登记缓存)
function subKeys(title) {
    const tt = String(title || '').trim();
    const code = subExtractCode(tt);
    const keys = [];
    if (code) keys.push(code);
    if (tt && tt !== code) keys.push(tt);
    if (code && tt) {
        const tp = tt.replace(new RegExp(code.replace(/-/g, '[- ]?'), 'i'), '').replace(/^[\s\-_:]+|[\s\-_:]+$/g, '').trim();
        if (tp && tp.length >= 3) keys.push(code + ' ' + tp);
    }
    return [...new Set(keys)].filter((k) => k.length >= 2).slice(0, 3);
}

// 语言判定: rank 越小越优先 (简中 > 繁中 > 双语 > 英文 > 其他)
function subLangOf(name, langs) {
    const s = (String(name || '') + ' ' + String(langs || '')).toLowerCase();
    if (/简体|简中|chs|zh[-_. ]?cn|zh[-_. ]?hans/.test(s)) return { tag: '简中', rank: 0 };
    if (/繁体|繁中|cht|zh[-_. ]?tw|zh[-_. ]?hk|zh[-_. ]?hant/.test(s)) return { tag: '繁中', rank: 1 };
    if (/双语|中英|中日|bilingual/.test(s)) return { tag: '双语', rank: 2 };
    if (/英文|english|eng|(^|[-_. ])en([-_. ]|$)/.test(s)) return { tag: '英文', rank: 3 };
    if (/日文|日语|japanese|jpn|(^|[-_. ])ja([-_. ]|$)/.test(s)) return { tag: '日文', rank: 4 };
    return { tag: '', rank: 5 };
}

const SUB_TEXT_RE = /\.(srt|vtt|ass|ssa)(\?|#|$)/i;

// 迅雷看看 (兼「迅雷」位, 同一 oracle 接口): 按名搜, 结果即直链。
// 前 2 个键并行查, 每键返回即入 bag, 最终由 subMerge 统一排序。
async function subFromXunlei(keys, code, bag) {
    await Promise.all(keys.slice(0, 2).map(async (key) => {
        const viaCode = code && key === code ? 1 : 0;
        const r = await subHttp('https://api-shoulei-ssl.xunlei.com/oracle/subtitle?name=' + encodeURIComponent(key),
            { 'User-Agent': 'ForwardWidgets/1.0.2', Accept: '*/*' }, 5000);
        if (r.status !== 200 || !r.body) return;
        let j;
        try { j = JSON.parse(r.body); } catch (e) { return; }
        if (!j || Number(j.code) !== 0 || !Array.isArray(j.data)) return;
        for (const it of j.data) {
            if (!it) continue;
            const url = String(it.url || it.Url || '');
            if (!SUB_TEXT_RE.test(url)) continue; // 压缩包/非文本字幕剔除
            const nm = String(it.name || it.Name || '字幕');
            const langs = Array.isArray(it.languages) ? it.languages.join(',') : String(it.langs || it.Langs || '');
            const lang = subLangOf(nm, langs);
            const pop = (Number(it.down_count || it.DownCount || it.downloads || 0) || 0)
                + (Number(it.score || 0) || 0) + (Number(it.fingerprintf_score || it.fingerprint_score || 0) || 0);
            // 个别条目名是裸哈希 (不可读): 显示名换成番号字幕, 匹配/
            // 语言判定仍用原名
            const dispName = /^[0-9a-f]{24,}$/i.test(nm.trim()) ? (code ? code + ' 迅雷字幕' : '迅雷字幕') : nm;
            bag.push({
                src: '迅雷看看', tier: 0, name: dispName, url, lang: lang.tag, langRank: lang.rank,
                codeHit: code && nm.toUpperCase().replace(/[._]/g, ' ').includes(code.replace(/-/g, ' ')) ? 1 : 0, pop, viaCode,
            });
        }
    }));
}

// SubtitleCat: 搜索页 -> 字幕页 -> 按语言分的 .srt 直链 (逐页入 bag)
async function subFromSubtitleCat(keys, code, bag) {
    const key = keys[0];
    if (!key) return;
    const r = await subHttp('https://subtitlecat.com/index.php?search=' + encodeURIComponent(key),
        { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 5000);
    if (r.status !== 200 || !r.body) return;
    const pages = [];
    const seen = new Set();
    for (const m of r.body.matchAll(/href="(subs\/\d+\/[^"]+\.html)"/g)) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        pages.push(m[1]);
        if (pages.length >= 3) break;
    }
    await Promise.all(pages.map(async (p) => {
        const pr = await subHttp('https://subtitlecat.com/' + p, { 'User-Agent': SUB_UA, Referer: 'https://subtitlecat.com/' }, 4000);
        if (pr.status !== 200 || !pr.body) return;
        for (const m of pr.body.matchAll(/href="(\/subs\/\d+\/[^"]+\.(?:srt|vtt|ass))"/gi)) {
            let nm = m[1].split('/').pop() || '字幕';
            try { nm = decodeURIComponent(nm); } catch (e) { /* 保持原样 */ }
            const lang = subLangOf(nm, '');
            bag.push({
                src: 'SubtitleCat', tier: 2, name: nm, url: 'https://subtitlecat.com' + m[1], lang: lang.tag, langRank: lang.rank,
                codeHit: code && nm.toUpperCase().replace(/[._]/g, ' ').includes(code.replace(/-/g, ' ')) ? 1 : 0, pop: 0, viaCode: code ? 1 : 0,
            });
        }
    }));
}

// 合并排序: 来源档位 -> 语言 -> 番号命中 -> 热度; 按 url 与
// (语言|去扩展名文件名) 双键去重; 上限 10 条。
function subMerge(items) {
    const sorted = items.slice().sort((a, b) =>
        (a.tier - b.tier) || (a.langRank - b.langRank) || (b.codeHit - a.codeHit) || (b.pop - a.pop) || String(a.name).localeCompare(String(b.name)));
    const seenUrl = new Set();
    const seenName = new Set();
    const out = [];
    for (const it of sorted) {
        if (seenUrl.has(it.url)) continue;
        const nameKey = it.lang + '|' + it.name.toLowerCase().replace(/\.(srt|vtt|ass|ssa)$/i, '');
        if (seenName.has(nameKey)) continue;
        seenUrl.add(it.url);
        seenName.add(nameKey);
        const ext = (it.url.match(SUB_TEXT_RE) || [])[1].toLowerCase();
        const cleanName = it.name.replace(/\.(srt|vtt|ass|ssa)$/i, '').slice(0, 60);
        out.push({ name: it.src + '·' + (it.lang ? it.lang + '·' : '') + cleanName, url: it.url, format: ext });
        if (out.length >= 10) break;
    }
    return out;
}

// 相关性闸门 (照 REX 版 lai_subtitleagg 实测结论): oracle 对片名
// 键会做模糊匹配 (实测乱码片名里的单个生僻字也能召回无关字幕)。
// 放行条件: 条目出自番号键 (索引精确命中, 含裸哈希名的真字幕),
// 或条目名含番号, 或条目名与片名共享有效词元 (拉丁/数字词 >=3
// 字符, 或汉字串 >=2 字), 或条目名含片名全文 (去标点)。全不
// 满足的丢弃, 保证无真字幕时干净空返。
function subTitleTokens(title) {
    const tt = String(title || '').toLowerCase();
    const toks = [];
    let m;
    const re = /[a-z0-9]+/g;
    while ((m = re.exec(tt)) !== null) if (m[0].length >= 3) toks.push(m[0]);
    const re2 = /[一-鿿]+/g;
    while ((m = re2.exec(tt)) !== null) if (m[0].length >= 2) toks.push(m[0]);
    return toks;
}

function subTokenHit(name, tokens) {
    const n = String(name || '').toLowerCase();
    for (let i = 0; i < tokens.length; i++) if (n.indexOf(tokens[i]) >= 0) return 1;
    return 0;
}

function subGate(bag, title) {
    const tokens = subTitleTokens(title);
    const titleLoose = String(title || '').toLowerCase().replace(/[-_.\s]/g, '');
    return bag.filter((it) => {
        if (it.viaCode || it.codeHit || subTokenHit(it.name, tokens)) return true;
        if (titleLoose.length >= 4) {
            const nl = String(it.name || '').toLowerCase().replace(/[-_.\s]/g, '');
            if (nl.indexOf(titleLoose) >= 0) return true;
        }
        return false;
    });
}

// 一次搜索: 两源并行, 各自失败静默; 过相关性闸门后合并;
// 无键/无命中返回 []。
async function subSearch(title) {
    const keys = subKeys(title);
    if (!keys.length) return [];
    const code = subExtractCode(title);
    const bag = [];
    await Promise.all([
        Promise.resolve(subFromXunlei(keys, code, bag)).catch(() => {}),
        Promise.resolve(subFromSubtitleCat(keys, code, bag)).catch(() => {}),
    ]);
    return subMerge(subGate(bag, title));
}


async function getConfig() {
    let tabs = FALLBACK_TABS;
    const s = await fetchJson(API);
    if (s && Array.isArray(s.class) && s.class.length) {
        tabs = s.class.map((r) => ({ name: t(r.type_name), ext: { tid: String(r.type_id) } }));
    }
    return jsonify({ ver: 1, title: 'Avdb', site: 'https://avdbapi.com', tabs });
}

async function getCards(ext) {
    ext = argsify(ext);
    const tid = ext.tid || '';
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const url = `${API}?t=${encodeURIComponent(tid)}&ac=detail&pg=${page}`;
    const n = await fetchJson(url);
    const list = (n && Array.isArray(n.list) ? n.list : []).map(toCard);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const id = t(ext.id || '');
    const tracks = [];
    if (id) {
        const info = await fetchJson(`${API}?ac=detail&ids=${encodeURIComponent(id)}`);
        const item = info && Array.isArray(info.list) && info.list[0] ? info.list[0] : null;
        if (item && item.episodes) {
            try {
                const eps = typeof item.episodes === 'string' ? JSON.parse(item.episodes) : item.episodes;
                const serverData = eps.server_data || eps;
                for (const k of Object.keys(serverData)) {
                    const v = serverData[k];
                    const link = (v && (v.link_embed || v.link)) || '';
                    if (!link) continue;
                    const html = await fetchText(link);
                    if (!html) continue;
                    let m = html.match(/"m3u8"\s*:\s*"((?:https?:)?\\?\/\\?\/[^"]+?\.m3u8[^"]*)"/);
                    if (m && m[1]) {
                        let playUrl = m[1].replace(/\\\//g, '/').replace(/\\u0026/g, '&');
                        if (playUrl.startsWith('//')) playUrl = 'https:' + playUrl;
                        tracks.push({ name: t(item.name) || '播放', pan: '', ext: { url: playUrl, name: t(item.name) } });
                        break;
                    }
                    m = html.match(/m3u8\s*:\s*"((\/play\/token_hash\?hash=[^"]+))"/);
                    if (m && m[1]) {
                        try {
                            const playUrl = new URL(link).origin + m[1];
                            tracks.push({ name: t(item.name) || '播放', pan: '', ext: { url: playUrl, name: t(item.name) } });
                        } catch (e) {}
                        break;
                    }
                }
            } catch (e) {}
        }
    }
    return jsonify({ list: [{ title: '在线播放', tracks }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const url = t(ext.url || '');
    if (!url) return jsonify({ urls: [], headers: [] });
    // 与猫源一致：helvid 分片查 Referer，必须用 avdbapi.com（用 helvid.com 会 403）
    const result = {
        urls: [url],
        headers: [{ 'User-Agent': UA, Referer: 'https://avdbapi.com/' }],
    };
    // 字幕聚合试点: 按 track.ext 带入的片名在本次调用内搜一次字幕,
    // 命中才挂 subs; 无命中/无片名时返回与未接入前逐字一致。
    const name = t(ext.name || '');
    if (name) {
        try {
            const subs = await subSearch(name);
            if (subs && subs.length) result.subs = subs;
        } catch (e) {}
    }
    return jsonify(result);
}

async function search(ext) {
    ext = argsify(ext);
    const wd = t(ext.text);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    if (!wd) return jsonify({ list: [] });
    const url = `${API}?ac=detail&wd=${encodeURIComponent(wd)}&pg=${page}`;
    const n = await fetchJson(url);
    const list = (n && Array.isArray(n.list) ? n.list : []).map(toCard);
    return jsonify({ list });
}
