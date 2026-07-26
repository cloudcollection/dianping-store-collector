from backend.parsers import (
    extract_shop_id,
    find_product_items,
    parse_deals,
    parse_json_body,
    response_requires_login,
)


def sample_payload():
    item = {
        "productId": 123,
        "title": "双人咖啡套餐",
        "salePrice": 59.9,
        "marketPrice": 88,
        "discountText": "6.8折",
        "subtitle": "双人下午茶套餐详情",
        "saleDesc": "已售136",
        "schema": "https://m.dianping.com/deal/123",
        "pic": "https://example.com/deal.jpg",
        "packageContents": [
            {"name": "大杯拿铁", "count": 2},
            {"name": "蛋糕", "count": 1},
        ],
        "validityPeriod": "2026-07-01 至 2026-12-31",
        "unavailableDate": "法定节假日不可用",
        "useTime": "周一至周五 14:00-17:00",
        "remark": "堂食可用，不支持外带",
        "useRules": [{"title": "有效期", "content": "购买后30天内有效"}],
    }
    return {
        "data": {
            "msg": {
                "products": [
                    {
                        "productAreas": [
                            {"itemArea": {"productItems": [item]}},
                        ]
                    }
                ]
            }
        }
    }


def test_extracts_shop_id_from_common_urls():
    assert extract_shop_id("https://www.dianping.com/shop/k2I9G5Ct1MGirh2V") == "k2I9G5Ct1MGirh2V"
    assert extract_shop_id("https://example.test/?shopuuid=abcDEF123") == "abcDEF123"


def test_parses_json_and_jsonp():
    assert parse_json_body('{"code": 0}') == {"code": 0}
    assert parse_json_body('callback({"code": 0});') == {"code": 0}


def test_parses_shelf_deals_and_preserves_raw_item():
    payload = sample_payload()
    assert len(find_product_items(payload)) == 1

    deals = parse_deals(
        payload,
        shop_id="k2I9G5Ct1MGirh2V",
        source_url="https://m.dianping.com/meishi/poi/v1/shelf/0",
    )

    assert len(deals) == 1
    deal = deals[0]
    assert deal["店铺id"] == "k2I9G5Ct1MGirh2V"
    assert deal["团购id"] == "123"
    assert deal["套餐id"] == "123"
    assert deal["团购名称"] == "双人咖啡套餐"
    assert deal["套餐名称"] == "双人咖啡套餐"
    assert deal["优惠类型"] == "团购套餐"
    assert deal["可用退款说明"] == "双人下午茶套餐详情"
    assert deal["团购详情"] == "双人下午茶套餐详情"
    assert deal["团购价格"] == 59.9
    assert deal["团购价"] == 59.9
    assert deal["原价"] == 88
    assert deal["团购折扣"] == "6.8折"
    assert deal["销量"] == "已售136"
    assert deal["套餐内容"] == []
    assert deal["备注"] == []
    assert not any(deal["购买须知"].values())
    assert deal["采集方式"] == "店铺页响应"
    assert deal["团购详情状态"] == "店铺页可见基础信息"
    assert deal["原始数据"] is find_product_items(payload)[0]


def test_calculates_discount_when_numeric_prices_are_present():
    payload = sample_payload()
    item = payload["data"]["msg"]["products"][0]["productAreas"][0]["itemArea"]["productItems"][0]
    item.pop("discountText")

    deal = parse_deals(payload)[0]

    assert deal["团购折扣"] == "6.81折"


def test_missing_shop_page_deal_fields_stay_empty():
    payload = {
        "productItems": [
            {
                "productId": "basic-1",
                "title": "店铺页基础套餐",
                "salePrice": 39.9,
            }
        ]
    }

    deal = parse_deals(payload, shop_id="basic-shop")[0]

    assert deal["团购详情"] == ""
    assert deal["套餐内容"] == []
    assert deal["备注"] == []
    assert deal["购买须知"] == {
        "有效日期": [],
        "不可用日期": [],
        "使用时间": [],
        "使用规则": [],
    }
    assert deal["原价"] == ""
    assert deal["团购折扣"] == ""
    assert deal["详情链接"] == ""
    assert deal["团购详情状态"] == "店铺页可见基础信息"


def test_classifies_explicit_coupon_items_without_inferring_face_value():
    payload = {
        "productItems": [
            {"productId": "meal-1", "title": "双人套餐", "salePrice": 188}
        ],
        "couponItems": [
            {
                "couponId": "voucher-1",
                "title": "100元代金券",
                "salePrice": 98,
                "discountText": "9.8折",
                "buttonText": "买券",
            }
        ],
    }

    assert len(find_product_items(payload)) == 2
    deals = parse_deals(payload, shop_id="coupon-shop")
    voucher = next(item for item in deals if item["团购名称"] == "100元代金券")

    assert voucher["优惠类型"] == "代金券"
    assert voucher["团购价格"] == 98
    assert voucher["团购折扣"] == "9.8折"
    assert voucher["原价"] == ""


def test_detects_login_requirement():
    assert response_requires_login(403, {})
    assert response_requires_login(429, {})
    assert response_requires_login(200, {"code": 401, "msg": "unauthorized"})
    assert response_requires_login(200, {"code": 0, "msg": "请求过于频繁，请稍后再试"})
    assert response_requires_login(200, {"code": 0, "needLogin": True})
    assert response_requires_login(200, {"code": 0, "isLogin": False})
    assert not response_requires_login(200, {"code": 0})
    assert not response_requires_login(200, {"code": 0, "needLogin": False})
    assert not response_requires_login(200, {"code": 0, "loginCode": 200})
