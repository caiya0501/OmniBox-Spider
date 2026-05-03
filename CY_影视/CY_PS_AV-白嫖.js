// @name AV-白嫖影视
// @author
// @description 网盘线路按文件大小降序，名称含清晰度+大小，官方线路后置
// @description AV-白嫖接口展示影视分类/首页/搜索，详情自动匹配网盘资源，官方播放+网盘播放双源共存，无网盘自动兜底原链接
// @version 0.0.1
// @downloadURL https://raw.githubusercontent.com/caiya0501/OmniBox-Spider/refs/heads/main/CY_%E5%BD%B1%E8%A7%86/CY_PS_AV-白嫖.js
const OmniBox = require("omnibox_sdk");
const querystring = require('querystring');
const axios = require("axios");
const https = require("https");

// ==================== 环境变量&固定配置 ====================
const PANSOU_API = process.env.PANSOU_API || "http://192.168.31.22:4080/";
const PANCHECK_API = process.env.PANCHECK_API || "http://192.168.31.22:6080/";
const PANSOU_CHANNELS = process.env.PANSOU_CHANNELS || "";
const PANSOU_PLUGINS = process.env.PANSOU_PLUGINS || "";
const PANSOU_CLOUD_TYPES = process.env.PANSOU_CLOUD_TYPES || "";
const PANSOU_FILTER = process.env.PANSOU_FILTER || JSON.stringify({ "include": [""], "exclude": [] });
const PANCHECK_ENABLED = String(process.env.PANCHECK_ENABLED || "1") === "1";
const PANCHECK_PLATFORMS = process.env.PANCHECK_PLATFORMS || "quark,baidu,uc,pan123,tianyi,cmcc";
const DRIVE_TYPE_CONFIG = splitConfigList(process.env.DRIVE_TYPE_CONFIG || "quark;uc");
const SOURCE_NAMES_CONFIG = splitConfigList(process.env.SOURCE_NAMES_CONFIG || "");
const EXTERNAL_SERVER_PROXY_ENABLED = String(process.env.EXTERNAL_SERVER_PROXY_ENABLED || "false").toLowerCase() === "true";
const DRIVE_ORDER = splitConfigList(process.env.DRIVE_ORDER || "quark;baidu;a139;a189;a123;a115;xunlei;ali;uc").map(s => s.toLowerCase());
const PANSOU_CACHE_EX_SECONDS = Number(process.env.PANSOU_CACHE_EX_SECONDS || 43200);

const SITE_API = "https://www.kxgav.com/api/json.php";
const BASE_DOMAIN = "https://www.kxgav.com";
const PAGE_LIMIT = 20;
const REQUEST_DELAY = 500;

// ============== 核心：定义需要优先排在前面的电影分类（可自行增删） ==============
const MOVIE_PRIORITY = process.env.MOVIE_PRIORITY || "动作片,惊悚片,科幻片,喜剧片,爱情片,恐怖片,悬疑片,冒险片,动画电影";
const MOVIE_PRIORITY_TYPES = MOVIE_PRIORITY.split(',');

// ==================== 全局变量 ====================
let CATEGORY_TREE = {};
let ALL_CATEGORIES = [];
let lastRequestTime = 0;
const PIC_CACHE = new Map();
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/124.0.0.0 Safari/537.36"
];

// ==================== 通用工具 ====================
function splitConfigList(value) {
    return String(value || "")
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean);
}

function inferDriveTypeFromSourceName(name = "") {
    const raw = String(name || "").toLowerCase();
    if (raw.includes("百度")) return "baidu";
    if (raw.includes("天翼")) return "tianyiyun";
    if (raw.includes("夸克")) return "quark";
    if (raw === "uc" || raw.includes("uc")) return "uc";
    if (raw.includes("115")) return "115";
    if (raw.includes("迅雷")) return "xunlei";
    if (raw.includes("阿里")) return "aliyun";
    if (raw.includes("移动") || raw.includes("139") || raw.includes("cmcc")) return "cmcc";
    if (raw.includes("123")) return "pan123";
    return raw;
}

