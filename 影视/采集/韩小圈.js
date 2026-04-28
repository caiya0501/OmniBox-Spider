// @name 韩小圈
// @author 梦
// @description 影视站：支持首页、分类、详情、搜索与播放
// @dependencies cheerio
// @version 1.0.2
// @downloadURL https://gh-proxy.org/https://github.com/Silent1566/OmniBox-Spider/raw/refs/heads/main/影视/采集/韩小圈.js

const OmniBox = require("omnibox_sdk");
const runner = require("spider_runner");

const BASE_URL = "https://hanxiaoquan.hanju.workers.dev";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";
const LIST_CACHE_TTL = Number(process.env.HXQ_LIST_CACHE_TTL || 900);
const DETAIL_CACHE_TTL = Number(process.env.HXQ_DETAIL_CACHE_TTL || 1800);
const SEARCH_CACHE_TTL = Number(process.env.HXQ_SEARCH_CACHE_TTL || 600);

const CATEGORY_CONFIG = [
  { id: "0", name: "韩剧" },
  { id: "1", name: "韩影" },
  { id: "2", name: "日韩综" },
  { id: "3", name: "日韩漫" },
  { id: "100", name: "热门" },
];

module.exports = { home, category, detail, search, play };
runner.run(module.exports);

async function requestApi(path, body, options = {}) {
  const url = `${BASE_URL}${path}`;
  await OmniBox.log("info", `[韩小圈][request] POST ${url} ${JSON.stringify(body || {})}`);
  const res = await OmniBox.request(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/json",
      "Accept": "application/json, text/plain, */*",
      "Origin": BASE_URL,
      "Referer": `${BASE_URL}/`,
      ...(options.headers || {}),
    },
    body: JSON.stringify(body || {}),
    timeout: options.timeout || 30000,
  });
  const statusCode = Number(res?.statusCode || 0);
  if (!res || statusCode !== 200) {
    throw new Error(`HTTP ${res?.statusCode || "unknown"} @ ${url}`);
  }
  const text = String(res.body || "");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON parse failed @ ${url}: ${err?.message || err}`);
  }
}

async function getCachedJson(cacheKey, ttl, producer) {
  try {
    const cached = await OmniBox.getCache(cacheKey);
    if (cached) return JSON.parse(String(cached));
  } catch (_) {}
  const value = await producer();
  try {
    await OmniBox.setCache(cacheKey, JSON.stringify(value || {}), ttl);
  } catch (_) {}
  return value;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absoluteUrl(url) {
  try {
    return new URL(String(url || ""), BASE_URL).toString();
  } catch (_) {
    return String(url || "");
  }
}

function categoryNameById(categoryId) {
  return CATEGORY_CONFIG.find((item) => item.id === String(categoryId))?.name || "韩小圈";
}

function buildListItem(item) {
  return {
    vod_id: String(item?.vod_id || ""),
    vod_name: normalizeText(item?.vod_name || ""),
    vod_pic: absoluteUrl(item?.vod_pic || ""),
    vod_remarks: normalizeText(item?.vod_remarks || item?.vod_class || ""),
    vod_year: normalizeText(item?.vod_year || ""),
    vod_director: normalizeText(item?.vod_director || ""),
    vod_actor: normalizeText(item?.vod_actor || ""),
    vod_content: normalizeText(item?.vod_content || ""),
  };
}

function normalizeSearchKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·•・\-—_:：,，.。'"“”‘’!?！？()（）\[\]【】]/g, "");
}

function scoreSearchItem(item, keyword) {
  const q = normalizeSearchKey(keyword);
  const name = normalizeSearchKey(item?.vod_name || "");
  const remarks = normalizeSearchKey(item?.vod_remarks || "");
  const actor = normalizeSearchKey(item?.vod_actor || "");
  const director = normalizeSearchKey(item?.vod_director || "");
  const content = normalizeSearchKey(item?.vod_content || "");
  if (!q) return 0;
  if (name === q) return 10000;
  if (name.startsWith(q)) return 8000 - name.length;
  if (name.includes(q)) return 6000 - name.indexOf(q);
  if (remarks.includes(q)) return 2500 - remarks.indexOf(q);
  if (actor.includes(q)) return 1800 - actor.indexOf(q);
  if (director.includes(q)) return 1500 - director.indexOf(q);
  if (content.includes(q)) return 500 - content.indexOf(q);
  return 0;
}

function buildVodFromDetail(vod) {
  const playUrls = Array.isArray(vod?.vod_play_url) ? vod.vod_play_url : [];
  const episodes = playUrls
    .map((ep) => ({
      name: normalizeText(ep?.t || ep?.name || ""),
      playId: String(ep?.u || ep?.url || ""),
    }))
    .filter((ep) => ep.name && ep.playId);

  return {
    vod_id: String(vod?.vod_id || ""),
    vod_name: normalizeText(vod?.vod_name || ""),
    vod_pic: absoluteUrl(vod?.vod_pic || ""),
    vod_remarks: normalizeText(vod?.vod_remarks || vod?.vod_class || ""),
    vod_content: normalizeText(vod?.vod_content || ""),
    vod_year: normalizeText(vod?.vod_year || ""),
    vod_director: normalizeText(vod?.vod_director || ""),
    vod_actor: normalizeText(vod?.vod_actor || ""),
    vod_area: "韩国",
    vod_play_sources: episodes.length
      ? [{ name: "默认线路", episodes }]
      : [],
  };
}

async function home() {
  try {
    const data = await getCachedJson("hxq:home:hot:1", LIST_CACHE_TTL, () =>
      requestApi("/api/list", { c_id: "100", page: "1" }),
    );
    const list = Array.isArray(data?.data) ? data.data.slice(0, 20).map(buildListItem) : [];
    await OmniBox.log("info", `[韩小圈][home] list=${list.length}`);
    return {
      class: CATEGORY_CONFIG.map((item) => ({ type_id: item.id, type_name: item.name })),
      filters: {},
      list,
    };
  } catch (err) {
    await OmniBox.log("error", `[韩小圈][home] ${err?.message || err}`);
    return {
      class: CATEGORY_CONFIG.map((item) => ({ type_id: item.id, type_name: item.name })),
      filters: {},
      list: [],
    };
  }
}

async function category(params) {
  const tid = String(params?.categoryId || "0");
  const pg = String(Math.max(1, Number(params?.page || 1)));
  try {
    const data = await getCachedJson(`hxq:list:${tid}:${pg}`, LIST_CACHE_TTL, () =>
      requestApi("/api/list", { c_id: tid, page: pg }),
    );
    const raw = Array.isArray(data?.data) ? data.data : [];
    const list = raw.map(buildListItem).filter((item) => item.vod_id && item.vod_name);
    const hasMore = raw.length >= 20;
    await OmniBox.log("info", `[韩小圈][category] tid=${tid} pg=${pg} list=${list.length}`);
    return {
      page: Number(pg),
      pagecount: hasMore ? Number(pg) + 1 : Number(pg),
      limit: 20,
      total: hasMore ? Number(pg) * 20 + 1 : (Number(pg) - 1) * 20 + list.length,
      list,
    };
  } catch (err) {
    await OmniBox.log("error", `[韩小圈][category] tid=${tid} pg=${pg} ${err?.message || err}`);
    return {
      page: Number(pg),
      pagecount: Number(pg),
      limit: 20,
      total: 0,
      list: [],
    };
  }
}

async function detail(params) {
  const vodId = String(
    params?.videoId
    || params?.id
    || params?.vod_id
    || params?.categoryId
    || "",
  ).trim();
  if (!vodId) {
    await OmniBox.log("info", `[韩小圈][detail] missing id params=${JSON.stringify(params || {})}`);
    return { list: [] };
  }
  try {
    const data = await getCachedJson(`hxq:detail:${vodId}`, DETAIL_CACHE_TTL, () =>
      requestApi("/api/detail", { b_id: vodId }),
    );
    const vod = data?.data ? buildVodFromDetail(data.data) : null;
    await OmniBox.log("info", `[韩小圈][detail] id=${vodId} episodes=${vod?.vod_play_sources?.[0]?.episodes?.length || 0}`);
    return { list: vod ? [vod] : [] };
  } catch (err) {
    await OmniBox.log("error", `[韩小圈][detail] id=${vodId} ${err?.message || err}`);
    return { list: [] };
  }
}

async function search(params) {
  const keyword = normalizeText(params?.keyword || params?.wd || "");
  const pg = String(Math.max(1, Number(params?.page || 1)));
  if (!keyword) {
    return { page: 1, pagecount: 1, limit: 20, total: 0, list: [] };
  }

  const producer = () => requestApi("/api/search", { keyword, page: pg }, { timeout: 60000 });
  try {
    let data;
    try {
      data = await getCachedJson(`hxq:search:${keyword}:${pg}`, SEARCH_CACHE_TTL, producer);
    } catch (firstErr) {
      await OmniBox.log("info", `[韩小圈][search] first try failed, retry once: ${firstErr?.message || firstErr}`);
      data = await producer();
    }
    const raw = Array.isArray(data?.data) ? data.data : [];
    const list = raw.map(buildListItem).filter((item) => item.vod_id && item.vod_name);
    list.sort((a, b) => {
      const scoreDiff = scoreSearchItem(b, keyword) - scoreSearchItem(a, keyword);
      if (scoreDiff !== 0) return scoreDiff;
      return a.vod_name.localeCompare(b.vod_name, "zh-CN");
    });
    const hasMore = raw.length >= 20;
    await OmniBox.log("info", `[韩小圈][search] keyword=${keyword} pg=${pg} list=${list.length} top=${list.slice(0, 5).map((item) => item.vod_name).join(" | ")}`);
    return {
      page: Number(pg),
      pagecount: hasMore ? Number(pg) + 1 : Number(pg),
      limit: 20,
      total: hasMore ? Number(pg) * 20 + 1 : (Number(pg) - 1) * 20 + list.length,
      list,
    };
  } catch (err) {
    await OmniBox.log("error", `[韩小圈][search] keyword=${keyword} pg=${pg} ${err?.message || err}`);
    return {
      page: Number(pg),
      pagecount: Number(pg),
      limit: 20,
      total: 0,
      list: [],
    };
  }
}

async function play(params) {
  const playId = String(params?.id || params?.playId || params?.url || "").trim();
  if (!playId) {
    return { urls: [] };
  }
  await OmniBox.log("info", `[韩小圈][play] ${playId}`);
  return {
    parse: 0,
    header: {
      "User-Agent": UA,
      Referer: `${BASE_URL}/`,
      Origin: BASE_URL,
    },
    urls: [{ name: "播放", url: playId }],
  };
}
