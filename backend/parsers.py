import json
import re
from hashlib import sha256
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse


SHOP_PATH_RE = re.compile(r"/shop/(?:old/)?([A-Za-z0-9_-]+)", re.IGNORECASE)


def extract_shop_id(*values: Any) -> str:
    """Extract a Dianping shop id from an id, URL, or nested URL parameter."""
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if not text:
            continue
        if re.fullmatch(r"[A-Za-z0-9_-]{6,}", text):
            return text

        decoded = unquote(text)
        match = SHOP_PATH_RE.search(decoded)
        if match:
            return match.group(1)

        query = parse_qs(urlparse(decoded).query)
        for key in ("shopuuid", "shopUuid", "shopid", "shopId"):
            if query.get(key):
                return str(query[key][0])
    return ""


def parse_json_body(body: Any) -> Any:
    if isinstance(body, (dict, list)):
        return body
    if not isinstance(body, str):
        return None
    text = body.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Some endpoints wrap JSON in a callback.
        match = re.search(r"^[^(]+\((.*)\)\s*;?$", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            return None


def _first(mapping: Any, keys: tuple[str, ...], default: Any = "-") -> Any:
    if not isinstance(mapping, dict):
        return default
    lowered = {str(key).lower(): value for key, value in mapping.items()}
    for key in keys:
        value = mapping.get(key, lowered.get(key.lower()))
        if value not in (None, "", [], {}):
            return value
    return default


def _scalar(value: Any, default: Any = "-") -> Any:
    if value in (None, "", [], {}):
        return default
    if isinstance(value, dict):
        nested = _first(
            value,
            ("value", "text", "amount", "price", "desc", "title", "content"),
            default=None,
        )
        return _scalar(nested, default) if nested is not None else default
    if isinstance(value, list):
        return _scalar(value[0], default) if value else default
    return value


def _source(item: dict[str, Any]) -> dict[str, Any]:
    source: dict[str, Any] = {}
    for key in ("productItem", "product", "deal", "productInfo", "dealInfo"):
        nested = item.get(key)
        if isinstance(nested, dict):
            source.update(nested)
    source.update(item)
    return source


def _nested_first(source: dict[str, Any], keys: tuple[str, ...], default: Any = "-") -> Any:
    value = _first(source, keys, default=None)
    if value not in (None, "", [], {}):
        return _scalar(value, default)
    for container_key in (
        "productInfo",
        "dealInfo",
        "priceInfo",
        "action",
        "button",
        "btn",
        "jumpInfo",
        "imageInfo",
    ):
        value = _first(source.get(container_key), keys, default=None)
        if value not in (None, "", [], {}):
            return _scalar(value, default)
    return default


def find_product_items(payload: Any) -> list[dict[str, Any]]:
    """Find explicit product/deal/coupon item lists in shop-page responses."""
    found: list[dict[str, Any]] = []
    seen: set[int] = set()

    def add(values: Any) -> None:
        if not isinstance(values, list):
            return
        for item in values:
            if isinstance(item, dict) and id(item) not in seen:
                seen.add(id(item))
                found.append(item)

    try:
        products = payload["data"]["msg"]["products"]
    except (KeyError, TypeError):
        products = []
    if isinstance(products, list):
        for product in products:
            for area in product.get("productAreas", []) if isinstance(product, dict) else []:
                item_area = area.get("itemArea", {}) if isinstance(area, dict) else {}
                add(item_area.get("productItems"))

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if str(key).lower() in {
                    "productitems",
                    "dealitems",
                    "couponitems",
                    "voucheritems",
                }:
                    add(child)
                else:
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(payload)
    return found


CONTENT_KEYWORDS = ("content", "dish", "menu", "package", "combo", "套餐", "菜品", "菜单")
RULE_KEYWORDS = ("rule", "notice", "instruction", "tips", "须知", "规则", "说明")
NAME_KEYS = ("name", "title", "dishName", "itemName", "skuName", "productName", "名称")
QUANTITY_KEYS = ("quantity", "count", "num", "amount", "份数", "数量")


def _unique_dicts(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in values:
        marker = json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)
        if marker not in seen:
            seen.add(marker)
            result.append(value)
    return result


def extract_package_contents(payload: Any) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []

    def parse_item(item: dict[str, Any]) -> dict[str, Any] | None:
        source = _source(item)
        name = _first(source, NAME_KEYS, default=None)
        if name in (None, ""):
            return None
        return {
            "名称": str(_scalar(name)).strip(),
            "数量": _scalar(_first(source, QUANTITY_KEYS, default=""), default=""),
        }

    def walk(value: Any, parent_key: str = "") -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                walk(child, str(key))
            return
        if not isinstance(value, list):
            return
        lowered = parent_key.lower()
        if any(keyword in lowered for keyword in CONTENT_KEYWORDS):
            for item in value:
                if isinstance(item, dict):
                    parsed = parse_item(item)
                    if parsed:
                        contents.append(parsed)
        for item in value:
            walk(item, parent_key)

    walk(payload)
    return _unique_dicts(contents)


def extract_rules(payload: Any) -> list[str]:
    rules: list[str] = []

    def append_text(value: Any) -> None:
        if isinstance(value, str):
            text = re.sub(r"\s+", " ", value).strip()
            if text:
                rules.append(text)
        elif isinstance(value, list):
            for item in value:
                append_text(item)
        elif isinstance(value, dict):
            for key in ("title", "name", "content", "text", "desc", "value"):
                append_text(value.get(key))

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                lowered = str(key).lower()
                if any(keyword in lowered for keyword in RULE_KEYWORDS):
                    append_text(child)
                walk(child)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(payload)
    return list(dict.fromkeys(rules))


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _offer_type(*values: Any) -> str:
    text = " ".join(_clean_text(value) for value in values if value not in (None, ""))
    if re.search(r"代金券|抵用券|现金券|优惠券", text):
        return "代金券"
    if re.search(r"团购套餐|团购|套餐", text):
        return "团购套餐"
    return ""


def _texts_by_key(payload: Any, keywords: tuple[str, ...]) -> list[str]:
    values: list[str] = []

    def append(value: Any) -> None:
        if isinstance(value, str):
            text = _clean_text(value)
            if text:
                values.append(text)
        elif isinstance(value, (int, float)):
            values.append(str(value))
        elif isinstance(value, list):
            for item in value:
                append(item)
        elif isinstance(value, dict):
            for child_key in (
                "title",
                "name",
                "content",
                "text",
                "desc",
                "description",
                "value",
                "startTime",
                "endTime",
            ):
                if child_key in value:
                    append(value.get(child_key))

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                key_text = str(key).lower()
                if any(keyword.lower() in key_text for keyword in keywords):
                    append(child)
                walk(child)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    walk(payload)
    return list(dict.fromkeys(values))


def extract_purchase_notice(payload: Any) -> dict[str, list[str]]:
    """Extract common deal-detail notice fields without depending on one API shape."""
    return {
        "有效日期": _texts_by_key(
            payload,
            (
                "valid",
                "validity",
                "effective",
                "dateRange",
                "beginTime",
                "endTime",
                "有效期",
                "有效日期",
                "使用日期",
            ),
        ),
        "不可用日期": _texts_by_key(
            payload,
            (
                "unavailable",
                "exclude",
                "holiday",
                "blackout",
                "不可用",
                "除外",
                "节假日",
            ),
        ),
        "使用时间": _texts_by_key(
            payload,
            (
                "useTime",
                "availableTime",
                "businessHour",
                "timeLimit",
                "使用时间",
                "营业时间",
            ),
        ),
        "使用规则": extract_rules(payload),
    }


def extract_remarks(payload: Any) -> list[str]:
    return _texts_by_key(
        payload,
        (
            "remark",
            "memo",
            "notice",
            "tips",
            "description",
            "subtitle",
            "备注",
            "说明",
            "须知",
            "温馨提示",
        ),
    )


def response_requires_login(status: int, payload: Any) -> bool:
    if status in (401, 403, 406, 407, 408, 409, 418, 429, 451, 503):
        return True
    if isinstance(payload, dict):
        code = payload.get("code", payload.get("status"))
        if str(code) in {"401", "403", "406", "429", "503"}:
            return True
    if isinstance(payload, (dict, list)):
        message = json.dumps(payload, ensure_ascii=False, default=str)[:4000]
    elif isinstance(payload, str):
        message = payload[:4000]
    else:
        return False
    return bool(
        re.search(
            r'"(?:need|require|requires)Login"\s*:\s*true'
            r'|"(?:isLogin|loggedIn)"\s*:\s*false'
            r'|unauthorized|forbidden|login required|please (?:log|sign) in'
            r'|not logged in|verify required|captcha required|too many requests'
            r'|rate limit|滑动验证|安全验证|请先登录|登录后继续|未登录'
            r'|访问异常|请求过于频繁|操作过于频繁|风控|封禁|禁止访问',
            message,
            re.IGNORECASE,
        )
    )


def parse_deals(payload: Any, shop_id: str = "", source_url: str = "") -> list[dict[str, Any]]:
    """Parse deal cards/details into both legacy and readable Chinese fields."""
    deals: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in find_product_items(payload):
        source = _source(item)
        deal_id = _nested_first(
            source,
            ("productId", "dealId", "dealGroupId", "couponId", "voucherId", "id"),
            default="",
        )
        title = _nested_first(
            source,
            ("title", "productName", "name", "shortTitle"),
            default="",
        )
        detail_url = _nested_first(
            source,
            ("detailJumpUrl", "jumpUrl", "schema", "url"),
            default="",
        )
        marker = str(deal_id) if deal_id else f"{title}|{detail_url}"
        if marker in seen:
            continue
        seen.add(marker)
        if not deal_id:
            deal_id = sha256(marker.encode("utf-8")).hexdigest()[:20]

        final_price = _nested_first(
            source,
            ("salePrice", "currentPrice", "discountPrice", "groupPrice", "price"),
            default="",
        )
        original_price = _nested_first(
            source,
            ("marketPrice", "originalPrice", "originPrice", "listPrice"),
            default="",
        )
        discount = _nested_first(
            source,
            ("discount", "discountRate", "discountText", "discountDesc"),
            default="",
        )
        if (
            discount in (None, "", "-")
            and isinstance(final_price, (int, float))
            and not isinstance(final_price, bool)
            and isinstance(original_price, (int, float))
            and not isinstance(original_price, bool)
            and 0 < final_price <= original_price
        ):
            discount_value = final_price / original_price * 10
            discount = f"{discount_value:.2f}".rstrip("0").rstrip(".") + "折"
        sales = _nested_first(
            source,
            ("sale", "saleDesc", "soldText", "sales", "soldCountDesc"),
            default="",
        )
        image = _nested_first(
            source,
            ("pic", "imageUrl", "image", "coverUrl"),
            default="",
        )
        detail = _nested_first(
            source,
            ("subTitle", "subtitle", "description", "desc", "detail", "summary"),
            default="",
        )
        type_text = _nested_first(
            source,
            (
                "productTypeName",
                "dealTypeName",
                "couponTypeName",
                "typeName",
                "categoryName",
                "buttonText",
            ),
            default="",
        )
        offer_type = _offer_type(type_text, title, detail)
        empty_notice = {
            "有效日期": [],
            "不可用日期": [],
            "使用时间": [],
            "使用规则": [],
        }

        deals.append(
            {
                "店铺id": shop_id,
                "团购id": str(deal_id),
                "套餐id": str(deal_id),
                "团购名称": title,
                "套餐名称": title,
                "优惠类型": offer_type,
                "可用退款说明": detail,
                "团购详情": detail,
                "套餐内容": [],
                "备注": [],
                "购买须知": empty_notice,
                "使用规则": [],
                "原价": original_price,
                "团购折扣": discount,
                "团购价格": final_price,
                "团购价": final_price,
                "销量": sales,
                "详情链接": detail_url,
                "图片": image,
                "来源接口": source_url,
                "采集方式": "店铺页响应",
                "团购详情状态": "店铺页可见基础信息",
                "原始数据": item,
            }
        )
    return deals