function normalizePanCheckPlatform(input = "") {
    const raw = String(input || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw.includes("百度") || raw === "baidu") return "baidu";
    if (raw.includes("天翼") || raw === "tianyi" || raw === "tianyiyun") return "tianyiyun";
    if (raw.includes("夸克") || raw === "quark") return "quark";
    if (raw === "uc" || raw.includes("uc")) return "uc";
    if (raw.includes("115")) return "115";
    if (raw.includes("迅雷") || raw === "xunlei") return "xunlei";
    if (raw.includes("阿里") || ["ali","aliyun","alipan","aliyundrive"].includes(raw)) return "aliyun";
    if (raw.includes("移动") || raw.includes("139") || raw === "cmcc") return "cmcc";
    if (["123","123pan","pan123"].includes(raw)) return "pan123";
    return raw;
}

function inferDriveTypeFromShareURL(shareURL = "") {
    const raw = String(shareURL || "").toLowerCase();
    if (!raw) return "";
    if (raw.includes("pan.quark.cn") || raw.includes("drive.quark.cn")) return "quark";
    if (raw.includes("drive.uc.cn") || raw.includes("fast.uc.cn")) return "uc";
    if (raw.includes("pan.baidu.com")) return "baidu";
    if (raw.includes("cloud.189.cn")) return "tianyiyun";
    if (raw.includes("yun.139.com")) return "cmcc";
    if (raw.includes("aliyundrive.com") || raw.includes("alipan.com")) return "aliyun";
    if (raw.includes("pan.xunlei.com")) return "xunlei";
    if (raw.includes("115.com")) return "115";
    if (raw.includes("123pan.com") || raw.includes("123684.com")) return "pan123";
    return "";
}

function resolveCallerSource(params = {}, context = {}) {
    return String(context?.from || params?.source || "").toLowerCase();
}

function getBaseURLHost(context = {}) {
    const baseURL = String(context?.baseURL || "").trim();
    if (!baseURL) return "";
    try {
        return new URL(baseURL).hostname.toLowerCase();
    } catch (e) {
        return baseURL.toLowerCase();
    }
}

