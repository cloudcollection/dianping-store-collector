const API_BASE = "http://127.0.0.1:8765";
const APP_VERSION = "2.1.0";
const DEBUG_PROTOCOL_VERSION = "1.3";
const STATE_KEY = "dianpingCrawlerState";
const STATUS_KEY = "dianpingRuntimeStatus";
const TOKEN_KEY = "collectorApiToken";
const SEARCH_RESULTS_PER_PAGE = 15;

const DEFAULT_STATE = {
  running: false,
  mode: "idle",
  tabId: null,
  pagesDone: 0,
  maxPages: 1,
  startPage: 1,
  endPage: 1,
  pageStartIndex: 1,
  maxShops: 15,
  startIndex: 1,
  queueLimit: 15,
  taskId: "",
  targetCityId: "4",
  targetKeyword: "陶陶居",
  currentUrl: "",
  visited: [],
  searchShops: [],
  queue: [],
  queueIndex: 0,
  completedCount: 0,
  skippedCount: 0,
  completedRows: [],
  lastCompletedShop: null,
  includeDeals: true,
  autoDetails: false,
  returnUrl: "",
  minDelaySeconds: 10,
  maxDelaySeconds: 20,
  minBatchSize: 3,
  maxBatchSize: 7,
  minBatchRestSeconds: 30,
  maxBatchRestSeconds: 90,
  nextBatchAt: 0,
  actionsDone: 0,
  waitUntil: 0,
  invalidPages: 0,
  maxInvalidPages: 2,
  message: "等待开始"
};

const DEFAULT_STATUS = {
  networkEnabledTabs: [],
  capturedResponses: 0,
  capturedDeals: 0,
  lastCapture: "",
  lastError: ""
};

const pendingResponses = new Map();
const processingTabs = new Set();

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    [STATE_KEY]: {
      ...DEFAULT_STATE,
      message: "扩展已更新，请设置限速参数后开始"
    }
  });
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }
});

chrome.runtime.onStartup?.addListener(async () => {
  const state = await getState();
  if (state.mode !== "idle") {
    await setState({
      running: false,
      tabId: null,
      message: "浏览器已重新启动，请点击“继续上次任务”"
    });
  }
});

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function clampNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(number, maximum)) : fallback;
}

function searchScope(value) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/p\d+\/?$/, "");
    url.hash = "";
    return url.toString();
  } catch (error) {
    return "";
  }
}

function buildSearchUrl(cityId, keyword, startPage = 1) {
  const normalizedCityId = String(cityId || "").trim();
  const normalizedKeyword = String(keyword || "").trim();
  const normalizedStartPage = Math.round(clampNumber(startPage, 1, 1, 30));
  if (!/^[1-9]\d{0,4}$/.test(normalizedCityId)) {
    throw new Error("请输入有效的城市编号");
  }
  if (!normalizedKeyword) {
    throw new Error("请输入店铺关键词");
  }
  const pagePath = normalizedStartPage > 1 ? `/p${normalizedStartPage}` : "";
  return `https://www.dianping.com/search/keyword/${normalizedCityId}/0_${encodeURIComponent(normalizedKeyword)}${pagePath}`;
}

function mergeSearchShops(existing, incoming) {
  const shops = new Map();
  for (const shop of [...(existing || []), ...(incoming || [])]) {
    const shopId = String(shop?.["店铺id"] || "");
    if (!shopId) {
      continue;
    }
    shops.set(shopId, { ...(shops.get(shopId) || {}), ...shop });
  }
  return Array.from(shops.values());
}

function limitSearchShops(existing, incoming, limit) {
  const maximum = Math.round(clampNumber(limit, 15, 1, 3000));
  return mergeSearchShops(existing, incoming).slice(0, maximum);
}

function detailQueueFromShops(shops, startIndex, count, sequenceStart = startIndex) {
  const first = Math.round(clampNumber(startIndex, 1, 1, 3000)) - 1;
  const firstSequence = Math.round(clampNumber(sequenceStart, first + 1, 1, 3000));
  const maximum = Math.round(clampNumber(count, 15, 1, 100));
  return mergeSearchShops([], shops).slice(first, first + maximum).map((shop, index) => ({
    shopId: shop["店铺id"],
    name: shop["店铺名"] || shop["店铺id"],
    url: shop["详情链接"] || `https://www.dianping.com/shop/${shop["店铺id"]}`,
    searchRecord: shop,
    sequence: firstSequence + index,
    status: "pending"
  }));
}

