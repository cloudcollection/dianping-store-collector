const t = I18n.t;
const elements = {
  serviceDot: document.querySelector("#service-dot"),
  serviceLabel: document.querySelector("#service-label"),
  pairingCard: document.querySelector("#pairing-card"),
  pairingSummary: document.querySelector("#pairing-summary"),
  apiToken: document.querySelector("#api-token"),
  saveToken: document.querySelector("#save-token"),
  taskMode: document.querySelector("#task-mode"),
  cityId: document.querySelector("#city-id"),
  shopKeyword: document.querySelector("#shop-keyword"),
  startPage: document.querySelector("#start-page"),
  endPage: document.querySelector("#end-page"),
  startIndex: document.querySelector("#start-index"),
  maxShops: document.querySelector("#max-shops"),
  includeDeals: document.querySelector("#include-deals"),
  ratePresets: Array.from(document.querySelectorAll("[data-rate-preset]")),
  pacePreview: document.querySelector("#pace-preview"),
  progressLabel: document.querySelector("#progress-label"),
  progressTrack: document.querySelector(".progress-track"),
  progressFill: document.querySelector("#progress-fill"),
  taskStatus: document.querySelector("#task-status"),
  searchCount: document.querySelector("#search-count"),
  shopCount: document.querySelector("#shop-count"),
  detailCount: document.querySelector("#detail-count"),
  dealCount: document.querySelector("#deal-count"),
  queueSummary: document.querySelector("#queue-summary"),
  shopQueue: document.querySelector("#shop-queue"),
  completedOfferCount: document.querySelector("#completed-offer-count"),
  completedEmpty: document.querySelector("#completed-empty"),
  completedContent: document.querySelector("#completed-content"),
  completedName: document.querySelector("#completed-name"),
  completedFields: document.querySelector("#completed-fields"),
  completedOffers: document.querySelector("#completed-offers"),
  message: document.querySelector("#message"),
  newSearch: document.querySelector("#new-search"),
  continueTask: document.querySelector("#continue-task"),
  pause: document.querySelector("#pause"),
  exportCsv: document.querySelector("#export-csv"),
};

const RATE_PRESETS = {
  fast: {
    minDelaySeconds: 10,
    maxDelaySeconds: 20,
    minBatchSize: 3,
    maxBatchSize: 7,
    minBatchRestSeconds: 30,
    maxBatchRestSeconds: 90,
  },
  safe: {
    minDelaySeconds: 30,
    maxDelaySeconds: 90,
    minBatchSize: 2,
    maxBatchSize: 5,
    minBatchRestSeconds: 90,
    maxBatchRestSeconds: 240,
  },
};
const SETTINGS_SCHEMA_VERSION = 5;

let activeRate = "safe";
let actionPending = false;
let latestStatus = null;

function showMessage(text, state = "default") {
  elements.message.textContent = t(text || "");
  elements.message.classList.toggle("is-error", state === "error");
  elements.message.classList.toggle("is-success", state === "success");
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "操作失败");
  }
  return response;
}

function targetPayload() {
  const cityId = String(elements.cityId.value || "").trim();
  const keyword = elements.shopKeyword.value.trim();
  const validCity = /^[1-9]\d{0,4}$/.test(cityId);
  elements.cityId.setAttribute("aria-invalid", String(!validCity));
  elements.shopKeyword.setAttribute("aria-invalid", String(!keyword));
  if (!validCity) {
    throw new Error("请输入有效的城市编号");
  }
  if (!keyword) {
    throw new Error("请输入店铺关键词");
  }
  return { cityId, keyword };
}

function ratePayload() {
  return { ...RATE_PRESETS[activeRate] };
}

function collectionPayload() {
  const startPage = Number(elements.startPage.value);
  const endPage = Number(elements.endPage.value);
  const startIndex = Number(elements.startIndex.value);
  const maxShops = Number(elements.maxShops.value);
  const rangeCapacity =
    (endPage - startPage + 1) * 15 - Math.max(0, startIndex - 1);
  const checks = [
    [
      elements.startPage,
      Number.isInteger(startPage) && startPage >= 1 && startPage <= 30,
    ],
    [
      elements.endPage,
      Number.isInteger(endPage) && endPage >= startPage && endPage <= 30,
    ],
    [
      elements.startIndex,
      Number.isInteger(startIndex) && startIndex >= 1 && startIndex <= 15,
    ],
    [
      elements.maxShops,
      Number.isInteger(maxShops) &&
        maxShops >= 1 &&
        maxShops <= 100 &&
        maxShops <= rangeCapacity,
    ],
  ];
  for (const [element, valid] of checks) {
    element.setAttribute("aria-invalid", String(!valid));
  }
  if (checks.some(([, valid]) => !valid)) {
    throw new Error("请检查开始页码、截至页码、页内开始序号和本次采集数量");
  }
  return { startPage, endPage, startIndex, maxShops };
}

