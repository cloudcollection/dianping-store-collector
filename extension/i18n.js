/* Shared UI translations. Record field names stay unchanged in storage and exports. */
(() => {
  const english = {
    本地服务尚未配对或令牌无效:
      "The local service is not paired or the token is invalid",
    页面要求人工验证或已触发访问限制:
      "The page requires manual verification or has restricted access",
    "当前页面需要人工登录、验证或已触发访问限制":
      "This page requires manual login or verification, or has restricted access",
    "详情页没有解析到可信字段，已停止保存":
      "No reliable store fields found. Saving stopped.",
    "页面已检测到团购套餐或代金券栏目，但没有解析出有效优惠，任务已暂停":
      "Paused: an offers section was detected but no valid offers could be read",
    当前页没有解析到可信字段: "No reliable fields found on the current page",
    "页面已检测到团购套餐或代金券栏目，但没有解析出有效优惠":
      "An offers section was detected but no valid offers could be read",
    未知页面操作: "Unknown page action",
    店迹: "店迹",
    大众点评: "Dianping",
    团购: "Group buy",
    团购套餐: "Group buy",
    代金券: "Voucher",
    店迹采集控制台: "Store Collector",
    "本地服务、配对与 MongoDB 状态":
      "Local service, pairing and MongoDB status",
    "把店铺资料，": "From store pages",
    "留成一份可用的数据。": "to useful records.",
    "小批量浏览，随时暂停。店铺与优惠整理好后，再带走一份 CSV。":
      "Browse a small batch, pause when you need to, and take your stores and offers with you as a CSV.",
    正在检查: "Checking",
    本地服务配对: "Connect locally",
    尚未验证: "Not verified",
    "启动本地服务后，把终端显示的配对令牌粘贴到这里。令牌只保存在浏览器本机。":
      "Start the local service, then paste the token shown in its terminal. The token stays in this browser.",
    配对令牌: "Pairing token",
    粘贴本地令牌: "Paste your local token",
    保存并连接: "Connect",
    设置任务: "Plan a collection",
    任务范围: "Collection mode",
    完整流程: "Search + details",
    仅搜索: "Search only",
    仅店铺页: "Saved store queue",
    当前页: "Current page",
    城市编号: "City ID",
    店铺关键词: "Search keyword",
    开始页: "First page",
    截至页: "Last page",
    页内起点: "First item",
    采集数量: "Store limit",
    "城市编号取自点评搜索地址 /search/keyword/ 后的数字；例如 /search/keyword/4/… 对应 4。":
      "Find the city ID after /search/keyword/ in a Dianping search URL. For example, /search/keyword/4/… uses 4.",
    采集优惠: "Include offers",
    团购套餐与代金券: "Group buys and vouchers",
    访问节奏: "Visit pace",
    所有等待均随机: "Random waits between visits",
    快速: "Standard",
    稳妥: "Cautious",
    任务进度: "Collection progress",
    等待开始: "Ready when you are",
    检索: "Search",
    店铺: "Stores",
    详情: "Details",
    优惠: "Offers",
    数据统计: "Record counts",
    固定队列: "Saved queue",
    暂无任务: "No collection yet",
    最新完成: "Latest saved store",
    "完成首家店铺后，结构化结果会显示在这里。":
      "Your first saved store will appear here, with its details and offers.",
    控制台已就绪: "Workspace ready",
    开始任务: "Start collection",
    继续上次任务: "Continue previous collection",
    继续上次: "Continue",
    暂停任务: "Pause collection",
    "安全导出 CSV": "Export CSV",
    "首次使用？从这里开始": "First time? Start here",
    "先启动 MongoDB，再运行": "Start MongoDB, then run",
    "在上方粘贴终端令牌，连接成功后打开点评搜索页。":
      "Paste the terminal token above. Once connected, open a Dianping search page.",
    "先试 3 家，核对店铺与优惠，再扩大范围。":
      "Start with 3 stores. Check the results before collecting more.",
    "独立工具 · 非大众点评官方产品":
      "Independent tool · Not affiliated with Dianping",
    采集统计: "Collection counts",
    正在检查本地服务: "Checking local service",
    正在读取状态: "Reading status",
    打开采集控制台: "Open workspace",
    继续任务: "Continue collection",
    操作失败: "The action failed",
    请输入有效的城市编号: "Enter a valid city ID",
    请输入店铺关键词: "Enter a search keyword",
    "请检查开始页码、截至页码、页内开始序号和本次采集数量":
      "Check the page range, first item and store limit",
    采集当前页: "Save current page",
    开始店铺队列: "Start saved queue",
    开始搜索: "Start search",
    令牌验证失败: "Token not accepted",
    需要配对: "Pairing needed",
    已安全保存: "Saved locally",
    队列为空: "Your queue is empty",
    未命名店铺: "Unnamed store",
    已完成: "Saved",
    已跳过: "Skipped",
    采集中: "Collecting",
    待继续: "Paused",
    待处理: "Pending",
    空: "Not shown",
    店铺id: "Store ID",
    店铺名: "Store name",
    评论总数: "Review count",
    人均价格: "Average spend",
    标签: "Tags",
    店铺地址: "Address",
    店铺均分: "Rating details",
    推荐菜: "Recommended dishes",
    店铺总分: "Overall rating",
    优惠券信息: "Offers",
    最后采集时间: "Last collected",
    首次采集时间: "First collected",
    未命名优惠: "Untitled offer",
    "MongoDB 在线": "MongoDB connected",
    "MongoDB 未连接": "MongoDB disconnected",
    本地服务离线: "Local service offline",
    "MongoDB 已连接": "Connected to MongoDB",
    正在处理: "Working…",
    任务已开始: "Collection started",
    任务已暂停: "Collection paused",
    正在继续上次任务: "Continuing previous collection",
    请粘贴本地服务显示的配对令牌: "Paste the token shown by the local service",
    本地服务已安全配对: "Local service connected",
    已创建一次性安全导出: "CSV download requested",
    本地预览: "Local preview",
    安装后配对: "Pair after installation",
    "预览模式 · 安装扩展后连接本地服务":
      "Preview · Install the extension to connect locally",
    本地预览模式: "Local preview",
    安装扩展后连接本地服务: "Install the extension to connect locally",
    配对验证失败: "Pairing failed",
    需要本地配对: "Local pairing needed",
    "扩展已更新，请设置限速参数后开始":
      "Extension updated. Check the visit pace before starting.",
    "浏览器已重新启动，请点击“继续上次任务”":
      "Browser restarted. Select Continue to resume.",
    请先在控制台完成本地服务配对:
      "Connect to the local service in the workspace first",
    "本地服务未启动，请先运行 start.ps1":
      "Local service is offline. Run start.ps1 first.",
    "MongoDB 未连接，任务已停止；请启动 MongoDB 后重试":
      "Collection stopped: MongoDB is disconnected. Start MongoDB and try again.",
    "MongoDB 未连接，请启动 MongoDB 后再采集":
      "Start MongoDB before collecting",
    没有找到当前标签页: "No active tab found",
    "页面采集脚本未加载，请刷新当前大众点评页面后点击继续":
      "The page collector did not load. Refresh the Dianping page, then continue.",
    "无法启用接口监听。请关闭该标签页的开发者工具后重试":
      "Could not listen to page responses. Close DevTools on this tab and try again.",
    "接口返回登录、验证、限流或封禁信号，已停止采集":
      "Collection stopped: the site requested login or verification, or restricted access.",
    接口要求重新登录或完成验证: "The site requires login or verification",
    请先打开大众点评搜索页或店铺页:
      "Open a Dianping search or store page first",
    "当前是登录/验证页面，请人工完成后再采集":
      "Complete login or verification manually before collecting",
    页面解析失败: "Could not read the page",
    "检测到登录或滑块验证，请人工完成后点击继续":
      "Login or verification detected. Complete it manually, then continue.",
    当前页没有识别到有效店铺列表: "No valid store list found on this page",
    "当前页没有识别到带稳定店铺 ID 的记录":
      "No records with stable store IDs found on this page",
    "店铺页要求人工验证，完成后点击继续":
      "The store page requires manual verification. Complete it, then continue.",
    店铺页要求人工登录或验证:
      "The store page requires manual login or verification",
    "优惠栏目解析失败，已暂停且未写入当前店铺":
      "Paused: the offers section could not be read. The current store was not committed.",
    "店铺页没有解析到有效信息；任务已停止":
      "Collection stopped: no valid store details found",
    没有可以继续的任务: "No previous collection to continue",
    正在恢复上次任务: "Restoring previous collection",
    "上次搜索任务缺少恢复地址，请重新搜索":
      "The previous search has no recovery URL. Start a new search.",
    采集标签页已关闭: "The collection tab was closed",
    配对令牌格式不正确: "The pairing token format is invalid",
    请先打开大众点评页面: "Open a Dianping page first",
    "当前页面要求登录或验证，请人工完成后重试":
      "This page requires login or verification. Complete it manually, then try again.",
    截至页码不能小于开始页码: "The last page must be at least the first page",
    "没有待采集详情的店铺，请先采集搜索页":
      "No saved stores are pending. Collect a search page first.",
    已暂停: "Paused",
    未知操作: "Unknown action",
    请求正文超过本地服务允许的大小: "The request exceeds the local size limit",
    "无效的 Content-Length": "Invalid Content-Length",
    "页面检测到团购套餐或代金券栏目，但没有解析出有效优惠":
      "An offers section was detected, but no valid offers could be read",
    "网络证据正文过大，已拒绝保存":
      "The response evidence is too large to save",
    导出凭证无效或已过期: "The export ticket is invalid or expired",
    "详情页未识别到店铺 ID": "No store ID found on the detail page",
  };
  let locale = "zh-CN";
  const patterns = [
    [/^已配对\s*(.*)$/, (_, hint) => `Connected ${hint}`],
    [/^(\d+) 项优惠$/, (_, n) => `${n} offers`],
    [/^(\d+) 项$/, (_, n) => `${n} items`],
    [
      /^间隔 (.*?) 秒 · 每批 (.*?) 次 · 休息 (.*?) 秒（全部随机）$/,
      (_, d, b, r) =>
        `${d}s between visits · ${b} visits per batch · ${r}s break (randomized)`,
    ],
    [
      /^间隔 (.*?) 秒 · 每批 (.*?) 次 · 休息 (.*?) 秒$/,
      (_, d, b, r) =>
        `${d}s between visits · ${b} visits per batch · ${r}s break`,
    ],
    [
      /^新采集 (\d+) · 跳过 (\d+) · 共 (\d+)$/,
      (_, a, b, n) => `Saved ${a} · Skipped ${b} · Total ${n}`,
    ],
    [/^响应 (\d+) · 优惠 (\d+)$/, (_, a, b) => `Responses ${a} · Offers ${b}`],
    [/^队列已开始 · (\d+) 家$/, (_, n) => `Queue started · ${n} stores`],
    [/^团购价 ¥(.*)$/, (_, n) => `Offer ¥${n}`],
    [/^原价 ¥(.*)$/, (_, n) => `Original ¥${n}`],
    [/^已完整写入 (.*)$/, (_, name) => `Saved ${name}`],
    [
      /^已写入 (.*?)；页面未展示：(.*)$/,
      (_, name, fields) =>
        `Saved ${name}; not shown on page: ${translateFields(fields)}`,
    ],
    [
      /^当前店铺缺少完整字段：(.*?)；未写入且未进入下一家$/,
      (_, fields) =>
        `Missing required fields: ${translateFields(fields)}. Store not committed; queue paused.`,
    ],
    [
      /^店铺身份字段缺失：(.*)$/,
      (_, fields) =>
        `Missing store identity fields: ${translateFields(fields)}`,
    ],
    [/^本地服务返回 (\d+)$/, (_, n) => `Local service returned HTTP ${n}`],
    [
      /^扩展 v(.*?) 与本地服务 v(.*?) 不兼容，请同步升级$/,
      (_, a, b) =>
        `Extension v${a} and service v${b} are incompatible. Update both.`,
    ],
    [
      /^任务完成：新采集 (\d+) 家，跳过 (\d+) 家$/,
      (_, a, b) => `Finished: ${a} stores saved, ${b} skipped`,
    ],
    [
      /^正在采集搜索序号 (\d+)：(.*)$/,
      (_, n, name) => `Collecting item ${n}: ${name}`,
    ],
    [
      /^正在同步第 (\d+) 页：(\d+)\/(\d+)$/,
      (_, p, n, total) => `Saving page ${p}: ${n}/${total}`,
    ],
    [
      /^已保存第 (\d+) 页，正在打开下一页$/,
      (_, p) => `Page ${p} saved. Opening next page.`,
    ],
    [
      /^已建立第 (.*?) 家队列；跳过 (\d+) 家$/,
      (_, r, n) => `Queue ready: items ${r}; ${n} skipped`,
    ],
    [
      /^搜索采集完成，第 (.*?) 页；没有待采集详情$/,
      (_, r) => `Search finished: page(s) ${r}. No store details pending.`,
    ],
    [/^搜索采集完成，第 (.*?) 页$/, (_, r) => `Search finished: page(s) ${r}`],
    [
      /^正在直接打开第 (\d+) 页，采集至第 (\d+) 页$/,
      (_, a, b) => `Opening page ${a}, collecting through page ${b}`,
    ],
    [/^正在直接打开第 (\d+) 页$/, (_, n) => `Opening page ${n}`],
    [/^采集搜索第 (\d+) 页$/, (_, n) => `collect search page ${n}`],
    [/^采集第 (\d+) 家店铺$/, (_, n) => `collect store ${n}`],
    [
      /^(批次随机休息|随机间隔) ([\d.]+) 秒，之后(.*)$/,
      (_, reason, n, next) =>
        `${reason === "批次随机休息" ? "Batch break" : "Waiting"} ${n}s, then ${t(next)}`,
    ],
    [
      /^当前页面范围最多可采集 (\d+) 家，请减少本次采集数量或增大截至页码$/,
      (_, n) =>
        `This range holds at most ${n} stores. Lower the limit or extend the page range.`,
    ],
    [
      /^(.*?)；已连续 (\d+) 次异常，任务已暂停$/,
      (_, message, n) =>
        `${t(message)}. Paused after ${n} consecutive failures.`,
    ],
    [
      /^(.*?)；异常 (\d+)\/(\d+)，下次仍异常会暂停$/,
      (_, message, n, max) =>
        `${t(message)}. Failure ${n}/${max}; another failure will pause the collection.`,
    ],
  ];
  function translateFields(value) {
    return value
      .split(/、|,\s*/)
      .map((v) => english[v] || v)
      .join(", ");
  }
  function t(value) {
    if (value == null) return "";
    const text = String(value);
    if (locale !== "en") return text;
    if (Object.hasOwn(english, text)) return english[text];
    for (const [pattern, render] of patterns) {
      const match = text.match(pattern);
      if (match) return render(...match);
    }
    // Unrecognized site text and store names remain verbatim.
    return text;
  }
  function setLocale(value) {
    locale = value === "en" ? "en" : "zh-CN";
  }
  const api = {
    t,
    setLocale,
    get locale() {
      return locale;
    },
  };
  if (typeof module !== "undefined") module.exports = api;
  globalThis.I18n = api;
  if (typeof document === "undefined") return;

  const sourceNodes = [];
  const attributes = [];
  const walker = document.createTreeWalker(
    document.documentElement,
    NodeFilter.SHOW_TEXT,
  );
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      !node.parentElement?.closest("script,style,select[data-language]") &&
      node.textContent.trim()
    ) {
      sourceNodes.push([node, node.textContent]);
    }
  }
  for (const element of document.querySelectorAll(
    "[title],[aria-label],[placeholder],[alt]",
  )) {
    for (const attr of ["title", "aria-label", "placeholder", "alt"]) {
      if (element.hasAttribute(attr))
        attributes.push([element, attr, element.getAttribute(attr)]);
    }
  }
  function apply(value) {
    setLocale(value);
    document.documentElement.lang = locale;
    for (const [node, original] of sourceNodes) {
      const trimmed = original.trim();
      node.textContent = original.replace(trimmed, t(trimmed));
    }
    for (const [element, attr, original] of attributes)
      element.setAttribute(attr, t(original));
    for (const select of document.querySelectorAll("[data-language]"))
      select.value = locale;
    document.dispatchEvent(new CustomEvent("collector:language"));
  }
  for (const select of document.querySelectorAll("[data-language]")) {
    select.addEventListener("change", () => {
      apply(select.value);
      if (globalThis.chrome?.storage?.local) {
        void chrome.storage.local
          .set({ collectorLanguage: locale })
          .catch(() => {});
      } else {
        try {
          localStorage.setItem("collectorLanguage", locale);
        } catch {}
      }
    });
  }
  if (globalThis.chrome?.storage?.local) {
    void chrome.storage.local
      .get("collectorLanguage")
      .then((data) => apply(data.collectorLanguage))
      .catch(() => apply("zh-CN"));
    chrome.storage.onChanged?.addListener((changes, area) => {
      if (area === "local" && changes.collectorLanguage)
        apply(changes.collectorLanguage.newValue);
    });
  } else {
    let saved = "zh-CN";
    try {
      saved = localStorage.getItem("collectorLanguage");
    } catch {}
    // Defer until the page-specific rendering functions have been initialized.
    queueMicrotask(() => apply(saved));
  }
})();