function createTaskId() {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId || `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function markCompletedQueueItems(queue, completedIds) {
  const completed = new Set((completedIds || []).map(String));
  return (queue || []).map((item) => item.status === "pending" && completed.has(String(item.shopId))
    ? { ...item, status: "skipped" }
    : item);
}

function nextPendingQueueIndex(queue, startIndex = 0) {
  for (let index = Math.max(0, startIndex); index < (queue || []).length; index += 1) {
    if (!["completed", "skipped"].includes(queue[index]?.status)) {
      return index;
    }
  }
  return (queue || []).length;
}

function queueCounts(queue) {
  return {
    completedCount: (queue || []).filter((item) => item.status === "completed").length,
    skippedCount: (queue || []).filter((item) => item.status === "skipped").length
  };
}

function isMeaningful(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value).length > 0;
  }
  return true;
}

function mergeUniqueValues(...values) {
  const result = [];
  const seen = new Set();
  for (const value of values.flatMap((item) => Array.isArray(item) ? item : (isMeaningful(item) ? [item] : []))) {
    const marker = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (!seen.has(marker)) {
      seen.add(marker);
      result.push(value);
    }
  }
  return result;
}

function mergeCompleteDetail(searchRecord, detail) {
  const fields = [
    "店铺名",
    "评论总数",
    "人均价格",
    "标签",
    "店铺地址",
    "店铺均分",
    "推荐菜",
    "店铺总分"
  ];
  const merged = {};
  for (const field of fields) {
    if (field === "标签" || field === "推荐菜") {
      merged[field] = mergeUniqueValues(searchRecord?.[field], detail?.[field]);
    } else {
      merged[field] = isMeaningful(detail?.[field]) ? detail[field] : (searchRecord?.[field] || "");
    }
  }
  merged["优惠券信息"] = [];
  return merged;
}

function missingCompleteFields(detail) {
  return ["店铺名", "店铺地址", "店铺总分"]
    .filter((field) => !isMeaningful(detail?.[field]));
}

function secureRandomUint32() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return Math.floor(Math.random() * 4294967296);
}

function secureRandomUnit() {
  return secureRandomUint32() / 4294967296;
}

function randomBetween(minimum, maximum) {
  const lower = Number(minimum);
  const upper = Math.max(lower, Number(maximum));
  return lower + secureRandomUnit() * (upper - lower);
}

function randomInteger(minimum, maximum) {
  const lower = Math.ceil(Number(minimum));
  const upper = Math.max(lower, Math.floor(Number(maximum)));
  const span = upper - lower + 1;
  const unbiasedLimit = Math.floor(4294967296 / span) * span;
  let value = secureRandomUint32();
  while (value >= unbiasedLimit) {
    value = secureRandomUint32();
  }
  return lower + (value % span);
}

function rateStateFromMessage(message) {
  const minDelaySeconds = clampNumber(message.minDelaySeconds, 10, 10, 300);
  const requestedMax = clampNumber(message.maxDelaySeconds, 20, 10, 600);
  const minBatchSize = Math.round(clampNumber(message.minBatchSize, 3, 1, 20));
  const maxBatchSize = Math.round(
    clampNumber(message.maxBatchSize, Math.max(minBatchSize, 7), minBatchSize, 30)
  );
  const minBatchRestSeconds = clampNumber(message.minBatchRestSeconds, 30, 0, 600);
  const maxBatchRestSeconds = clampNumber(
    message.maxBatchRestSeconds,
    Math.max(minBatchRestSeconds, 90),
    minBatchRestSeconds,
    1200
  );
  return {
    minDelaySeconds,
    maxDelaySeconds: Math.max(minDelaySeconds, requestedMax),
    minBatchSize,
    maxBatchSize,
    minBatchRestSeconds,
    maxBatchRestSeconds,
    nextBatchAt: randomInteger(minBatchSize, maxBatchSize),
    actionsDone: 0,
    waitUntil: 0,
    invalidPages: 0,
    maxInvalidPages: 2
  };
}

function copyRateState(state) {
  return {
    minDelaySeconds: state.minDelaySeconds,
    maxDelaySeconds: state.maxDelaySeconds,
    minBatchSize: state.minBatchSize,
    maxBatchSize: state.maxBatchSize,
    minBatchRestSeconds: state.minBatchRestSeconds,
    maxBatchRestSeconds: state.maxBatchRestSeconds,
    nextBatchAt: state.nextBatchAt ||
      state.actionsDone + randomInteger(state.minBatchSize, state.maxBatchSize),
    actionsDone: state.actionsDone,
    waitUntil: 0,
    invalidPages: state.invalidPages || 0,
    maxInvalidPages: state.maxInvalidPages || 2
  };
}

async function waitForRateLimit(nextAction) {
  let state = await getState();
  if (!state.running) {
    return false;
  }
  const randomDelay = randomBetween(state.minDelaySeconds, state.maxDelaySeconds);
  const batchTarget = state.nextBatchAt ||
    state.actionsDone + randomInteger(state.minBatchSize, state.maxBatchSize);
  const needsBatchRest =
    state.actionsDone > 0 &&
    state.actionsDone >= batchTarget;
  const batchRest = needsBatchRest
    ? randomBetween(state.minBatchRestSeconds, state.maxBatchRestSeconds)
    : 0;
  const nextBatchAt = needsBatchRest
    ? state.actionsDone + randomInteger(state.minBatchSize, state.maxBatchSize)
    : batchTarget;
  const totalSeconds = Math.round((randomDelay + batchRest) * 10) / 10;
  const waitUntil = Date.now() + totalSeconds * 1000;
  const reason = needsBatchRest ? "批次随机休息" : "随机间隔";
  state = await setState({
    nextBatchAt,
    actionsDone: state.actionsDone + 1,
    waitUntil,
    message: `${reason} ${totalSeconds.toFixed(1)} 秒，之后${nextAction}`
  });

  while (Date.now() < waitUntil) {
    await sleep(Math.min(1000, waitUntil - Date.now()));
    state = await getState();
    if (!state.running) {
      return false;
    }
  }
  await setState({ waitUntil: 0, message: nextAction });
  return true;
}

async function getStored(key, fallback) {
  const result = await chrome.storage.local.get(key);
  return { ...fallback, ...(result[key] || {}) };
}

async function getState() {
  return getStored(STATE_KEY, DEFAULT_STATE);
}

async function setState(value) {
  const next = { ...(await getState()), ...value };
  await chrome.storage.local.set({ [STATE_KEY]: next });
  return next;
}

async function getRuntimeStatus() {
  return getStored(STATUS_KEY, DEFAULT_STATUS);
}

async function setRuntimeStatus(value) {
  const next = { ...(await getRuntimeStatus()), ...value };
  await chrome.storage.local.set({ [STATUS_KEY]: next });
  return next;
}

async function getApiToken() {
  const stored = await chrome.storage.local.get(TOKEN_KEY);
  return String(stored[TOKEN_KEY] || "").trim();
}

async function apiHeaders() {
  const token = await getApiToken();
  if (!token) {
    throw new Error("请先在控制台完成本地服务配对");
  }
  return {
    "Content-Type": "application/json",
    "X-Collector-Token": token
  };
}

async function postJson(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error("本地服务未启动，请先运行 start.ps1");
  }
  let result = null;
  try {
    result = await response.json();
  } catch (error) {
    // Preserve the HTTP status when the backend returns a non-JSON error.
  }
  if (!response.ok) {
    throw new Error(result?.detail || `本地服务返回 ${response.status}`);
  }
  if (result?.stats && result.stats.mongo_connected === false) {
    throw new Error("MongoDB 未连接，任务已停止；请启动 MongoDB 后重试");
  }
  return result;
}

async function getJson(path) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: await apiHeaders()
    });
  } catch (error) {
    throw new Error("本地服务未启动，请先运行 start.ps1");
  }
  if (!response.ok) {
    throw new Error(`本地服务返回 ${response.status}`);
  }
  return response.json();
}

async function exportCsv() {
  const result = await postJson("/api/export-ticket", {});
  const url = `${API_BASE}/api/export.csv?ticket=${encodeURIComponent(result.ticket)}`;
  const downloadId = await chrome.downloads.download({
    url,
    filename: result.filename || "dianping-stores.csv",
    saveAs: true
  });
  return { downloadId };
}

async function requireMongo() {
  const health = await getJson("/health");
  const backendMajor = String(health.version || "").split(".")[0];
  const extensionMajor = APP_VERSION.split(".")[0];
  if (!backendMajor || backendMajor !== extensionMajor) {
    throw new Error(
      `扩展 v${APP_VERSION} 与本地服务 v${health.version || "未知"} 不兼容，请同步升级`
    );
  }
  if (!health.mongo_connected) {
    throw new Error("MongoDB 未连接，请启动 MongoDB 后再采集");
  }
  return health;
}

function isDianpingUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith("dianping.com") || host.endsWith("meituan.com");
  } catch (error) {
    return false;
  }
}

function isVerificationUrl(url) {
  return /verify\.meituan\.com|account\.dianping\.com|captcha|login/i.test(url || "");
}

function responseLooksBlocked(status, payload, responseUrl = "") {
  if ([401, 403, 406, 407, 408, 409, 418, 429, 451, 503].includes(Number(status))) {
    return true;
  }
  if (/verify\.meituan\.com|captcha/i.test(responseUrl)) {
    return true;
  }
  const text = typeof payload === "string"
    ? payload.slice(0, 2000)
    : JSON.stringify(payload || {}).slice(0, 4000);
  return /"(?:need|require|requires)Login"\s*:\s*true|"(?:isLogin|loggedIn)"\s*:\s*false|unauthorized|forbidden|login required|please (?:log|sign) in|not logged in|verify required|captcha required|too many requests|rate limit|滑动验证|安全验证|请先登录|登录后继续|未登录|访问异常|请求过于频繁|操作过于频繁|风控|封禁|禁止访问/i.test(text);
}

async function recordInvalidPage(message) {
  const state = await getState();
  const invalidPages = (state.invalidPages || 0) + 1;
  const maxInvalidPages = state.maxInvalidPages || 2;
  if (invalidPages >= maxInvalidPages) {
    await pauseWithMessage(`${message}；已连续 ${invalidPages} 次异常，任务已暂停`);
    return false;
  }
  await setState({
    invalidPages,
    message: `${message}；异常 ${invalidPages}/${maxInvalidPages}，下次仍异常会暂停`
  });
  return true;
}

async function clearInvalidPages() {
  const state = await getState();
  if (state.invalidPages) {
    await setState({ invalidPages: 0 });
  }
}

function shopIdFromUrl(url) {
  if (!url) {
    return "";
  }
  try {
    const decoded = decodeURIComponent(url);
    const pathMatch = decoded.match(/\/shop\/(?:old\/)?([A-Za-z0-9_-]+)/i);
    if (pathMatch) {
      return pathMatch[1];
    }
    const parsed = new URL(decoded);
    for (const key of ["shopuuid", "shopUuid", "shopid", "shopId"]) {
      if (parsed.searchParams.get(key)) {
        return parsed.searchParams.get(key);
      }
    }
  } catch (error) {
    return "";
  }
  return "";
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) {
    throw new Error("没有找到当前标签页");
  }
  return tabs[0];
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["offer_parser.js", "content.js"]
      });
      await sleep(350);
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (recoveryError) {
      throw new Error("页面采集脚本未加载，请刷新当前大众点评页面后点击继续");
    }
  }
}

function waitForTabComplete(tabId, timeoutMs = 25000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function isDebuggerAttached(tabId) {
  const targets = await chrome.debugger.getTargets();
  return targets.some((target) => target.tabId === tabId && target.attached);
}

async function ensureDebugger(tabId) {
  if (!(await isDebuggerAttached(tabId))) {
    try {
      await chrome.debugger.attach({ tabId }, DEBUG_PROTOCOL_VERSION);
    } catch (error) {
      throw new Error("无法启用接口监听。请关闭该标签页的开发者工具后重试");
    }
  }
  await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
    maxTotalBufferSize: 100000000,
    maxResourceBufferSize: 10000000,
    maxPostDataSize: 1000000
  });
  const status = await getRuntimeStatus();
  const tabs = Array.from(new Set([...(status.networkEnabledTabs || []), tabId]));
  await setRuntimeStatus({ networkEnabledTabs: tabs, lastError: "" });
  return true;
}

async function releaseDebugger(tabId) {
  try {
    if (await isDebuggerAttached(tabId)) {
      await chrome.debugger.detach({ tabId });
    }
  } catch (error) {
    // The tab or debugger session may already be gone.
  }
  const status = await getRuntimeStatus();
  await setRuntimeStatus({
    networkEnabledTabs: (status.networkEnabledTabs || []).filter((id) => id !== tabId)
  });
}

function isCandidateResponse(response, resourceType) {
  try {
    const parsed = new URL(response.url);
    const allowedHost = parsed.hostname.endsWith("dianping.com") || parsed.hostname.endsWith("meituan.com");
    if (!allowedHost || !["XHR", "Fetch"].includes(resourceType)) {
      return false;
    }
    return /shelf|deal|product|coupon|voucher|groupbuy|poi\/v\d/i.test(
      `${parsed.pathname}${parsed.search}`
    );
  } catch (error) {
    return false;
  }
}

function bodyLooksRelevant(url, text) {
  if (/\/meishi\/poi\/v1\/shelf\/0/i.test(url)) {
    return true;
  }
  if (/shelf|deal|product|coupon|voucher|groupbuy/i.test(url)) {
    return true;
  }
  const sample = text.slice(0, 6000000);
  return /"productItems"|"dealId"|"productId"|"couponId"|"voucherId"|"groupBuy"/i.test(sample);
}

function decodeBase64Utf8(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function captureFinishedResponse(tabId, requestId) {
  const key = `${tabId}:${requestId}`;
  const metadata = pendingResponses.get(key);
  pendingResponses.delete(key);
  if (!metadata) {
    return;
  }

  let bodyResult;
  try {
    bodyResult = await chrome.debugger.sendCommand(
      { tabId },
      "Network.getResponseBody",
      { requestId }
    );
  } catch (error) {
    return;
  }

  let body = bodyResult.body || "";
  if (bodyResult.base64Encoded) {
    try {
      body = decodeBase64Utf8(body);
    } catch (error) {
      return;
    }
  }
  if (!bodyLooksRelevant(metadata.response.url, body)) {
    return;
  }

  let parsedBody = body;
  try {
    parsedBody = JSON.parse(body);
  } catch (error) {
    // The backend also supports JSONP and retains unmatched raw text.
  }

  if (responseLooksBlocked(metadata.response.status, parsedBody, metadata.response.url)) {
    await pauseWithMessage("接口返回登录、验证、限流或封禁信号，已停止采集");
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (error) {
    return;
  }

  try {
    const result = await postJson("/api/network/capture", {
      shop_id: shopIdFromUrl(tab.url),
      tab_url: tab.url || "",
      response_url: metadata.response.url,
      status: metadata.response.status || 0,
      mime_type: metadata.response.mimeType || "",
      body: parsedBody,
      captured_at: new Date().toISOString()
    });
    const status = await getRuntimeStatus();
    await setRuntimeStatus({
      capturedResponses: (status.capturedResponses || 0) + 1,
      capturedDeals: (status.capturedDeals || 0) + (result.deal_count || 0),
      lastCapture: metadata.response.url,
      lastError: result.requires_login ? "接口要求重新登录或完成验证" : ""
    });
  } catch (error) {
    await pauseWithMessage(error.message);
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (!source.tabId) {
    return;
  }
  const key = `${source.tabId}:${params.requestId || ""}`;
  if (method === "Network.responseReceived" && isCandidateResponse(params.response, params.type)) {
    pendingResponses.set(key, { response: params.response, type: params.type });
  } else if (method === "Network.loadingFinished") {
    void captureFinishedResponse(source.tabId, params.requestId);
  } else if (method === "Network.loadingFailed") {
    pendingResponses.delete(key);
  }
});

chrome.debugger.onDetach.addListener(async (source) => {
  if (!source.tabId) {
    return;
  }
  const status = await getRuntimeStatus();
  await setRuntimeStatus({
    networkEnabledTabs: (status.networkEnabledTabs || []).filter((id) => id !== source.tabId)
  });
});

async function pauseWithMessage(message) {
  await setState({ running: false, message });
  await setRuntimeStatus({ lastError: message });
}

async function saveCurrentPage(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isDianpingUrl(tab.url)) {
    throw new Error("请先打开大众点评搜索页或店铺页");
  }
  if (isVerificationUrl(tab.url)) {
    throw new Error("当前是登录/验证页面，请人工完成后再采集");
  }
  const result = await sendToContent(tabId, { type: "collectCurrentPage", requireOffers: true });
  if (!result || !result.ok) {
    throw new Error(result?.error || "页面解析失败");
  }
  if (result.pageType === "search") {
    const saved = await postJson("/api/search-results/batch", {
      source_url: tab.url,
      page_number: result.pageNumber,
      shops: result.shops,
      captured_at: new Date().toISOString()
    });
    return { pageType: "search", saved: saved.saved, nextUrl: result.nextUrl };
  }
  const saved = await postJson("/api/shops/detail", {
    shop_id: result.shopId,
    page_url: tab.url,
    detail: result.detail,
    offers: result.offers || [],
    offer_section_detected: Boolean(result.offerSectionDetected),
    captured_at: new Date().toISOString()
  });
  const savedShop = saved.shop || null;
  const state = await getState();
  const completedRows = [
    ...(state.completedRows || []).filter((shop) => shop?.["店铺id"] !== savedShop?.["店铺id"]),
    savedShop
  ].filter(Boolean).slice(-state.maxShops);
  await setState({
    completedRows,
    lastCompletedShop: savedShop,
    message: `已完整写入 ${savedShop?.["店铺名"] || result.shopId}`
  });
  return {
    pageType: "detail",
    saved: 1,
    shopId: savedShop?.["店铺id"] || saved.shop_id,
    offerCount: savedShop?.["优惠券信息"]?.length ?? saved.deal_count ?? 0,
    shop: savedShop
  };
}

async function processSearchPage(tabId) {
  if (processingTabs.has(tabId)) {
    return;
  }
  processingTabs.add(tabId);
  try {
    let state = await getState();
    if (!state.running || state.mode !== "search" || state.tabId !== tabId) {
      return;
    }
    const tab = await chrome.tabs.get(tabId);
    await setState({ currentUrl: tab.url });
    if (isVerificationUrl(tab.url)) {
      await pauseWithMessage("检测到登录或滑块验证，请人工完成后点击继续");
      return;
    }
    const currentPage = (state.startPage || 1) + (state.pagesDone || 0);
    if (!(await waitForRateLimit(`采集搜索第 ${currentPage} 页`))) {
      return;
    }
    const result = await sendToContent(tabId, { type: "collectSearchPage" });
    if (!result?.ok || !result.shops?.length) {
      await recordInvalidPage(result?.error || "当前页没有识别到有效店铺列表");
      return;
    }
    await clearInvalidPages();
    const scopedShops = limitSearchShops(
      state.searchShops,
      result.shops,
      state.queueLimit
    );
    const allowedShopIds = new Set(
      scopedShops.map((shop) => String(shop?.["店铺id"] || ""))
    );
    const pageShops = mergeSearchShops([], result.shops)
      .filter((shop) => allowedShopIds.has(String(shop?.["店铺id"] || "")));
    if (!pageShops.length) {
      await recordInvalidPage("当前页没有识别到带稳定店铺 ID 的记录");
      return;
    }

    const capturedAt = new Date().toISOString();
    for (const [index, shop] of pageShops.entries()) {
      state = await getState();
      if (!state.running || state.mode !== "search" || state.tabId !== tabId) {
        return;
      }
      const nextSearchShops = limitSearchShops(
        state.searchShops,
        [shop],
        state.queueLimit
      );
      const sequence = nextSearchShops.findIndex(
        (item) => String(item?.["店铺id"] || "") === String(shop?.["店铺id"] || "")
      ) + 1 + ((state.startPage || 1) - 1) * SEARCH_RESULTS_PER_PAGE;
      await postJson("/api/search-results/batch", {
        source_url: tab.url,
        page_number: result.pageNumber,
        task_id: state.taskId,
        sequence_start: sequence,
        shops: [shop],
        captured_at: capturedAt
      });
      await setState({
        searchShops: nextSearchShops,
        message: `正在同步第 ${result.pageNumber || currentPage} 页：${index + 1}/${pageShops.length}`
      });
    }

    state = await getState();
    const visited = Array.from(new Set([...(state.visited || []), tab.url]));
    const searchShops = limitSearchShops(state.searchShops, [], state.queueLimit);
    const pagesDone = (state.pagesDone || 0) + 1;
    const lastPage = (state.startPage || 1) + pagesDone - 1;
    const completedPageRange = lastPage === (state.startPage || 1)
      ? `第 ${lastPage} 页`
      : `第 ${state.startPage || 1}–${lastPage} 页`;
    const canContinue =
      result.nextUrl &&
      pagesDone < state.maxPages &&
      searchShops.length < state.queueLimit &&
      !visited.includes(result.nextUrl);
    if (!canContinue) {
      state = await setState({ pagesDone, visited, searchShops });
      if (state.autoDetails) {
        const count = await beginDetailQueue(tabId, {
          maxShops: state.maxShops,
          startIndex: state.pageStartIndex,
          sequenceStart: state.startIndex,
          startPage: state.startPage,
          endPage: state.endPage,
          taskId: state.taskId,
          cityId: state.targetCityId,
          keyword: state.targetKeyword,
          includeDeals: state.includeDeals,
          returnUrl: state.returnUrl,
          sourceUrl: state.returnUrl,
          shops: state.searchShops,
          rateState: state
        });
        if (!count) {
          await setState({
            running: false,
            mode: "idle",
            message: `搜索采集完成，${completedPageRange}；没有待采集详情`
          });
        }
      } else {
        await setState({
          running: false,
          mode: "idle",
          message: `搜索采集完成，${completedPageRange}`
        });
      }
      return;
    }
    await setState({
      pagesDone,
      visited,
      searchShops,
      message: `已保存第 ${result.pageNumber || currentPage} 页，正在打开下一页`
    });
    await setState({ currentUrl: result.nextUrl });
    await chrome.tabs.update(tabId, { url: result.nextUrl });
  } catch (error) {
    await pauseWithMessage(error.message);
  } finally {
    processingTabs.delete(tabId);
  }
}

async function beginDetailQueue(tabId, options) {
  const count = Math.round(clampNumber(options.maxShops, 15, 1, 100));
  const startIndex = Math.round(clampNumber(options.startIndex, 1, 1, 3000));
  const sequenceStart = Math.round(clampNumber(options.sequenceStart, startIndex, 1, 3000));
  const queueLimit = startIndex + count - 1;
  const includeDeals = Boolean(options.includeDeals);
  let pendingShops = options.shops?.length ? options.shops : [];
  if (!pendingShops.length) {
    const sourceFilter = options.sourceUrl
      ? `&source_url=${encodeURIComponent(options.sourceUrl)}`
      : "";
    const taskFilter = options.taskId
      ? `&task_id=${encodeURIComponent(options.taskId)}`
      : "";
    const pending = await getJson(
      `/api/shops/pending?limit=${queueLimit}${sourceFilter}${taskFilter}`
    );
    pendingShops = pending.shops || [];
  }
  const selectedQueue = detailQueueFromShops(pendingShops, startIndex, count, sequenceStart);
  if (!selectedQueue.length) {
    return 0;
  }
  const completion = await postJson("/api/shops/completion", {
    shop_ids: selectedQueue.map((item) => item.shopId)
  });
  const queue = markCompletedQueueItems(selectedQueue, completion.completed_ids);
  const queueIndex = nextPendingQueueIndex(queue);
  const counts = queueCounts(queue);
  if (includeDeals && queueIndex < queue.length) {
    await ensureDebugger(tabId);
  }
  const rateState = options.rateState
    ? copyRateState(options.rateState)
    : rateStateFromMessage(options);
  const state = await setState({
    ...DEFAULT_STATE,
    ...rateState,
    running: true,
    mode: "detail",
    tabId,
    taskId: options.taskId || createTaskId(),
    startPage: Math.round(clampNumber(options.startPage, 1, 1, 30)),
    endPage: Math.round(clampNumber(options.endPage, options.startPage || 1, 1, 30)),
    pageStartIndex: startIndex,
    startIndex: sequenceStart,
    maxShops: count,
    queueLimit: sequenceStart + count - 1,
    targetCityId: String(options.cityId || ""),
    targetKeyword: String(options.keyword || ""),
    queue,
    queueIndex,
    ...counts,
    includeDeals,
    returnUrl: options.returnUrl || "",
    currentUrl: queue[queueIndex]?.url || "",
    message: `已建立第 ${sequenceStart}–${sequenceStart + queue.length - 1} 家队列；跳过 ${counts.skippedCount} 家`
  });
  await navigateDetailItem(state);
  return queue.length;
}

async function completeCurrentQueueItem(state) {
  const queue = (state.queue || []).map((item, index) => index === state.queueIndex
    ? { ...item, status: "completed" }
    : item);
  const nextIndex = nextPendingQueueIndex(queue, state.queueIndex + 1);
  return setState({
    queue,
    queueIndex: nextIndex,
    ...queueCounts(queue)
  });
}

async function navigateDetailItem(state) {
  if (!state.running || state.mode !== "detail") {
    return;
  }
  const nextIndex = nextPendingQueueIndex(state.queue, state.queueIndex);
  if (nextIndex !== state.queueIndex) {
    state = await setState({
      queueIndex: nextIndex,
      ...queueCounts(state.queue)
    });
  }
  if (nextIndex >= state.queue.length) {
    if (state.includeDeals) {
      await releaseDebugger(state.tabId);
    }
    const counts = queueCounts(state.queue);
    await setState({
      running: false,
      mode: "idle",
      ...counts,
      currentUrl: "",
      message: `任务完成：新采集 ${counts.completedCount} 家，跳过 ${counts.skippedCount} 家`
    });
    if (state.returnUrl) {
      await chrome.tabs.update(state.tabId, { url: state.returnUrl });
    }
    return;
  }
  const item = state.queue[nextIndex];
  await setState({
    currentUrl: item.url,
    message: `正在采集搜索序号 ${item.sequence}：${item.name || item.shopId}`
  });
  await chrome.tabs.update(state.tabId, { url: item.url });
}

async function processDetailPage(tabId) {
  if (processingTabs.has(tabId)) {
    return;
  }
  processingTabs.add(tabId);
  try {
    let state = await getState();
    if (!state.running || state.mode !== "detail" || state.tabId !== tabId) {
      return;
    }
    const tab = await chrome.tabs.get(tabId);
    if (isVerificationUrl(tab.url)) {
      await pauseWithMessage("检测到登录或滑块验证，请人工完成后点击继续");
      return;
    }
    const item = state.queue[state.queueIndex];
    if (!item) {
      await navigateDetailItem(state);
      return;
    }

    if (!(await waitForRateLimit(`采集第 ${state.queueIndex + 1} 家店铺`))) {
      return;
    }
    if (state.includeDeals) {
      const activation = await sendToContent(tabId, { type: "activateDealArea" });
      if (!activation?.ok && activation?.requiresHuman) {
        await pauseWithMessage("店铺页要求人工验证，完成后点击继续");
        return;
      }
      await sleep(1500);
    }
    const result = await sendToContent(tabId, {
      type: "collectDetailPage",
      requireOffers: state.includeDeals
    });
    if (!result?.ok) {
      if (result?.requiresHuman) {
        await pauseWithMessage(result.error || "店铺页要求人工登录或验证");
      } else if (result?.offerParseFailed) {
        await pauseWithMessage(result.error || "优惠栏目解析失败，已暂停且未写入当前店铺");
      } else {
        await pauseWithMessage(result?.error || "店铺页没有解析到有效信息；任务已停止");
      }
      return;
    }
    await clearInvalidPages();
    const completeDetail = mergeCompleteDetail(item.searchRecord || {}, result.detail || {});
    const missingFields = missingCompleteFields(completeDetail);
    if (missingFields.length) {
      await pauseWithMessage(`当前店铺缺少完整字段：${missingFields.join("、")}；未写入且未进入下一家`);
      return;
    }
    const saved = await postJson("/api/shops/detail", {
      shop_id: item.shopId || result.shopId,
      page_url: tab.url,
      detail: completeDetail,
      offers: state.includeDeals ? (result.offers || []) : [],
      offer_section_detected: Boolean(state.includeDeals && result.offerSectionDetected),
      captured_at: new Date().toISOString()
    });
    state = await getState();
    const completedRows = [
      ...(state.completedRows || []).filter((shop) => shop?.["店铺id"] !== saved.shop?.["店铺id"]),
      saved.shop
    ].filter(Boolean).slice(-state.maxShops);
    state = await setState({
      completedRows,
      lastCompletedShop: saved.shop || null,
      message: saved.missing_fields?.length
        ? `已写入 ${saved.shop?.["店铺名"] || item.name || item.shopId}；页面未展示：${saved.missing_fields.join("、")}`
        : `已完整写入 ${saved.shop?.["店铺名"] || item.name || item.shopId}`
    });
    state = await completeCurrentQueueItem(state);
    await navigateDetailItem(state);
  } catch (error) {
    await pauseWithMessage(error.message);
  } finally {
    processingTabs.delete(tabId);
  }
}

async function refreshQueueCompletion(state) {
  const pendingIds = (state.queue || [])
    .filter((item) => item.status === "pending")
    .map((item) => item.shopId);
  if (!pendingIds.length) {
    return state;
  }
  const completion = await postJson("/api/shops/completion", {
    shop_ids: pendingIds
  });
  const queue = markCompletedQueueItems(state.queue, completion.completed_ids);
  const queueIndex = nextPendingQueueIndex(queue, state.queueIndex);
  return setState({
    queue,
    queueIndex,
    ...queueCounts(queue)
  });
}

async function resumeLastTask() {
  await requireMongo();
  let state = await getState();
  if (state.mode === "idle") {
    throw new Error("没有可以继续的任务");
  }
  const tab = await activeTab();
  if (state.mode === "detail") {
    state = await refreshQueueCompletion(state);
    if (state.includeDeals && state.queueIndex < state.queue.length) {
      await ensureDebugger(tab.id);
    }
  }
  state = await setState({
    running: true,
    tabId: tab.id,
    message: "正在恢复上次任务"
  });
  await setRuntimeStatus({ lastError: "" });

  if (state.mode === "search") {
    const targetUrl = state.currentUrl || state.returnUrl;
    if (!targetUrl) {
      throw new Error("上次搜索任务缺少恢复地址，请重新搜索");
    }
    if (tab.url === targetUrl) {
      void processSearchPage(tab.id);
    } else {
      await chrome.tabs.update(tab.id, { url: targetUrl });
    }
  } else {
    const item = state.queue[state.queueIndex];
    if (!item) {
      await navigateDetailItem(state);
    } else if (tab.url === item.url) {
      void processDetailPage(tab.id);
    } else {
      await navigateDetailItem(state);
    }
  }
  return state;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "complete") {
    return;
  }
  void (async () => {
    const state = await getState();
    if (!state.running || state.tabId !== tabId) {
      return;
    }
    if (state.mode === "search") {
      await processSearchPage(tabId);
    } else if (state.mode === "detail") {
      await processDetailPage(tabId);
    }
  })();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const state = await getState();
  if (state.running && state.tabId === tabId) {
    await pauseWithMessage("采集标签页已关闭");
  }
});

async function handleMessage(message) {
  if (message.type === "setApiToken") {
    const token = String(message.token || "").trim();
    if (token.length < 24) {
      throw new Error("配对令牌格式不正确");
    }
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
    try {
      const health = await getJson("/health");
      await setRuntimeStatus({ lastError: "" });
      return { ok: true, health };
    } catch (error) {
      await chrome.storage.local.remove(TOKEN_KEY);
      throw error;
    }
  }

  if (message.type === "getPairingState") {
    const token = await getApiToken();
    return {
      ok: true,
      paired: Boolean(token),
      tokenHint: token ? `••••${token.slice(-4)}` : ""
    };
  }

  if (message.type === "getStatus") {
    let health = null;
    let apiError = "";
    const token = await getApiToken();
    try {
      health = await getJson("/health");
    } catch (error) {
      apiError = error.message;
    }
    return {
      ok: true,
      state: await getState(),
      runtime: await getRuntimeStatus(),
      health,
      apiError,
      pairing: {
        paired: Boolean(token && health),
        tokenStored: Boolean(token),
        tokenHint: token ? `••••${token.slice(-4)}` : ""
      }
    };
  }

  if (message.type === "exportCsv") {
    return { ok: true, result: await exportCsv() };
  }

  if (message.type === "captureCurrent") {
    await requireMongo();
    const tab = await activeTab();
    return { ok: true, result: await saveCurrentPage(tab.id) };
  }

  if (message.type === "enableNetwork") {
    await requireMongo();
    const tab = await activeTab();
    if (!isDianpingUrl(tab.url)) {
      throw new Error("请先打开大众点评页面");
    }
    await ensureDebugger(tab.id);
    return { ok: true };
  }

  if (message.type === "startSearch") {
    await requireMongo();
    const tab = await activeTab();
    if (isVerificationUrl(tab.url)) {
      throw new Error("当前页面要求登录或验证，请人工完成后重试");
    }
    const startPage = Math.round(clampNumber(message.startPage, 1, 1, 30));
    const endPage = Math.round(clampNumber(message.endPage, startPage, 1, 30));
    if (endPage < startPage) {
      throw new Error("截至页码不能小于开始页码");
    }
    const targetUrl = buildSearchUrl(
      message.cityId || "4",
      message.keyword || "陶陶居",
      startPage
    );
    if (message.captureNetwork) {
      await ensureDebugger(tab.id);
    }
    const pageStartIndex = Math.round(
      clampNumber(message.startIndex, 1, 1, SEARCH_RESULTS_PER_PAGE)
    );
    const startIndex =
      (startPage - 1) * SEARCH_RESULTS_PER_PAGE + pageStartIndex;
    const maxShops = Math.round(clampNumber(message.maxShops, 15, 1, 100));
    const rangeCapacity =
      (endPage - startPage + 1) * SEARCH_RESULTS_PER_PAGE - pageStartIndex + 1;
    if (maxShops > rangeCapacity) {
      throw new Error(`当前页面范围最多可采集 ${rangeCapacity} 家，请减少本次采集数量或增大截至页码`);
    }
    const queueLimit = pageStartIndex + maxShops - 1;
    const taskId = createTaskId();
    await setState({
      ...DEFAULT_STATE,
      ...rateStateFromMessage(message),
      running: true,
      mode: "search",
      tabId: tab.id,
      taskId,
      maxPages: endPage - startPage + 1,
      startPage,
      endPage,
      pageStartIndex,
      maxShops,
      startIndex,
      queueLimit,
      targetCityId: String(message.cityId || "4"),
      targetKeyword: String(message.keyword || "陶陶居").trim(),
      currentUrl: targetUrl,
      searchShops: [],
      includeDeals: Boolean(message.includeDeals),
      autoDetails: Boolean(message.autoDetails),
      returnUrl: targetUrl,
      message: startPage === endPage
        ? `正在直接打开第 ${startPage} 页`
        : `正在直接打开第 ${startPage} 页，采集至第 ${endPage} 页`
    });
    await setRuntimeStatus({ lastError: "" });
    if (tab.url === targetUrl) {
      void processSearchPage(tab.id);
    } else {
      await chrome.tabs.update(tab.id, { url: targetUrl });
    }
    return { ok: true, targetUrl };
  }

  if (message.type === "startDetails") {
    await requireMongo();
    const tab = await activeTab();
    const currentState = await getState();
    const sameSearch = searchScope(currentState.returnUrl) === searchScope(tab.url);
    const startPage = Math.round(clampNumber(message.startPage, currentState.startPage || 1, 1, 30));
    const pageStartIndex = Math.round(
      clampNumber(message.startIndex, currentState.pageStartIndex || 1, 1, SEARCH_RESULTS_PER_PAGE)
    );
    const count = await beginDetailQueue(tab.id, {
      ...message,
      startPage,
      endPage: Math.round(clampNumber(message.endPage, startPage, startPage, 30)),
      startIndex: pageStartIndex,
      sequenceStart: (startPage - 1) * SEARCH_RESULTS_PER_PAGE + pageStartIndex,
      taskId: currentState.taskId,
      sourceUrl: tab.url || "",
      shops: sameSearch ? currentState.searchShops : [],
      returnUrl: tab.url || ""
    });
    if (!count) {
      throw new Error("没有待采集详情的店铺，请先采集搜索页");
    }
    return { ok: true, count };
  }

  if (message.type === "pause") {
    await setState({ running: false, message: "已暂停" });
    return { ok: true };
  }

  if (message.type === "resume") {
    await resumeLastTask();
    return { ok: true };
  }

  if (message.type === "continueLastTask") {
    await resumeLastTask();
    return { ok: true };
  }

  throw new Error("未知操作");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch(async (error) => {
      await setRuntimeStatus({ lastError: error.message });
      sendResponse({ ok: false, error: error.message });
    });
  return true;
});