function updateNewTaskLabel() {
  const label = elements.newSearch.querySelector("span");
  const currentPage = elements.taskMode.value === "current";
  for (const input of [
    elements.cityId,
    elements.shopKeyword,
    elements.startPage,
    elements.endPage,
    elements.startIndex,
    elements.maxShops,
  ])
    input.disabled = currentPage;
  label.textContent = t(
    elements.taskMode.value === "current"
      ? "采集当前页"
      : elements.taskMode.value === "details"
        ? "开始店铺队列"
        : "开始搜索",
  );
}

function updatePairing(pairing, health) {
  const paired = Boolean(pairing?.paired && health);
  const tokenStored = Boolean(pairing?.tokenStored);
  elements.pairingCard.classList.toggle("is-paired", paired);
  elements.pairingSummary.textContent = t(
    paired
      ? `已配对 ${pairing.tokenHint || health?.token_hint || ""}`
      : tokenStored
        ? "令牌验证失败"
        : "需要配对",
  );
  if (paired) {
    elements.apiToken.value = "";
    elements.apiToken.placeholder =
      pairing.tokenHint || health?.token_hint || "已安全保存";
    elements.pairingCard.open = false;
  } else if (!tokenStored) {
    elements.pairingCard.open = true;
  }
}

async function persistSettings() {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({
    collectorTarget: {
      cityId: String(elements.cityId.value || "").trim(),
      keyword: elements.shopKeyword.value.trim(),
    },
    sidePanelSettings: {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      taskMode: elements.taskMode.value,
      startPage: Number(elements.startPage.value),
      endPage: Number(elements.endPage.value),
      startIndex: Number(elements.startIndex.value),
      maxShops: Number(elements.maxShops.value),
      includeDeals: elements.includeDeals.checked,
      ratePreset: activeRate,
    },
  });
}

function applyRatePreset(name, persist = false) {
  if (!RATE_PRESETS[name]) {
    return;
  }
  activeRate = name;
  for (const button of elements.ratePresets) {
    const selected = button.dataset.ratePreset === name;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  const preset = RATE_PRESETS[name];
  elements.pacePreview.textContent = t(
    `间隔 ${preset.minDelaySeconds}–${preset.maxDelaySeconds} 秒 · ` +
      `每批 ${preset.minBatchSize}–${preset.maxBatchSize} 次 · ` +
      `休息 ${preset.minBatchRestSeconds}–${preset.maxBatchRestSeconds} 秒（全部随机）`,
  );
  if (persist)
    void persistSettings().catch((error) =>
      showMessage(error.message, "error"),
    );
}

function updateProgress(state) {
  const { current, total, percent } = CollectorProgress.from(state);
  elements.progressLabel.textContent = t(`${current} / ${total}`);
  elements.progressFill.style.width = `${percent}%`;
  elements.progressTrack.setAttribute("aria-valuenow", String(percent));
}

function renderQueue(state) {
  const queue = Array.isArray(state.queue) ? state.queue : [];
  const completedCount = queue.filter(
    (item) => item.status === "completed",
  ).length;
  const skippedCount = queue.filter((item) => item.status === "skipped").length;
  elements.shopQueue.replaceChildren();
  elements.queueSummary.textContent = t(
    queue.length
      ? `新采集 ${completedCount} · 跳过 ${skippedCount} · 共 ${queue.length}`
      : "暂无任务",
  );
  if (!queue.length) {
    const empty = document.createElement("li");
    empty.className = "empty-queue";
    empty.textContent = t("队列为空");
    elements.shopQueue.append(empty);
    return;
  }

  const currentIndex = Math.min(state.queueIndex || 0, queue.length);
  for (const [index, item] of queue.entries()) {
    const row = document.createElement("li");
    const done = item.status === "completed";
    const skipped = item.status === "skipped";
    const current =
      index === currentIndex && state.mode === "detail" && !done && !skipped;
    row.className = `queue-row${done ? " is-done" : ""}${skipped ? " is-skipped" : ""}${current ? " is-current" : ""}`;

    const number = document.createElement("span");
    number.className = "queue-index";
    number.textContent = t(String(item.sequence || index + 1).padStart(2, "0"));
    const name = document.createElement("span");
    name.className = "queue-name";
    name.textContent = item.name || item.shopId || t("未命名店铺");
    name.title = name.textContent;
    const status = document.createElement("span");
    status.className = "queue-state";
    status.textContent = t(
      done
        ? "已完成"
        : skipped
          ? "已跳过"
          : current
            ? state.running
              ? "采集中"
              : "待继续"
            : "待处理",
    );
    row.append(number, name, status);
    elements.shopQueue.append(row);
  }
}

function displayValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join("、") : t("空");
  }
  if (value && typeof value === "object") {
    return (
      Object.entries(value)
        .map(([key, item]) => `${key} ${item}`)
        .join(" · ") || t("空")
    );
  }
  return value === null || value === undefined || value === ""
    ? t("空")
    : String(value);
}

