from fastapi.testclient import TestClient

import backend.app as app_module
from backend.security import API_TOKEN
from backend.storage import DemoStore

AUTH_HEADERS = {"X-Collector-Token": API_TOKEN}


def test_api_collection_flow(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    monkeypatch.setattr(app_module, "store", store)
    client = TestClient(app_module.app)
    client.headers.update(AUTH_HEADERS)
    shop_id = "k2I9G5Ct1MGirh2V"

    batch = client.post(
        "/api/search-results/batch",
        json={
            "source_url": "https://www.dianping.com/shanghai/ch30/r854",
            "page_number": 1,
            "task_id": "task-api-flow",
            "sequence_start": 16,
            "shops": [
                {
                    "店铺id": shop_id,
                    "店铺名": "测试店",
                    "详情链接": f"https://www.dianping.com/shop/{shop_id}",
                }
            ],
        },
    )
    assert batch.status_code == 200
    assert batch.json()["saved"] == 0
    assert batch.json()["recorded"] == 1
    assert batch.json()["stats"]["search_result_count"] == 1
    assert batch.json()["stats"]["shop_count"] == 0
    completion = client.post(
        "/api/shops/completion",
        json={"shop_ids": [shop_id]},
    )
    assert completion.status_code == 200
    assert completion.json()["completed_ids"] == []

    pending = client.get(
        "/api/shops/pending?limit=30&task_id=task-api-flow"
    )
    assert pending.status_code == 200
    assert pending.json()["count"] == 1
    assert pending.json()["shops"][0]["序号"] == 16
    scoped_pending = client.get(
        "/api/shops/pending",
        params={"limit": 10, "source_url": "https://www.dianping.com/shanghai/ch30/r854/p2"},
    )
    assert scoped_pending.json()["count"] == 1

    detail = client.post(
        "/api/shops/detail",
        json={
            "shop_id": shop_id,
            "page_url": f"https://www.dianping.com/shop/{shop_id}",
            "detail": {
                "店铺名": "测试店",
                "评论总数": "100 条评价",
                "人均价格": "人均 ￥60",
                "标签": ["咖啡厅"],
                "店铺地址": "测试路1号",
                "店铺均分": {"口味": "4.5", "环境": "4.6", "服务": "4.4"},
                "推荐菜": ["拿铁"],
                "店铺总分": "4.5",
                "优惠券信息": [],
            },
            "offers": [
                {
                    "店铺id": shop_id,
                    "团购id": "123",
                    "优惠类型": "团购套餐",
                    "团购名称": "双人套餐",
                    "可用退款说明": "周一至周日 · 随时退 · 过期退",
                    "原价": 99,
                    "团购折扣": "6折",
                    "团购价格": 59.9,
                }
            ],
            "offer_section_detected": True,
        },
    )
    assert detail.status_code == 200
    assert detail.json()["shop_id"] == shop_id
    assert detail.json()["deal_count"] == 1
    assert detail.json()["shop"]["店铺名"] == "测试店"
    assert detail.json()["stats"]["shop_count"] == 1
    completion = client.post(
        "/api/shops/completion",
        json={"shop_ids": [shop_id, "missing-shop"]},
    )
    assert completion.json()["completed_ids"] == [shop_id]
    deals_pending = client.get("/api/shops/pending?limit=10")
    assert deals_pending.json()["count"] == 1
    saved_offer = detail.json()["shop"]["优惠券信息"][0]
    assert saved_offer["团购名称"] == "双人套餐"
    assert saved_offer["使用说明"] == "周一至周日 · 随时退 · 过期退"
    assert saved_offer["原价"] == 99
    assert saved_offer["折扣"] == "6折"
    assert saved_offer["团购价格"] == 59.9

    capture = client.post(
        "/api/network/capture",
        json={
            "shop_id": shop_id,
            "tab_url": f"https://m.dianping.com/shop/{shop_id}",
            "response_url": "https://m.dianping.com/meishi/poi/v1/shelf/0",
            "status": 200,
            "mime_type": "application/json",
            "body": {
                "data": {
                    "msg": {
                        "products": [
                            {
                                "productAreas": [
                                    {
                                        "itemArea": {
                                            "productItems": [
                                                {
                                                    "productId": 123,
                                                    "title": "双人套餐",
                                                    "salePrice": 59.9,
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
        },
    )
    assert capture.status_code == 200
    assert capture.json()["deal_count"] == 1
    assert client.get(f"/api/deals?shop_id={shop_id}").json()["count"] == 1
    assert client.get("/api/shops/pending?limit=10").json()["count"] == 1

    ticket = client.post("/api/export-ticket").json()["ticket"]
    exported = client.get("/api/export.csv", params={"ticket": ticket})
    assert exported.status_code == 200
    assert "测试店" in exported.content.decode("utf-8-sig")
    assert client.get("/api/export.csv", params={"ticket": ticket}).status_code == 401


def test_detail_rejects_partial_fields_and_empty_detected_offer_section(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    monkeypatch.setattr(app_module, "store", store)
    client = TestClient(app_module.app)
    client.headers.update(AUTH_HEADERS)

    partial = client.post(
        "/api/shops/detail",
        json={"shop_id": "partial-shop", "detail": {"店铺名": "半成品店"}},
    )
    assert partial.status_code == 422
    assert store.stats()["shop_count"] == 0

    complete_detail = {
        "店铺名": "无优惠解析店",
        "评论总数": "10 条评价",
        "人均价格": "人均 ￥20",
        "标签": ["快餐"],
        "店铺地址": "测试路2号",
        "店铺均分": {"口味": "4.0"},
        "推荐菜": [],
        "店铺总分": "4.0",
        "优惠券信息": [],
    }
    empty_offers = client.post(
        "/api/shops/detail",
        json={
            "shop_id": "empty-offer-shop",
            "detail": complete_detail,
            "offers": [],
            "offer_section_detected": True,
        },
    )
    assert empty_offers.status_code == 422
    assert store.stats()["shop_count"] == 0


def test_network_capture_never_creates_partial_shop(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    monkeypatch.setattr(app_module, "store", store)
    client = TestClient(app_module.app)
    client.headers.update(AUTH_HEADERS)
    shop_id = "network-only-shop"

    capture = client.post(
        "/api/network/capture",
        json={
            "shop_id": shop_id,
            "tab_url": f"https://www.dianping.com/shop/{shop_id}",
            "response_url": "https://m.dianping.com/meishi/poi/v1/shelf/0",
            "status": 200,
            "mime_type": "application/json",
            "body": {
                "data": {
                    "msg": {
                        "products": [
                            {
                                "productAreas": [
                                    {
                                        "itemArea": {
                                            "productItems": [
                                                {
                                                    "productId": "network-offer-1",
                                                    "title": "网络套餐",
                                                    "salePrice": 88,
                                                }
                                            ]
                                        }
                                    }
                                ]
                            }
                        ]
                    }
                }
            },
        },
    )

    assert capture.status_code == 200
    assert capture.json()["deal_count"] == 1
    assert store.stats()["shop_count"] == 0
    assert store.stats()["deal_count"] == 1


def test_local_api_requires_pairing_token(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    monkeypatch.setattr(app_module, "store", store)
    client = TestClient(app_module.app)

    assert client.get("/").status_code == 200
    assert client.get("/health").status_code == 401
    assert client.get("/api/stats").status_code == 401
    assert client.post("/api/search-results/batch", json={"shops": []}).status_code == 401
    assert client.get("/api/export.csv", params={"ticket": "invalid"}).status_code == 401


def test_optional_shop_fields_can_be_legitimately_missing(tmp_path, monkeypatch):
    store = DemoStore(data_dir=tmp_path, connect_mongo=False)
    monkeypatch.setattr(app_module, "store", store)
    client = TestClient(app_module.app)
    client.headers.update(AUTH_HEADERS)

    response = client.post(
        "/api/shops/detail",
        json={
            "shop_id": "new-shop",
            "detail": {
                "店铺名": "刚开业的店",
                "店铺地址": "测试路3号",
                "店铺总分": "4.2",
            },
            "offers": [],
            "offer_section_detected": False,
        },
    )

    assert response.status_code == 200
    assert response.json()["completeness"] == "partial_valid"
    assert "人均价格" in response.json()["missing_fields"]
    completion = client.post(
        "/api/shops/completion",
        json={"shop_ids": ["new-shop"]},
    )
    assert completion.json()["completed_ids"] == ["new-shop"]
