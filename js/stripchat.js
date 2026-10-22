// StripChat - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/stripchat.js（py_stripchat）
// 站点 https://zh.stripchat.com；依赖 Worker：stripchat-hls
//   （https://stripchat-hls.li768435813.workers.dev，/master/{id} 改写清单，调用原样搬自猫版；取数 GET）。
// 未证实/降级项：播放为 Worker 产出 URL 直出（playForm=worker）；
//   搜索：站方无可用公开搜索接口（猫版实测 /api/front/models 的 search 参数被忽略），search 如实返回空列表，同猫版。
const API = 'https://zh.stripchat.com/api/front';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const REFERER = 'https://zh.stripchat.com/';
const PAGE_SIZE = 60;
const STRIPCHAT_WORKER = 'https://stripchat-hls.li768435813.workers.dev';

const CATS = [
    { tid: 'girls', name: '女生' },
    { tid: 'men', name: '男生' },
    { tid: 'couples', name: '情侣' },
    { tid: 'trans', name: '跨性别' },
    { tid: 'girls:doAnal', name: '女·肛交' },
    { tid: 'girls:ethnicityMiddleEastern', name: '女·阿拉伯人' },
    { tid: 'girls:ethnicityAsian', name: '女·亚洲人' },
    { tid: 'girls:bodyTypeAthletic', name: '女·运动型' },
    { tid: 'girls:bodyTypeBBW', name: '女·大号美女' },
    { tid: 'girls:subcultureBdsm', name: '女·BDSM' },
    { tid: 'girls:specificsBigAss', name: '女·大屁股' },
    { tid: 'girls:specificsBigTits', name: '女·巨乳' },
    { tid: 'girls:hairColorBrown', name: '女·黑发' },
    { tid: 'girls:hairColorBlonde', name: '女·金发' },
    { tid: 'girls:doBlowjob', name: '女·口交' },
    { tid: 'girls:hairColorBlack', name: '女·棕发小妞' },
    { tid: 'girls:autoTagP2P', name: '女·视频通话' },
    { tid: 'girls:tagLanguageChinese', name: '女·中国' },
    { tid: 'girls:hairColorColorful', name: '女·彩发' },
    { tid: 'girls:bodyTypeCurvy', name: '女·丰满' },
    { tid: 'girls:doDeepThroat', name: '女·深喉' },
    { tid: 'girls:ethnicityEbony', name: '女·黑珍珠' },
    { tid: 'girls:doFisting', name: '女·拳交' },
    { tid: 'girls:doFootFetish', name: '女·恋足' },
    { tid: 'girls:fuckMachine', name: '女·炮机' },
    { tid: 'girls:ageOld', name: '女·老奶奶' },
    { tid: 'girls:tagGroupSex', name: '女·群交' },
    { tid: 'girls:specificsHairy', name: '女·阴部多毛' },
    { tid: 'girls:doHardcore', name: '女·粗暴' },
    { tid: 'girls:ethnicityIndian', name: '女·印度人' },
    { tid: 'girls:autoTagInteractiveToy', name: '女·互动玩具' },
    { tid: 'girls:ethnicityLatino', name: '女·拉丁人' },
    { tid: 'girls:doMasturbation', name: '女·自慰' },
    { tid: 'girls:ageMature', name: '女·成熟' },
    { tid: 'girls:bodyTypeMedium', name: '女·中等身材' },
    { tid: 'girls:ageMilf', name: '女·熟女' },
    { tid: 'girls:ethnicityMultiracial', name: '女·混血' },
    { tid: 'girls:mobile', name: '女·手机直播' },
    { tid: 'girls:autoTagNew', name: '女·新人' },
    { tid: 'girls:doOffice', name: '女·办公室' },
    { tid: 'girls:doPublicPlace', name: '女·户外' },
    { tid: 'girls:bodyTypePetite', name: '女·瘦' },
    { tid: 'girls:specificPregnant', name: '女·孕妇' },
    { tid: 'girls:hairColorRed', name: '女·红发' },
    { tid: 'girls:specificShaven', name: '女·剃光' },
    { tid: 'girls:specificSmallTits', name: '女·小胸部' },
    { tid: 'girls:autoTagSpy', name: '女·偷窥' },
    { tid: 'girls:doSquirt', name: '女·潮吹' },
    { tid: 'girls:ageTeen', name: '女·少女18+' },
    { tid: 'girls:tagLanguageUkrainian', name: '女·乌克兰人' },
    { tid: 'girls:autoTagVr', name: '女·VR' },
    { tid: 'girls:ethnicityWhite', name: '女·白人' },
    { tid: 'girls:ageYoung', name: '女·鲜嫩青年' },
    { tid: 'men:doAnal', name: '男·肛交' },
    { tid: 'men:ethnicityAsian', name: '男·亚洲人' },
    { tid: 'men:doBlowjob', name: '男·口交' },
    { tid: 'men:autoTagP2P', name: '男·视频通话' },
    { tid: 'men:tagLanguageChinese', name: '男·中国' },
    { tid: 'men:ageDaddies', name: '男·老爹' },
    { tid: 'men:ethnicityEbony', name: '男·黑珍珠' },
    { tid: 'men:orientationGay', name: '男·同性恋' },
    { tid: 'men:tagGroupSex', name: '男·群交' },
    { tid: 'men:doHardcore', name: '男·粗暴' },
    { tid: 'men:ethnicityLatino', name: '男·拉丁人' },
    { tid: 'men:bodyTypeMuscular', name: '男·肌肉' },
    { tid: 'men:autoTagNew', name: '男·新人' },
    { tid: 'men:bodyTypeSkinny', name: '男·瘦' },
    { tid: 'men:tagMenTwinks', name: '男·小鲜肉' },
    { tid: 'couples:do69Position', name: '情侣·69姿势' },
    { tid: 'couples:doAnal', name: '情侣·肛交' },
    { tid: 'couples:doBlowjob', name: '情侣·口交' },
    { tid: 'couples:tagLanguageChinese', name: '情侣·中国' },
    { tid: 'couples:doDeepThroat', name: '情侣·深喉' },
    { tid: 'couples:doFootFetish', name: '情侣·恋足' },
    { tid: 'couples:fuckMachine', name: '情侣·炮机' },
    { tid: 'couples:subcultureGoth', name: '情侣·哥特' },
    { tid: 'couples:tagGroupSex', name: '情侣·群交' },
    { tid: 'couples:doHardcore', name: '情侣·粗暴' },
    { tid: 'couples:autoTagNew', name: '情侣·新人' },
    { tid: 'couples:doOffice', name: '情侣·办公室' },
    { tid: 'couples:autoTagOldYoung', name: '情侣·老少配' },
    { tid: 'couples:doPublicPlace', name: '情侣·户外' },
    { tid: 'couples:doSquirt', name: '情侣·潮吹' },
    { tid: 'trans:doAnal', name: '跨·肛交' },
    { tid: 'trans:ethnicityAsian', name: '跨·亚洲人' },
    { tid: 'trans:specificsBigAss', name: '跨·大屁股' },
    { tid: 'trans:specificsBigTits', name: '跨·巨乳' },
    { tid: 'trans:doBlowjob', name: '跨·口交' },
    { tid: 'trans:ethnicityEbony', name: '跨·黑珍珠' },
    { tid: 'trans:tagGroupSex', name: '跨·群交' },
    { tid: 'trans:doHardcore', name: '跨·粗暴' },
    { tid: 'trans:ethnicityLatino', name: '跨·拉丁人' },
    { tid: 'trans:doMasturbation', name: '跨·自慰' },
    { tid: 'trans:ageMilf', name: '跨·熟女' },
    { tid: 'trans:autoTagNew', name: '跨·新人' },
    { tid: 'trans:specificSmallTits', name: '跨·小胸部' },
    { tid: 'trans:doSquirt', name: '跨·潮吹' },
    { tid: 'trans:ageTeen', name: '跨·少年18+' },
    { tid: 'trans:ageYoung', name: '跨·鲜嫩青年' }
];