function renderCompletedShop(state) {
  const shop = state.lastCompletedShop;
  const fields = [
    "店铺id",
    "店铺名",
    "评论总数",
    "人均价格",
    "标签",
    "店铺地址",
    "店铺均分",
    "推荐菜",
    "店铺总分",
    "优惠券信息",
    "最后采集时间",
    "首次采集时间",
  ];
  const offers = Array.isArray(shop?.["优惠券信息"]) ? shop["优惠券信息"] : [];
  elements.completedOfferCount.textContent = t(`${offers.length} 项优惠`);
  elements.completedEmpty.hidden = Boolean(shop);
  elements.completedContent.hidden = !shop;
  elements.completedFields.replaceChildren();
  elements.completedOffers.replaceChildren();
  if (!shop) {
    elements.completedName.textContent = t("");
    return;
  }

  elements.completedName.textContent =
    shop["店铺名"] || shop["店铺id"] || t("未命名店铺");
  for (const field of fields) {
    const term = document.createElement("dt");
    term.textContent = t(field);
    const description = document.createElement("dd");
    description.textContent =
      field === "优惠券信息"
        ? t(`${offers.length} 项`)
        : displayValue(shop[field]);
    elements.completedFields.append(term, description);
  }

  for (const offer of offers) {
    const article = document.createElement("article");
    article.className = "completed-offer";
    const title = document.createElement("strong");
    title.textContent = offer["团购名称"] || t("未命名优惠");
    const meta = document.createElement("span");
    meta.textContent = t(
      [
        t(offer["优惠类型"]),
        offer["团购价格"] !== undefined &&
        offer["团购价格"] !== null &&
        offer["团购价格"] !== ""
          ? t(`团购价 ¥${offer["团购价格"]}`)
          : "",
        offer["折扣"],
        offer["原价"] !== undefined &&
        offer["原价"] !== null &&
        offer["原价"] !== ""
          ? t(`原价 ¥${offer["原价"]}`)
          : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    article.append(title, meta);
    if (offer["使用说明"]) {
      const support = document.createElement("small");
      support.textContent = offer["使用说明"];
      article.append(support);
    }
    elements.completedOffers.append(article);
  }
}

async function refresh() {
  try {
    const result = await send({ type: "getStatus" });
    latestStatus = result;
    const { state, health, runtime, apiError, pairing } = result;
    const online = Boolean(health?.mongo_connected);
    updatePairing(pairing, health);
    elements.serviceDot.classList.toggle("online", online);
    elements.serviceDot.classList.toggle("offline", !online);
    elements.serviceLabel.textContent = t(
      health ? (online ? "MongoDB 在线" : "MongoDB 未连接") : "本地服务离线",
    );
    elements.serviceLabel.title = health?.mongo_database || apiError || "";
    elements.taskStatus.textContent = t(state.message || "等待开始");
    elements.searchCount.textContent = t(health?.search_result_count ?? 0);
    elements.shopCount.textContent = t(health?.shop_count ?? 0);
    elements.detailCount.textContent = t(health?.detail_count ?? 0);
    elements.dealCount.textContent = t(health?.deal_count ?? 0);
    elements.newSearch.disabled = actionPending || state.running || !online;
    elements.pause.disabled = actionPending || !state.running;
    elements.continueTask.disabled =
      actionPending || state.running || state.mode === "idle" || !online;
    elements.exportCsv.disabled = actionPending || !online;
    updateProgress(state);
    renderQueue(state);
    renderCompletedShop(state);

    if (runtime.lastError) {
      showMessage(runtime.lastError, "error");
    } else if (apiError) {
      showMessage(apiError, "error");
    } else if (!online) {
      showMessage("MongoDB 未连接", "error");
    } else if (state.running) {
      showMessage(
        `响应 ${runtime.capturedResponses || 0} · 优惠 ${runtime.capturedDeals || 0}`,
      );
    } else {
      showMessage("MongoDB 已连接");
    }
  } catch (error) {
    latestStatus = null;
    elements.serviceDot.classList.remove("online");
    elements.serviceDot.classList.add("offline");
    elements.serviceLabel.textContent = t("本地服务离线");
    elements.newSearch.disabled = true;
    elements.pause.disabled = true;
    elements.continueTask.disabled = true;
    elements.exportCsv.disabled = true;
    showMessage(error.message, "error");
  }
}

async function run(button, action, successText) {
  if (actionPending) return;
  actionPending = true;
  button.disabled = true;
  showMessage("正在处理");
  let feedback = "",
    failed = false;
  try {
    const response = await action();
    feedback =
      typeof successText === "function" ? successText(response) : successText;
  } catch (error) {
    feedback = error.message;
    failed = true;
  } finally {
    actionPending = false;
    await refresh();
    showMessage(feedback, failed ? "error" : "success");
  }
}

async function startSelectedTask() {
  if (elements.taskMode.value === "current")
    return send({ type: "captureCurrent" });
  const target = targetPayload();
  const common = {
    ...target,
    ...ratePayload(),
    ...collectionPayload(),
    includeDeals: elements.includeDeals.checked,
  };
  await persistSettings();
  if (elements.taskMode.value === "details") {
    return send({ type: "startDetails", ...common });
  }
  const full = elements.taskMode.value === "full";
  return send({
    type: "startSearch",
    ...common,
    autoDetails: full,
    captureNetwork: false,
    includeDeals: full && elements.includeDeals.checked,
  });
}

for (const button of elements.ratePresets) {
  button.addEventListener("click", () =>
    applyRatePreset(button.dataset.ratePreset, true),
  );
}

for (const control of [
  elements.taskMode,
  elements.cityId,
  elements.shopKeyword,
  elements.startPage,
  elements.endPage,
  elements.startIndex,
  elements.maxShops,
  elements.includeDeals,
]) {
  control.addEventListener("change", () => void persistSettings());
}
elements.taskMode.addEventListener("change", updateNewTaskLabel);

elements.newSearch.addEventListener("click", () =>
  run(elements.newSearch, startSelectedTask, (response) =>
    response.count ? `队列已开始 · ${response.count} 家` : "任务已开始",
  ),
);

elements.pause.addEventListener("click", () =>
  run(elements.pause, () => send({ type: "pause" }), "任务已暂停"),
);

elements.continueTask.addEventListener("click", () =>
  run(
    elements.continueTask,
    () => send({ type: "continueLastTask" }),
    "正在继续上次任务",
  ),
);

elements.saveToken.addEventListener("click", () =>
  run(
    elements.saveToken,
    async () => {
      const token = elements.apiToken.value.trim();
      if (!token) {
        throw new Error("请粘贴本地服务显示的配对令牌");
      }
      return send({ type: "setApiToken", token });
    },
    "本地服务已安全配对",
  ),
);

elements.exportCsv.addEventListener("click", () =>
  run(
    elements.exportCsv,
    () => send({ type: "exportCsv" }),
    "已创建一次性安全导出",
  ),
);

if (
  globalThis.chrome?.runtime?.sendMessage &&
  globalThis.chrome?.storage?.local
) {
  void chrome.storage.local
    .get(["collectorTarget", "sidePanelSettings"])
    .then((stored) => {
      const target = stored.collectorTarget || {};
      const settings = stored.sidePanelSettings || {};
      elements.cityId.value = target.cityId || "4";
      elements.shopKeyword.value = target.keyword || "陶陶居";
      elements.taskMode.value = settings.taskMode || "full";
      elements.startPage.value = String(settings.startPage ?? 1);
      elements.endPage.value = String(
        settings.endPage ?? settings.startPage ?? 1,
      );
      elements.startIndex.value = String(settings.startIndex ?? 1);
      elements.maxShops.value = String(settings.maxShops ?? 3);
      elements.includeDeals.checked = settings.includeDeals !== false;
      updateNewTaskLabel();
      applyRatePreset(settings.ratePreset || "safe");
    });

  void refresh();
  let refreshTimer = window.setInterval(() => void refresh(), 2000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearInterval(refreshTimer);
      refreshTimer = 0;
    } else if (!refreshTimer) {
      void refresh();
      refreshTimer = window.setInterval(() => void refresh(), 2000);
    }
  });
  window.addEventListener("unload", () => window.clearInterval(refreshTimer));
} else {
  updateNewTaskLabel();
  applyRatePreset(activeRate);
  renderQueue({});
  elements.serviceDot.classList.add("offline");
  elements.serviceLabel.textContent = t("本地预览");
  elements.pairingSummary.textContent = t("安装后配对");
  elements.newSearch.disabled = true;
  elements.continueTask.disabled = true;
  elements.pause.disabled = true;
  elements.exportCsv.disabled = true;
  showMessage("预览模式 · 安装扩展后连接本地服务");
}

document.addEventListener("collector:language", () => {
  updateNewTaskLabel();
  applyRatePreset(activeRate);
  if (globalThis.chrome?.runtime?.sendMessage) void refresh();
  else {
    elements.serviceLabel.textContent = t("本地预览");
    elements.pairingSummary.textContent = t("安装后配对");
    showMessage("预览模式 · 安装扩展后连接本地服务");
    renderQueue({});
  }
});
