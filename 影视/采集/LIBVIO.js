// @name LIBVIO
// @author 梦
// @description 刮削：已接入，弹幕：已接入，播放记录：已接入，嗅探：不需要（直链优先，支持网盘线路展开）
// @dependencies
// @version 1.4.7
// @downloadURL https://gh-proxy.org/https://github.com/Silent1566/OmniBox-Spider/raw/refs/heads/main/影视/采集/LIBVIO.js

const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { URL } = require("url");
const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

const HOST_CANDIDATES = [
    "https://www.libvios.com",
    "https://libvio.run",
    "https://www.libvio.mov",
    "https://www.libhd.com",
].map((item) => normalizeHost(item)).filter(Boolean);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
let ACTIVE_HOST = HOST_CANDIDATES[0];

const DEFAULT_PAGE_SIZE = 12;
const HOME_CACHE_TTL = 60 * 15;
const CATEGORY_CACHE_TTL = 60 * 10;
const SEARCH_CACHE_TTL = 60 * 10;
const DETAIL_CACHE_TTL = 60 * 20;
const FILTER_CACHE_TTL = 60 * 20;
const PAN_SHARE_CACHE_TTL = 60 * 60;
const PLAY_CACHE_TTL = 60 * 3;
const DRIVE_TYPE_CONFIG = (process.env.DRIVE_TYPE_CONFIG || "quark;uc").split(";").map((t) => t.trim().toLowerCase()).filter(Boolean);
const SOURCE_NAMES_CONFIG = (process.env.SOURCE_NAMES_CONFIG || "本地代理;服务端代理;直连").split(";").map((s) => s.trim()).filter(Boolean);
const DRIVE_ORDER = (process.env.DRIVE_ORDER || "baidu;tianyi;quark;uc;115;xunlei;ali;123pan").split(";").map((s) => s.trim().toLowerCase()).filter(Boolean);
const panShareCache = new Map();

const CLASS_LIST = [
    { type_id: "1", type_name: "电影" },
    { type_id: "2", type_name: "剧集" },
    { type_id: "4", type_name: "动漫" },
    { type_id: "15", type_name: "日韩剧" },
    { type_id: "16", type_name: "欧美剧" }
];

const FILTERS = {
    "1": {
        genre: ["喜剧", "爱情", "恐怖", "动作", "科幻", "剧情", "战争", "警匪", "犯罪", "动画", "奇幻", "武侠", "冒险", "枪战", "悬疑", "惊悚", "经典", "青春", "文艺", "微电影", "古装", "历史", "运动", "农村", "儿童", "网络电影"],
        area: ["中国大陆", "中国香港", "中国台湾", "美国", "法国", "英国", "日本", "韩国", "德国", "泰国", "印度", "意大利", "西班牙", "加拿大", "其他"],
        lang: ["国语", "英语", "粤语", "闽南语", "韩语", "日语", "其它"]
    },
    "2": {
        genre: ["古装", "战争", "青春偶像", "喜剧", "家庭", "犯罪", "动作", "奇幻", "剧情", "历史", "经典", "乡村", "情景", "商战", "网剧", "其他"],
        area: ["中国大陆", "中国台湾", "中国香港", "韩国", "日本", "美国", "泰国", "英国", "新加坡", "其他"],
        lang: ["国语", "英语", "粤语", "闽南语", "韩语", "日语", "其它"]
    },
    "4": {
        genre: ["情感", "科幻", "热血", "推理", "搞笑", "冒险", "萝莉", "校园", "动作", "机战", "运动", "战争", "少年", "少女", "社会", "原创", "亲子", "益智", "励志", "其他"],
        area: ["中国大陆", "日本", "欧美", "其他"],
        lang: ["国语", "英语", "粤语", "闽南语", "韩语", "日语", "其它"]
    },
    "15": {
        genre: ["悬疑", "爱情", "科幻", "青春", "偶像", "喜剧", "古装", "武侠", "家庭", "犯罪", "动作", "奇幻", "剧情", "历史", "经典", "乡村", "情景", "商战", "网剧", "其他"],
        area: ["韩国", "日本", "其他"],
        lang: ["国语", "英语", "粤语", "闽南语", "韩语", "日语", "其它"]
    },
    "16": {
        genre: ["悬疑", "科幻", "青春", "偶像", "喜剧", "犯罪", "动作", "奇幻", "剧情", "历史", "经典", "乡村", "情景", "商战", "网剧", "其他"],
        area: ["美国", "英国", "泰国", "其他"],
        lang: ["国语", "英语", "粤语", "闽南语", "韩语", "日语", "其它"]
    }
};

const SORT_OPTIONS = [
    { name: "最新", value: "time" },
    { name: "人气", value: "hits" },
    { name: "评分", value: "score" }
];

function normalizeHost(url = "") {
    const value = String(url || "").trim();
    if (!value) return "";
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    try {
        const target = new URL(withProtocol);
        return `${target.protocol}//${target.host}`;
    } catch {
        return withProtocol.replace(/\/+$/, "");
    }
}

function getCurrentHost() {
    return ACTIVE_HOST || HOST_CANDIDATES[0];
}

function buildHeadersForHost(host, extra = {}) {
    return {
        "User-Agent": UA,
        "Referer": `${host}/`,
        "Origin": host,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        ...extra,
    };
}

async function requestTextAbsolute(url, options = {}) {
    const target = new URL(url);
    const lib = target.protocol === "https:" ? https : http;
    const hostForHeaders = normalizeHost(options.hostForHeaders || `${target.protocol}//${target.host}`);
    const headers = buildHeadersForHost(hostForHeaders, options.headers || {});

    return await new Promise((resolve, reject) => {
        const req = lib.request(target, {
            method: options.method || "GET",
            headers,
            timeout: options.timeout || 15000,
        }, (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
                const body = Buffer.concat(chunks).toString("utf8");
                if (res.statusCode !== 200) {
                    reject(new Error(`请求失败: ${res.statusCode} ${target.href}`));
                    return;
                }
                resolve(body);
            });
        });

        req.on("error", reject);
        req.on("timeout", () => {
            req.destroy(new Error(`请求超时: ${target.href}`));
        });
        req.end();
    });
}

async function probeHost(host) {
    try {
        await requestTextAbsolute(`${host}/`, { timeout: 8000, hostForHeaders: host });
        return true;
    } catch (error) {
        logInfo("域名探测失败", { host, error: error.message });
        return false;
    }
}

async function ensureActiveHost(preferredHost = "") {
    const preferred = normalizeHost(preferredHost);
    const ordered = [preferred, getCurrentHost(), ...HOST_CANDIDATES].filter(Boolean).filter((item, idx, arr) => arr.indexOf(item) === idx);
    for (const host of ordered) {
        if (await probeHost(host)) {
            if (ACTIVE_HOST !== host) {
                logInfo("切换可用域名", { from: ACTIVE_HOST, to: host });
            }
            ACTIVE_HOST = host;
            return ACTIVE_HOST;
        }
    }
    throw new Error(`未找到可用域名: ${ordered.join(", ")}`);
}

