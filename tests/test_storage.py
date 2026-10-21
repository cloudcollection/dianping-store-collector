import csv
import io
import json

from backend.storage import SHOP_FIELDS, DemoStore


class FakeCollection:
    def __init__(self, documents):
        self.documents = documents

    def find(self, _query):
        return list(self.documents)

    def find_one(self, query):
        return next(
            (
                document
                for document in self.documents
                if all(document.get(key) == value for key, value in query.items())
            ),
            None,
        )

    def replace_one(self, query, replacement, upsert=False):
        existing = self.find_one(query)
        if existing is not None:
            self.documents[self.documents.index(existing)] = dict(replacement)
        elif upsert:
            self.documents.append(dict(replacement))

    def update_one(self, query, update, upsert=False):
        existing = self.find_one(query)
        values = update.get("$set") or update.get("$setOnInsert") or {}
        if existing is not None:
            if "$set" in update:
                existing.update(values)
        elif upsert:
            self.documents.append({**query, **values})

    def count_documents(self, query):
        return sum(
            1
            for document in self.documents
            if all(document.get(key) == value for key, value in query.items())
        )


class FakeMongoDatabase:
    def __init__(self, shops, deals, search_results=None, shop_commits=None):
        self.shops = FakeCollection(shops)
        self.deals = FakeCollection(deals)
        self.search_results = FakeCollection(search_results or [])
        self.shop_commits = FakeCollection(shop_commits or [])
        self.network_captures = FakeCollection([])

    def __getitem__(self, name):
        return getattr(self, name)


def test_store_merges_search_detail_and_deals(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    shop_id = "k2I9G5Ct1MGirh2V"

    assert store.record_search_results(
        [
            {
                "店铺id": shop_id,
                "店铺名": "测试咖啡店",
                "店铺地址": "搜索页地址",
                "详情链接": f"https://www.dianping.com/shop/{shop_id}",
            }
        ],
        source_url="https://www.dianping.com/shanghai/ch30/r854",
        page_number=1,
    ) == 1
    assert store.stats()["shop_count"] == 0
    assert len(store.pending_shops()) == 1

    merged = store.upsert_detail(
        shop_id,
        {
            "店铺名": "测试咖啡店",
            "评论总数": "100 条评价",
            "人均价格": "人均 ￥50",
            "标签": ["咖啡厅"],
            "店铺地址": "详情页地址",
            "店铺均分": {"口味": "4.6", "环境": "4.8"},
            "推荐菜": ["拿铁"],
            "店铺总分": "4.7",
            "菜单图片": ["https://example.com/menu.jpg"],
        },
        page_url=f"https://www.dianping.com/shop/{shop_id}",
    )
    assert merged["店铺名"] == "测试咖啡店"
    assert merged["店铺地址"] == "详情页地址"
    assert set(merged) == set(SHOP_FIELDS)
    assert "菜单图片" not in merged
    assert len(store.pending_shops()) == 1

    assert store.upsert_deals(
        [
            {
                "店铺id": shop_id,
                "套餐id": "123",
                "套餐名称": "双人套餐",
                "优惠类型": "团购套餐",
                "可用退款说明": "周一至周日 · 随时退 · 过期退",
                "原价": 27.5,
                "团购折扣": "5.8折",
                "团购价格": 15.9,
                "详情链接": "https://www.dianping.com/deal/123",
            }
        ]
    ) == 1
    assert store.stats()["shop_count"] == 1
    assert store.stats()["detail_count"] == 1
    assert store.stats()["deal_count"] == 1

    shops = json.loads((tmp_path / "shops.json").read_text(encoding="utf-8"))
    assert set(shops[shop_id]) == set(SHOP_FIELDS)
    saved_offer = shops[shop_id]["优惠券信息"][0]
    assert saved_offer["团购名称"] == "双人套餐"
    assert saved_offer["使用说明"] == "周一至周日 · 随时退 · 过期退"
    assert saved_offer["原价"] == 27.5
    assert saved_offer["折扣"] == "5.8折"
    assert saved_offer["团购价格"] == 15.9
    assert saved_offer["详情链接"] == "https://www.dianping.com/deal/123"

    exported = store.export_csv().decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(exported)))
    assert len(rows) == 1
    assert list(rows[0]) == list(SHOP_FIELDS)
    assert rows[0]["店铺名"] == "测试咖啡店"
    assert "双人套餐" in rows[0]["优惠券信息"]


