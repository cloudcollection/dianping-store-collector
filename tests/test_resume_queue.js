const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("extension/background.js", "utf8");
const stored = {
  collectorApiToken: "test-token-123456789012345678901234"
};
const updates = [];
const event = { addListener() {} };
const chrome = {
  runtime: { onInstalled: event, onStartup: event, onMessage: event },
  debugger: {
    onEvent: event,
    onDetach: event,
    attach: async () => {},
    detach: async () => {},
    sendCommand: async () => ({})
  },
  sidePanel: { setPanelBehavior: async () => {} },
  storage: {
    local: {
      async get(key) {
        return { [key]: stored[key] };
      },
      async set(value) {
        Object.assign(stored, value);
      }
    }
  },
  tabs: {
    onUpdated: event,
    onRemoved: event,
    async query() {
      return [{ id: 7, url: "https://example.com/" }];
    },
    async update(tabId, change) {
      updates.push({ tabId, ...change });
      return { id: tabId, ...change };
    }
  }
};

async function fetchMock(url) {
  if (url.endsWith("/health")) {
    return {
      ok: true,
      async json() {
        return { mongo_connected: true, version: "2.0.0" };
      }
    };
  }
  if (url.endsWith("/api/shops/completion")) {
    return {
      ok: true,
      async json() {
        return { ok: true, completed_ids: ["shop-16", "shop-18"], count: 2 };
      }
    };
  }
  throw new Error(`Unexpected URL: ${url}`);
}

const context = {
  chrome,
  fetch: fetchMock,
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

vm.createContext(context);
vm.runInContext(source, context);

const result = vm.runInContext(`(async () => {
  const shops = Array.from(
    { length: 40 },
    (_, index) => ({
      "店铺id": "shop-" + (index + 1),
      "店铺名": "店铺" + (index + 1),
      "详情链接": "https://www.dianping.com/shop/shop-" + (index + 1)
    })
  );
  const count = await beginDetailQueue(7, {
    shops,
    startIndex: 16,
    maxShops: 15,
    includeDeals: false,
    cityId: "4",
    keyword: "陶陶居",
    returnUrl: "https://www.dianping.com/search/keyword/4/0_test"
  });
  const initial = await getState();
  await setState({ running: false });
  await resumeLastTask();
  const resumed = await getState();
  return { count, initial, resumed };
})()`, context);

result.then(({ count, initial, resumed }) => {
  assert.equal(count, 15);
  assert.equal(initial.queue[0].sequence, 16);
  assert.equal(initial.queue[14].sequence, 30);
  assert.equal(initial.queue[0].status, "skipped");
  assert.equal(initial.queue[2].status, "skipped");
  assert.equal(initial.queueIndex, 1);
  assert.equal(initial.queue[initial.queueIndex].shopId, "shop-17");
  assert.equal(initial.skippedCount, 2);
  assert.equal(resumed.running, true);
  assert.equal(resumed.queueIndex, 1);
  assert.equal(resumed.queue[resumed.queueIndex].shopId, "shop-17");
  assert.equal(updates[0].url, "https://www.dianping.com/shop/shop-17");
  assert.equal(updates.at(-1).url, "https://www.dianping.com/shop/shop-17");
  console.log("resume queue test passed");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