function isPrivateHost(hostname = "") {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    if (["localhost","127.0.0.1","::1","0.0.0.0"].includes(host)) return true;
    if (/^(10\.|192\.168\.|169\.254\.)/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
    if (host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal")) return true;
    return false;
}

function canUseServerProxy(context = {}) {
    if (EXTERNAL_SERVER_PROXY_ENABLED) return true;
    return isPrivateHost(getBaseURLHost(context));
}

function filterSourceNamesForCaller(sourceNames = [], callerSource = "", context = {}) {
    let filtered = Array.isArray(sourceNames) ? [...sourceNames] : [];
    const allowServerProxy = canUseServerProxy(context);

    if (callerSource === "web") {
        filtered = filtered.filter(name => name !== "本地代理");
    } else if (callerSource === "emby") {
        filtered = allowServerProxy
            ? filtered.filter(name => name === "服务端代理")
            : filtered.filter(name => name !== "服务端代理");
    } else if (callerSource === "uz") {
        filtered = filtered.filter(name => name !== "本地代理");
    }

    if (!allowServerProxy) {
        filtered = filtered.filter(name => name !== "服务端代理");
    }

    return filtered.length > 0 ? filtered : ["直连"];
}

function resolveRouteType(flag = "", callerSource = "", context = {}) {
    const allowServerProxy = canUseServerProxy(context);
    let routeType = "直连";

    if (callerSource === "web" || callerSource === "emby") {
        routeType = allowServerProxy ? "服务端代理" : "直连";
    }

    if (flag) {
        if (flag.includes("-")) {
            const parts = flag.split("-");
            routeType = parts[parts.length - 1];
        } else {
            routeType = flag;
        }
    }

    if (!allowServerProxy && routeType === "服务端代理") routeType = "直连";
    if (callerSource === "uz" && routeType === "本地代理") routeType = "直连";
    return routeType;
}

function formatDriveShortName(name = "") {
    return String(name || "").replace(/(网盘|云盘)/g, "");
}

function sortPlaySourcesByDriveOrder(playSources = []) {
    if (!Array.isArray(playSources) || playSources.length <= 1 || DRIVE_ORDER.length === 0) return playSources;
    const orderMap = new Map(DRIVE_ORDER.map((name, idx) => [name, idx]));
    return [...playSources].sort((a,b)=>{
        const aType = inferDriveTypeFromSourceName(a?.name||"");
        const bType = inferDriveTypeFromSourceName(b?.name||"");
        const aIdx = orderMap.get(aType) ?? Number.MAX_SAFE_INTEGER;
        const bIdx = orderMap.get(bType) ?? Number.MAX_SAFE_INTEGER;
        return aIdx - bIdx;
    });
}

function inferDriveTypeFromResult(item = {}) {
    const rawType = String(item.type_id || item.type_name || item.vod_remarks || "").toLowerCase();
    return normalizePanCheckPlatform(rawType);
}

function getPanCheckSelectedPlatforms() {
    return splitConfigList(PANCHECK_PLATFORMS)
        .map(p => normalizePanCheckPlatform(p))
        .filter(Boolean);
}

function splitLinksByPanCheckPlatforms(links = []) {
    const allLinks = Array.isArray(links) ? links.filter(Boolean) : [];
    const selectedPlatforms = getPanCheckSelectedPlatforms();
    if (selectedPlatforms.length === 0) {
        return { selectedPlatforms:[], linksToCheck:allLinks, bypassLinks:[] };
    }
    const set = new Set(selectedPlatforms);
    const linksToCheck = [], bypassLinks = [];
    for (const link of allLinks) {
        const t = inferDriveTypeFromShareURL(link) || normalizePanCheckPlatform(OmniBox.getDriveInfoByShareURL(link)?.driveType||"");
        set.has(t) ? linksToCheck.push(link) : bypassLinks.push(link);
    }
    return { selectedPlatforms, linksToCheck, bypassLinks };
}

function sortResultsByDriveOrder(results = []) {
    if (!Array.isArray(results) || results.length <=1 || DRIVE_ORDER.length ===0) return results;
    const map = new Map(DRIVE_ORDER.map((n,i)=>[n,i]));
    return [...results].sort((a,b)=>{
        const ta = inferDriveTypeFromResult(a);
        const tb = inferDriveTypeFromResult(b);
        const ia = map.get(ta)??Number.MAX_SAFE_INTEGER;
        const ib = map.get(tb)??Number.MAX_SAFE_INTEGER;
        return ia - ib;
    });
}

// ==================== 新增：文件信息提取工具 ====================
function extractResolution(filename = "") {
    const lower = String(filename).toLowerCase();
    if (lower.includes("4k") || lower.includes("2160p")) return "  4K  ";
    if (lower.includes("2k") || lower.includes("1440p")) return "  2K  ";
    if (lower.includes("1080p") || lower.includes("1080")) return "1080P";
    if (lower.includes("720p") || lower.includes("720")) return "720P";
    return "其他";
}

function formatSizeShort(size = 0) {
    if (!size || size <= 0) return "";
    const units = ["B", "K", "M", "G", "T"];
    let i = 0;
    let s = size;
    while (s >= 1024 && i < units.length - 1) {
        s /= 1024;
        i++;
    }
    return `${Math.round(s)}${units[i]}`;
}

// ==================== 盘搜API请求 ====================
async function requestPansouAPI(params = {}) {
    if (!PANSOU_API) throw new Error("未配置 PANSOU_API 盘搜地址");
    const url = new URL(`${PANSOU_API}/api/search`);
    const body = {
        kw: params.keyword || "",
        refresh: false,
        res: "merge",
        src: "all"
    };
    if (PANSOU_CHANNELS) body.channels = PANSOU_CHANNELS.split(',');
    if (PANSOU_PLUGINS) body.plugins = PANSOU_PLUGINS.split(',');
    if (PANSOU_CLOUD_TYPES) body.cloud_types = splitConfigList(PANSOU_CLOUD_TYPES);
    try {
        body.filter = JSON.parse(PANSOU_FILTER);
    }catch(e){}

    const resp = await OmniBox.request(url.toString(), {
        method:"POST",
        headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        body
    });
    if (resp.statusCode !==200) throw new Error(`HTTP ${resp.statusCode}`);
    if (!resp.body) throw new Error("盘搜返回空");
    return JSON.parse(resp.body);
}

function formatFileSize(size) {
    if (!size || size <=0) return "";
    const unit=1024;
    const arr=["B","K","M","G","T","P"];
    if (size < unit) return `${size}B`;
    let exp=0, s=size;
    while(s>=unit && exp<arr.length-1){ s/=unit; exp++; }
    return s===Math.floor(s) ? `${Math.floor(s)}${arr[exp]}` : `${s.toFixed(2)}${arr[exp]}`;
}

function buildCacheKey(prefix, value) { return `${prefix}:${value}`; }
async function getCachedJSON(key) { try{return await OmniBox.getCache(key);}catch(e){return null;} }
async function setCachedJSON(key, val, sec) { try{await OmniBox.setCache(key,val,sec);}catch(e){} }

// ==================== PanCheck 验活 ====================
async function checkLinksWithPanCheck(links) {
    if (!PANCHECK_ENABLED || !PANCHECK_API || !links.length) return { invalidLinksSet:new Set(), stats:null };
    const { selectedPlatforms, linksToCheck, bypassLinks } = splitLinksByPanCheckPlatforms(links);
    if (!linksToCheck.length) return { invalidLinksSet:new Set(), stats:null };

    const reqBody = { links:linksToCheck };
    if (selectedPlatforms.length) reqBody.selected_platforms = selectedPlatforms;
    const apiUrl = PANCHECK_API.replace(/\/$/,"");
    const resp = await OmniBox.request(`${apiUrl}/api/v1/links/check`,{
        method:"POST",
        headers:{"Content-Type":"application/json","User-Agent":"Mozilla/5.0"},
        body:JSON.stringify(reqBody)
    });
    if (resp.statusCode!==200 || !resp.body) return { invalidLinksSet:new Set(), stats:null };
    const data = JSON.parse(resp.body);
    return { invalidLinksSet:new Set(data.invalid_links||[]), stats:null };
}

function extractLinksFromSearchData(data) {
    const links = [];
    if (!data || !data.data) return links;
    const merged = data.data.merged_by_type || {};
    for (const [_, list] of Object.entries(merged)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const u = String(item.url||item.URL||"");
            if (u) links.push(u);
        }
    }
    return links;
}

function filterInvalidLinks(data, invalidSet) {
    if (!invalidSet.size) return data;
    if (!data || !data.data) return data;
    const copy = JSON.parse(JSON.stringify(data));
    const merged = copy.data.merged_by_type || {};
    for (const [k, list] of Object.entries(merged)) {
        if (!Array.isArray(list)) continue;
        copy.data.merged_by_type[k] = list.filter(item=>{
            const u = String(item.url||item.URL||"");
            return !invalidSet.has(u);
        });
    }
    return copy;
}

async function formatDriveSearchResults(data, keyword) {
    if (!data || !data.data) return [];
    const results = [];
    const merged = data.data.merged_by_type || {};
    for (const [driveType, list] of Object.entries(merged)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            const shareURL = String(item.url||"");
            const note = String(item.note||"");
            const images = item.images||[];
            const dt = String(item.datetime||"");
            if (!shareURL) continue;

            const cacheKey = buildCacheKey("pansou:driveInfo", shareURL);
            let driveInfo = await getCachedJSON(cacheKey);
            if (!driveInfo) {
                driveInfo = await OmniBox.getDriveInfoByShareURL(shareURL);
                await setCachedJSON(cacheKey, driveInfo, PANSOU_CACHE_EX_SECONDS);
            }

            const vodId = `${shareURL}|${keyword||""}|${note}`;
            const vodName = note || shareURL;
            const vodPic = Array.isArray(images)&&images.length?images[0]:driveInfo.iconUrl;
            results.push({
                vod_id:vodId,
                vod_name:vodName,
                vod_pic:vodPic,
                type_id:driveType,
                type_name:driveInfo.displayName,
                vod_remarks:formatDriveShortName(driveInfo.displayName),
                vod_time:dt
            });
        }
    }
    return sortResultsByDriveOrder(results);
}

