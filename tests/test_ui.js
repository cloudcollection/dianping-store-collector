const assert = require("node:assert/strict");
const i18n = require("../extension/i18n.js");
const progress = require("../extension/progress.js");
i18n.setLocale("en");
assert.equal(i18n.t("本地服务离线"), "Local service offline");
assert.equal(i18n.t("已完整写入 测试店"), "Saved 测试店");
assert.equal(
  i18n.t("任务完成：新采集 3 家，跳过 2 家"),
  "Finished: 3 stores saved, 2 skipped",
);
assert.equal(
  i18n.t("随机间隔 12.5 秒，之后采集搜索第 2 页"),
  "Waiting 12.5s, then collect search page 2",
);
assert.equal(
  i18n.t("当前店铺缺少完整字段：店铺名、店铺地址；未写入且未进入下一家"),
  "Missing required fields: Store name, Address. Store not committed; queue paused.",
);
assert.equal(i18n.t("团购价 ¥88"), "Offer ¥88");
assert.equal(i18n.t("店铺自定义名称"), "店铺自定义名称");
i18n.setLocale("zh-CN");
assert.equal(i18n.t("本地服务离线"), "本地服务离线");
assert.deepEqual(progress.from({ mode: "idle" }), {
  current: 0,
  total: 0,
  percent: 0,
});
assert.deepEqual(progress.from({ mode: "search", pagesDone: 2, maxPages: 4 }), {
  current: 2,
  total: 4,
  percent: 50,
});
assert.deepEqual(
  progress.from({
    mode: "detail",
    queue: [{}, {}, {}, {}],
    completedCount: 1,
    skippedCount: 1,
  }),
  { current: 2, total: 4, percent: 50 },
);
assert.equal(
  progress.from({ mode: "detail", queue: [{}], completedCount: 9 }).percent,
  100,
);
assert.equal(
  progress.from({ mode: "search", pagesDone: Infinity, maxPages: 3 }).percent,
  0,
);
console.log("UI language and progress tests passed");
