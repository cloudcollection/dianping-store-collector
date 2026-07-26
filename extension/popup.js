const elements = {
  serviceDot: document.querySelector("#service-dot"),
  serviceLabel: document.querySelector("#service-label"),
  taskStatus: document.querySelector("#task-status"),
  shopCount: document.querySelector("#shop-count"),
  detailCount: document.querySelector("#detail-count"),
  dealCount: document.querySelector("#deal-count"),
  message: document.querySelector("#message"),
  openConsole: document.querySelector("#open-console"),
  pause: document.querySelector("#pause"),
  resume: document.querySelector("#resume")
};

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error || "操作失败");
  }
  return response;
}

function showMessage(text, error = false) {
  elements.message.textContent = text || "";
  elements.message.classList.toggle("is-error", error);
}

async function refresh() {
  try {
    const { state, health, runtime, apiError, pairing } = await send({ type: "getStatus" });
    const online = Boolean(health?.mongo_connected);
    elements.serviceDot.classList.toggle("online", online);
    elements.serviceDot.classList.toggle("offline", !online);
    elements.serviceLabel.textContent = health
      ? online ? "MongoDB 在线" : "MongoDB 未连接"
      : pairing?.tokenStored ? "配对验证失败" : "需要本地配对";
    elements.taskStatus.textContent = state.message || "等待开始";
    elements.shopCount.textContent = health?.shop_count ?? 0;
    elements.detailCount.textContent = health?.detail_count ?? 0;
    elements.dealCount.textContent = health?.deal_count ?? 0;
    elements.pause.disabled = !state.running;
    elements.resume.disabled = state.running || state.mode === "idle" || !online;
    if (runtime.lastError) {
      showMessage(runtime.lastError, true);
    } else if (apiError) {
      showMessage(apiError, true);
    } else {
      showMessage(`响应 ${runtime.capturedResponses || 0} · 优惠 ${runtime.capturedDeals || 0}`);
    }
  } catch (error) {
    elements.serviceDot.classList.remove("online");
    elements.serviceDot.classList.add("offline");
    elements.serviceLabel.textContent = "本地服务离线";
    elements.pause.disabled = true;
    elements.resume.disabled = true;
    showMessage(error.message, true);
  }
}

async function run(button, action) {
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    await refresh();
  }
}

elements.openConsole.addEventListener("click", async () => {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.sidePanel.open({ windowId: currentWindow.id });
    window.close();
  } catch (error) {
    const url = chrome.runtime.getURL("sidepanel.html");
    await chrome.tabs.create({ url });
    window.close();
  }
});

elements.pause.addEventListener("click", () => run(
  elements.pause,
  () => send({ type: "pause" })
));

elements.resume.addEventListener("click", () => run(
  elements.resume,
  () => send({ type: "resume" })
));

if (globalThis.chrome?.runtime?.sendMessage) {
  void refresh();
  const refreshTimer = window.setInterval(() => void refresh(), 2000);
  window.addEventListener("unload", () => window.clearInterval(refreshTimer));
} else {
  elements.serviceDot.classList.add("offline");
  elements.serviceLabel.textContent = "本地预览模式";
  elements.pause.disabled = true;
  elements.resume.disabled = true;
  showMessage("安装扩展后连接本地服务");
}
