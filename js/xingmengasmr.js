// 星梦ASMR - XPTV csp 格式
// 转换自 mira-cat nodejs/src/spider/video/xingmengasmr.js（py_xingmengasmr）
// 站点 https://www.asmrzy.top，无站外依赖（bilibili 内容走 B 站公开 API 取直链）。
// 本站以 ASMR 音频/视频为主，XPTV 端的音频呈现未经真机验证。
const BASE_URL = 'https://www.asmrzy.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const appConfig = {
ver: 1,
title: '星梦ASMR',
site: BASE_URL,
tabs: [
{ name: '中国', ext: { tid: 'cn'}},
{ name: '韩国', ext: { tid: 'kr'}},
{ name: '日本', ext: { tid: 'jp'}},
{ name: '其他', ext: { tid: 'other'}},
{ name: '音频', ext: { tid: 'listen'}},
],
};

function t(v) { return String(v == null? '': v).trim();}

async function httpGet(url, headers) {
const h = Object.assign({ 'User-Agent': UA}, headers || {});
try {
const { data} = await $fetch.get(url, { headers: h});
return typeof data === 'string'? data: String(data == null? '': data);
} catch (e) {
return '';
}
}

async function httpGetJson(url, headers) {
const h = Object.assign({ 'User-Agent': UA}, headers || {});
try {
const { data} = await $fetch.get(url, { headers: h});
if (data && typeof data === 'object') return data;
try { return JSON.parse(String(data || '{}'));} catch (e) { return {};}
} catch (e) {
return {};
}
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
const name = idx >= 0? ep.slice(0, idx): ep;
const pid = idx >= 0? ep.slice(idx + 1): ep;
tracks.push({ name: name || '播放', pan: '', ext: { id: pid, flag: title}});
}
}
if (tracks.length) groups.push({ title, tracks});
}
return groups;
}

function parsePostItem(itemHtml) {
const titleM = itemHtml.match(/<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]+)<\/a>/);
if (!titleM) return null;
const title = t(titleM[1]);

let linkM = itemHtml.match(/<a[^>]+href="([^"]+)"[^>]*class="[^"]*thumbnail[^"]*"/);
if (!linkM) linkM = itemHtml.match(/<a[^>]+href="([^"]+)"[^>]*>.*?<img/);
if (!linkM) return null;
let link = linkM[1];
if (!/^https?:\/\//i.test(link)) {
link = link.startsWith('/')? BASE_URL + link: BASE_URL + '/' + link;
}
const vidM = link.match(/\/(\d+)\.html/);
const vid = vidM? vidM[1]: link;

let pic = '';
const imgM = itemHtml.match(/<img[^>]+data-src="([^"]+)"/) || itemHtml.match(/<img[^>]+src="([^"]+)"/);
if (imgM) pic = imgM[1];

let remarks = '';
const dateM = itemHtml.match(/<time[^>]*>([^<]+)<\/time>/) || itemHtml.match(/<li>(\d{4}年\d{2}月\d{2}日)<\/li>/);
if (dateM) remarks = t(dateM[1]);

return { vod_id: vid, vod_name: title, vod_pic: pic, vod_remarks: remarks, ext: { id: vid}};
}

function parseList(html) {
const videos = [];
if (!html) return videos;
const items = html.match(/<li[^>]*class="[^"]*joe_list__item[^"]*"[^>]*>([\s\S]*?)<\/li>/g) || [];
for (const li of items) {
const post = parsePostItem(li);
if (post) videos.push(post);
}
return videos;
}

function extractVideoUrl(html) {
if (!html) return null;
const iframes = html.match(/<iframe[^>]+src="([^"]+)"/gi) || [];
for (const tag of iframes) {
const m = tag.match(/src="([^"]+)"/i);
if (!m) continue;
let src = t(m[1]);
if (src.startsWith('//')) src = 'https:' + src;
else if (src.startsWith('/')) src = BASE_URL + src;
if (/google|trustpilot|tree-nation/i.test(src)) continue;
return src;
}
const direct = html.match(/https?:\/\/[^\s"']+\.(?:mp4|m3u8|webm|flv)/i);
if (direct) return direct[0];
const sm = html.match(/<div[^>]*class="[^"]*smartideo[^"]*"[^>]*data-(?:src|url)="([^"]+)"/i);
if (sm) return sm[1];
const vs = html.match(/<(?:video|source)[^>]+src="([^"]+)"/i);
if (vs) return vs[1];
return null;
}

