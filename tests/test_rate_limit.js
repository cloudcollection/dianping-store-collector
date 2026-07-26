const assert = require("node:assert/strict");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const vm = require("node:vm");
const popupSource = fs.readFileSync("extension/popup.html", "utf8");
const sidePanelSource = fs.readFileSync("extension/sidepanel.html", "utf8");
const sidePanelScriptSource = fs.readFileSync("extension/sidepanel.js", "utf8");
const manifest = JSON.parse(fs.readFileSync("extension/manifest.json", "utf8"));

const event = { addListener() {} };
const context = {
  chrome: {
    runtime: { onInstalled: event, onMessage: event },
    debugger: { onEvent: event, onDetach: event },
    tabs: { onUpdated: event, onRemoved: event }
  },
  console,
  URL,
  Map,
  Set,
  Date,
  Math,
  Number,
  String,
  Array,
  Boolean,
  Promise,
  setTimeout,
  clearTimeout
};
context.crypto = webcrypto;

vm.createContext(context);
const backgroundSource = fs.readFileSync("extension/background.js", "utf8");
vm.runInContext(backgroundSource, context);

const result = vm.runInContext(`(() => {
  const randomSamples = Array.from({ length: 64 }, () => secureRandomUnit());
  const integerSamples = Array.from({ length: 64 }, () => randomInteger(3, 7));
  const delaySamples = Array.from({ length: 64 }, () => randomBetween(10, 20));
  const config = rateStateFromMessage({
    minDelaySeconds: 6,
    maxDelaySeconds: 12,
    minBatchSize: 2,
    maxBatchSize: 6,
    minBatchRestSeconds: 15,
    maxBatchRestSeconds: 75
  });
  const defaultConfig = rateStateFromMessage({});
  const merged = mergeSearchShops(
    [{ "店铺id": "a", "店铺名": "旧名称" }],
    [{ "店铺id": "a", "店铺名": "新名称" }, { "店铺id": "b" }]
  );
  const limited = limitSearchShops(
    [],
    [{ "店铺id": "a" }, { "店铺id": "b" }, { "店铺id": "c" }],
    2
  );
  const queue = detailQueueFromShops(
    [{ "店铺id": "a" }, { "店铺id": "b" }, { "店铺id": "c" }],
    2,
    2
  );
  const markedQueue = markCompletedQueueItems(queue, ["b"]);
  const markedCounts = queueCounts(markedQueue);
  const nextPending = nextPendingQueueIndex(markedQueue);
  const rangeQueue = detailQueueFromShops(
    Array.from({ length: 40 }, (_, index) => ({ "店铺id": "shop-" + (index + 1) })),
    16,
    15
  );
  const sixthPageQueue = detailQueueFromShops(
    Array.from({ length: 15 }, (_, index) => ({ "店铺id": "page-6-shop-" + (index + 1) })),
    1,
    15,
    76
  );
  const targetUrl = buildSearchUrl("4", "陶陶居");
  const seventhPageUrl = buildSearchUrl("4", "陶陶居", 7);
  const normalLoginMetadata = responseLooksBlocked(200, { code: 0, needLogin: false, loginCode: 200 });
  const requiredLogin = responseLooksBlocked(200, { code: 0, needLogin: true });
  const rateLimited = responseLooksBlocked(429, {});
  const shelfCandidate = isCandidateResponse(
    { url: "https://m.dianping.com/meishi/poi/v1/shelf/0", mimeType: "application/json" },
    "XHR"
  );
  const menuCandidate = isCandidateResponse(
    { url: "https://m.dianping.com/ajax/menu/list", mimeType: "application/json" },
    "XHR"
  );
  let invalidCityRejected = false;
  try {
    buildSearchUrl("广州", "陶陶居");
  } catch (error) {
    invalidCityRejected = true;
  }
  return { randomSamples, integerSamples, delaySamples, config, defaultConfig, merged, limited, queue, markedQueue, markedCounts, nextPending, rangeQueue, sixthPageQueue, targetUrl, seventhPageUrl, normalLoginMetadata, requiredLogin, rateLimited, shelfCandidate, menuCandidate, invalidCityRejected };
})()`, context);

