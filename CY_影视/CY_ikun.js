/*
=============================================
  脚本名称：ikun资源-分类逻辑最终完美版
  初始需求：
  1. 电影分类二级平铺展示，无二级筛选
  2. 电视剧/综艺/动漫等一级分类展示二级筛选
  3. 对接苹果CMS API实现完整影视爬虫功能

  迭代修改需求：
  1. 移除二级筛选中的「全部/all」选项，仅保留真实分类
  2. 修复首次进入二级分类空白无内容问题
  3. 修复数组越界、undefined.value 报错
  4. 修复分类树未初始化导致首次请求失效问题

  问题&修复过程：
  1. 问题：二级筛选含all，接口不识别→删除all相关配置
  2. 问题：首次进二级分类空白→切换后正常
     根因：首次请求时分类树未初始化完成，子分类ID无效
     修复：category内强制等待分类树加载+微延迟渲染
  3. 问题：脚本语法/空值报错→增加全量安全判断

  最终效果：
  1. 二级筛选无全部选项，仅真实分类
  2. 首次点击二级分类直接显示内容，无空白
  3. 切换分类流畅，无任何报错、无失效请求
=============================================
*/

// @name ikun资源-分类逻辑最终完美版
// @author 
// @description 电影二级平铺+其他分类二级筛选（移除全部，修复首次空白）
// @dependencies axios,cheerio
// @version 1.0.2
// @downloadURL https://raw.githubusercontent.com/caiya0501/OmniBox-Spider/refs/heads/main/CY_%E5%BD%B1%E8%A7%86/CY_ikun.js

const axios = require("axios");
const https = require("https");
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

// 构建分类列表：电影平铺，其他分类生成二级筛选（已移除全部选项）
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
        
        // 电影分类：二级子分类直接平铺展示
        if (movieCategory) {
            const movieChildren = categoryMap.get(movieCategory.type_id) || [];
            ALL_CATEGORIES.push(...movieChildren);
        }
        
        // 其他一级分类：添加到主分类，构建二级筛选
        const otherTopCategories = topCategories.filter(c => 
            c.type_id !== (movieCategory?.type_id || "1")
        );
        ALL_CATEGORIES.push(...otherTopCategories);
        
        // 二级筛选：仅保留真实子分类，彻底移除全部/all选项
        otherTopCategories.forEach(topCat => {
            const children = categoryMap.get(topCat.type_id) || [];
            CATEGORY_TREE[topCat.type_id] = children.map(c => ({ name: c.type_name, value: c.type_id }));
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

// 构建筛选器：默认选中第一个二级分类
function buildFilters() {
    const filters = {};
    Object.entries(CATEGORY_TREE).forEach(([typeId, children]) => {
        if (children.length > 1) {
            filters[typeId] = [{
                key: "cate",
                name: "类型",
                init: children[0].value,
                value: children
            }];
        }
    });
    return filters;
}

// 解析筛选参数
function parseFilterParams(params = {}) {
    const res = {};
    if (params.filters) {
        Object.assign(res, typeof params.filters === "string" ? JSON.parse(params.filters) : params.filters);
    }
    return res;
}

// 数据格式化
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

// 解析播放地址
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

// 播放接口
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

// 首页接口
async function home() {
    await buildCategoryList();
    const data = await req({ ac: "list", pg: 1, pagesize: PAGE_LIMIT });
    return {
        class: ALL_CATEGORIES,
        list: await fmt(data.list || []),
        filters: buildFilters()
    };
}

// ==================== 终极修复：彻底解决首次空白问题 ====================
async function category(params) {
    const { categoryId, page = 1 } = params;
    if (!categoryId) return { page:1, pagecount:0, total:0, list:[] };

    // 🔥 核心修复1：强制等待分类树完全加载，避免首次初始化不全
    await buildCategoryList();
    
    // 🔥 核心修复2：100ms微延迟，等待前端筛选框渲染完成
    await new Promise(resolve => setTimeout(resolve, 100));

    const filter = parseFilterParams(params);
    const childList = CATEGORY_TREE[categoryId] || [];

    // 安全赋值：永远有有效分类ID
    let selectedCate = categoryId;
    if (filter.cate) {
        selectedCate = filter.cate;
    } else if (childList.length > 0) {
        selectedCate = childList[0].value;
    }

    // 发送有效请求
    const data = await req({ t: selectedCate, pg: page, pagesize: PAGE_LIMIT });
    return {
        page: parseInt(data.page) || 1,
        pagecount: parseInt(data.pagecount) || 1,
        total: parseInt(data.total) || 0,
        list: await fmt(data.list || [])
    };
}
// ========================================================================

// 搜索接口
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

// 详情接口
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
