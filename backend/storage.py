import csv
import io
import json
import re
import threading
import time
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from .config import (
    DATA_DIR,
    MONGO_DATABASE,
    MONGO_RETRY_SECONDS,
    MONGO_TIMEOUT_MS,
    MONGO_URI,
    RAW_MAX_TOTAL_BYTES,
    RAW_RETENTION_DAYS,
)
from .parsers import extract_shop_id


SHOP_FIELDS = (
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
)

REQUIRED_SHOP_FIELDS = (
    "店铺名",
    "店铺地址",
    "店铺总分",
)
OPTIONAL_SHOP_FIELDS = (
    "评论总数",
    "人均价格",
    "标签",
    "店铺均分",
    "推荐菜",
)

LIST_SHOP_FIELDS = {"标签", "推荐菜", "优惠券信息"}
PUBLIC_OFFER_FIELDS = (
    "优惠类型",
    "团购id",
    "团购名称",
    "使用说明",
    "原价",
    "折扣",
    "团购价格",
    "详情链接",
    "销量",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _meaningful(value: Any) -> bool:
    return value not in (None, "", "-", [], {})


def _merge(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(existing)
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _merge(merged[key], value)
        elif _meaningful(value) or key not in merged:
            merged[key] = value
    return merged


def _search_scope(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = urlsplit(value)
        path = re.sub(r"/p\d+/?$", "", parsed.path)
        return urlunsplit((parsed.scheme, parsed.netloc, path, parsed.query, ""))
    except ValueError:
        return re.sub(r"/p\d+/?$", "", value)


def _first_meaningful(record: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = record.get(key)
        if _meaningful(value):
            return value
    return ""


def _as_list(value: Any) -> list[Any]:
    if not _meaningful(value):
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, (tuple, set)):
        return list(value)
    return [value]


def _item_identity(value: Any) -> str:
    if isinstance(value, dict):
        offer_id = _first_meaningful(value, "团购id", "套餐id", "优惠id")
        if _meaningful(offer_id):
            return f"id:{offer_id}"
        value = {
            "优惠类型": value.get("优惠类型", ""),
            "名称": _first_meaningful(value, "团购名称", "套餐名称", "优惠名称"),
            "价格": _first_meaningful(value, "团购价格", "团购价", "优惠价格"),
            "详情链接": value.get("详情链接", ""),
        }
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def _merge_unique_items(*values: Any) -> list[Any]:
    merged: dict[str, Any] = {}
    for value in values:
        for item in _as_list(value):
            if not _meaningful(item):
                continue
            identity = _item_identity(item)
            existing = merged.get(identity)
            if isinstance(existing, dict) and isinstance(item, dict):
                merged[identity] = _merge(existing, item)
            elif identity not in merged:
                merged[identity] = item
    return list(merged.values())


def _public_offer(record: dict[str, Any]) -> dict[str, Any]:
    offer = {
        "优惠类型": _first_meaningful(record, "优惠类型"),
        "团购id": _first_meaningful(record, "团购id", "套餐id", "优惠id"),
        "团购名称": _first_meaningful(record, "团购名称", "套餐名称", "优惠名称"),
        "使用说明": _first_meaningful(
            record, "使用说明", "可用退款说明", "团购详情"
        ),
        "原价": _first_meaningful(record, "原价", "门市价"),
        "折扣": _first_meaningful(record, "折扣", "团购折扣"),
        "团购价格": _first_meaningful(record, "团购价格", "团购价", "优惠价格"),
        "详情链接": _first_meaningful(record, "详情链接"),
        "销量": _first_meaningful(record, "销量", "已售"),
    }
    return {key: value for key, value in offer.items() if _meaningful(value)}


def _canonical_shop_record(
    existing: dict[str, Any],
    incoming: dict[str, Any],
    shop_id: str,
    captured_at: str,
    offers: list[dict[str, Any]] | None = None,
    *,
    touch_time: bool = True,
) -> dict[str, Any]:
    combined = _merge(existing, incoming)
    tags = _merge_unique_items(
        existing.get("标签"),
        incoming.get("标签"),
        incoming.get("标签1"),
        incoming.get("标签2"),
    )
    recommendations = _merge_unique_items(
        existing.get("推荐菜"), incoming.get("推荐菜")
    )
    public_offers = [
        offer
        for offer in (_public_offer(item) for item in (offers or []))
        if offer
    ]
    coupon_info = _merge_unique_items(
        existing.get("优惠券信息"),
        incoming.get("优惠券信息"),
        public_offers,
    )

    first_captured = _first_meaningful(
        existing, "首次采集时间"
    ) or _first_meaningful(incoming, "首次采集时间") or captured_at
    last_captured = (
        captured_at
        if touch_time
        else _first_meaningful(incoming, "最后采集时间")
        or _first_meaningful(existing, "最后采集时间")
        or captured_at
    )

    record: dict[str, Any] = {}
    for field in SHOP_FIELDS:
        if field == "店铺id":
            value = shop_id
        elif field == "标签":
            value = tags
        elif field == "推荐菜":
            value = recommendations
        elif field == "优惠券信息":
            value = coupon_info
        elif field == "首次采集时间":
            value = first_captured
        elif field == "最后采集时间":
            value = last_captured
        else:
            value = combined.get(field, "")
        if field in LIST_SHOP_FIELDS and not isinstance(value, list):
            value = _as_list(value)
        record[field] = value
    return record


def _deal_fingerprint(record: dict[str, Any], shop_id: str = "") -> str:
    title = _first_meaningful(record, "团购名称", "套餐名称")
    price = _first_meaningful(record, "团购价格", "团购价")
    offer_type = _first_meaningful(record, "优惠类型")
    if not _meaningful(title):
        return ""
    identity = json.dumps(
        {
            "店铺id": shop_id or record.get("店铺id", ""),
            "优惠类型": offer_type,
            "标题": title,
            "价格": price,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )
    return sha256(identity.encode("utf-8")).hexdigest()[:24]


def _fallback_deal_id(value: Any) -> bool:
    text = str(value or "")
    return text.startswith(("visible_", "fallback_")) or bool(
        re.fullmatch(r"[0-9a-f]{20}", text)
    )


class CollectorStore:
    """MongoDB-backed store with a replayable local write-ahead mirror."""

    def __init__(
        self,
        data_dir: Path | str = DATA_DIR,
        mongo_uri: str = MONGO_URI,
        mongo_database: str = MONGO_DATABASE,
        connect_mongo: bool = True,
    ) -> None:
        self.data_dir = Path(data_dir)
        self.raw_dir = self.data_dir / "raw"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.raw_dir.mkdir(parents=True, exist_ok=True)
        self.shop_file = self.data_dir / "shops.json"
        self.deal_file = self.data_dir / "deals.json"
        self.search_result_file = self.data_dir / "search_results.json"
        self.commit_file = self.data_dir / "shop_commits.json"
        self._lock = threading.RLock()
        self.mongo_client = None
        self.mongo_db = None
        self.mongo_uri = mongo_uri
        self.mongo_database_name = mongo_database
        self.connect_mongo_enabled = connect_mongo
        self.mongo_error = "MongoDB connection has not been attempted"
        self.last_mongo_attempt = 0.0
        self.last_mongo_connected_at = ""

        if connect_mongo:
            self._connect_mongo(mongo_uri, mongo_database)

    def _connect_mongo(
        self,
        mongo_uri: str | None = None,
        database: str | None = None,
    ) -> bool:
        mongo_uri = mongo_uri or self.mongo_uri
        database = database or self.mongo_database_name
        self.last_mongo_attempt = time.monotonic()
        try:
            from pymongo import ASCENDING, MongoClient

            client = MongoClient(
                mongo_uri,
                serverSelectionTimeoutMS=MONGO_TIMEOUT_MS,
                connectTimeoutMS=MONGO_TIMEOUT_MS,
            )
            client.admin.command("ping")
            db = client[database]
            db.shops.create_index([("店铺id", ASCENDING)], unique=True)
            db.deals.create_index([("存储键", ASCENDING)], unique=True)
            db.network_captures.create_index([("capture_hash", ASCENDING)], unique=True)
            db.search_results.create_index([("capture_key", ASCENDING)], unique=True)
            db.shop_commits.create_index([("店铺id", ASCENDING)], unique=True)
            self.mongo_client = client
            self.mongo_db = db
            self.mongo_error = ""
            self.last_mongo_connected_at = utc_now()
            self._replay_local_to_mongo()
            return True
        except Exception as exc:  # Local JSON remains available when MongoDB is down.
            try:
                if self.mongo_client is not None:
                    self.mongo_client.close()
            except Exception:
                pass
            self.mongo_client = None
            self.mongo_db = None
            self.mongo_error = str(exc)
            return False

    def _ensure_mongo(self) -> bool:
        if self.mongo_db is not None:
            return True
        if not self.connect_mongo_enabled:
            return False
        if time.monotonic() - self.last_mongo_attempt < MONGO_RETRY_SECONDS:
            return False
        return self._connect_mongo()

    def _mark_mongo_unavailable(self, exc: Exception) -> None:
        self.mongo_error = str(exc)
        try:
            if self.mongo_client is not None:
                self.mongo_client.close()
        except Exception:
            pass
        self.mongo_client = None
        self.mongo_db = None

    def _replay_local_to_mongo(self) -> None:
        if self.mongo_db is None:
            return
        shops = self._load_map(self.shop_file)
        deals = self._load_map(self.deal_file)
        search_results = self._load_map(self.search_result_file)
        commits = self._load_map(self.commit_file)
        for document in shops.values():
            shop_id = str(document.get("店铺id") or "")
            if shop_id:
                existing = self.mongo_db.shops.find_one({"店铺id": shop_id})
                local_time = str(document.get("最后采集时间") or "")
                remote_time = str((existing or {}).get("最后采集时间") or "")
                if not existing or local_time >= remote_time:
                    self.mongo_db.shops.replace_one(
                        {"店铺id": shop_id},
                        document,
                        upsert=True,
                    )
        for document in deals.values():
            storage_key = str(document.get("存储键") or "")
            if storage_key:
                existing = self.mongo_db.deals.find_one({"存储键": storage_key})
                local_time = str(document.get("最后采集时间") or "")
                remote_time = str((existing or {}).get("最后采集时间") or "")
                if not existing or local_time >= remote_time:
                    self.mongo_db.deals.update_one(
                        {"存储键": storage_key},
                        {"$set": document},
                        upsert=True,
                    )
        for document in search_results.values():
            capture_key = str(document.get("capture_key") or "")
            if capture_key:
                self.mongo_db.search_results.update_one(
                    {"capture_key": capture_key},
                    {"$setOnInsert": document},
                    upsert=True,
                )
        for document in commits.values():
            shop_id = str(document.get("店铺id") or "")
            if shop_id:
                self.mongo_db.shop_commits.update_one(
                    {"店铺id": shop_id},
                    {"$set": document},
                    upsert=True,
                )

    @property
    def mongo_connected(self) -> bool:
        return self._ensure_mongo()

    @staticmethod
    def _load_map(path: Path) -> dict[str, dict[str, Any]]:
        if not path.exists():
            return {}
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    @staticmethod
    def _write_map(path: Path, value: dict[str, dict[str, Any]]) -> None:
        temp_path = path.with_suffix(path.suffix + ".tmp")
        temp_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        temp_path.replace(path)

    def _mongo_values(self, collection_name: str) -> list[dict[str, Any]] | None:
        if not self._ensure_mongo() or self.mongo_db is None:
            return None
        try:
            values = []
            for document in self.mongo_db[collection_name].find({}):
                values.append({key: value for key, value in document.items() if key != "_id"})
            self.mongo_error = ""
            return values
        except Exception as exc:
            self._mark_mongo_unavailable(exc)
            return None

    def _existing_shop(
        self, shop_id: str, local_record: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        existing = dict(local_record or {})
        if self.mongo_db is None:
            return existing
        try:
            document = self.mongo_db.shops.find_one({"店铺id": shop_id})
            self.mongo_error = ""
            if not document:
                return {}
            return {key: value for key, value in document.items() if key != "_id"}
        except Exception as exc:
            self.mongo_error = str(exc)
        return existing

    @staticmethod
    def _shop_key(record: dict[str, Any]) -> str:
        shop_id = extract_shop_id(
            record.get("店铺id"),
            record.get("详情链接"),
            record.get("页面地址"),
        )
        if shop_id:
            return shop_id
        seed = f"{record.get('店铺名', '')}|{record.get('店铺地址', '')}"
        return "unknown_" + sha256(seed.encode("utf-8")).hexdigest()[:16]

    def upsert_shops(
        self,
        shops: list[dict[str, Any]],
        source_url: str = "",
        captured_at: str | None = None,
    ) -> int:
        now = captured_at or utc_now()
        saved = 0
        mongo_records: list[dict[str, Any]] = []
        with self._lock:
            records = self._load_map(self.shop_file)
            for shop in shops:
                if not isinstance(shop, dict):
                    continue
                key = self._shop_key(shop)
                existing = self._existing_shop(key, records.get(key, {}))
                record = _canonical_shop_record(existing, shop, key, now)
                records[key] = record
                mongo_records.append(record)
                saved += 1
            self._write_map(self.shop_file, records)
            if self.mongo_db is not None:
                try:
                    for record in mongo_records:
                        self.mongo_db.shops.replace_one(
                            {"店铺id": record["店铺id"]},
                            record,
                            upsert=True,
                        )
                except Exception as exc:
                    self._mark_mongo_unavailable(exc)
                    raise
        return saved

    def record_search_results(
        self,
        shops: list[dict[str, Any]],
        source_url: str = "",
        page_number: int = 1,
        captured_at: str | None = None,
        task_id: str = "",
        sequence_start: int | None = None,
    ) -> int:
        now = captured_at or utc_now()
        recorded = 0
        mongo_documents: list[dict[str, Any]] = []
        with self._lock:
            records = self._load_map(self.search_result_file)
            for offset, shop in enumerate(shops):
                if not isinstance(shop, dict):
                    continue
                shop_id = self._shop_key(shop)
                sequence = (
                    max(1, int(sequence_start) + offset)
                    if sequence_start is not None
                    else None
                )
                canonical = (
                    f"{task_id}|{sequence}|{shop_id}"
                    if task_id
                    else f"{source_url}|{page_number}|{now}|{shop_id}"
                )
                capture_key = sha256(canonical.encode("utf-8")).hexdigest()
                document = {
                    "capture_key": capture_key,
                    "task_id": task_id,
                    "序号": sequence,
                    "店铺id": shop_id,
                    "店铺名": shop.get("店铺名", ""),
                    "详情链接": shop.get("详情链接", ""),
                    "搜索来源": source_url,
                    "搜索范围": _search_scope(source_url),
                    "页码": max(1, int(page_number)),
                    "采集时间": now,
                    "检索结果": dict(shop),
                }
                if capture_key not in records:
                    recorded += 1
                    records[capture_key] = document
                mongo_documents.append(document)
            self._write_map(self.search_result_file, records)
            if self.mongo_db is not None:
                try:
                    for document in mongo_documents:
                        self.mongo_db.search_results.update_one(
                            {"capture_key": document["capture_key"]},
                            {"$setOnInsert": document},
                            upsert=True,
                        )
                except Exception as exc:
                    self._mark_mongo_unavailable(exc)
                    raise
        return recorded

    def upsert_detail(
        self,
        shop_id: str,
        detail: dict[str, Any],
        page_url: str = "",
        captured_at: str | None = None,
        offers: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        now = captured_at or utc_now()
        key = extract_shop_id(shop_id, page_url) or shop_id
        with self._lock:
            records = self._load_map(self.shop_file)
            existing = self._existing_shop(key, records.get(key, {}))
            record = _canonical_shop_record(
                existing,
                detail,
                key,
                now,
                offers=offers,
            )
            records[key] = record
            self._write_map(self.shop_file, records)
            if self.mongo_db is not None:
                self.mongo_db.shops.replace_one(
                    {"店铺id": key},
                    record,
                    upsert=True,
                )
        return record

    def pending_shops(
        self,
        limit: int = 50,
        source_url: str = "",
        task_id: str = "",
    ) -> list[dict[str, Any]]:
        search_records = self._mongo_values("search_results")
        if search_records is None:
            with self._lock:
                search_records = list(self._load_map(self.search_result_file).values())
        source_scope = _search_scope(source_url)
        if task_id:
            search_records = [
                record
                for record in search_records
                if str(record.get("task_id") or "") == task_id
            ]
        if source_scope:
            search_records = [
                record
                for record in search_records
                if _search_scope(
                    str(record.get("搜索范围") or record.get("搜索来源") or "")
                )
                == source_scope
            ]
        if task_id:
            search_records.sort(
                key=lambda item: (
                    int(item.get("序号") or 10**9),
                    str(item.get("采集时间", "")),
                )
            )
        else:
            search_records.sort(
                key=lambda item: (
                    str(item.get("采集时间", "")),
                    int(item.get("页码") or 1),
                ),
                reverse=True,
            )
        latest: dict[str, dict[str, Any]] = {}
        for record in search_records:
            shop_id = str(record.get("店铺id", ""))
            if not shop_id or shop_id in latest:
                continue
            snapshot = record.get("检索结果")
            snapshot = dict(snapshot) if isinstance(snapshot, dict) else {}
            latest[shop_id] = {
                **snapshot,
                "店铺id": shop_id,
                "店铺名": snapshot.get("店铺名") or record.get("店铺名", ""),
                "详情链接": snapshot.get("详情链接")
                or record.get("详情链接")
                or f"https://www.dianping.com/shop/{shop_id}",
                "序号": record.get("序号"),
            }
        maximum = max(1, min(limit, 3000))
        return list(latest.values())[:maximum]

    def complete_shop_ids(self, shop_ids: list[str]) -> list[str]:
        requested = [str(shop_id).strip() for shop_id in shop_ids if str(shop_id).strip()]
        if not requested:
            return []
        records = self._mongo_values("shop_commits")
        if records is None:
            with self._lock:
                records = list(self._load_map(self.commit_file).values())
        committed_ids = {
            str(record.get("店铺id") or "")
            for record in records
            if isinstance(record, dict)
            and record.get("status") == "committed"
        }
        return [
            shop_id
            for shop_id in requested
            if shop_id in committed_ids
        ]

    def commit_shop(
        self,
        shop_id: str,
        *,
        captured_at: str | None = None,
        missing_fields: list[str] | None = None,
    ) -> dict[str, Any]:
        key = str(shop_id).strip()
        if not key:
            raise ValueError("shop_id is required")
        document = {
            "店铺id": key,
            "status": "committed",
            "committed_at": captured_at or utc_now(),
            "missing_fields": list(missing_fields or []),
        }
        with self._lock:
            records = self._load_map(self.commit_file)
            records[key] = document
            self._write_map(self.commit_file, records)
            if self.mongo_db is not None:
                try:
                    self.mongo_db.shop_commits.update_one(
                        {"店铺id": key},
                        {"$set": document},
                        upsert=True,
                    )
                except Exception as exc:
                    self._mark_mongo_unavailable(exc)
                    raise
        return document

    def _attach_offers(
        self,
        shop_id: str,
        offers: list[dict[str, Any]],
        captured_at: str,
    ) -> None:
        if not shop_id or not offers:
            return
        with self._lock:
            records = self._load_map(self.shop_file)
            existing = self._existing_shop(shop_id, records.get(shop_id, {}))
            record = _canonical_shop_record(
                existing,
                {},
                shop_id,
                captured_at,
                offers=offers,
            )
            records[shop_id] = record
            self._write_map(self.shop_file, records)
            if self.mongo_db is not None:
                self.mongo_db.shops.replace_one(
                    {"店铺id": shop_id},
                    record,
                    upsert=True,
                )

    def upsert_deals(
        self,
        deals: list[dict[str, Any]],
        captured_at: str | None = None,
        *,
        attach_to_shops: bool = True,
    ) -> int:
        now = captured_at or utc_now()
        saved = 0
        shop_offers: dict[str, list[dict[str, Any]]] = {}
        mongo_records: list[dict[str, Any]] = []
        with self._lock:
            records = self._load_map(self.deal_file)
            for deal in deals:
                if not isinstance(deal, dict):
                    continue
                shop_id = str(_first_meaningful(deal, "店铺id")).strip()
                deal_id = str(_first_meaningful(deal, "团购id", "套餐id")).strip()
                provided_deal_id = deal_id
                deal_name = _first_meaningful(deal, "团购名称", "套餐名称")
                detail_url = _first_meaningful(deal, "详情链接")
                if not deal_id:
                    identity = {
                        "团购名称": deal_name,
                        "详情链接": detail_url,
                    }
                    if not deal_name and not detail_url:
                        identity["原始记录"] = deal
                    canonical = json.dumps(
                        identity,
                        ensure_ascii=False,
                        sort_keys=True,
                        default=str,
                    )
                    deal_id = "fallback_" + sha256(canonical.encode("utf-8")).hexdigest()[:20]

                fingerprint = _deal_fingerprint(deal, shop_id)
                if fingerprint:
                    for existing_record in records.values():
                        if str(existing_record.get("店铺id", "")) != shop_id:
                            continue
                        existing_fingerprint = (
                            existing_record.get("优惠指纹")
                            or _deal_fingerprint(existing_record, shop_id)
                        )
                        existing_id = str(
                            _first_meaningful(existing_record, "团购id", "套餐id")
                        ).strip()
                        if (
                            existing_fingerprint == fingerprint
                            and existing_id
                            and (_fallback_deal_id(deal_id) or _fallback_deal_id(existing_id))
                        ):
                            if provided_deal_id and provided_deal_id != existing_id:
                                deal = {**deal, "来源团购id": provided_deal_id}
                            deal_id = existing_id
                            break

                key = f"{shop_id}:{deal_id}"
                incoming = dict(deal)
                incoming["店铺id"] = shop_id
                incoming["团购id"] = deal_id
                incoming["套餐id"] = deal_id
                incoming["优惠类型"] = str(deal.get("优惠类型") or "").strip()
                incoming["优惠指纹"] = fingerprint
                if _meaningful(deal_name):
                    incoming["团购名称"] = deal_name
                    incoming["套餐名称"] = deal_name
                deal_price = _first_meaningful(deal, "团购价格", "团购价")
                if _meaningful(deal_price):
                    incoming["团购价格"] = deal_price
                    incoming["团购价"] = deal_price
                incoming["存储键"] = key
                incoming["最后采集时间"] = now
                merged = _merge(records.get(key, {}), incoming)
                records[key] = merged
                if shop_id:
                    shop_offers.setdefault(shop_id, []).append(merged)
                saved += 1
                mongo_records.append(merged)
            self._write_map(self.deal_file, records)
            if self.mongo_db is not None:
                try:
                    for merged in mongo_records:
                        key = str(merged.get("存储键") or "")
                        if not key:
                            continue
                        self.mongo_db.deals.update_one(
                            {"存储键": key},
                            {"$set": merged},
                            upsert=True,
                        )
                except Exception as exc:
                    self._mark_mongo_unavailable(exc)
                    raise
        if attach_to_shops:
            for shop_id, offers in shop_offers.items():
                self._attach_offers(shop_id, offers, now)
        return saved

    def _prune_raw_files(self) -> None:
        files = [
            path
            for path in self.raw_dir.rglob("*.json")
            if path.is_file()
        ]
        cutoff = time.time() - max(1, RAW_RETENTION_DAYS) * 86400
        for path in files:
            try:
                if path.stat().st_mtime < cutoff:
                    path.unlink()
            except OSError:
                continue

        remaining = []
        total = 0
        for path in self.raw_dir.rglob("*.json"):
            try:
                stat = path.stat()
            except OSError:
                continue
            remaining.append((stat.st_mtime, stat.st_size, path))
            total += stat.st_size
        for _, size, path in sorted(remaining):
            if total <= RAW_MAX_TOTAL_BYTES:
                break
            try:
                path.unlink()
                total -= size
            except OSError:
                continue

    def save_capture(self, capture: dict[str, Any]) -> tuple[str, Path]:
        canonical = json.dumps(capture, ensure_ascii=False, sort_keys=True, default=str)
        digest = sha256(canonical.encode("utf-8")).hexdigest()
        shop_id = extract_shop_id(
            capture.get("shop_id"),
            capture.get("tab_url"),
            capture.get("response_url"),
        ) or "unknown"
        folder = self.raw_dir / shop_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{digest[:20]}.json"
        if not path.exists():
            path.write_text(
                json.dumps(capture, ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )
        self._prune_raw_files()
        if self.mongo_db is not None:
            document = {
                key: value
                for key, value in capture.items()
                if key != "body"
            }
            document.update(
                {
                    "capture_hash": digest,
                    "raw_file": str(path),
                    "body_bytes": len(canonical.encode("utf-8")),
                }
            )
            try:
                self.mongo_db.network_captures.update_one(
                    {"capture_hash": digest},
                    {"$setOnInsert": document},
                    upsert=True,
                )
            except Exception as exc:
                self._mark_mongo_unavailable(exc)
                raise
        return digest, path

    def deals(self, shop_id: str = "") -> list[dict[str, Any]]:
        records = self._mongo_values("deals")
        if records is None:
            with self._lock:
                records = list(self._load_map(self.deal_file).values())
        if shop_id:
            records = [item for item in records if item.get("店铺id") == shop_id]
        return records

    def stats(self) -> dict[str, Any]:
        with self._lock:
            shops = self._load_map(self.shop_file)
            deals = self._load_map(self.deal_file)
            search_results = self._load_map(self.search_result_file)
        mongo_connected = False
        shop_count = len(shops)
        detail_count = sum(
            1
            for item in shops.values()
            if _meaningful(item.get("推荐菜")) or isinstance(item.get("店铺均分"), dict)
        )
        embedded_deal_count = sum(
            len(_as_list(item.get("优惠券信息"))) for item in shops.values()
        )
        deal_count = max(len(deals), embedded_deal_count)
        search_result_count = len(search_results)
        committed_count = len(self._load_map(self.commit_file))
        if self._ensure_mongo() and self.mongo_db is not None:
            try:
                mongo_shops = self._mongo_values("shops") or []
                shop_count = len(mongo_shops)
                detail_count = sum(
                    1
                    for item in mongo_shops
                    if _meaningful(item.get("推荐菜"))
                    or isinstance(item.get("店铺均分"), dict)
                )
                embedded_deal_count = sum(
                    len(_as_list(item.get("优惠券信息"))) for item in mongo_shops
                )
                deal_count = max(
                    self.mongo_db.deals.count_documents({}), embedded_deal_count
                )
                search_result_count = self.mongo_db.search_results.count_documents({})
                committed_count = self.mongo_db.shop_commits.count_documents(
                    {"status": "committed"}
                )
                self.mongo_error = ""
                mongo_connected = True
            except Exception as exc:
                self._mark_mongo_unavailable(exc)
        return {
            "service": "ok",
            "mongo_connected": mongo_connected,
            "mongo_database": self.mongo_database_name,
            "mongo_error": self.mongo_error,
            "shop_count": shop_count,
            "detail_count": detail_count,
            "deal_count": deal_count,
            "search_result_count": search_result_count,
            "committed_count": committed_count,
            "data_dir": str(self.data_dir),
            "last_mongo_connected_at": self.last_mongo_connected_at,
        }

    def export_csv(self) -> bytes:
        with self._lock:
            shops = list(self._load_map(self.shop_file).values())
            deals = list(self._load_map(self.deal_file).values())
        mongo_shops = self._mongo_values("shops")
        mongo_deals = self._mongo_values("deals")
        if mongo_shops is not None:
            shops = mongo_shops
        if mongo_deals is not None:
            deals = mongo_deals
        deal_groups: dict[str, list[dict[str, Any]]] = {}
        for deal in deals:
            deal_groups.setdefault(str(deal.get("店铺id", "")), []).append(deal)

        rows: list[dict[str, Any]] = []
        for shop in shops:
            row = {field: shop.get(field, [] if field in LIST_SHOP_FIELDS else "") for field in SHOP_FIELDS}
            row["优惠券信息"] = _merge_unique_items(
                row.get("优惠券信息"),
                [
                    public
                    for public in (
                        _public_offer(deal)
                        for deal in deal_groups.get(str(shop.get("店铺id", "")), [])
                    )
                    if public
                ],
            )
            for key, value in list(row.items()):
                if isinstance(value, (dict, list)):
                    row[key] = json.dumps(value, ensure_ascii=False, default=str)
                row[key] = _csv_safe(row[key])
            rows.append(row)

        buffer = io.StringIO(newline="")
        if rows:
            writer = csv.DictWriter(buffer, fieldnames=SHOP_FIELDS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(rows)
        return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def _csv_safe(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


# Compatibility alias for the original demo test suite and downstream imports.
DemoStore = CollectorStore