function isVideoFile(file) {
    if (!file || !file.file_name) return false;
    const name = file.file_name.toLowerCase();
    const exts = [".mp4",".mkv",".avi",".flv",".mov",".wmv",".m3u8",".ts",".webm"];
    return exts.some(e=>name.endsWith(e));
}

async function getAllVideoFiles(shareURL, files) {
    let res = [];
    for (const f of files) {
        if (f.file && isVideoFile(f)) {
            res.push(f);
        } else if (f.dir) {
            try {
                const sub = await OmniBox.getDriveFileList(shareURL, f.fid);
                if (sub && sub.files) res.push(...await getAllVideoFiles(shareURL, sub.files));
            }catch(e){}
        }
    }
    return res;
}

// ==================== IKUN 基础函数 ====================
async function req(params = {}) {
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_DELAY) await new Promise(r=>setTimeout(r, REQUEST_DELAY - (now-lastRequestTime)));
    lastRequestTime = Date.now();

    const url = new URL(SITE_API);
    Object.entries(params).forEach(([k,v])=>v&&url.searchParams.append(k,v));
    const userAgent = USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)];
    const resp = await OmniBox.request(url.href, {
        headers:{
            "User-Agent": userAgent,
            "Referer": BASE_DOMAIN
        }
    });
    return JSON.parse(resp.body);
}