assert.equal(result.randomSamples.every((value) => value >= 0 && value < 1), true);
assert.equal(new Set(result.randomSamples).size > 1, true);
assert.equal(result.integerSamples.every((value) => value >= 3 && value <= 7), true);
assert.equal(new Set(result.integerSamples).size > 1, true);
assert.equal(result.delaySamples.every((value) => value >= 10 && value <= 20), true);
assert.equal(new Set(result.delaySamples).size > 1, true);
assert.equal(result.config.minDelaySeconds, 10);
assert.equal(result.config.maxDelaySeconds, 12);
assert.equal(result.config.minBatchSize, 2);
assert.equal(result.config.maxBatchSize, 6);
assert.equal(result.config.minBatchRestSeconds, 15);
assert.equal(result.config.maxBatchRestSeconds, 75);
assert.equal(result.config.nextBatchAt >= 2 && result.config.nextBatchAt <= 6, true);
assert.equal(result.defaultConfig.minDelaySeconds, 10);
assert.equal(result.defaultConfig.maxDelaySeconds, 20);
assert.equal(result.defaultConfig.minBatchSize, 3);
assert.equal(result.defaultConfig.maxBatchSize, 7);
assert.equal(result.defaultConfig.minBatchRestSeconds, 30);
assert.equal(result.defaultConfig.maxBatchRestSeconds, 90);
assert.equal(result.defaultConfig.nextBatchAt >= 3 && result.defaultConfig.nextBatchAt <= 7, true);
assert.equal(result.merged.length, 2);
assert.equal(result.merged[0]["店铺名"], "新名称");
assert.deepEqual(Array.from(result.limited, (shop) => shop["店铺id"]), ["a", "b"]);
assert.equal(result.queue.length, 2);
assert.deepEqual(Array.from(result.queue, (item) => item.shopId), ["b", "c"]);
assert.deepEqual(Array.from(result.queue, (item) => item.sequence), [2, 3]);
assert.equal(result.markedQueue[0].status, "skipped");
assert.equal(result.markedCounts.skippedCount, 1);
assert.equal(result.nextPending, 1);
assert.equal(result.rangeQueue.length, 15);
assert.equal(result.rangeQueue[0].shopId, "shop-16");
assert.equal(result.rangeQueue[0].sequence, 16);
assert.equal(result.rangeQueue[14].shopId, "shop-30");
assert.equal(result.rangeQueue[14].sequence, 30);
assert.equal(result.sixthPageQueue.length, 15);
assert.equal(result.sixthPageQueue[0].sequence, 76);
assert.equal(result.sixthPageQueue[14].sequence, 90);
assert.equal(
  result.targetUrl,
  "https://www.dianping.com/search/keyword/4/0_%E9%99%B6%E9%99%B6%E5%B1%85"
);
assert.equal(
  result.seventhPageUrl,
  "https://www.dianping.com/search/keyword/4/0_%E9%99%B6%E9%99%B6%E5%B1%85/p7"
);
assert.equal(result.invalidCityRejected, true);
assert.equal(result.normalLoginMetadata, false);
assert.equal(result.requiredLogin, true);
assert.equal(result.rateLimited, true);
assert.equal(result.shelfCandidate, true);
assert.equal(result.menuCandidate, false);
assert.equal(backgroundSource.includes("collectDealLinks"), false);
assert.equal(backgroundSource.includes("打开第 ${index + 1}"), false);
assert.equal(backgroundSource.includes("https://m.dianping.com/shop/${item.shopId}"), false);
assert.equal(backgroundSource.includes('shops: [shop]'), true);
assert.equal(backgroundSource.includes('/api/search-results/batch'), true);
assert.equal(backgroundSource.includes('/api/shops/completion'), true);
assert.equal(backgroundSource.includes('continueLastTask'), true);
assert.equal(backgroundSource.includes('crypto.getRandomValues'), true);
assert.equal(backgroundSource.includes('hashSeed'), false);
assert.equal(backgroundSource.includes('seededRandom'), false);
assert.equal(backgroundSource.includes('queueLimit = pageStartIndex + maxShops - 1'), true);
assert.equal(backgroundSource.includes('maxPages: endPage - startPage + 1'), true);
assert.equal(backgroundSource.includes('/api/shops/deal-status'), false);
assert.equal(backgroundSource.includes('pendingShops = options.shops?.length ? options.shops : []'), true);
assert.equal(backgroundSource.includes('missingCompleteFields'), true);
assert.equal(backgroundSource.includes('lastCompletedShop'), true);
assert.equal(sidePanelSource.includes('id="completed-fields"'), true);
assert.equal(sidePanelSource.includes('id="completed-offers"'), true);
assert.equal(popupSource.includes('id="open-console"'), true);
assert.equal(popupSource.includes('id="city-id"'), false);
assert.equal(sidePanelSource.includes('id="city-id"'), true);
assert.equal(sidePanelSource.includes('value="4"'), true);
assert.equal(sidePanelSource.includes('id="shop-keyword"'), true);
assert.equal(sidePanelSource.includes('value="陶陶居"'), true);
assert.equal(sidePanelSource.includes('id="start-page"'), true);
assert.equal(sidePanelSource.includes('开始页'), true);
assert.equal(sidePanelSource.includes('id="end-page"'), true);
assert.equal(sidePanelSource.includes('截至页'), true);
assert.equal(sidePanelSource.includes('id="start-index"'), true);
assert.equal(sidePanelSource.includes('页内起点'), true);
assert.equal(sidePanelSource.includes('id="start-index" type="number" min="1" max="15"'), true);
assert.equal(sidePanelSource.includes('value="1"'), true);
assert.equal(sidePanelScriptSource.includes('endPage >= startPage'), true);
assert.equal(sidePanelSource.includes('id="new-search"'), true);
assert.equal(sidePanelSource.includes('id="continue-task"'), true);
assert.equal(sidePanelSource.includes('采集数量'), true);
assert.equal(sidePanelSource.includes('data-rate-preset="fast"'), true);
assert.equal(sidePanelSource.includes('data-rate-preset="safe"'), true);
assert.equal(sidePanelSource.includes('id="export-csv"'), true);
assert.equal(backgroundSource.includes('X-Collector-Token'), true);
assert.equal(backgroundSource.includes('/api/export-ticket'), true);
assert.equal(manifest.side_panel.default_path, "sidepanel.html");
assert.equal(manifest.permissions.includes("sidePanel"), true);

console.log("rate limit randomness test passed");
