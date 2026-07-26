const assert = require("node:assert/strict");
const parser = require("../extension/offer_parser.js");

const meal = parser.normalizeOffer({
  type: "团购套餐",
  title: "【打卡必点】本地人推荐粤菜2人餐",
  supportText: "今日可用 · 随时退 · 过期自动退",
  currentPriceText: "¥198",
  originalPriceText: "¥247",
  discountText: "8.1折",
  detailUrl: "https://www.dianping.com/deal/meal-1",
  image: "https://example.com/meal.jpg",
  shopId: "shop-1",
  pageUrl: "https://www.dianping.com/shop/shop-1"
});

assert.equal(meal["优惠类型"], "团购套餐");
assert.equal(meal["团购价格"], 198);
assert.equal(meal["原价"], 247);
assert.equal(meal["团购折扣"], "8.1折");
assert.equal(meal["团购id"], "meal-1");
assert.equal(meal["可用退款说明"], "今日可用 · 随时退 · 过期自动退");
assert.equal(parser.isOfferActionText("团购套餐", "详情"), true);
assert.equal(parser.isOfferActionText("团购套餐", "查看详情"), true);
assert.equal(parser.isOfferActionText("代金券", "详情"), true);
assert.equal(parser.isOfferActionText("团购套餐", "评价"), false);

const voucher = parser.normalizeOffer({
  type: "代金券",
  title: "100元代金券",
  currentPriceText: "¥98",
  originalPriceText: "",
  discountText: "9.8折",
  shopId: "shop-1"
});

assert.equal(voucher["优惠类型"], "代金券");
assert.equal(voucher["团购价格"], 98);
assert.equal(voucher["原价"], "");
assert.equal(voucher["团购折扣"], "9.8折");
assert.equal(
  parser.normalizeOffer({ type: "其他", title: "未知优惠" }),
  null
);
assert.equal(
  voucher["团购id"],
  parser.normalizeOffer({
    type: "代金券",
    title: "100元代金券",
    currentPriceText: "¥98",
    shopId: "shop-1"
  })["团购id"]
);

console.log("offer parser test passed");