async function getVodPic(vodId, existPic) {
    if (existPic) return existPic;
    if (PIC_CACHE.has(vodId)) return PIC_CACHE.get(vodId);
    try {
        const d = await req({ac:"detail", ids:vodId});
        if (d.list&&d.list[0]&&d.list[0].vod_pic) {
            PIC_CACHE.set(vodId, d.list[0].vod_pic);
            return d.list[0].vod_pic;
        }
    }catch(e){}
    return "";
}

async function buildCategoryList() {
    if (ALL_CATEGORIES.length) return;
    try {
        const d = await req({ac:"list",pg:1,pagesize:1});
        if (!Array.isArray(d.class)) throw new Error("无分类");
        const map = new Map();
        d.class.forEach(item=>{
            const id = String(item.type_id||"");
            const pid = String(item.type_pid||"0");
            const name = String(item.type_name||"");
            if (id&&name) {
                if (!map.has(pid)) map.set(pid,[]);
                map.get(pid).push({type_id:id, type_name:name});
            }
        });
        const top = map.get("0")||[];
        const movie = top.find(c=>c.type_id==="1"||c.type_name.includes("电影"));
        ALL_CATEGORIES = [];
        CATEGORY_TREE = {};
        if (movie) ALL_CATEGORIES.push(...(map.get(movie.type_id)||[]));
        const other = top.filter(c=>c.type_id!==(movie?.type_id||"1"));
        // ============== 关键：给 other 排序（电影分类靠前，其他靠后） ==============
        other.sort((a, b) => {
            const isAMovie = MOVIE_PRIORITY_TYPES.includes(a.type_name);
            const isBMovie = MOVIE_PRIORITY_TYPES.includes(b.type_name);
            if (isAMovie && !isBMovie) return -1;
            if (!isAMovie && isBMovie) return 1;
            return 0;
        });
        ALL_CATEGORIES.push(...other);
        other.forEach(cat=>{
            const child = map.get(cat.type_id)||[];
            CATEGORY_TREE[cat.type_id] = child.map(c=>({name:c.type_name, value:c.type_id}));
        });
        const filterMap = new Map();
        ALL_CATEGORIES = ALL_CATEGORIES.filter(c=>{
            if (filterMap.has(c.type_id)) return false;
            filterMap.set(c.type_id,true);
            return true;
        });
    }catch(e){
        ALL_CATEGORIES = [
            {type_id:"1",type_name:"电影"},
            {type_id:"2",type_name:"电视剧"},
            {type_id:"3",type_name:"综艺"},
            {type_id:"4",type_name:"动漫"}
        ];
        CATEGORY_TREE = {};
    }
}

