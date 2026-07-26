(() => {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function nodeText(node) {
    return node ? cleanText(node.innerText || node.textContent) : "";
  }

  function firstNode(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node) {
        return node;
      }
    }
    return null;
  }

  function firstText(root, selectors) {
    return nodeText(firstNode(root, selectors));
  }

  function unique(values) {
    return Array.from(new Set(values.map(cleanText).filter(Boolean)));
  }

  function absoluteUrl(value) {
    if (!value || /^(data:|javascript:)/i.test(value)) {
      return "";
    }
    try {
      return new URL(value, location.href).href;
    } catch (error) {
      return "";
    }
  }

  function shopIdFrom(value) {
    if (!value) {
      return "";
    }
    const text = decodeURIComponent(String(value));
    const pathMatch = text.match(/\/shop\/(?:old\/)?([A-Za-z0-9_-]+)/i);
    if (pathMatch) {
      return pathMatch[1];
    }
    try {
      const url = new URL(text, location.href);
      return url.searchParams.get("shopuuid") || url.searchParams.get("shopId") || "";
    } catch (error) {
      return "";
    }
  }

  function imageUrl(image) {
    if (!image) {
      return "";
    }
    for (const attribute of ["src", "data-src", "data-original", "data-lazyload", "data-url"]) {
      let value = image.getAttribute(attribute);
      if (!value) {
        continue;
      }
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === "string") {
          value = parsed;
        }
      } catch (error) {
        // Attribute is a normal URL.
      }
      const result = absoluteUrl(value);
      if (result) {
        return result;
      }
    }
    const style = image.getAttribute("style") || getComputedStyle(image).backgroundImage || "";
    const match = style.match(/url\(["']?(.*?)["']?\)/i);
    return match ? absoluteUrl(match[1]) : "";
  }

  function hasPrivateUseCharacters(value) {
    return Array.from(String(value || "")).some((character) => {
      const code = character.codePointAt(0);
      return code >= 0xe000 && code <= 0xf8ff;
    });
  }

  function collectTexts(root, selectors, maxLength = 160) {
    const values = [];
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) {
        const value = nodeText(node);
        if (value && value.length <= maxLength) {
          values.push(value);
        }
      }
    }
    return unique(values);
  }

  function findByLabel(root, labels) {
    const text = nodeText(root);
    for (const label of labels) {
      const expression = new RegExp(`${label}[：:]?\\s*([^|·\\n]{2,80})`);
      const match = text.match(expression);
      if (match) {
        return cleanText(match[1]);
      }
    }
    return "";
  }

  function parseJsonLd() {
    const results = [];
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const parsed = JSON.parse(node.textContent);
        if (Array.isArray(parsed)) {
          results.push(...parsed);
        } else if (parsed?.["@graph"]) {
          results.push(...parsed["@graph"]);
        } else {
          results.push(parsed);
        }
      } catch (error) {
        // Ignore invalid structured data blocks.
      }
    }
    return results.find((item) => {
      const type = Array.isArray(item?.["@type"]) ? item["@type"].join(" ") : item?.["@type"];
      return /Restaurant|LocalBusiness|FoodEstablishment|Store/i.test(type || "");
    }) || {};
  }

  function scoreFrom(container) {
    const direct = firstText(container, [
      ".star_score",
      ".score",
      ".rating-score",
      '[itemprop="ratingValue"]',
      '[class*="score"]'
    ]);
    const numeric = direct.match(/\b([0-5](?:\.\d)?)\b/);
    if (numeric) {
      return numeric[1];
    }
    const starNode = firstNode(container, ['[class*="star_"]', '[class*="star-"]']);
    const classes = starNode?.className ? String(starNode.className) : "";
    const classScore = classes.match(/star[_-](\d{2})/i);
    return classScore ? String(Number(classScore[1]) / 10) : direct;
  }

  function couponsFrom(root) {
    return collectTexts(root, [
      '[class*="coupon"]',
      '[class*="voucher"]',
      '[class*="promo"]',
      '[class*="deal"] [class*="title"]',
      '[data-click-name*="coupon"]'
    ], 220).filter((value) => /优惠|券|团购|套餐|代金|折/.test(value)).slice(0, 50);
  }

  function textLines(node) {
    return unique(String(node?.innerText || node?.textContent || "")
      .split(/[\r\n]+/)
      .map(cleanText));
  }

  function offerActionNodes(root, offerType) {
    const parser = globalThis.DianpingOfferParser;
    const isAction = (node) => parser?.isOfferActionText
        ? parser.isOfferActionText(offerType, nodeText(node))
        : /^(买券|抢购|购买|详情|查看详情)$/.test(nodeText(node));
    return Array.from(root.querySelectorAll("button, a, [role=button], div, span"))
      .filter(isAction)
      .filter((node) => !Array.from(node.children || []).some(isAction));
  }

  function offerSectionRoot(heading, offerType) {
    let current = heading;
    for (let depth = 0; current && current !== document.body && depth < 8; depth += 1) {
      if (offerActionNodes(current, offerType).length) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function offerCardFromAction(action, section, offerType) {
    let current = action;
    while (current.parentElement && current.parentElement !== section) {
      const parent = current.parentElement;
      if (offerActionNodes(parent, offerType).length > 1) {
        break;
      }
      current = parent;
    }
    return current;
  }

  function offerIdFrom(card, link) {
    const attributes = [
      "data-product-id",
      "data-productid",
      "data-deal-id",
      "data-dealid",
      "data-coupon-id",
      "data-couponid",
      "data-id"
    ];
    for (const node of [card, link, ...Array.from(card.querySelectorAll("[data-product-id], [data-productid], [data-deal-id], [data-dealid], [data-coupon-id], [data-couponid]"))]) {
      if (!node) {
        continue;
      }
      for (const attribute of attributes) {
        const value = cleanText(node.getAttribute(attribute));
        if (value) {
          return value;
        }
      }
    }
    const href = link?.getAttribute("href") || "";
    const pathMatch = href.match(/\/(?:deal|product|coupon|voucher)\/(?:detail\/)?([A-Za-z0-9_-]{3,})/i);
    if (pathMatch) {
      return pathMatch[1];
    }
    try {
      const parsed = new URL(href, location.href);
      for (const key of ["productId", "dealId", "couponId", "id"]) {
        if (parsed.searchParams.get(key)) {
          return parsed.searchParams.get(key);
        }
      }
    } catch (error) {
      // A stable fallback id is generated by offer_parser.js.
    }
    return "";
  }

  function offerTitle(card, offerType) {
    const candidates = [];
    for (const selector of [
      "h3",
      "h4",
      "h5",
      '[class*="title"]',
      'a[href*="/deal/"]',
      'a[href*="product"]',
      'a[href*="coupon"]'
    ]) {
      for (const node of card.querySelectorAll(selector)) {
        candidates.push(nodeText(node));
      }
    }
    candidates.push(...textLines(card));
    return candidates.find((value) => {
      if (!value || value === offerType || /^(抢购|买券|购买|详情|查看详情)$/.test(value)) {
        return false;
      }
      if (/^[\u00a5\uffe5]?\s*\d+(?:\.\d+)?\s*(?:元|折)?$/.test(value)) {
        return false;
      }
      return value.length <= 120;
    }) || "";
  }

  function collectVisibleOffers(shopId) {
    const parser = globalThis.DianpingOfferParser;
    if (!parser) {
      return { offers: [], sectionDetected: false, actionCount: 0 };
    }
    const headings = Array.from(new Set(Array.from(document.querySelectorAll(
      'h1, h2, h3, h4, h5, [role="heading"], [class*="section-title"], [class*="module-title"], div, span'
    )).filter((node) => ["团购套餐", "代金券"].includes(nodeText(node)))));
    const offers = [];
    const seen = new Set();
    let actionCount = 0;

    for (const heading of headings) {
      const offerType = nodeText(heading);
      const section = offerSectionRoot(heading, offerType);
      if (!section) {
        continue;
      }
      const actions = offerActionNodes(section, offerType);
      actionCount += actions.length;
      for (const action of actions) {
        const card = offerCardFromAction(action, section, offerType);
        const title = offerTitle(card, offerType);
        if (!title) {
          continue;
        }
        const actionLink = action.matches?.("a[href]")
          ? action
          : action.closest?.("a[href]");
        const detailLink = actionLink || firstNode(card, [
          'a[href*="/deal/"]',
          'a[href*="product"]',
          'a[href*="coupon"]',
          'a[href*="voucher"]',
          'a[href]'
        ]);
        const originalPriceNode = firstNode(card, [
          "del",
          "s",
          '[class*="originalPrice"]',
          '[class*="origin-price"]',
          '[class*="marketPrice"]',
          '[class*="oldPrice"]'
        ]);
        const currentPriceNode = firstNode(card, [
          '[class*="salePrice"]',
          '[class*="currentPrice"]',
          '[class*="price"]'
        ]);
        const discountNode = firstNode(card, ['[class*="discount"]', '[class*="折"]']);
        const ignored = new Set([offerType, title, nodeText(action), nodeText(originalPriceNode)]);
        const supportText = textLines(card)
          .filter((line) => !ignored.has(line))
          .filter((line) => !/^[\u00a5\uffe5]\s*\d/.test(line))
          .filter((line) => !/^\d+(?:\.\d+)?\s*折$/.test(line))
          .filter((line) => line.length <= 180)
          .slice(0, 4)
          .join(" · ");
        const image = firstNode(card, ["img", '[style*="background-image"]']);
        const normalized = parser.normalizeOffer({
          type: offerType,
          title,
          supportText,
          currentPriceText: nodeText(currentPriceNode) || nodeText(card),
          originalPriceText: nodeText(originalPriceNode),
          discountText: nodeText(discountNode) || nodeText(card),
          detailUrl: detailLink ? absoluteUrl(detailLink.getAttribute("href")) : "",
          image: imageUrl(image),
          offerId: offerIdFrom(card, detailLink),
          shopId,
          pageUrl: location.href
        });
        if (!normalized) {
          continue;
        }
        const marker = `${normalized["优惠类型"]}|${normalized["团购id"]}`;
        if (!seen.has(marker)) {
          seen.add(marker);
          offers.push(normalized);
        }
      }
    }
    return {
      offers,
      sectionDetected: headings.length > 0,
      actionCount
    };
  }

  function collectSearchPage() {
    const selectorGroups = [
      ".shop-list > ul > li",
      ".shop-list li",
      '[class*="shop-list"] [class*="shop-item"]',
      '[class*="shopList"] [class*="shopItem"]',
      'li:has(a[href*="/shop/"])'
    ];
    let containers = [];
    for (const selector of selectorGroups) {
      try {
        containers = Array.from(document.querySelectorAll(selector));
      } catch (error) {
        continue;
      }
      if (containers.length) {
        break;
      }
    }

    const shops = [];
    const seen = new Set();
    for (const container of containers) {
      const link = firstNode(container, [
        'a[data-shopid]',
        'a[data-shop-id]',
        '.tit a[href*="/shop/"]',
        'a[href*="/shop/"]'
      ]);
      if (!link) {
        continue;
      }
      const detailUrl = absoluteUrl(link.getAttribute("href"));
      const shopId =
        link.dataset.shopid ||
        link.dataset.shopId ||
        container.dataset.shopid ||
        container.dataset.shopId ||
        shopIdFrom(detailUrl);
      const name = firstText(container, [
        ".tit h4",
        ".tit a",
        ".shop-name",
        '[class*="shopName"]',
        "h4",
        "h3"
      ]) || nodeText(link);
      const marker = shopId || `${name}|${detailUrl}`;
      if (!name || seen.has(marker)) {
        continue;
      }
      seen.add(marker);

      const tags = collectTexts(container, [".tag-addr .tag", ".tag", '[class*="tagName"]'], 50);
      const address = firstText(container, [
        ".tag-addr .addr",
        ".addr",
        ".address",
        '[class*="address"]'
      ]);
      const recommendation = firstText(container, [
        ".recommend",
        '[class*="recommend"]',
        '[class*="dish"]'
      ]);
      const scoreDetails = firstText(container, [".comment-list", ".scoreText", '[class*="scoreText"]']);
      const reviewCount = firstText(container, [
        ".review-num",
        '[class*="reviewNum"]',
        '[class*="commentCount"]'
      ]);
      const averagePrice = firstText(container, [
        ".mean-price",
        '[class*="avgPrice"]',
        '[class*="meanPrice"]'
      ]);
      shops.push({
        "店铺id": shopId,
        "店铺名": name,
        "评论总数": reviewCount,
        "人均价格": averagePrice,
        "标签": tags,
        "店铺地址": address,
        "详情链接": detailUrl,
        "店铺均分": scoreDetails,
        "推荐菜": recommendation ? unique(recommendation.split(/[，、|]/)) : [],
        "店铺总分": scoreFrom(container),
        "优惠券信息": couponsFrom(container)
      });
    }

    let nextLink = firstNode(document, [
      'a[rel="next"]',
      ".page a.next",
      ".Pages a.NextPage",
      "a.next"
    ]);
    if (!nextLink) {
      nextLink = Array.from(document.querySelectorAll("a")).find((node) =>
        /^(下一页|下页|>)$/.test(nodeText(node))
      );
    }
    const disabled = nextLink && (
      nextLink.hasAttribute("disabled") ||
      /disabled/.test(String(nextLink.className)) ||
      nextLink.getAttribute("aria-disabled") === "true"
    );
    const pageMatch = location.href.match(/(?:\/p|[?&]page=)(\d+)/i);
    return {
      ok: true,
      shops,
      pageNumber: pageMatch ? Number(pageMatch[1]) : 1,
      nextUrl: nextLink && !disabled ? absoluteUrl(nextLink.getAttribute("href")) : ""
    };
  }

  function collectDetailPage() {
    const structured = parseJsonLd();
    const addressObject = structured.address || {};
    const structuredAddress = typeof addressObject === "string"
      ? addressObject
      : [addressObject.streetAddress, addressObject.addressLocality, addressObject.addressRegion]
          .filter(Boolean)
          .join(" ");
    const shopId = shopIdFrom(location.href) || String(structured.identifier || "");

    const scoreText = firstText(document, [".scoreText", '[class*="scoreText"]', ".comment_score"]);
    const scoreParts = {};
    for (const match of scoreText.matchAll(/(口味|环境|服务|效果|设施)[：:]?\s*([0-5](?:\.\d)?)/g)) {
      scoreParts[match[1]] = match[2];
    }

    const recommendedDishes = collectTexts(document, [
      "#shop-dish .dishName",
      "#shop-dish .food",
      '[class*="recommend"] [class*="dish"]',
      '[class*="dishName"]'
    ], 80).slice(0, 100);

    const tags = collectTexts(document, [
      ".breadcrumb a",
      '[class*="category"] a',
      '[class*="shopType"]',
      ".other",
      '[class*="feature"]',
      '[class*="facility"]'
    ], 80).slice(0, 50);

    const offerScan = collectVisibleOffers(shopId);
    const detail = {
      "店铺名": firstText(document, ["h1.shop-name", ".shop-name", "h1", '[class*="shopName"]']) || structured.name || "",
      "店铺地址": firstText(document, [
        ".addressText",
        '[itemprop="street-address"]',
        '[itemprop="streetAddress"]',
        ".address",
        '[class*="addressText"]'
      ]) || structuredAddress || findByLabel(document.body, ["地址"]),
      "标签": tags,
      "店铺总分": scoreFrom(document) || structured.aggregateRating?.ratingValue || "",
      "店铺均分": Object.keys(scoreParts).length ? scoreParts : scoreText,
      "评论总数": firstText(document, [
        "#reviewCount",
        '[itemprop="reviewCount"]',
        '[class*="reviewCount"]'
      ]) || structured.aggregateRating?.reviewCount || "",
      "人均价格": firstText(document, ["#avgPriceTitle", '[class*="avgPrice"]', '[class*="meanPrice"]']),
      "推荐菜": recommendedDishes,
      "优惠券信息": []
    };
    return {
      ok: true,
      shopId,
      detail,
      offers: offerScan.offers,
      offerSectionDetected: offerScan.sectionDetected,
      offerActionCount: offerScan.actionCount
    };
  }

  function verificationDetected() {
    return /verify\.meituan\.com|account\.dianping\.com|captcha/i.test(location.href) ||
      /滑动验证|安全验证|请完成验证/.test(nodeText(document.body).slice(0, 1000));
  }

  function blockedDetected() {
    const text = nodeText(document.body).slice(0, 2500);
    return verificationDetected() ||
      /访问异常|请求过于频繁|操作过于频繁|账号安全|禁止访问|请稍后再试|风控|封禁|验证后继续|登录后继续/.test(text);
  }

  function pageHasUsefulDetail(detail) {
    return Boolean(
      detail["店铺名"] ||
      detail["店铺地址"] ||
      detail["店铺总分"] ||
      detail["评论总数"] ||
      (Array.isArray(detail["推荐菜"]) && detail["推荐菜"].length)
    );
  }

  async function activateDealArea() {
    if (blockedDetected()) {
      return { ok: false, requiresHuman: true, error: "页面要求人工验证或已触发访问限制" };
    }
    window.scrollTo({ top: Math.floor(document.body.scrollHeight * 0.55), behavior: "smooth" });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const patterns = /^(团购|优惠|套餐|优惠团购|查看全部团购|更多团购|全部套餐)$/;
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'))
      .filter((node) => patterns.test(nodeText(node)) && node.getClientRects().length > 0)
      .slice(0, 3);
    for (const node of candidates) {
      try {
        node.click();
        await new Promise((resolve) => setTimeout(resolve, 800));
      } catch (error) {
        // Continue trying other visible deal controls.
      }
    }
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    return { ok: true, clicked: candidates.length };
  }

  const messageListener = (message, sender, sendResponse) => {
    void (async () => {
      if (blockedDetected()) {
        return { ok: false, requiresHuman: true, error: "当前页面需要人工登录、验证或已触发访问限制" };
      }
      if (message.type === "collectSearchPage") {
        return collectSearchPage();
      }
      if (message.type === "collectDetailPage") {
        const result = collectDetailPage();
        if (!pageHasUsefulDetail(result.detail)) {
          return { ok: false, error: "详情页没有解析到可信字段，已停止保存" };
        }
        if (message.requireOffers && result.offerSectionDetected && !result.offers.length) {
          return {
            ok: false,
            offerParseFailed: true,
            error: "页面已检测到团购套餐或代金券栏目，但没有解析出有效优惠，任务已暂停"
          };
        }
        return result;
      }
      if (message.type === "collectCurrentPage") {
        const search = collectSearchPage();
        if (search.shops.length && !shopIdFrom(location.href)) {
          return { ...search, pageType: "search" };
        }
        const result = collectDetailPage();
        if (!pageHasUsefulDetail(result.detail)) {
          return { ok: false, error: "当前页没有解析到可信字段" };
        }
        if (message.requireOffers && result.offerSectionDetected && !result.offers.length) {
          return {
            ok: false,
            offerParseFailed: true,
            error: "页面已检测到团购套餐或代金券栏目，但没有解析出有效优惠"
          };
        }
        return { ...result, pageType: "detail" };
      }
      if (message.type === "activateDealArea") {
        return activateDealArea();
      }
      return { ok: false, error: "未知页面操作" };
    })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  };

  const previousListener = globalThis.__DIANPING_DEMO_MESSAGE_LISTENER__;
  if (previousListener) {
    try {
      chrome.runtime.onMessage.removeListener(previousListener);
    } catch (error) {
      // The previous extension context may already be invalid after a reload.
    }
  }
  globalThis.__DIANPING_DEMO_MESSAGE_LISTENER__ = messageListener;
  chrome.runtime.onMessage.addListener(messageListener);
})();
