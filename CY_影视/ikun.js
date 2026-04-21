// @name ikun资源-分类逻辑优化版
// @author 
// @description 分类逻辑：电影二级分类+其他一级分类，其他功能不变
// @version 2.2.2
const OmniBox = require("omnibox_sdk");

// ==================== 核心配置 ====================
const SITE_API = "https://ikunzyapi.com/api.php/provide/vod";
const BASE_DOMAIN = "https://ikunzyapi.com";
const PAGE_LIMIT = 20;
const REQUEST_DELAY = 500;
// ==================== 配置结束 ====================

// 全局分类树
let CATEGORY_TREE = {};
let ALL_CATEGORIES = [];
let lastRequestTime = 0;
const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh, Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/124.0.0.0 Safari/537.36"
];

const PIC_CACHE = new Map();

async function req(params = {}) {
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_DELAY) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY - (now - lastRequestTime)));
    }
    lastRequestTime = Date.now();

    const url = new URL(SITE_API);
    Object.entries(params).forEach(([k, v]) => v && url.searchParams.append(k, v));
    
    const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    
    const resp = await OmniBox.request(url.href, {
        headers: { 
            "User-Agent": userAgent,
            "Referer": BASE_DOMAIN
        }
    });
    
    return JSON.parse(resp.body);
}

async function getVodPic(vodId, existingPic) {
    if (existingPic) return existingPic;
    if (PIC_CACHE.has(vodId)) return PIC_CACHE.get(vodId);
    
    try {
        const data = await req({ ac: "detail", ids: vodId });
        if (data.list && data.list[0] && data.list[0].vod_pic) {
            const pic = data.list[0].vod_pic;
            PIC_CACHE.set(vodId, pic);
            return pic;
        }
    } catch (e) {}
    
    return "";
}

// 【仅修复此处】二级菜单选项格式问题
async function buildCategoryList() {
    if (ALL_CATEGORIES.length > 0) return;
    
    OmniBox.log("info", "正在构建分类列表...");

    try {
        const data = await req({ ac: "list", pg: 1, pagesize: 1 });
        
        if (!Array.isArray(data.class)) throw new Error("接口无分类数据");

        const categoryMap = new Map();
        data.class.forEach(item => {
            const id = String(item.type_id || "");
            const pid = String(item.type_pid || "0");
            const name = String(item.type_name || "");
            if (id && name) {
                if (!categoryMap.has(pid)) categoryMap.set(pid, []);
                categoryMap.get(pid).push({ type_id: id, type_name: name });
            }
        });

        const topCategories = categoryMap.get("0") || [];
        let movieCategory = topCategories.find(c => c.type_id === "1" || c.type_name.includes("电影"));
        
        ALL_CATEGORIES = [];
        CATEGORY_TREE = {};
        
        // 1. 先加入电影下的所有二级分类（平铺）
        if (movieCategory) {
            const movieChildren = categoryMap.get(movieCategory.type_id) || [];
            ALL_CATEGORIES.push(...movieChildren);
        }
        
        // 2. 再加入其他一级分类，并为它们构建二级筛选
        const otherTopCategories = topCategories.filter(c => 
            c.type_id !== (movieCategory?.type_id || "1")
        );
        ALL_CATEGORIES.push(...otherTopCategories);
        
        // 3. 【核心修复】为其他一级分类构建带name/value格式的二级筛选
        otherTopCategories.forEach(topCat => {
            const children = categoryMap.get(topCat.type_id) || [];
            // 把{type_id, type_name}转换为OmniBox要求的{name, value}格式
            CATEGORY_TREE[topCat.type_id] = [{ name: "全部", value: "all" }, ...children.map(c => ({ name: c.type_name, value: c.type_id }))];
        });

        const map = new Map();
        ALL_CATEGORIES = ALL_CATEGORIES.filter(c => {
            if (map.has(c.type_id)) return false;
            map.set(c.type_id, true);
            return true;
        });

        OmniBox.log("info", `分类构建完成，共${ALL_CATEGORIES.length}个分类`);

    } catch (error) {
        OmniBox.log("error", `构建分类失败: ${error.message}`);
        ALL_CATEGORIES = [
            { type_id: "1", type_name: "电影" },
            { type_id: "2", type_name: "电视剧" },
            { type_id: "3", type_name: "综艺" },
            { type_id: "4", type_name: "动漫" }
        ];
        CATEGORY_TREE = {};
    }
}

function buildFilters() {
    const filters = {};
    Object.entries(CATEGORY_TREE).forEach(([typeId, children]) => {
        if (children.length > 1) {
            filters[typeId] = [{
                key: "cate",
                name: "类型",
                init: "all",
                value: children
            }];
        }
    });
    return filters;
}