function buildFilters() {
    const filters = {};
    Object.entries(CATEGORY_TREE).forEach(([tid, child])=>{
        if (child.length>1) {
            filters[tid] = [{key:"cate", name:"类型", init:child[0].value, value:child}];
        }
    });
    return filters;
}

function parseFilterParams(params={}) {
    const res = {};
    if (params.filters) Object.assign(res, typeof params.filters==="string"?JSON.parse(params.filters):params.filters);
    return res;
}

async function fmt(list) {
    if (!Array.isArray(list)) return [];
    const arr = await Promise.all(list.map(async item=>{
        if (!item) return null;
        const pic = await getVodPic(String(item.vod_id||""), String(item.vod_pic||""));
        return {
            vod_id:String(item.vod_id||""),
            vod_name:String(item.vod_name||""),
            vod_pic:pic,
            type_name:String(item.type_name||""),
            vod_remarks:String(item.vod_remarks||""),
            vod_year:String(item.vod_year||"")
        };
    }));
    return arr.filter(i=>i&&i.vod_id);
}

function parsePlay(from, url) {
    const res = [];
    if (!from||!url) return res;
    from.split("$$$").forEach((ln,i)=>{
        const eps = [];
        (url.split("$$$")[i]||"").split("#").forEach((seg,j)=>{
            const [n,u] = seg.split("$");
            if (u) eps.push({name:n||`第${j+1}集`, playId:u});
        });
        if (eps.length) res.push({name:ln, episodes:eps});
    });
    return res;
}

