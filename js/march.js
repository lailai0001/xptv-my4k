// March视频 - XPTV csp 格式 (csp_march)
// 转换自 mira-cat nodejs/src/spider/video/march.js（py_march，335 行），按猫版现状如实移植、逐段照搬，未发明新解法。
// 站点/API: https://api.march24168.online（App 接口，无网页端）；封面 CDN: https://cdn.uameta.ai/file/bucket-media
// 背景: 此源为音频/视频混合的历史老大难（用户在 REX 侧多轮未通过后删过组件，
//   但猫蜘蛛仍在册、本次点名照搬）——猫版怎么取数/怎么出播放就怎么搬。
// 已知边界（如实标注）:
// 1) POST 待真机验: 登录走 $fetch.post(url, {}, {headers})，线格式逐字保持猫侧——
//    POST https://api.march24168.online/console/app/login?loginName=..&password=..&platform=app，
//    body {}、headers {'user-agent':'Dart/3.11 (dart:io)','accept-encoding':'gzip'}。
//    XPTV 仓内两源未用过 POST、运行时未证实，待真机验（本地 harness 已验通登录+取数全链）。
// 2) 内置账号: 猫版注释「账号由用户授权内置，可通过 extend 覆盖」，混淆存储（base64）；
//    XPTV 版原样保留混淆串，解码由 Node Buffer 改 CryptoJS.enc.Base64 对应件；
//    登录名/密码可经 ext.loginName/ext.password 或 ext.extend(JSON) 覆盖，同猫版 initAuth 口径。
// 3) token 跨调用状态: 猫版模块级 _token 缓存；XPTV 版只作机会缓存，apiGet 在缓存
//    缺失时于调用内重新登录重建，不依赖 getConfig→getCards 的跨调用传状态。
// 4) URLSearchParams 运行时未证实，改手工拼 query（键序/取值与猫版 params 对象一致）。
// 5) 猫版无 setTimeout 竞速逻辑（音频章节本就是串行 for-await 逐章取址），原样串行。
// 6) filters 无 XPTV 对应位: tabs 只来自猫 home 的 class（视频/有声/漫画/小说）；
//    猫版各类的 sub 过滤值（VIDEO_CATS 等，见下方常量）保留在 getCards 的 ext.sub
//    入参逻辑里（缺省 '' 即「全部」），与猫 category 的 extend.sub 口径一致。
// 7) search: 猫版 search() 本就是空桩（直接 return {list: []}，未实现站内搜索），照搬——搜索恒为空。
// 8) 漫画/小说: 猫版 detail 给 vod_play_from=图文/小说、vod_play_url=''（仅详情、无播放链），
//    照搬——getTracks 返回对应 group 但 tracks 为空，XPTV 里只能浏览不能播，与猫版一致。
// 9) 视频 detail（2026-10-22 本地核查结论）: 猫版走 /video/app/video/intro 取 model.url；
//    当日多条目/多页/多 header 变体实测该接口全量返回 {result:'fail', code:0, msg:'非法操作', model:null}——
//    按猫版 apiGet 口径（code===0 返回 model||{}）详情取不到 url，视频 tracks 为空。
//    列表条目自带的 url 字段实测为活 m3u8，但猫版 detail 不用它，按「现状照搬」不发明新解法；
//    站方 intro 恢复后同一模块即自动出链。音频线不受影响（intro/chapter 接口实测正常）。
// 10) 音频 detail: 猫版逐章调 /audio/app/audio/chapter 取 chapterUrl 串行拼集；章节为空时
//     回退 latestReadChapterUrl 单集。当日实测样本 intro 的 chapters 均为 []，实际走回退单集出链。
// 11) play: 猫版 {url: playId 原样, header: JSON 串 {'user-agent': UA}}，XPTV 改 headers 对象数组等价呈现。
const CryptoJS = createCryptoJS();

const API = 'https://api.march24168.online';
const CDN = 'https://cdn.uameta.ai/file/bucket-media';
const UA = 'Dart/3.11 (dart:io)';
// 账号已做混淆存储（用户授权放入公开仓库），与猫版同一对混淆串
const _LN = CryptoJS.enc.Base64.parse('Mjg1ODg2NzUxQHFxLmNvbQ==').toString(CryptoJS.enc.Utf8);
const _PW = CryptoJS.enc.Base64.parse('cXdlcjQzMjE=').toString(CryptoJS.enc.Utf8);