function parseFilterParams(params = {}) {
    const res = {};
    if (params.filters) {
        Object.assign(res, typeof params.filters === "string" ? JSON.parse(params.filters) : params.filters);
    }
    return res;
}

async function fmt(list) {
    if (!Array.isArray(list)) return [];
    const results = await Promise.all(list.map(async (item) => {
        if (!item) return null;
        const pic = await getVodPic(String(item.vod_id || ""), String(item.vod_pic || ""));
        return {
            vod_id: String(item.vod_id || ""),
            vod_name: String(item.vod_name || ""),
            vod_pic: pic,
            type_name: String(item.type_name || ""),
            vod_remarks: String(item.vod_remarks || ""),
            vod_year: String(item.vod_year || ""),
            vod_play_from: String(item.vod_play_from || ""),
            vod_play_url: String(item.vod_play_url || "")
        };
    }));
    return results.filter(i => i && i.vod_id);
}

function parsePlay(from, url, vid, name) {
    const res = [];
    if (!from || !url) return res;
    from.split("$$$").forEach((ln, i) => {
        const eps = [];
        (url.split("$$$")[i] || "").split("#").forEach((seg, j) => {
            const [n, u] = seg.split("$");
            if (u) eps.push({ name: n || `第${j+1}集`, playId: u });
        });
        if (eps.length) res.push({ name: ln, episodes: eps });
    });
    return res;
}

async function play(params) {
    try {
        const { playId } = params;
        if (!playId) return { urls: [], flag: "" };

        const header = {
            "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
            "Referer": BASE_DOMAIN
        };

        if (/\.(m3u8|mp4|mkv|ts|flv)/i.test(playId)) {
            return {
                urls: [{ name: "播放", url: playId }],
                flag: params.flag || "",
                parse: 0,
                header
            };
        }

        try {
            const sniff = await OmniBox.sniffVideo(playId, { header });
            if (sniff?.url) {
                return {
                    urls: [{ name: "播放", url: sniff.url }],
                    flag: params.flag || "",
                    parse: 0,
                    header: { ...header, ...sniff.header }
                };
            }
        } catch (e) {}

        return {
            urls: [{ name: "播放", url: playId }],
            flag: params.flag || "",
            parse: 1,
            header
        };
    } catch (e) {
        return { urls: [], flag: "" };
    }
}

// ==================== 核心接口 ====================
async function home() {
    await buildCategoryList();
    const data = await req({ ac: "list", pg: 1, pagesize: PAGE_LIMIT });
    return {
        class: ALL_CATEGORIES,
        list: await fmt(data.list || []),
        filters: buildFilters()
    };
}

// 【仅修复此处：二级菜单「全部」选项加载内容】
async function category(params) {
    const { categoryId, page = 1 } = params;
    if (!categoryId) return { page:1, pagecount:0, total:0, list:[] };

    const filter = parseFilterParams(params);
    // 修复：当选择"全部"时，使用一级分类ID请求
    const selectedCate = filter.cate && filter.cate !== "all" ? String(filter.cate).trim() : categoryId;

    const data = await req({ t: selectedCate, pg: page, pagesize: PAGE_LIMIT });
    return {
        page: parseInt(data.page) || 1,
        pagecount: parseInt(data.pagecount) || 1,
        total: parseInt(data.total) || 0,
        list: await fmt(data.list || [])
    };
}

async function search(params) {
    const { keyword, page = 1 } = params;
    if (!keyword) return { page:1, pagecount:0, total:0, list:[] };
    const data = await req({ wd: keyword, pg: page, pagesize: PAGE_LIMIT });
    return {
        page: parseInt(data.page) || 1,
        pagecount: parseInt(data.pagecount) || 1,
        total: parseInt(data.total) || 0,
        list: await fmt(data.list || [])
    };
}

async function detail(params) {
    const { videoId } = params;
    const data = await req({ ac: "detail", ids: videoId });
    const list = (data.list || []).map(i => ({
        vod_id: String(i.vod_id || ""),
        vod_name: String(i.vod_name || ""),
        vod_pic: String(i.vod_pic || ""),
        type_name: String(i.type_name || ""),
        vod_year: String(i.vod_year || ""),
        vod_area: String(i.vod_area || ""),
        vod_actor: String(i.vod_actor || ""),
        vod_director: String(i.vod_director || ""),
        vod_content: String(i.vod_content || ""),
        vod_play_sources: parsePlay(i.vod_play_from, i.vod_play_url, i.vod_id, i.vod_name)
    }));
    return { list };
}

module.exports = { home, category, search, detail, play };
const runner = require("spider_runner");
runner.run(module.exports);
