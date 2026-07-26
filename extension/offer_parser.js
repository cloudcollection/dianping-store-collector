(function initOfferParser(root, factory) {
  const parser = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = parser;
  }
  root.DianpingOfferParser = parser;
})(typeof globalThis === "object" ? globalThis : this, () => {
  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function firstMoney(value) {
    const text = cleanText(value).replace(/,/g, "");
    const marked = text.match(/[\u00a5\uffe5]\s*(\d+(?:\.\d+)?)/);
    const plain = text.match(/^(\d+(?:\.\d+)?)$/);
    const match = marked || plain;
    return match ? Number(match[1]) : "";
  }

  function firstDiscount(value) {
    const match = cleanText(value).match(/(\d+(?:\.\d+)?)\s*折/);
    return match ? `${match[1]}折` : "";
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function explicitOfferType(value) {
    const text = cleanText(value);
    if (/代金券|抵用券|现金券|优惠券/.test(text)) {
      return "代金券";
    }
    if (/团购套餐|团购|套餐/.test(text)) {
      return "团购套餐";
    }
    return "";
  }

  function isOfferActionText(offerType, value) {
    const text = cleanText(value);
    if (explicitOfferType(offerType) === "代金券") {
      return /^(买券|购买|详情|查看详情)$/.test(text);
    }
    return /^(抢购|购买|详情|查看详情)$/.test(text);
  }

  function offerIdFromUrl(value) {
    const text = cleanText(value);
    const pathMatch = text.match(/\/(?:deal|product|coupon|voucher)\/(?:detail\/)?([A-Za-z0-9_-]{3,})/i);
    if (pathMatch) {
      return pathMatch[1];
    }
    try {
      const parsed = new URL(text);
      for (const key of ["productId", "dealId", "couponId", "voucherId", "id"]) {
        if (parsed.searchParams.get(key)) {
          return parsed.searchParams.get(key);
        }
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function normalizeOffer(snapshot) {
    const type = explicitOfferType(snapshot.type);
    const title = cleanText(snapshot.title);
    if (!type || !title) {
      return null;
    }

    const detailUrl = cleanText(snapshot.detailUrl);
    const currentPrice = firstMoney(snapshot.currentPriceText);
    const originalPrice = firstMoney(snapshot.originalPriceText);
    const discount = firstDiscount(snapshot.discountText);
    const fallbackId = `visible_${stableHash([
      snapshot.shopId,
      type,
      title,
      currentPrice,
      originalPrice,
      detailUrl
    ].join("|"))}`;
    const offerId = cleanText(snapshot.offerId) || offerIdFromUrl(detailUrl) || fallbackId;
    const supportText = cleanText(snapshot.supportText);

    return {
      "店铺id": cleanText(snapshot.shopId),
      "团购id": offerId,
      "套餐id": offerId,
      "优惠类型": type,
      "团购名称": title,
      "套餐名称": title,
      "可用退款说明": supportText,
      "团购详情": supportText,
      "原价": originalPrice,
      "团购折扣": discount,
      "团购价格": currentPrice,
      "团购价": currentPrice,
      "详情链接": detailUrl,
      "图片": cleanText(snapshot.image),
      "来源页面": cleanText(snapshot.pageUrl),
      "采集方式": "店铺页可见内容",
      "套餐内容": [],
      "备注": [],
      "购买须知": {
        "有效日期": [],
        "不可用日期": [],
        "使用时间": [],
        "使用规则": []
      },
      "使用规则": [],
      "团购详情状态": "店铺页可见基础信息"
    };
  }

  return {
    cleanText,
    explicitOfferType,
    firstDiscount,
    firstMoney,
    isOfferActionText,
    normalizeOffer,
    offerIdFromUrl,
    stableHash
  };
});