async function requestText(url, options = {}) {
    const raw = String(url || "").trim();
    if (!raw) throw new Error("请求地址为空");

    if (/^https?:\/\//i.test(raw)) {
        return await requestTextAbsolute(raw, options);
    }

    const hosts = [getCurrentHost(), ...HOST_CANDIDATES].filter(Boolean).filter((item, idx, arr) => arr.indexOf(item) === idx);
    let lastError = null;
    for (const host of hosts) {
        try {
            await ensureActiveHost(host);
            const absoluteUrl = raw.startsWith("/") ? `${ACTIVE_HOST}${raw}` : `${ACTIVE_HOST}/${raw}`;
            return await requestTextAbsolute(absoluteUrl, { ...options, hostForHeaders: ACTIVE_HOST });
        } catch (error) {
            lastError = error;
            logInfo("候选域名请求失败", { host, url: raw, error: error.message });
        }
    }
    throw lastError || new Error(`请求失败: ${raw}`);
}

function md5Short(input = "") {
    return crypto.createHash("md5").update(String(input || "")).digest("hex").slice(0, 16);
}

function buildCacheKey(prefix = "", ...parts) {
    const rawParts = parts
        .flat()
        .map((item) => item === undefined || item === null ? "" : String(item))
        .filter((item) => item !== "");
    const raw = rawParts.join("|");
    const short = raw ? md5Short(raw) : "empty";
    return `${prefix}:${short}`;
}

async function getCachedText(cacheKey, ttl, producer) {
    try {
        const cached = await OmniBox.getCache(cacheKey);
        if (cached) return String(cached);
    } catch (error) {
        logInfo("读取文本缓存失败", { cacheKey, error: error.message });
    }
    const text = String(await producer());
    try {
        await OmniBox.setCache(cacheKey, text, ttl);
    } catch (error) {
        logInfo("写入文本缓存失败", { cacheKey, error: error.message });
    }
    return text;
}

async function getCachedJson(cacheKey, ttl, producer) {
    try {
        const cached = await OmniBox.getCache(cacheKey);
        if (cached) return JSON.parse(String(cached));
    } catch (error) {
        logInfo("读取 JSON 缓存失败", { cacheKey, error: error.message });
    }
    const value = await producer();
    try {
        await OmniBox.setCache(cacheKey, JSON.stringify(value), ttl);
    } catch (error) {
        logInfo("写入 JSON 缓存失败", { cacheKey, error: error.message });
    }
    return value;
}

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

function logInfo(message, data = null) {
    OmniBox.log("info", `[LIBVIO] ${data ? `${message}: ${safeJson(data)}` : message}`);
}

function logError(message, error) {
    OmniBox.log("error", `[LIBVIO] ${message}: ${error?.message || error}`);
}

function safeJson(data) {
    try {
        return JSON.stringify(data);
    } catch {
        return String(data);
    }
}

function ensureArray(value) {
    return Array.isArray(value) ? value : [];
}

