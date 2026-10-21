async (page) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.context().addInitScript(() => {
    const stored = {
      collectorLanguage: "en",
      collectorTarget: { cityId: "4", keyword: "保留的关键词" },
      sidePanelSettings: {
        schemaVersion: 4,
        taskMode: "full",
        startPage: 2,
        endPage: 4,
        startIndex: 3,
        maxShops: 10,
        ratePreset: "fast",
        includeDeals: true,
      },
    };
    const listeners = [];
    window.collectorMessages = [];
    window.collectorState = {
      mode: "detail",
      running: false,
      queueIndex: 2,
      queue: [
        { name: "等待开始", shopId: "1", status: "completed" },
        { name: "已完成", shopId: "2", status: "skipped" },
        {
          name: "<img src=x onerror=alert(1)>",
          shopId: "3",
          status: "pending",
        },
        { name: "第四家", shopId: "4", status: "pending" },
      ],
      completedCount: 1,
      skippedCount: 1,
      message: "任务完成：新采集 1 家，跳过 1 家",
      lastCompletedShop: {
        店铺id: "1",
        店铺名: "等待开始",
        店铺地址: "<script>alert(1)</script>",
        店铺总分: 4.5,
        优惠券信息: [
          {
            团购名称: "已完成",
            优惠类型: "代金券",
            团购价格: 88,
            原价: 100,
            使用说明: "原始使用说明",
          },
        ],
      },
    };
    const mock = {
      storage: {
        local: {
          get: async (keys) =>
            typeof keys === "string"
              ? { [keys]: stored[keys] }
              : Object.fromEntries(keys.map((key) => [key, stored[key]])),
          set: async (values) => {
            const changes = {};
            for (const [key, value] of Object.entries(values)) {
              changes[key] = { oldValue: stored[key], newValue: value };
              stored[key] = value;
            }
            listeners.forEach((listener) => listener(changes, "local"));
          },
        },
        onChanged: { addListener: (listener) => listeners.push(listener) },
      },
      runtime: {
        sendMessage: async (message) => {
          window.collectorMessages.push(message);
          if (message.type === "getStatus")
            return {
              ok: true,
              state: window.collectorState,
              health: {
                mongo_connected: true,
                shop_count: 1,
                detail_count: 1,
                deal_count: 1,
              },
              runtime: {},
              pairing: {
                paired: true,
                tokenStored: true,
                tokenHint: "test-only",
              },
            };
          if (message.type === "captureCurrent")
            return new Promise((resolve) => {
              window.finishCapture = () => resolve({ ok: true });
            });
          return { ok: true };
        },
      },
    };
    Object.assign(window.chrome, mock);
    window.savedCollectorSettings = stored;
  });
  await page.goto("http://127.0.0.1:8848/extension/sidepanel.html");
  await page.getByRole("heading", { name: "Plan a collection" }).waitFor();
  if ((await page.locator("#start-page").inputValue()) !== "2")
    throw Error("Upgrade lost saved range");
  if ((await page.locator("#max-shops").inputValue()) !== "10")
    throw Error("Upgrade lost store limit");
  if ((await page.locator("#completed-name").textContent()) !== "等待开始")
    throw Error("Store name was translated");
  if (
    (await page.locator(".completed-offer strong").textContent()) !== "已完成"
  )
    throw Error("Offer name was translated");
  if (await page.locator("#completed-fields script").count())
    throw Error("Record content became executable HTML");
  if (
    (await page.locator(".progress-track").getAttribute("aria-valuenow")) !==
    "50"
  )
    throw Error("Incorrect side panel progress");
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("zh-CN");
  if (
    (await page.evaluate(
      () => window.savedCollectorSettings.sidePanelSettings.startPage,
    )) !== 2
  )
    throw Error("Language change wrote task defaults");
  await page.locator("#city-id").fill("");
  await page.locator("#shop-keyword").fill("");
  await page.locator("#start-page").fill("");
  await page
    .getByRole("combobox", { name: "任务范围", exact: true })
    .selectOption("current");
  await page.locator("#new-search").click();
  await page
    .getByRole("combobox", { name: "Language / 语言" })
    .selectOption("en");
  if (await page.locator("#new-search").isEnabled())
    throw Error("Polling unlocked an active action");
  if (
    !(await page.evaluate(() =>
      window.collectorMessages.some((m) => m.type === "captureCurrent"),
    ))
  )
    throw Error("Current page was blocked by empty search fields");
  await page.evaluate(() => window.finishCapture());
  await page.locator("#new-search").waitFor({ state: "visible" });
  await page.goto("http://127.0.0.1:8848/extension/popup.html");
  if (
    (await page.locator(".progress-line").getAttribute("aria-valuenow")) !==
    "50"
  )
    throw Error("Popup progress is not real");
  if (errors.length) throw Error(errors.join("\n"));
  return {
    passed: true,
    checks: [
      "settings upgrade",
      "language switching",
      "verbatim records",
      "HTML safety",
      "current-page action",
      "busy state",
      "real popup progress",
    ],
  };
}