// ==================== 内部私有方法 ====================
async function _getPanDetail(videoId, context, sourceIndex) {
    try {
        const parts = videoId.split("|");
        const shareURL = parts[0]||"";
        const keyword = parts[1]||"";
        if (!shareURL) return null;

        const source = resolveCallerSource({}, context);
        const ckInfo = buildCacheKey("pansou:driveInfo", shareURL);
        const ckFile = buildCacheKey("pansou:rootFiles", shareURL);
        const ckVideo = buildCacheKey("pansou:videoFiles", shareURL);

        let driveInfo = await getCachedJSON(ckInfo);
        let fileList = await getCachedJSON(ckFile);
        if (!driveInfo||!fileList) {
            [driveInfo, fileList] = await Promise.all([
                OmniBox.getDriveInfoByShareURL(shareURL),
                OmniBox.getDriveFileList(shareURL, "0")
            ]);
            await setCachedJSON(ckInfo, driveInfo, PANSOU_CACHE_EX_SECONDS);
            await setCachedJSON(ckFile, fileList, PANSOU_CACHE_EX_SECONDS);
        }
        if (!fileList||!fileList.files) return null;

        let allVideo = await getCachedJSON(ckVideo);
        if (!Array.isArray(allVideo)||!allVideo.length) {
            allVideo = await getAllVideoFiles(shareURL, fileList.files);
            await setCachedJSON(ckVideo, allVideo, PANSOU_CACHE_EX_SECONDS);
        }

        let sourceNames = ["直连"];
        if (DRIVE_TYPE_CONFIG.includes(driveInfo.driveType)) {
            sourceNames = [...SOURCE_NAMES_CONFIG];
            sourceNames = filterSourceNamesForCaller(sourceNames, source, context);
        }

        const playSources = [];
        for (const sn of sourceNames) {
            const eps = allVideo.map(file=>{
                const fid = file.fid||"";
                const fname = file.file_name||"";
                const fsize = file.size||0;
                const meta = Buffer.from(JSON.stringify({t:keyword,e:fname}),"utf8").toString("base64");
                return {
                    name:`[${formatFileSize(fsize)}] ${fname}`,
                    playId:`${shareURL}|${fid}|${meta}`,
                    fileSize: fsize
                };
            });
            if (eps.length) {
                const firstFile = eps[0];
                const resolution = extractResolution(firstFile.name);
                const shortSize = formatSizeShort(firstFile.fileSize);
                const driveShortName = formatDriveShortName(driveInfo.displayName);
                const sourceName = `☁️网盘${sourceIndex+1}-${driveShortName}-${resolution}-${shortSize}-${sn}`;
                playSources.push({
                    name: sourceName,
                    episodes: eps,
                    fileSize: firstFile.fileSize
                });
            }
        }
        return { list:[{vod_play_sources:sortPlaySourcesByDriveOrder(playSources)}] };
    }catch(e){return null;}
}

async function _panPlay(params, context) {
    const flag = params.flag || "";
    const playId = params.playId || "";
    const source = resolveCallerSource(params, context);

    let mainPlayId = playId;
    let metaPart = "";
    const parts = mainPlayId.split("|");
    if (parts.length < 2) throw new Error("参数格式错误");
    const shareURL = parts[0]||"";
    const fileId = parts[1]||"";

    const routeType = resolveRouteType(flag, source, context);
    const playInfo = await OmniBox.getDriveVideoPlayInfo(shareURL, fileId, routeType);
    if (!playInfo||!playInfo.url||!playInfo.url.length) throw new Error("获取播放地址失败");

    const urlsResult = playInfo.url.map(item=>({name:item.name||"播放", url:item.url}));
    return {
        urls:urlsResult,
        flag:shareURL,
        header:playInfo.header||{},
        parse:0,
        danmaku:[]
    };
}

async function _ikunPlay(params) {
    const { playId } = params;
    if (!playId) return { urls:[], flag:"" };
    const header = {
        "User-Agent": USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)],
        "Referer": BASE_DOMAIN
    };
    if (/\.(m3u8|mp4|mkv|ts|flv)/i.test(playId)) {
        return { urls:[{name:"播放", url:playId}], flag:params.flag||"", parse:0, header };
    }
    try {
        const sniff = await OmniBox.sniffVideo(playId, {header});
        if (sniff?.url) {
            return { urls:[{name:"播放", url:sniff.url}], flag:params.flag||"", parse:0, header:{...header,...sniff.header} };
        }
    }catch(e){}
    return { urls:[{name:"播放", url:playId}], flag:params.flag||"", parse:1, header };
}

// ==================== 对外标准接口 ====================
async function home(params, context) {
    await buildCategoryList();
    const data = await req({ac:"list",pg:1,pagesize:PAGE_LIMIT});
    return {
        class:ALL_CATEGORIES,
        list:await fmt(data.list||[]),
        filters:buildFilters()
    };
}