function stripTags(text = "") {
    return String(text)
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeText(text = "") {
    return stripTags(String(text || ""))
        .normalize("NFKC")
        .replace(/[【】\[\]()（）]/g, " ")
        .replace(/[·•・]/g, " ")
        .replace(/[：:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildMappingPreview(mappings = [], limit = 3) {
    return ensureArray(mappings)
        .slice(0, limit)
        .map((item) => `${item?.fileId || "<empty>"}=>${item?.episodeName || item?.name || "<empty>"}`)
        .join(" | ");
}

function buildScrapedEpisodeName(scrapeData, mapping, fallbackName = "") {
    const fallback = normalizeText(fallbackName || "") || String(fallbackName || "").trim() || "正片";
    if (!mapping) return fallback;
    const seasonNumber = mapping.seasonNumber;
    const episodeNumber = mapping.episodeNumber;
    const rawEpisodeName = normalizeText(mapping.episodeName || "");
    const title = normalizeText(scrapeData?.title || "");
    const episodeTitle = rawEpisodeName && rawEpisodeName !== title ? rawEpisodeName : "";

    if (episodeNumber !== undefined && episodeNumber !== null && episodeNumber !== "") {
        const epLabel = `第${episodeNumber}集`;
        if (episodeTitle) {
            return seasonNumber ? `S${seasonNumber}E${episodeNumber} ${episodeTitle}` : `${epLabel} ${episodeTitle}`;
        }
        return seasonNumber ? `S${seasonNumber}E${episodeNumber}` : epLabel;
    }

    if (episodeTitle) return episodeTitle;
    return fallback;
}

function buildDanmakuFileName(vodName = "", episodeName = "") {
    const title = normalizeText(vodName || "");
    if (!title) return "";
    const episode = normalizeText(episodeName || "");
    return episode ? `${title} ${episode}` : title;
}

function buildHistoryEpisode(playId, episodeNumber, episodeName) {
    if (episodeNumber !== undefined && episodeNumber !== null && episodeNumber !== "") {
        return `${playId || ""}@@${episodeNumber}`;
    }
    return `${playId || ""}@@${normalizeText(episodeName || "正片") || "正片"}`;
}

function sortEpisodesByMeta(episodes = []) {
    if (!Array.isArray(episodes) || episodes.length <= 1) return episodes;
    const items = episodes.map((ep, index) => {
        const meta = decodePlayId(String(ep?.playId || "").split("|||")[1] || "");
        const season = Number(meta?.s);
        const episode = Number(meta?.n);
        return {
            ep,
            index,
            hasSeason: Number.isFinite(season) && season > 0,
            hasEpisode: Number.isFinite(episode) && episode > 0,
            season: Number.isFinite(season) ? season : Number.MAX_SAFE_INTEGER,
            episode: Number.isFinite(episode) ? episode : Number.MAX_SAFE_INTEGER,
        };
    });
    const hasSortable = items.some((item) => item.hasEpisode);
    if (!hasSortable) return episodes;
    items.sort((a, b) => {
        if (a.hasEpisode !== b.hasEpisode) return a.hasEpisode ? -1 : 1;
        if (a.season !== b.season) return a.season - b.season;
        if (a.episode !== b.episode) return a.episode - b.episode;
        return a.index - b.index;
    });
    return items.map((item) => item.ep);
}

function fixUrl(url = "") {
    if (!url) return "";
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("//")) return `https:${url}`;
    const host = getCurrentHost();
    return url.startsWith("/") ? `${host}${url}` : `${host}/${url}`;
}

function encodePlayId(payload) {
    return Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64");
}

function decodePlayId(playId = "") {
    const input = String(playId || "").trim();
    if (!input) return {};

    // 1) 标准 base64 JSON
    try {
        const text = Buffer.from(input, "base64").toString("utf8").trim();
        if (text.startsWith("{") && text.endsWith("}")) {
            return JSON.parse(text);
        }
    } catch {}

    // 2) URL-safe base64 JSON（-/_）
    try {
        const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        const text = Buffer.from(padded, "base64").toString("utf8").trim();
        if (text.startsWith("{") && text.endsWith("}")) {
            return JSON.parse(text);
        }
    } catch {}

    // 3) 直接 JSON 字符串
    try {
        if (input.startsWith("{") && input.endsWith("}")) {
            return JSON.parse(input);
        }
    } catch {}

    return {};
}

function resolveCollectPlayPageUrl(rawPlayId = "", meta = {}) {
    const raw = String(rawPlayId || "").trim();

    // 优先用编码后的 meta.url
    const metaUrl = fixUrl(String(meta?.url || "").trim());
    if (/^https?:\/\//i.test(metaUrl)) return metaUrl;

    // raw 已是绝对/相对路径
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^\//.test(raw)) return fixUrl(raw);
    if (/^[^\s]+\.html?(\?.*)?$/i.test(raw)) return fixUrl(`/${raw}`);

    // raw 可能本身是 base64/json 打包过的 playId
    const nested = decodePlayId(raw);
    const nestedUrl = fixUrl(String(nested?.url || "").trim());
    if (/^https?:\/\//i.test(nestedUrl)) return nestedUrl;

    return "";
}

function buildFilterList(categoryId) {
    const preset = FILTERS[String(categoryId)] || {};
    const list = [];
    if (preset.genre?.length) {
        list.push({
            key: "genre",
            name: "剧情",
            init: "",
            value: [{ name: "全部", value: "" }, ...preset.genre.map((item) => ({ name: item, value: item }))]
        });
    }
    if (preset.area?.length) {
        list.push({
            key: "area",
            name: "地区",
            init: "",
            value: [{ name: "全部", value: "" }, ...preset.area.map((item) => ({ name: item, value: item }))]
        });
    }
    list.push({
        key: "year",
        name: "年份",
        init: "",
        value: [{ name: "全部", value: "" }, ...buildYearOptions()]
    });
    if (preset.lang?.length) {
        list.push({
            key: "lang",
            name: "语言",
            init: "",
            value: [{ name: "全部", value: "" }, ...preset.lang.map((item) => ({ name: item, value: item }))]
        });
    }
    list.push({
        key: "sort",
        name: "排序",
        init: "time",
        value: SORT_OPTIONS.map((item) => ({ name: item.name, value: item.value }))
    });
    return list;
}

function buildYearOptions() {
    const current = new Date().getFullYear();
    const list = [];
    for (let year = current; year >= 1998; year -= 1) {
        list.push({ name: String(year), value: String(year) });
    }
    return list;
}

function getCategoryBasePath(categoryId, page = 1) {
    const cid = encodeURIComponent(String(categoryId));
    return page > 1 ? `/type/${cid}-${page}.html` : `/type/${cid}.html`;
}

function parseFilterGroups(html = "") {
    const groups = [];
    const ulRegex = /<ul class="clearfix">([\s\S]*?)<\/ul>/g;
    let match;
    while ((match = ulRegex.exec(html))) {
        const block = match[1];
        const title = stripTags(block.match(/<li><span>([^<]+)：<\/span><\/li>/)?.[1] || "");
        if (!title) continue;
        const items = [...block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((item) => ({
            name: stripTags(item[2]),
            href: fixUrl(item[1]),
        })).filter((item) => item.name && item.href);
        if (items.length) groups.push({ title, items });
    }
    return groups;
}

function mapFilterTitleToKey(title = "") {
    const text = String(title || "").trim();
    if (text.includes("剧情") || text.includes("类型")) return "genre";
    if (text.includes("地区")) return "area";
    if (text.includes("年份")) return "year";
    if (text.includes("语言")) return "lang";
    if (text.includes("排序") || text.includes("时间") || text.includes("人气") || text.includes("评分")) return "sort";
    return "";
}

function normalizeFilterValue(key, value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (key === "sort") {
        if (["最新", "时间", "time"].includes(raw)) return "time";
        if (["人气", "热门", "hits"].includes(raw)) return "hits";
        if (["评分", "高分", "score"].includes(raw)) return "score";
    }
    return raw;
}

function resolveFilterHref(groups, key, value) {
    const normalizedValue = normalizeFilterValue(key, value);
    const targetNames = new Set();
    if (!normalizedValue) {
        targetNames.add("全部");
        if (key === "sort") {
            targetNames.add("时间");
            targetNames.add("最新");
        }
    } else if (key === "sort") {
        if (normalizedValue === "time") {
            targetNames.add("时间");
            targetNames.add("最新");
        } else if (normalizedValue === "hits") {
            targetNames.add("人气");
            targetNames.add("热门");
        } else if (normalizedValue === "score") {
            targetNames.add("评分");
            targetNames.add("高分");
        }
    } else {
        targetNames.add(normalizedValue);
    }

    for (const group of groups) {
        if (mapFilterTitleToKey(group.title) !== key) continue;
        const found = group.items.find((item) => targetNames.has(item.name));
        if (found?.href) return found.href;
    }
    return "";
}

async function resolveCategoryUrl(categoryId, page, filters = {}) {
    const filterKey = buildCacheKey("libvio:category-filter-url", categoryId, page, JSON.stringify(filters || {}));
    return await getCachedText(filterKey, FILTER_CACHE_TTL, async () => {
        let currentUrl = fixUrl(getCategoryBasePath(categoryId, page));
        const order = ["genre", "area", "year", "lang", "sort"];

        for (const key of order) {
            const html = await fetchHtml(currentUrl, { ttl: FILTER_CACHE_TTL });
            const groups = parseFilterGroups(html);
            const targetHref = resolveFilterHref(groups, key, filters[key]);
            if (targetHref) currentUrl = targetHref;
        }

        return currentUrl;
    });
}

function buildSearchPath(keyword, page = 1) {
    const pageSeg = page > 1 ? String(page) : "";
    return `/search/------------${pageSeg}---.html?wd=${encodeURIComponent(keyword)}`;
}

async function fetchHtml(url, options = {}) {
    const ttl = Number(options?.ttl || 0);
    if (ttl > 0) {
        const cacheKey = buildCacheKey("libvio:html", url);
        return await getCachedText(cacheKey, ttl, async () => String(await requestText(url, options)));
    }
    return String(await requestText(url, options));
}

function parseVodList(html = "") {
    const results = [];
    const regex = /<div class="stui-vodlist__box">([\s\S]*?)<\/div>\s*<\/li>/g;
    let match;
    while ((match = regex.exec(html))) {
        const block = match[1];
        const href = block.match(/href="([^"]*\/detail\/\d+\.html)"/);
        const title = block.match(/title="([^"]+)"/);
        const pic = block.match(/data-original="([^"]+)"/);
        const remark = block.match(/<span class="pic-text[^>]*">([\s\S]*?)<\/span>/);
        const score = block.match(/<span class="pic-tag[^>]*">([\s\S]*?)<\/span>/);
        if (!href || !title) continue;
        results.push({
            vod_id: fixUrl(href[1]),
            vod_name: stripTags(title[1]),
            vod_pic: fixUrl(pic?.[1] || ""),
            vod_remarks: stripTags(remark?.[1] || score?.[1] || ""),
            vod_score: stripTags(score?.[1] || "")
        });
    }
    return results;
}

function normalizePanSourceName(name = "") {
    const text = stripTags(name);
    const match = text.match(/\(([^()]+)\)/);
    if (match?.[1]) return match[1].trim();
    return text.replace(/^视频下载\s*/u, "").trim() || text;
}

function splitNetdiskPanels(html = "") {
    const marker = '<div class="playlist-panel netdisk-panel">';
    const pieces = String(html || "").split(marker);
    return pieces.slice(1).map((part) => marker + part);
}

function parseMetaItems(html = "") {
    return ensureArray(html.match(/<span class="meta-item">([\s\S]*?)<\/span>/g)).map((item) => stripTags(item));
}

function isPanUrl(url = "") {
    const u = String(url || "").toLowerCase();
    return u.includes("pan.baidu.com") || u.includes("quark.cn") || u.includes("pan.quark.cn") || u.includes("drive.uc.cn") || u.includes("aliyundrive.com") || u.includes("alipan.com") || u.includes("xunlei.com") || u.includes("cloud.189.cn") || u.includes("115.com") || u.includes("123pan.com");
}

function normalizeShareUrl(url = "") {
    let value = String(url || "").trim();
    if (value.startsWith("push://")) value = value.slice("push://".length);
    if (value.startsWith("push:")) value = value.slice("push:".length);
    return value.trim();
}

function isVideoFile(file) {
    if (!file) return false;
    const fileName = String(file.file_name || file.name || "").toLowerCase();
    const exts = [".mp4", ".mkv", ".avi", ".flv", ".mov", ".wmv", ".m3u8", ".ts", ".webm", ".m4v"];
    if (exts.some((ext) => fileName.endsWith(ext))) return true;
    const formatType = String(file.format_type || "").toLowerCase();
    return formatType.includes("video") || formatType.includes("mpeg") || formatType.includes("h264");
}

function getFileId(file) {
    return file?.fid || file?.file_id || "";
}

function getFileName(file) {
    return file?.file_name || file?.name || "";
}

async function getAllVideoFiles(shareURL, files) {
    const result = [];
    for (const file of files || []) {
        if (file?.file && isVideoFile(file)) {
            result.push(file);
            continue;
        }
        if (file?.dir) {
            try {
                const subFileId = getFileId(file);
                if (!subFileId) continue;
                const subFileList = await OmniBox.getDriveFileList(shareURL, subFileId);
                if (Array.isArray(subFileList?.files)) {
                    const subVideos = await getAllVideoFiles(shareURL, subFileList.files);
                    result.push(...subVideos);
                }
            } catch (error) {
                logInfo("获取网盘子目录失败", { shareURL, name: getFileName(file), error: error.message });
            }
        }
    }
    return result;
}

async function loadPanFiles(shareURL) {
    if (!shareURL) return null;
    if (panShareCache.has(shareURL)) return panShareCache.get(shareURL);
    const cacheKey = buildCacheKey("libvio:pan-share", shareURL);
    try {
        const result = await getCachedJson(cacheKey, PAN_SHARE_CACHE_TTL, async () => {
            const driveInfo = await OmniBox.getDriveInfoByShareURL(shareURL);
            const fileList = await OmniBox.getDriveFileList(shareURL, "0");
            const files = Array.isArray(fileList?.files) ? fileList.files : [];
            const videos = await getAllVideoFiles(shareURL, files);
            return { driveInfo, videos };
        });
        panShareCache.set(shareURL, result);
        return result;
    } catch (error) {
        logInfo("读取网盘文件失败", { shareURL, error: error.message });
        return null;
    }
}

function inferDriveTypeFromSourceName(name = "") {
    const raw = String(name || "").toLowerCase();
    if (raw.includes("百度")) return "baidu";
    if (raw.includes("天翼")) return "tianyi";
    if (raw.includes("夸克")) return "quark";
    if (raw === "uc" || raw.includes("uc")) return "uc";
    if (raw.includes("115")) return "115";
    if (raw.includes("迅雷")) return "xunlei";
    if (raw.includes("阿里")) return "ali";
    if (raw.includes("123")) return "123pan";
    return raw;
}

function sortPlaySourcesByDriveOrder(playSources = []) {
    if (!Array.isArray(playSources) || playSources.length <= 1 || DRIVE_ORDER.length === 0) {
        return playSources;
    }
    const orderMap = new Map(DRIVE_ORDER.map((name, index) => [name, index]));
    return [...playSources].sort((a, b) => {
        const aType = inferDriveTypeFromSourceName(a?.name || "");
        const bType = inferDriveTypeFromSourceName(b?.name || "");
        const aOrder = orderMap.has(aType) ? orderMap.get(aType) : Number.MAX_SAFE_INTEGER;
        const bOrder = orderMap.has(bType) ? orderMap.get(bType) : Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
    });
}

function buildPanEpisodePlayId(shareURL, fileId, meta = {}) {
    return `${shareURL}|${fileId}|||${encodePlayId(meta)}`;
}

function decodeCombinedPlayId(playId = "") {
    if (!String(playId).includes("|||")) return { main: String(playId || ""), meta: {} };
    const [main, metaB64] = String(playId).split("|||");
    return { main, meta: decodePlayId(metaB64 || "") };
}

function expandPanSourcesWithRoutes(playSources = [], from = "web") {
    const result = [];
    for (const source of playSources) {
        const driveType = inferDriveTypeFromSourceName(source?.name || "");
        const shouldExpandRoutes = DRIVE_TYPE_CONFIG.length === 0 || !driveType || DRIVE_TYPE_CONFIG.includes(driveType);

        if (!shouldExpandRoutes) {
            result.push(source);
            continue;
        }

        let routeNames = [...SOURCE_NAMES_CONFIG];
        if (from === "web") {
            routeNames = routeNames.filter((name) => name !== "本地代理");
        }
        if (!routeNames.length) {
            result.push(source);
            continue;
        }

        for (const routeName of routeNames) {
            result.push({
                name: `${source.name}-${routeName}`,
                episodes: (source.episodes || []).map((ep) => {
                    const decoded = decodeCombinedPlayId(ep.playId);
                    const baseMeta = decoded.meta || {};
                    const fileId = String(baseMeta.fileId || baseMeta.fid || "").trim();
                    const shareUrl = String(baseMeta.shareUrl || baseMeta.shareURL || "").trim();
                    const fid = shareUrl && fileId ? `${shareUrl}|${fileId}` : fileId;
                    const meta = { ...(decoded.meta || {}), routeType: routeName, flag: `${source.name}-${routeName}`, fid: fid || baseMeta.fid || "" };
                    return {
                        name: ep.name,
                        playId: `${decoded.main}|||${encodePlayId(meta)}`
                    };
                })
            });
        }
    }
    return result;
}

function decodePlayerUrl(url = "", encrypt = 0) {
    let value = String(url || "").trim();
    const mode = Number(encrypt || 0);
    if (!value) return "";
    try {
        if (mode === 1) {
            value = unescape(value);
        } else if (mode === 2) {
            value = unescape(Buffer.from(value, "base64").toString("utf8"));
        }
    } catch (error) {
        logError("播放地址解码失败", error);
    }
    return value.replace(/\\\//g, "/");
}

function buildPlayUrl(rawUrl = "") {
    const value = String(rawUrl || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith("//")) return `https:${value}`;
    return fixUrl(value);
}

function isDirectMediaUrl(url = "") {
    const value = String(url || "").trim();
    if (!/^https?:\/\//i.test(value)) return false;
    try {
        const target = new URL(value);
        const pathname = target.pathname.toLowerCase();
        return /\.(m3u8|mp4|m4v|m4a|mp3|flv|avi|mkv|mov|webm)(?:$|\?)/i.test(pathname) || /\.(m3u8|mp4|m4v|m4a|mp3|flv|avi|mkv|mov|webm)$/i.test(value.toLowerCase());
    } catch {
        return /\.(m3u8|mp4|m4v|m4a|mp3|flv|avi|mkv|mov|webm)(?:$|\?)/i.test(value.toLowerCase());
    }
}

function buildProviderIframeUrl(player = {}) {
    const from = String(player?.from || '').trim();
    const rawUrl = String(player?.url || '').trim();
    const id = String(player?.id || '').trim();
    const nid = String(player?.nid || '').trim();
    const next = String(player?.link_next || '').trim();
    if (!from || !rawUrl) return "";

    if (from === 'ty_new1') {
        return `${getCurrentHost()}/vid/ty4.php?url=${encodeURIComponent(rawUrl)}&next=${encodeURIComponent(next)}&id=${encodeURIComponent(id)}&nid=${encodeURIComponent(nid)}`;
    }
    if (from === 'vr2') {
        return `${getCurrentHost()}/vid/plyr/vr2.php?url=${encodeURIComponent(rawUrl)}&next=${encodeURIComponent(next)}&id=${encodeURIComponent(id)}&nid=${encodeURIComponent(nid)}`;
    }
    return "";
}

function emptyPlay(flag = "LIBVIO") {
    return { parse: 0, flag, urls: [] };
}

function emptyPage(page = 1) {
    return { page, pagecount: 0, total: 0, limit: DEFAULT_PAGE_SIZE, list: [] };
}

async function home(params, context) {
    try {
        logInfo("home 进入", { params, host: getCurrentHost(), from: context?.from || "web" });
        const html = await fetchHtml("/", { ttl: HOME_CACHE_TTL });
        const list = parseVodList(html).slice(0, 24);
        const classes = CLASS_LIST.map((item) => ({ ...item }));
        const filters = {};
        for (const item of classes) {
            filters[item.type_id] = buildFilterList(item.type_id);
        }
        logInfo("home 完成", { classCount: classes.length, listCount: list.length });
        return { class: classes, filters, list };
    } catch (error) {
        logError("home 失败", error);
        return { class: [], filters: {}, list: [] };
    }
}

async function category(params, context) {
    const categoryId = String(params?.categoryId || "1");
    const page = Number(params?.page || 1);
    const filters = params?.filters || {};
    try {
        const finalUrl = await resolveCategoryUrl(categoryId, page, filters);
        logInfo("category 请求", { categoryId, page, filters, host: getCurrentHost(), path: finalUrl.replace(getCurrentHost(), ""), from: context?.from || "web" });
        const html = await fetchHtml(finalUrl, { ttl: CATEGORY_CACHE_TTL });
        const list = parseVodList(html);
        const hasNext = html.includes(`>${page + 1}<`) || html.includes(`-${page + 1}---`) || html.includes(`下一页`);
        const pagecount = list.length === DEFAULT_PAGE_SIZE && hasNext ? page + 1 : (page > 1 || list.length ? page : 0);
        logInfo("category 完成", { categoryId, page, listCount: list.length, pagecount });
        return {
            page,
            pagecount,
            total: pagecount ? pagecount * DEFAULT_PAGE_SIZE : list.length,
            limit: DEFAULT_PAGE_SIZE,
            filters: buildFilterList(categoryId),
            list
        };
    } catch (error) {
        logError("category 失败", error);
        return { ...emptyPage(page), filters: buildFilterList(categoryId) };
    }
}

async function detail(params, context) {
    const videoId = String(params?.videoId || "").trim();
    if (!videoId) return { list: [] };
    try {
        logInfo("detail 请求", { videoId, host: getCurrentHost(), from: context?.from || "web" });
        const html = await fetchHtml(videoId, { ttl: DETAIL_CACHE_TTL });
        const name = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] || "");
        const poster = fixUrl(html.match(/class="lazyload"[^>]*data-original="([^"]+)"/)?.[1] || html.match(/data-original="([^"]+)"/)?.[1] || "");
        const intro = stripTags(html.match(/<span class="detail-content"[^>]*>([\s\S]*?)<\/span>/)?.[1] || "");
        const score = stripTags(html.match(/<span class="score">([^<]+)<\/span>/)?.[1] || "");
        const metaItems = parseMetaItems(html);
        const typeName = metaItems[0] || "";
        const area = metaItems[1] || "";
        const year = metaItems[2]?.replace(/[^\d]/g, "") || "";
        const remarks = metaItems[5] || html.match(/<span class="pic-text[^>]*">([\s\S]*?)<\/span>/)?.[1] || "";
        const actor = metaItems.find((item) => item.startsWith("主演："))?.replace(/^主演：/, "") || "";
        const director = metaItems.find((item) => item.startsWith("导演："))?.replace(/^导演：/, "") || "";

        const sourceMatches = [...html.matchAll(/<div class="playlist-panel">([\s\S]*?)<\/ul>/g)];
        const collectSources = sourceMatches.map((matched, sourceIndex) => {
            const block = matched[1];
            const sourceName = stripTags(block.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] || "播放");
            const episodes = [...block.matchAll(/href="([^"]*\/play\/[^\"]+\.html)"[^>]*>([\s\S]*?)<\/a>/g)].map((item, episodeIndex) => {
                const episodeName = stripTags(item[2]);
                const playUrl = fixUrl(item[1]);
                const fid = `${videoId}#${sourceIndex}#${episodeIndex}`;
                const meta = {
                    mode: "collect",
                    url: playUrl,
                    flag: sourceName,
                    name: episodeName,
                    v: name,
                    e: episodeName,
                    sid: videoId,
                    fid,
                    t: sourceName,
                    i: episodeIndex,
                };
                return {
                    name: episodeName,
                    playId: `${playUrl}|||${encodePlayId(meta)}`,
                    _fid: fid,
                    _rawName: episodeName,
                };
            });
            return { name: sourceName, episodes };
        }).filter((item) => item.episodes.length && !/视频下载|网盘|夸克|uc|百度|阿里|迅雷|115|123pan/i.test(item.name || ""));

        const netdiskPanels = splitNetdiskPanels(html);
        const netdiskSources = [];
        for (const panelHtml of netdiskPanels) {
            const sourceName = normalizePanSourceName(panelHtml.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] || "网盘");
            const shareItems = [...panelHtml.matchAll(/<a class="netdisk-item"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span class="netdisk-name">([\s\S]*?)<\/span>[\s\S]*?<span class="netdisk-url">([\s\S]*?)<\/span>/g)];
            const episodes = [];
            for (const item of shareItems) {
                const shareUrl = normalizeShareUrl(stripTags(item[3] || item[1] || "").trim());
                if (!isPanUrl(shareUrl)) continue;
                const panInfo = await loadPanFiles(shareUrl);
                const files = Array.isArray(panInfo?.videos) ? panInfo.videos : [];
                if (!files.length) continue;
                for (const file of files) {
                    const fileId = getFileId(file);
                    if (!fileId) continue;
                    const fileName = getFileName(file) || stripTags(item[2] || "网盘资源").trim();
                    episodes.push({
                        name: fileName,
                        playId: buildPanEpisodePlayId(shareUrl, fileId, {
                            mode: "pan-file",
                            shareUrl,
                            fileId,
                            flag: sourceName,
                            name: fileName,
                            vodName: name,
                            vodId: String(videoId || "")
                        })
                    });
                }
            }
            if (episodes.length) {
                netdiskSources.push({ name: sourceName, episodes });
            }
        }

        const sortedNetdiskSources = sortPlaySourcesByDriveOrder(netdiskSources);
        const expandedNetdiskSources = expandPanSourcesWithRoutes(sortedNetdiskSources, context?.from || "web");
        const normalizedCollectSources = collectSources.map((source) => ({
            name: source.name,
            episodes: (source.episodes || []).map((ep) => ({ name: ep.name, playId: ep.playId }))
        }));
        const vod_play_sources = [...normalizedCollectSources, ...expandedNetdiskSources];
        for (const source of vod_play_sources) {
            for (const ep of source.episodes || []) {
                const decoded = decodeCombinedPlayId(ep.playId || "");
                const meta = decoded.meta || {};
                if (!meta.fid) {
                    const fileId = String(meta.fileId || "").trim();
                    const shareUrl = String(meta.shareUrl || meta.shareURL || "").trim();
                    if (shareUrl && fileId) {
                        meta.fid = `${shareUrl}|${fileId}`;
                        ep.playId = `${decoded.main}|||${encodePlayId(meta)}`;
                    }
                }
            }
        }
        const scrapeSourceHints = [];
        const scrapeSourceBuckets = [];
        for (const source of collectSources) {
            if (Array.isArray(source?.episodes) && source.episodes.length) {
                scrapeSourceBuckets.push({
                    name: source.name,
                    episodes: source.episodes.map((ep) => ({ ...ep, _scrapeSourceType: "collect" }))
                });
                scrapeSourceHints.push(`${source.name || "采集"}:${source.episodes.length}`);
            }
        }
        for (const source of netdiskSources) {
            if (Array.isArray(source?.episodes) && source.episodes.length) {
                scrapeSourceBuckets.push({
                    name: source.name,
                    episodes: source.episodes.map((ep, episodeIndex) => {
                        const meta = decodeCombinedPlayId(ep.playId || "")?.meta || {};
                        const shareUrl = String(meta.shareUrl || meta.shareURL || "").trim();
                        const fileId = String(meta.fileId || meta.fid || "").trim();
                        const fid = shareUrl && fileId ? `${shareUrl}|${fileId}` : (fileId || ep.playId);
                        return {
                            ...ep,
                            _fid: fid,
                            _rawName: ep.name || "正片",
                            _scrapeSourceType: "pan",
                            _scrapeMeta: {
                                ...meta,
                                fid,
                                sid: String(meta.sid || meta.vodId || videoId || ""),
                                i: Number.isFinite(Number(meta.i)) ? Number(meta.i) : episodeIndex,
                            }
                        };
                    })
                });
                scrapeSourceHints.push(`${source.name || "网盘"}:${source.episodes.length}`);
            }
        }
        logInfo("detail 线路统计", { videoId, collectSourceCount: collectSources.length, netdiskSourceCount: netdiskSources.length, scrapeSourceCount: scrapeSourceBuckets.length, scrapeSources: scrapeSourceHints.join(" | ") });
        const result = {
            list: [{
                vod_id: videoId,
                vod_name: name,
                vod_pic: poster,
                type_name: typeName,
                vod_year: year,
                vod_area: area,
                vod_actor: actor,
                vod_director: director,
                vod_content: intro,
                vod_douban_score: score.replace(/分$/, ""),
                vod_remarks: stripTags(remarks),
                vod_play_sources
            }],
            _play_sources_for_scrape: scrapeSourceBuckets,
        };
        const vod = result.list?.[0];
        const scrapePlaySources = Array.isArray(result._play_sources_for_scrape) ? result._play_sources_for_scrape : vod?.vod_play_sources || [];
        const canProcessScraping = typeof OmniBox.processScraping === "function";
        const canGetScrapeMetadata = typeof OmniBox.getScrapeMetadata === "function";
        if (!vod) {
            logInfo("detail 跳过刮削", { videoId, reason: "vod 为空" });
        } else if (!Array.isArray(scrapePlaySources) || scrapePlaySources.length === 0) {
            logInfo("detail 无站内采集线路，跳过刮削", { videoId, sourceCount: Array.isArray(scrapePlaySources) ? scrapePlaySources.length : -1 });
        } else if (!canProcessScraping || !canGetScrapeMetadata) {
            logInfo("detail 宿主未提供刮削能力，跳过刮削", { videoId, hasProcessScraping: canProcessScraping, hasGetScrapeMetadata: canGetScrapeMetadata });
        } else {
            let scrapeData = null;
            let videoMappings = [];
            const scrapeCandidates = [];
            for (const source of scrapePlaySources) {
                for (const ep of source.episodes || []) {
                    const fid = ep._fid || decodePlayId(String(ep.playId || "").split("|||")[1] || "")?.fid || ep.playId;
                    if (!fid) continue;
                    scrapeCandidates.push({
                        fid,
                        file_id: fid,
                        file_name: ep._rawName || ep.name || "正片",
                        name: ep._rawName || ep.name || "正片",
                        format_type: "video",
                    });
                }
            }
            logInfo("detail 刮削候选", { videoId, count: scrapeCandidates.length, preview: scrapeCandidates.slice(0, 3).map((item) => `${item.fid}=>${item.file_name}`).join(" | ") });
            if (scrapeCandidates.length === 0) {
                logInfo("detail 刮削候选为空，跳过刮削", { videoId, sourceNames: scrapePlaySources.map((item) => item?.name || "") });
            }
            if (scrapeCandidates.length > 0) {
                try {
                    const scrapeKeyword = normalizeText(vod.vod_name || name || "");
                    const scrapingResult = await OmniBox.processScraping(videoId, scrapeKeyword, scrapeKeyword, scrapeCandidates);
                    logInfo("detail 刮削完成", { videoId, keyword: scrapeKeyword, result: JSON.stringify(scrapingResult || {}).slice(0, 200) });
                    const metadata = await OmniBox.getScrapeMetadata(videoId);
                    scrapeData = metadata?.scrapeData || null;
                    videoMappings = Array.isArray(metadata?.videoMappings) ? metadata.videoMappings : [];
                    logInfo("detail 刮削元数据", {
                        videoId,
                        hasScrapeData: !!scrapeData,
                        mappings: videoMappings.length,
                        scrapeType: metadata?.scrapeType || "",
                        mappingPreview: buildMappingPreview(videoMappings),
                        candidatePreview: scrapeCandidates.slice(0, 3).map((item) => item.file_id || item.fid || "<empty>").join(" | ")
                    });
                } catch (error) {
                    logInfo("detail 刮削失败", { videoId, error: error.message });
                }
            }
            logInfo("detail 刮削后状态", {
                videoId,
                hasScrapeData: !!scrapeData,
                mappingCount: Array.isArray(videoMappings) ? videoMappings.length : 0,
                scrapePlaySourceCount: scrapePlaySources.length,
                vodPlaySourceCount: Array.isArray(vod?.vod_play_sources) ? vod.vod_play_sources.length : 0,
            });
            if (scrapeData) {
                vod.vod_name = scrapeData.title || vod.vod_name;
                if (scrapeData.posterPath) {
                    vod.vod_pic = `https://image.tmdb.org/t/p/w500${scrapeData.posterPath}`;
                }
                if (scrapeData.overview) {
                    vod.vod_content = scrapeData.overview;
                }
            }
            for (const source of vod.vod_play_sources || []) {
                for (const ep of source.episodes || []) {
                    if (!String(ep.playId || "").includes("|||")) continue;
                    const [mainPlayId, metaB64] = String(ep.playId || "").split("|||");
                    const meta = decodePlayId(metaB64 || "");
                    const fid = meta?.fid;
                    if (!fid) continue;
                    const mapping = videoMappings.find((item) => item?.fileId === fid);
                    if (!mapping) {
                        logInfo("detail 分集未命中刮削映射", {
                            fid,
                            episodeName: ep.name || "",
                            mappingPreview: buildMappingPreview(videoMappings),
                        });
                        continue;
                    }
                    const oldName = ep.name;
                    const newName = buildScrapedEpisodeName(scrapeData, mapping, oldName);
                    if (newName && newName !== oldName) {
                        ep.name = newName;
                        logInfo("detail 应用刮削分集名", { from: oldName, to: newName, fid });
                    }
                    meta.e = ep.name;
                    meta.s = mapping.seasonNumber;
                    meta.n = mapping.episodeNumber;
                    ep.playId = `${mainPlayId}|||${encodePlayId(meta)}`;
                }
                source.episodes = sortEpisodesByMeta(source.episodes || []);
            }
        }

        logInfo("detail 完成", { videoId, sourceCount: vod_play_sources.length, episodeCount: vod_play_sources.reduce((n, item) => n + item.episodes.length, 0) });
        return result;
    } catch (error) {
        logError("detail 失败", error);
        return { list: [] };
    }
}

async function search(params, context) {
    const keyword = String(params?.keyword || "").trim();
    const page = Number(params?.page || 1);
    if (!keyword) return emptyPage(page);
    try {
        const path = buildSearchPath(keyword, page);
        logInfo("search 请求", { keyword, page, host: getCurrentHost(), path, quick: params?.quick ? 1 : 0, from: context?.from || "web" });
        const html = await fetchHtml(path, { ttl: SEARCH_CACHE_TTL });
        const list = parseVodList(html);
        const pagecount = list.length === DEFAULT_PAGE_SIZE ? page + 1 : page;
        logInfo("search 完成", { keyword, page, listCount: list.length, pagecount });
        return {
            page,
            pagecount,
            total: list.length + (pagecount > page ? DEFAULT_PAGE_SIZE : 0),
            limit: DEFAULT_PAGE_SIZE,
            list
        };
    } catch (error) {
        logError("search 失败", error);
        return emptyPage(page);
    }
}

async function play(params, context) {
    const flag = String(params?.flag || "LIBVIO");
    const playId = String(params?.playId || "").trim();
    if (!playId) return emptyPlay(flag);
    try {
        const { main: rawPlayId, meta } = decodeCombinedPlayId(playId);
        const playPageUrl = resolveCollectPlayPageUrl(rawPlayId, meta);
        const playFlag = String(meta.flag || flag || "LIBVIO");
        if (!playPageUrl) {
            logInfo("play 无法解析播放页地址", { rawPlayId, flag: playFlag, meta });
            return emptyPlay(playFlag);
        }

        if (meta.mode === "pan-file") {
            const shareURL = normalizeShareUrl(meta.shareUrl || "");
            const fileId = String(meta.fileId || "");
            const routeType = String(meta.routeType || "").trim() || (context?.from === "web" ? "服务端代理" : "直连");
            if (shareURL && fileId) {
                const playInfoPromise = OmniBox.getDriveVideoPlayInfo(shareURL, fileId, routeType);
                const metadataPromise = (async () => {
                    const result = {
                        danmakuList: [],
                        scrapeTitle: "",
                        scrapePic: "",
                        episodeNumber: meta?.n ?? null,
                        episodeName: meta?.name || meta?.e || "",
                    };
                    if (!meta?.fid || typeof OmniBox.getScrapeMetadata !== "function") {
                        logInfo("play 网盘增强链路跳过", { shareURL, fid: meta?.fid || "" });
                        return result;
                    }
                    try {
                        const metadata = await OmniBox.getScrapeMetadata(String(meta.sid || meta.vodId || ""));
                        if (!metadata || !metadata.scrapeData) {
                            logInfo("play 网盘增强链路跳过: metadata 不完整", { shareURL, vodId: meta.sid || meta.vodId || "" });
                            return result;
                        }
                        result.scrapeTitle = metadata.scrapeData.title || "";
                        if (metadata.scrapeData.posterPath) {
                            result.scrapePic = `https://image.tmdb.org/t/p/w500${metadata.scrapeData.posterPath}`;
                        }
                        const mappings = Array.isArray(metadata.videoMappings) ? metadata.videoMappings : [];
                        const mapping = mappings.find((item) => item?.fileId === meta.fid);
                        if (mapping) {
                            result.episodeName = buildScrapedEpisodeName(metadata.scrapeData, mapping, result.episodeName || meta.name || "");
                            if (mapping.episodeNumber !== undefined && mapping.episodeNumber !== null) {
                                result.episodeNumber = mapping.episodeNumber;
                            }
                        }
                        const fileName = buildDanmakuFileName(result.scrapeTitle || meta.vodName || "", result.episodeName || meta.name || "");
                        if (fileName && typeof OmniBox.getDanmakuByFileName === "function") {
                            const matchedDanmaku = await OmniBox.getDanmakuByFileName(fileName);
                            if (Array.isArray(matchedDanmaku) && matchedDanmaku.length > 0) {
                                result.danmakuList = matchedDanmaku;
                            }
                            logInfo("play 网盘弹幕匹配", { fileName, count: Array.isArray(matchedDanmaku) ? matchedDanmaku.length : 0 });
                        }
                    } catch (error) {
                        logInfo("play 网盘增强链路失败", { shareURL, error: error.message });
                    }
                    return result;
                })();
                const [playInfoResult, metadataResult] = await Promise.allSettled([playInfoPromise, metadataPromise]);
                if (playInfoResult.status === "fulfilled") {
                    const playInfo = playInfoResult.value || {};
                    const urlList = Array.isArray(playInfo?.url) ? playInfo.url : [];
                    const metadataValue = metadataResult.status === "fulfilled" ? metadataResult.value : {};
                    const danmakuList = metadataValue?.danmakuList?.length ? metadataValue.danmakuList : (playInfo?.danmaku || []);
                    if (meta?.fid && context?.sourceId && typeof OmniBox.addPlayHistory === "function") {
                        const historyPayload = {
                            vodId: String(meta.sid || meta.vodId || ""),
                            title: metadataValue?.scrapeTitle || meta.vodName || meta.name || "LIBVIO视频",
                            pic: metadataValue?.scrapePic || "",
                            episode: buildHistoryEpisode(playId, metadataValue?.episodeNumber, metadataValue?.episodeName || meta.name || meta.e || ""),
                            sourceId: context.sourceId,
                            episodeNumber: metadataValue?.episodeNumber,
                            episodeName: metadataValue?.episodeName || meta.name || meta.e || "",
                        };
                        OmniBox.addPlayHistory(historyPayload).then((added) => {
                            OmniBox.log("info", `[LIBVIO] play 网盘播放记录${added ? "已添加" : "已存在"}: ${historyPayload.title}`);
                        }).catch((error) => {
                            OmniBox.log("info", `[LIBVIO] play 网盘添加播放记录失败: ${error.message}`);
                        });
                    }
                    return {
                        urls: urlList.map((item) => ({ name: item.name || meta.name || "播放", url: item.url })),
                        flag: shareURL,
                        header: playInfo?.header || {},
                        parse: 0,
                        danmaku: danmakuList,
                    };
                }
                logInfo("play 网盘直取失败", { shareURL, fileId, routeType, error: playInfoResult.reason?.message || String(playInfoResult.reason || "") });
                return {
                    parse: 0,
                    flag: playFlag,
                    urls: [{ name: meta.name || "网盘资源", url: `push://${shareURL}` }]
                };
            }
        }

        const sniffHeaders = {
            Referer: `${getCurrentHost()}/`,
            Origin: getCurrentHost(),
            "User-Agent": UA
        };
        const playInfoPromise = (async () => {
            const cacheKey = buildCacheKey("libvio:play", playPageUrl, playFlag, context?.from || "web");
            return await getCachedJson(cacheKey, PLAY_CACHE_TTL, async () => {
                logInfo("play 请求", { playPageUrl, flag: playFlag, from: context?.from || "web" });
                const html = await fetchHtml(playPageUrl, { ttl: PLAY_CACHE_TTL });
                const playerJson = html.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})<\/script>/)?.[1];
                if (!playerJson) {
                    logInfo("play 未找到 player_aaaa", { playPageUrl });
                    return {
                        parse: 1,
                        flag: playFlag,
                        header: sniffHeaders,
                        urls: [{ name: meta.name || "播放", url: playPageUrl }],
                        danmaku: []
                    };
                }

                const player = JSON.parse(playerJson);
                const realUrl = buildPlayUrl(decodePlayerUrl(player.url, player.encrypt));
                if (realUrl && isDirectMediaUrl(realUrl)) {
                    logInfo("play 直链完成", { playPageUrl, from: player.from, finalUrl: realUrl });
                    return {
                        parse: 0,
                        flag: playFlag,
                        header: sniffHeaders,
                        urls: [{ name: meta.name || "播放", url: realUrl }],
                        danmaku: []
                    };
                }

                const iframeUrl = buildProviderIframeUrl(player);
                const sniffTarget = iframeUrl || playPageUrl;
                try {
                    const sniffResult = await OmniBox.sniffVideo(sniffTarget, sniffHeaders);
                    const sniffUrls = Array.isArray(sniffResult?.urls) ? sniffResult.urls.filter((item) => item?.url) : [];
                    if (!sniffUrls.length && sniffResult?.url) {
                        sniffUrls.push({ name: meta.name || "播放", url: sniffResult.url });
                    }
                    if (sniffUrls.length) {
                        logInfo("play SDK嗅探完成", { playPageUrl, from: player.from, sniffTarget, sniffCount: sniffUrls.length, first: sniffUrls[0] || null });
                        return {
                            parse: 0,
                            flag: playFlag,
                            header: sniffResult?.header || sniffHeaders,
                            urls: sniffUrls.map((item) => ({ name: item.name || meta.name || "播放", url: item.url })),
                            danmaku: sniffResult?.danmaku || []
                        };
                    }
                    logInfo("play SDK嗅探无结果", { playPageUrl, from: player.from, sniffTarget, sniffResult: sniffResult || null });
                } catch (sniffError) {
                    logInfo("play SDK嗅探失败", { playPageUrl, from: player.from, sniffTarget, error: sniffError.message });
                }

                logInfo("play 使用嗅探兜底", { playPageUrl, decodedUrl: realUrl, iframeUrl, sniffTarget });
                return {
                    parse: 1,
                    flag: playFlag,
                    header: sniffHeaders,
                    urls: [{ name: meta.name || "播放", url: sniffTarget }],
                    danmaku: []
                };
            });
        })();

        const metadataPromise = (async () => {
            const result = {
                danmakuList: [],
                scrapeTitle: "",
                scrapePic: "",
                episodeNumber: meta?.n ?? null,
                episodeName: meta?.e || meta?.name || "",
            };
            if (!meta?.fid || !meta?.sid || typeof OmniBox.getScrapeMetadata !== "function") {
                logInfo("play 播放增强链路跳过", { fid: meta?.fid || "", sid: meta?.sid || "" });
                return result;
            }
            try {
                const metadata = await OmniBox.getScrapeMetadata(String(meta.sid || ""));
                if (!metadata || !metadata.scrapeData) {
                    logInfo("play 播放增强链路跳过: metadata 不完整", { videoId: meta.sid || "" });
                    return result;
                }
                result.scrapeTitle = metadata.scrapeData.title || "";
                if (metadata.scrapeData.posterPath) {
                    result.scrapePic = `https://image.tmdb.org/t/p/w500${metadata.scrapeData.posterPath}`;
                }
                const mappings = Array.isArray(metadata.videoMappings) ? metadata.videoMappings : [];
                logInfo("play 播放增强元数据", { videoId: meta.sid || "", mappings: mappings.length, fid: meta.fid });
                const mapping = mappings.find((item) => item?.fileId === meta.fid);
                if (mapping) {
                    result.episodeName = buildScrapedEpisodeName(metadata.scrapeData, mapping, result.episodeName || meta.name || "");
                    if (mapping.episodeNumber !== undefined && mapping.episodeNumber !== null) {
                        result.episodeNumber = mapping.episodeNumber;
                    }
                } else if (mappings.length > 0) {
                    logInfo("play 播放增强未命中 mapping", { expected: meta.fid, preview: mappings.slice(0, 2).map((item) => `${item?.fileId || "<empty>"}=>${item?.episodeName || ""}`).join(" | ") });
                }
                const fileName = buildDanmakuFileName(result.scrapeTitle || meta.v || "", result.episodeName || meta.name || "");
                if (fileName && typeof OmniBox.getDanmakuByFileName === "function") {
                    const matchedDanmaku = await OmniBox.getDanmakuByFileName(fileName);
                    const count = Array.isArray(matchedDanmaku) ? matchedDanmaku.length : 0;
                    logInfo("play 弹幕匹配", { fileName, count });
                    if (count > 0) {
                        result.danmakuList = matchedDanmaku;
                    }
                }
            } catch (error) {
                logInfo("play 读取刮削元数据失败", { error: error.message, videoId: meta.sid || "" });
            }
            return result;
        })();

        const [playInfoResult, metadataResult] = await Promise.allSettled([playInfoPromise, metadataPromise]);
        if (playInfoResult.status !== "fulfilled") {
            throw playInfoResult.reason || new Error("播放主链路失败");
        }
        const playResult = playInfoResult.value || { urls: [], parse: 0, header: {} };
        let danmakuList = [];
        let scrapeTitle = "";
        let scrapePic = "";
        let episodeNumber = meta?.n ?? null;
        let episodeName = meta?.e || meta?.name || "";
        if (metadataResult.status === "fulfilled" && metadataResult.value) {
            danmakuList = metadataResult.value.danmakuList || [];
            scrapeTitle = metadataResult.value.scrapeTitle || "";
            scrapePic = metadataResult.value.scrapePic || "";
            if (metadataResult.value.episodeNumber !== undefined && metadataResult.value.episodeNumber !== null) {
                episodeNumber = metadataResult.value.episodeNumber;
            }
            episodeName = metadataResult.value.episodeName || episodeName;
        } else if (metadataResult.status === "rejected") {
            logInfo("play 播放增强链路失败(不影响播放)", { error: metadataResult.reason?.message || String(metadataResult.reason || "") });
        }
        if (danmakuList.length > 0) {
            playResult.danmaku = danmakuList;
        }
        if (meta?.fid && context?.sourceId && typeof OmniBox.addPlayHistory === "function") {
            const historyPayload = {
                vodId: String(meta.sid || ""),
                title: scrapeTitle || meta.v || meta.name || "LIBVIO视频",
                pic: scrapePic || "",
                episode: buildHistoryEpisode(playId, episodeNumber, episodeName),
                sourceId: context.sourceId,
                episodeNumber,
                episodeName: episodeName || "",
            };
            OmniBox.addPlayHistory(historyPayload)
                .then((added) => {
                    OmniBox.log("info", `[LIBVIO] play 已${added ? "添加" : "跳过"}播放记录: ${historyPayload.title}`);
                })
                .catch((error) => {
                    OmniBox.log("info", `[LIBVIO] play 添加播放记录失败: ${error.message}`);
                });
        } else {
            logInfo("play 跳过播放记录", { sourceId: context?.sourceId || "", fid: meta?.fid || "", hasApi: typeof OmniBox.addPlayHistory === "function" });
        }
        return playResult;
    } catch (error) {
        logError("play 失败", error);
        return emptyPlay(flag);
    }
}
