// ASMR - XPTV csp 格式 (csp_asmr)
// 转换自 mira-cat nodejs/src/spider/video/asmr.js（py_asmr，133 行），站点 https://api.asmr.one（www.asmr.one），无站外依赖。
// 已知边界：纯音频源——猫版 detail 出的播放地址为音频直链（streamLowQualityUrl 优先，同猫版现状，未改高码率顺序）；
// 音频类，XPTV 呈现待真机验（能否当视频条目播、封面/进度表现存疑，以真机为准）。harness 仅验数据链。
const API = 'https://api.asmr.one';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36';
const PAGE_SIZE = 20;

const ORDERS = [
{ type_id: 'create_date', type_name: '最新'},
{ type_id: 'release', type_name: '新发'},
{ type_id: 'dl_count', type_name: '最热'},
{ type_id: 'rate_average_2dp', type_name: '高分'},
{ type_id: 'review_count', type_name: '热议'},
];

const appConfig = {
ver: 1,
title: 'ASMR',
site: API,
tabs: ORDERS.map((o) => ({ name: o.type_name, ext: { tid: o.type_id}})),
};

function t(v) { return String(v == null? '': v).trim();}

async function apiGet(path) {
try {
const { data} = await $fetch.get(API + path, {
headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': 'https://www.asmr.one/'},
});
if (typeof data === 'object') return data;
return JSON.parse(String(data || '{}'));
} catch (e) { return {};}
}

function cleanTitle(s) {
return t(s).replace(/【/g, '[').replace(/】/g, ']').replace(/\$/g, '').replace(/#/g, '');
}

function rowsToVods(rows) {
const out = [];
for (const w of rows || []) {
const wid = String(w.id || '');
if (!wid) continue;
out.push({
vod_id: wid,
vod_name: cleanTitle(w.title),
vod_pic: w.mainCoverUrl || w.samCoverUrl || '',
vod_remarks: String(w.dl_count || ''),
ext: { id: wid},
});
}
return out;
}

function collectAudio(node, out) {
out = out || [];
if (!node) return out;
if (node.type === 'audio') out.push(node);
const children = node.children || [];
for (let i = 0; i < children.length; i++) collectAudio(children[i], out);
return out;
}

async function getConfig() {
return jsonify(appConfig);
}

async function getCards(ext) {
ext = argsify(ext);
const orderIds = ORDERS.map(function (o) { return o.type_id;});
const order = orderIds.indexOf(ext.tid) >= 0? ext.tid: 'create_date';
const page = Math.max(1, parseInt(ext.page, 10) || 1);
const d = await apiGet('/api/works?order=' + order + '&sort=desc&page=' + page + '&pageSize=' + PAGE_SIZE);
const rows = d && typeof d === 'object'? d.works: [];
return jsonify({ list: rowsToVods(rows)});
}

async function getTracks(ext) {
ext = argsify(ext);
const vid = t(ext.id);
const tracks = [];
if (vid) {
const d = await apiGet('/api/work/' + vid);
if (d && d.id) {
const td = await apiGet('/api/tracks/' + vid + '?v=2');
const audio = collectAudio({ children: Array.isArray(td)? td: []});
const parts = [];
for (let i = 0; i < audio.length; i++) {
const a = audio[i];
const title = cleanTitle(a.title) || ('音轨' + (i + 1));
const url = a.streamLowQualityUrl || a.mediaStreamUrl || '';
if (url) parts.push(('0' + (i + 1)).slice(-2) + ' ' + title + '$' + url);
}
// 按猫 detail 的 vod_play_url 拆集：# 分集、首个 $ 分集名/playId，playId 原样透传
for (const part of parts.join('#').split('#')) {
if (!part) continue;
const idx = part.indexOf('$');
if (idx < 0) continue;
tracks.push({ name: part.slice(0, idx), pan: '', ext: { id: part.slice(idx + 1), flag: 'ASMR'}});
}
}
}
return jsonify({ list: [{ title: 'ASMR', tracks}]});
}

async function getPlayinfo(ext) {
ext = argsify(ext);
const id = t(ext.id);
if (!id || id.indexOf('http')!== 0) return jsonify({ urls: [], headers: []});
return jsonify({ urls: [id], headers: [{ 'User-Agent': UA}]});
}

async function search(ext) {
ext = argsify(ext);
const wd = t(ext.text);
const page = Math.max(1, parseInt(ext.page, 10) || 1);
if (!wd) return jsonify({ list: []});
const d = await apiGet('/api/search/' + encodeURIComponent(wd) + '?order=create_date&sort=desc&page=' + page + '&pageSize=' + PAGE_SIZE);
const rows = d && typeof d === 'object'? d.works: [];
return jsonify({ list: rowsToVods(rows)});
}