const VIDEO_CATS = [
  ['FC2', 'FC2'],
  ['MOODYZ', "MOODYZ(Moody's)"],
  ['S1', 'S1 No. 1 Style'],
  ['加勒比', '加勒比'],
  ['一本道', '一本道'],
  ['麻豆传媒', '麻豆传媒'],
];
const COMIC_CATS = [
  ['全彩', '全彩'],
  ['剧情', '剧情'],
  ['巨乳大奶', '巨乳大奶'],
  ['内射中出', '内射中出'],
  ['不伦', '不伦'],
  ['单女', '单女'],
  ['单男', '单男'],
];
const AUDIO_CATS = [
  ['有声小说', '有声小说'],
  ['淫词艳曲', '淫词艳曲'],
  ['激情骚麦', '激情骚麦'],
  ['寸止训练', '寸止训练'],
  ['ASMR', 'ASMR'],
];
const NOVEL_CATS = [
  ['校园', '校园'],
  ['都市', '都市'],
  ['古代', '古代'],
  ['NP', 'NP'],
  ['剧情', '剧情'],
  ['甜文', '甜文'],
  ['百合', '百合'],
  ['纯爱', '纯爱'],
];

const appConfig = {
    ver: 1,
    title: 'March视频',
    site: API,
    tabs: [
        { name: '视频', ext: { tid: 'video' } },
        { name: '有声', ext: { tid: 'audio' } },
        { name: '漫画', ext: { tid: 'comic' } },
        { name: '小说', ext: { tid: 'novel' } },
    ],
};

function t(v) {
  return String(v == null ? '' : v).trim();
}

// 每个请求独立 session 风格：用模块级 token 缓存（机会缓存，缺失时调用内重建）
let _token = '';
let _loginName = '';
let _password = '';

function initAuth(ext) {
  let cfg = {};
  try {
    if (ext && typeof ext === 'object') {
      cfg = ext;
      if (ext.extend) {
        const inner = typeof ext.extend === 'string' ? JSON.parse(ext.extend) : ext.extend;
        if (inner && typeof inner === 'object') cfg = inner;
      }
    } else if (ext) {
      cfg = JSON.parse(ext);
    }
  } catch (e) {}
  _loginName = cfg.loginName || _LN;
  _password = cfg.password || _PW;
}

async function login() {
  if (_token) return true;
  if (!_loginName || !_password) return false;
  try {
    const { data } = await $fetch.post(
      `${API}/console/app/login?loginName=${encodeURIComponent(_loginName)}&password=${encodeURIComponent(_password)}&platform=app`,
      {},
      { headers: { 'user-agent': UA, 'accept-encoding': 'gzip' } }
    );
    const obj = typeof data === 'object' ? data : JSON.parse(String(data || '{}'));
    const model = obj.model || {};
    _token = obj.code === 0 ? model.token || '' : '';
    return !!_token;
  } catch (e) {
    return false;
  }
}