function parsePlatform(url) {
if (!url) return null;
let m = url.match(/(?:bilibili\.com\/video\/|player\.bilibili\.com\/player\.html\?[^"]*bvid=)([a-zA-Z0-9]+)/i);
if (m) return 'bilibili://' + m[1];
m = url.match(/player\.bilibili\.com\/player\.html\?[^"]*aid=(\d+)/i);
if (m) return 'bilibili_aid://' + m[1];
m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
if (m) return 'youtube://' + m[1];
return url;
}

async function getConfig() {
return jsonify(appConfig);
}

async function getCards(ext) {
ext = argsify(ext);
const tid = t(ext.tid) || 'cn';
let pg = parseInt(ext.page, 10) || 1;
if (pg < 1) pg = 1;
const url = pg > 1? `${BASE_URL}/category/${tid}/${pg}/`: `${BASE_URL}/category/${tid}/`;
const html = await httpGet(url);
return jsonify({ list: parseList(html)});
}

async function getTracks(ext) {
ext = argsify(ext);
const id = t(ext.id);
if (!id) return jsonify({ list: []});
const html = await httpGet(`${BASE_URL}/${id}.html`);
if (!html) return jsonify({ list: []});
const videoUrl = extractVideoUrl(html);
let groups = [];
if (videoUrl) {
const parsed = parsePlatform(videoUrl);
groups = buildGroups('视频', `播放$${parsed}`);
}
return jsonify({ list: groups});
}

async function getPlayinfo(ext) {
ext = argsify(ext);
let videoId = t(ext.id);
if (videoId.includes('$') &&!videoId.includes('://')) videoId = videoId.split('$').pop().trim();
if (videoId.startsWith('bilibili://')) {
const bvid = videoId.split('://')[1];
const viewData = await httpGetJson(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, { 'Referer': 'https://www.bilibili.com'});
if (viewData.code === 0 && viewData.data && viewData.data.cid) {
const cid = viewData.data.cid;
const playData = await httpGetJson(
`https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=16`,
{ 'Referer': 'https://www.bilibili.com'}
);
if (playData.code === 0 && playData.data && playData.data.durl && playData.data.durl.length) {
return jsonify({ urls: [playData.data.durl[0].url], headers: [{ Referer: 'https://www.bilibili.com'}]});
}
}
return jsonify({ urls: [`https://player.bilibili.com/player.html?bvid=${bvid}`], headers: [{}]});
}
if (videoId.startsWith('bilibili_aid://')) {
const aid = videoId.split('://')[1];
return jsonify({ urls: [`https://player.bilibili.com/player.html?aid=${aid}`], headers: [{}]});
}
if (videoId.startsWith('youtube://')) {
const yid = videoId.split('://')[1];
return jsonify({ urls: [`https://www.youtube.com/embed/${yid}?autoplay=1`], headers: [{}]});
}
if (/^https?:\/\//i.test(videoId)) {
const header = videoId.includes('asmrzy.top')? { Referer: BASE_URL + '/'}: {};
return jsonify({ urls: [videoId], headers: [header]});
}
return jsonify({ urls: [], headers: [{}]});
}

async function search(ext) {
ext = argsify(ext);
const key = t(ext.text);
let pg = parseInt(ext.page, 10) || 1;
if (pg < 1) pg = 1;
if (!key) return jsonify({ list: []});
let url = `${BASE_URL}/?s=${encodeURIComponent(key)}`;
if (pg > 1) url += `&page=${pg}`;
const html = await httpGet(url);
return jsonify({ list: parseList(html)});
}