async function category(params) {
    const { categoryId, page=1 } = params;
    if (!categoryId) return { page:1, pagecount:0, total:0, list:[] };
    await buildCategoryList();
    await new Promise(r=>setTimeout(r,100));
    const filter = parseFilterParams(params);
    const childList = CATEGORY_TREE[categoryId]||[];
    let selectedCate = categoryId;
    if (filter.cate) selectedCate = filter.cate;
    else if (childList.length) selectedCate = childList[0].value;

    const data = await req({t:selectedCate, pg:page, pagesize:PAGE_LIMIT});
    return {
        page:parseInt(data.page)||1,
        pagecount:parseInt(data.pagecount)||1,
        total:parseInt(data.total)||0,
        list:await fmt(data.list||[])
    };
}

async function search(params) {
    const { keyword, page=1 } = params;
    if (!keyword) return { page:1, pagecount:0, total:0, list:[] };
    const data = await req({wd:keyword, pg:page, pagesize:PAGE_LIMIT});
    return {
        page:parseInt(data.page)||1,
        pagecount:parseInt(data.pagecount)||1,
        total:parseInt(data.total)||0,
        list:await fmt(data.list||[])
    };
}

async function detail(params, context) {
    try {
        const { videoId } = params;
        if (!videoId) return { list:[] };
        const ikunData = await req({ac:"detail", ids:videoId});
        if (!ikunData.list||!ikunData.list.length) return { list:[] };
        const ikunItem = ikunData.list[0];
        const videoName = ikunItem.vod_name||"";
        const officialSrc = parsePlay(ikunItem.vod_play_from, ikunItem.vod_play_url);
        officialSrc.forEach(s=>s.name = `🎬官方-${s.name}`);

        let panSrc = [];
        if (PANSOU_API && videoName) {
            try {
                const panData = await requestPansouAPI({keyword:videoName});
                let filterData = panData;
                if (PANCHECK_ENABLED && PANCHECK_API) {
                    const links = extractLinksFromSearchData(panData);
                    if (links.length) {
                        const { invalidLinksSet } = await checkLinksWithPanCheck(links);
                        filterData = filterInvalidLinks(panData, invalidLinksSet);
                    }
                }
                const panRes = await formatDriveSearchResults(filterData, videoName);
                
                const allPanSources = [];
                for (let i = 0; i < panRes.length; i++) {
                    const panItem = panRes[i];
                    try {
                        const panDetail = await _getPanDetail(panItem.vod_id, context, i);
                        if (panDetail && panDetail.list.length > 0) {
                            const sources = panDetail.list[0].vod_play_sources || [];
                            allPanSources.push(...sources);
                        }
                    } catch (e) {
                        OmniBox.log("warn", `解析第${i+1}个盘搜源失败: ${e.message}`);
                        continue;
                    }
                }
                panSrc = allPanSources;
            }catch(e){
                OmniBox.log("warn", `网盘资源搜索失败: ${e.message}`);
            }
        }

        panSrc.sort((a, b) => (b.fileSize || 0) - (a.fileSize || 0));
        const allSrc = [...panSrc, ...officialSrc];

        return {
            list:[{
                vod_id:videoId,
                vod_name:ikunItem.vod_name||"",
                vod_pic:ikunItem.vod_pic||"",
                type_name:ikunItem.type_name||"",
                vod_year:ikunItem.vod_year||"",
                vod_area:ikunItem.vod_area||"",
                vod_actor:ikunItem.vod_actor||"",
                vod_director:ikunItem.vod_director||"",
                vod_content:ikunItem.vod_content||"",
                vod_play_sources:allSrc
            }]
        };
    }catch(e){
        return { list:[] };
    }
}

async function play(params, context) {
    const { playId } = params;
    if (!playId) return { urls:[], flag:"" };
    if (playId.includes("|") && (playId.includes("quark.cn")||playId.includes("pan.baidu.com")||playId.includes("uc.cn"))) {
        return await _panPlay(params, context);
    } else {
        return await _ikunPlay(params);
    }
}

module.exports = { home, category, search, detail, play };
const runner = require("spider_runner");
runner.run(module.exports);