def test_capture_is_written_once_by_hash(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    capture = {
        "shop_id": "k2I9G5Ct1MGirh2V",
        "response_url": "https://m.dianping.com/meishi/poi/v1/shelf/0",
        "body": {"code": 0},
    }

    first_hash, first_path = store.save_capture(capture)
    second_hash, second_path = store.save_capture(capture)

    assert first_hash == second_hash
    assert first_path == second_path
    assert json.loads(first_path.read_text(encoding="utf-8"))["body"] == {"code": 0}


def test_detail_snapshot_embeds_offers_without_task_fields(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    shop_id = "k2I9G5Ct1MGirh2V"
    result = store.upsert_detail(
        shop_id,
        {"店铺名": "测试店"},
        offers=[
            {
                "团购id": "meal-1",
                "优惠类型": "团购套餐",
                "团购名称": "早餐三件套",
                "团购价格": 15.9,
            }
        ],
    )

    assert result["优惠券信息"][0]["团购名称"] == "早餐三件套"
    shops = json.loads((tmp_path / "shops.json").read_text(encoding="utf-8"))
    assert set(shops[shop_id]) == set(SHOP_FIELDS)
    assert "团购采集状态" not in shops[shop_id]


def test_same_shop_multiple_deals_keep_distinct_keys_and_export(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    shop_id = "multi-deal-shop"
    store.upsert_shops(
        [{"店铺id": shop_id, "店铺名": "多套餐门店"}],
        source_url="https://www.dianping.com/search/keyword/4/0_test",
    )

    assert store.upsert_deals(
        [
            {
                "店铺id": shop_id,
                "团购id": "deal-1",
                "团购名称": "双人套餐",
                "团购价格": 99,
            },
            {
                "店铺id": shop_id,
                "套餐id": "deal-2",
                "套餐名称": "四人套餐",
                "团购价": 188,
            },
        ]
    ) == 2

    deals = store.deals(shop_id)
    assert {deal["存储键"] for deal in deals} == {
        f"{shop_id}:deal-1",
        f"{shop_id}:deal-2",
    }
    assert {deal["团购id"] for deal in deals} == {"deal-1", "deal-2"}
    assert {deal["套餐id"] for deal in deals} == {"deal-1", "deal-2"}
    assert {deal["团购名称"] for deal in deals} == {"双人套餐", "四人套餐"}
    assert store.stats()["deal_count"] == 2

    rows = list(csv.DictReader(io.StringIO(store.export_csv().decode("utf-8-sig"))))
    exported_deals = json.loads(rows[0]["优惠券信息"])
    assert {deal["团购名称"] for deal in exported_deals} == {"双人套餐", "四人套餐"}


def test_missing_deal_id_uses_stable_fallback_key(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    deal = {
        "店铺id": "fallback-shop",
        "团购名称": "无编号套餐",
        "详情链接": "https://m.dianping.com/deal/fallback",
    }

    store.upsert_deals([deal])
    first = store.deals("fallback-shop")[0]
    store.upsert_deals([deal])
    second = store.deals("fallback-shop")[0]

    assert len(store.deals("fallback-shop")) == 1
    assert first["团购id"] == second["团购id"]
    assert first["存储键"] == second["存储键"]


def test_visible_fallback_and_network_id_merge_by_offer_fingerprint(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    shop_id = "fingerprint-shop"
    visible = {
        "店铺id": shop_id,
        "团购id": "visible_1234abcd",
        "优惠类型": "代金券",
        "团购名称": "100元代金券",
        "团购价格": 98,
    }
    network = {
        "店铺id": shop_id,
        "团购id": "real-voucher-88",
        "优惠类型": "代金券",
        "团购名称": "100元代金券",
        "团购价格": 98,
    }

    store.upsert_deals([visible])
    store.upsert_deals([network])

    deals = store.deals(shop_id)
    assert len(deals) == 1
    assert deals[0]["团购id"] == "visible_1234abcd"
    assert deals[0]["来源团购id"] == "real-voucher-88"


def test_stats_and_manual_export_prefer_mongodb(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    store.upsert_shops(
        [{"店铺id": "local-shop", "店铺名": "仅本地门店"}],
        source_url="https://www.dianping.com/search/keyword/4/0_local",
    )
    store.mongo_db = FakeMongoDatabase(
        shops=[
            {
                "_id": "mongo-shop-object-id",
                "店铺id": "mongo-shop",
                "店铺名": "MongoDB 门店",
                "推荐菜": ["招牌菜"],
                "优惠券信息": [],
            }
        ],
        deals=[
            {
                "_id": "mongo-deal-object-id",
                "店铺id": "mongo-shop",
                "团购id": "mongo-deal",
                "团购名称": "MongoDB 套餐",
            }
        ],
        search_results=[{"capture_key": "mongo-search-result"}],
    )

    stats = store.stats()
    assert stats["mongo_connected"] is True
    assert stats["shop_count"] == 1
    assert stats["detail_count"] == 1
    assert stats["deal_count"] == 1
    assert stats["search_result_count"] == 1

    rows = list(csv.DictReader(io.StringIO(store.export_csv().decode("utf-8-sig"))))
    assert len(rows) == 1
    assert list(rows[0]) == list(SHOP_FIELDS)
    assert rows[0]["店铺名"] == "MongoDB 门店"
    assert "MongoDB 套餐" in rows[0]["优惠券信息"]
    assert "_id" not in rows[0]


def test_search_results_are_recorded_and_pending_can_be_scoped(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    first_url = "https://www.dianping.com/search/keyword/4/0_test"
    second_url = "https://www.dianping.com/search/keyword/4/0_other"
    first = {
        "店铺id": "first-shop",
        "店铺名": "第一家",
        "详情链接": "https://www.dianping.com/shop/first-shop",
    }
    second = {
        "店铺id": "second-shop",
        "店铺名": "第二家",
        "详情链接": "https://www.dianping.com/shop/second-shop",
    }
    store.upsert_shops([first], source_url=f"{first_url}/p2")
    store.upsert_shops([second], source_url=second_url)

    captured_at = "2026-07-22T09:00:00Z"
    assert store.record_search_results([first], first_url, 1, captured_at) == 1
    assert store.record_search_results([first], first_url, 1, captured_at) == 0
    assert store.stats()["search_result_count"] == 1

    pending = store.pending_shops(source_url=first_url)
    assert [item["店铺id"] for item in pending] == ["first-shop"]


def test_task_sequence_and_complete_shop_filter(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    source_url = "https://www.dianping.com/search/keyword/4/0_test"
    task_id = "task-sequence"
    shops = [
        {
            "店铺id": "shop-16",
            "店铺名": "第十六家",
            "详情链接": "https://www.dianping.com/shop/shop-16",
        },
        {
            "店铺id": "shop-17",
            "店铺名": "第十七家",
            "详情链接": "https://www.dianping.com/shop/shop-17",
        },
    ]
    assert store.record_search_results(
        shops,
        source_url,
        2,
        "2026-07-23T10:00:00Z",
        task_id=task_id,
        sequence_start=16,
    ) == 2

    pending = store.pending_shops(limit=30, task_id=task_id)
    assert [(item["店铺id"], item["序号"]) for item in pending] == [
        ("shop-16", 16),
        ("shop-17", 17),
    ]
    assert store.complete_shop_ids(["shop-16", "shop-17"]) == []

    store.upsert_detail(
        "shop-16",
        {
            "店铺名": "第十六家",
            "评论总数": "100条评价",
            "人均价格": "60元",
            "标签": ["粤菜"],
            "店铺地址": "测试路16号",
            "店铺均分": {"口味": "4.5"},
            "推荐菜": [],
            "店铺总分": "4.5",
            "优惠券信息": [],
        },
    )
    store.commit_shop("shop-16")
    assert store.complete_shop_ids(["shop-17", "shop-16"]) == ["shop-16"]


def test_empty_mongodb_does_not_restore_stale_local_shop_data(tmp_path):
    shop_id = "fresh-shop"
    (tmp_path / "shops.json").write_text(
        json.dumps(
            {
                shop_id: {
                    "店铺id": shop_id,
                    "店铺名": "旧名称",
                    "图片链接": "https://example.com/old.jpg",
                    "首次采集时间": "2025-01-01T00:00:00Z",
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    store.mongo_db = FakeMongoDatabase(shops=[], deals=[])

    store.upsert_shops(
        [{"店铺id": shop_id, "店铺名": "新名称"}],
        captured_at="2026-07-22T14:00:00Z",
    )

    document = store.mongo_db.shops.find_one({"店铺id": shop_id})
    assert set(document) == set(SHOP_FIELDS)
    assert document["店铺名"] == "新名称"
    assert document["首次采集时间"] == "2026-07-22T14:00:00Z"
    assert "图片链接" not in document


def test_csv_export_neutralizes_formula_prefixes(tmp_path):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    store.upsert_detail(
        "formula-shop",
        {
            "店铺名": "=HYPERLINK(\"https://example.com\")",
            "店铺地址": "+1+1",
            "店铺总分": "4.8",
        },
    )
    store.commit_shop("formula-shop")

    rows = list(csv.DictReader(io.StringIO(store.export_csv().decode("utf-8-sig"))))
    assert rows[0]["店铺名"].startswith("'=")
    assert rows[0]["店铺地址"].startswith("'+")


def test_store_attempts_reconnect_after_startup_failure(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    store.connect_mongo_enabled = True
    store.last_mongo_attempt = -100
    attempts = []

    def reconnect():
        attempts.append(True)
        store.mongo_db = FakeMongoDatabase(shops=[], deals=[])
        store.mongo_error = ""
        return True

    monkeypatch.setattr(store, "_connect_mongo", reconnect)

    assert store.mongo_connected is True
    assert len(attempts) == 1



def test_empty_export_keeps_schema(tmp_path):
    import csv
    import io
    from backend.storage import DemoStore, SHOP_FIELDS

    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    rows = list(csv.reader(io.StringIO(store.export_csv().decode("utf-8-sig"))))
    assert rows == [list(SHOP_FIELDS)]