function qs(params) {
  return Object.keys(params || {})
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

async function apiGet(path, params) {
  if (!(await login())) return null;
  try {
    const q = qs(params || {});
    const { data } = await $fetch.get(`${API}${path}${q ? '?' + q : ''}`, {
      headers: { 'user-agent': UA, 'accept-encoding': 'gzip', token: _token },
    });
    const obj = typeof data === 'object' ? data : JSON.parse(String(data || '{}'));
    if (obj.code === 0) return obj.model || {};
    return null;
  } catch (e) {
    return null;
  }
}

function cover(item) {
  const c = item.coverUrl || item.cover || '';
  if (c.startsWith('http')) return c;
  return c.startsWith('/') ? CDN + c : '';
}

function videoItem(item) {
  const vod_id = 'video:' + item.id;
  return {
    vod_id,
    vod_name: item.title || item.number || '未命名视频',
    vod_pic: cover(item),
    vod_remarks: item.categories || item.tags || '',
    ext: { id: vod_id },
  };
}
function comicItem(item) {
  const vod_id = 'comic:' + item.id;
  return {
    vod_id,
    vod_name: item.title || item.number || '未命名漫画',
    vod_pic: cover(item),
    vod_remarks: item.categories || item.tag || '',
    ext: { id: vod_id },
  };
}
function audioItem(item) {
  const vod_id = 'audio:' + item.id;
  return {
    vod_id,
    vod_name: item.title || '未命名音频',
    vod_pic: cover(item),
    vod_remarks: item.categories || '',
    ext: { id: vod_id },
  };
}
function novelItem(item) {
  const vod_id = 'novel:' + item.id;
  return {
    vod_id,
    vod_name: item.title || '未命名小说',
    vod_pic: cover(item),
    vod_remarks: item.categories || item.tags || '',
    ext: { id: vod_id },
  };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    initAuth(ext);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const tid = String(ext.tid || 'video');
    const extend = ext.extend && typeof ext.extend === 'object' ? ext.extend : {};
    const sub = ext.sub || extend.sub || '';

    if (tid === 'video') {
        const params = { orderType: 2, page, size: 50 };
        if (sub) {
            params.searchType = 2;
            params.author = sub;
        }
        const model = await apiGet('/video/app/video/search', params);
        if (!model) return jsonify({ list: [] });
        const data = model.data || [];
        return jsonify({ list: data.map(videoItem) });
    }
    if (tid === 'comic') {
        const params = { orderType: 2, page, size: 50 };
        if (sub) params.tag = sub;
        const model = await apiGet('/comic/app/comic/search', params);
        if (!model) return jsonify({ list: [] });
        const data = model.data || [];
        return jsonify({ list: data.map(comicItem) });
    }
    if (tid === 'audio') {
        const params = { orderType: 1, page, searchType: 1, size: 42 };
        if (sub) params.category = sub;
        const model = await apiGet('/audio/app/audio/search', params);
        if (!model) return jsonify({ list: [] });
        const data = model.data || [];
        return jsonify({ list: data.map(audioItem) });
    }
    if (tid === 'novel') {
        const params = { orderType: 2, page, size: 50 };
        if (sub) params.tag = sub;
        const model = await apiGet('/novel/app/novel/search', params);
        if (!model) return jsonify({ list: [] });
        const data = model.data || [];
        return jsonify({ list: data.map(novelItem) });
    }
    return jsonify({ list: [] });
}

// 猫版 detail 的逐分支照搬：产出 {vod_play_from, vod_play_url} 后由 getTracks 按契约拆组
async function detail(rawId) {
  // 有声：独立详情接口
  if (rawId.startsWith('audio:')) {
    const audioId = rawId.slice(6);
    const model = await apiGet('/audio/app/audio/intro', { id: audioId });
    if (!model) return null;
    const playList = [];
    for (const ch of model.chapters || []) {
      const chModel = await apiGet('/audio/app/audio/chapter', { id: ch.id });
      const url = chModel ? chModel.chapterUrl || '' : '';
      if (url) playList.push(`${ch.title || '第' + (ch.order || 1) + '集'}$${url}`);
    }
    if (!playList.length && model.latestReadChapterUrl) {
      playList.push(`第1集$${model.latestReadChapterUrl}`);
    }
    return { vod_play_from: 'UAA', vod_play_url: playList.join('#') };
  }

  // 小说：独立详情接口（章节走 po18 网页；猫版不产播放链）
  if (rawId.startsWith('novel:')) {
    const novelId = rawId.slice(6);
    const model = await apiGet('/novel/app/novel/intro', { id: novelId });
    if (!model) return null;
    return { vod_play_from: '小说', vod_play_url: '' };
  }

  // 漫画：独立详情接口
  if (rawId.startsWith('comic:')) {
    const comicId = rawId.slice(6);
    const model = await apiGet('/comic/app/comic/intro', { id: comicId });
    if (!model) return null;
    return { vod_play_from: '图文', vod_play_url: '' };
  }

  // 视频：需要先从列表缓存拿（简化：直接用 id 查详情）
  if (rawId.startsWith('video:')) {
    const videoId = rawId.slice(6);
    const model = await apiGet('/video/app/video/intro', { id: videoId });
    if (!model) return null;
    const url = model.url || '';
    return { vod_play_from: '官方线路', vod_play_url: url ? `播放$${url}` : '' };
  }

  return null;
}

async function getTracks(ext) {
    ext = argsify(ext);
    initAuth(ext);
    const rawId = t(ext.id);
    if (!rawId) return jsonify({ list: [] });
    const d = await detail(rawId);
    if (!d) return jsonify({ list: [] });
    const froms = String(d.vod_play_from || '').split('$$$');
    const groups = String(d.vod_play_url || '').split('$$$');
    const list = froms.map((from, gi) => {
        const tracks = [];
        const grp = groups[gi] || '';
        if (grp) {
            grp.split('#').filter(Boolean).forEach((seg) => {
                const idx = seg.indexOf('$');
                if (idx < 0) return;
                tracks.push({
                    name: seg.slice(0, idx),
                    pan: '',
                    ext: { id: seg.slice(idx + 1), flag: from },
                });
            });
        }
        return { title: from, tracks };
    });
    return jsonify({ list });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const id = t(ext.id);
    if (!id) return jsonify({ urls: [], headers: [] });
    return jsonify({ urls: [id], headers: [{ 'user-agent': UA }] });
}

async function search(ext) {
    ext = argsify(ext);
    // 猫版 search 为空桩（未实现站内搜索），照搬
    return jsonify({ list: [] });
}