const appConfig = {
    ver: 1,
    title: 'StripChat',
    site: 'https://zh.stripchat.com',
    tabs: CATS.map((c) => ({ name: c.name, ext: { tid: c.tid } })),
};

function t(v) { return String(v == null ? '' : v).trim(); }

async function fetchJson(url) {
    try {
        const { data } = await $fetch.get(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': REFERER } });
        if (data) return typeof data === 'string' ? JSON.parse(data) : data;
    } catch (e) {}
    return null;
}

function modelToVod(m) {
    const id = String(m.id || '');
    let pic = '';
    if (m.snapshotTimestamp && id) pic = `https://img.doppiocdn.net/thumbs/${m.snapshotTimestamp}/${id}`;
    if (!pic) pic = t(m.previewUrlThumbSmall) || t(m.avatarUrl);
    const marks = [];
    if (m.isHd) marks.push('HD');
    if (m.isNew) marks.push('新人');
    const remarks = `${m.viewersCount || 0}人观看${marks.length ? ' · ' + marks.join(' · ') : ''}`;
    return { vod_id: id, vod_name: t(m.username), vod_pic: pic, vod_remarks: remarks, ext: { id: id } };
}

async function getModelsPage(primaryTag, tagId, page) {
    const offset = (page - 1) * PAGE_SIZE;
    let url = `${API}/models?primaryTag=${encodeURIComponent(primaryTag)}&limit=${PAGE_SIZE}&offset=${offset}`;
    if (tagId) url += `&filterGroupTags=${encodeURIComponent(JSON.stringify([[tagId]]))}`;
    const d = await fetchJson(url);
    if (!d || !Array.isArray(d.models)) return { list: [], total: 0 };
    const list = d.models
        .filter((m) => m && m.status === 'public' && m.isLive && m.id && m.username)
        .map(modelToVod);
    return { list, total: d.filteredCount || 0 };
}

function parseTid(tid) {
    const s = t(tid) || 'girls';
    const i = s.indexOf(':');
    if (i < 0) return { primaryTag: s, tagId: '' };
    return { primaryTag: s.slice(0, i), tagId: s.slice(i + 1) };
}

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    const { primaryTag, tagId } = parseTid(ext.tid || ext.id);
    const page = Math.max(1, parseInt(ext.page, 10) || 1);
    const { list } = await getModelsPage(primaryTag, tagId, page);
    return jsonify({ list });
}

async function getTracks(ext) {
    ext = argsify(ext);
    const raw = t(ext.id);
    const id = raw.includes('$') ? raw.split('$').pop() : raw;
    if (!id) return jsonify({ list: [] });
    // 猫 detail 会拉一次模型详情确认状态，失败也拼得出可播条目；此处同逻辑（不依赖其结果出轨）
    await fetchJson(`${API}/models/${encodeURIComponent(id)}`);
    return jsonify({ list: [{ title: 'StripChat', tracks: [{ name: '直播', pan: '', ext: { id: id, flag: 'StripChat' } }] }] });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    const raw = t(ext.id);
    const id = raw.includes('$') ? raw.split('$').pop() : raw;
    if (!/^\d+$/.test(id)) return jsonify({ urls: [], headers: [] });
    return jsonify({
        urls: [`${STRIPCHAT_WORKER}/master/${id}`],
        headers: [{ 'User-Agent': UA, 'Referer': REFERER }],
    });
}

async function search(ext) {
    ext = argsify(ext);
    // 无可用公开搜索接口（见文件头），返回空，同猫版
    return jsonify({ list: [] });
}
