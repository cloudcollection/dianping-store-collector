import json
from datetime import datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .config import (
    APP_VERSION,
    EXTENSION_ORIGIN_PATTERN,
    MAX_CAPTURE_BYTES,
    MAX_REQUEST_BYTES,
    SCHEMA_VERSION,
)
from .models import NetworkCapture, ShopBatch, ShopCompletionRequest, ShopDetail
from .parsers import (
    extract_shop_id,
    parse_deals,
    parse_json_body,
    response_requires_login,
)
from .security import export_tickets, require_api_token, token_hint
from .storage import (
    OPTIONAL_SHOP_FIELDS,
    REQUIRED_SHOP_FIELDS,
    CollectorStore,
    utc_now,
)


app = FastAPI(
    title="Dianping Store Collector",
    version=APP_VERSION,
    docs_url=None,
    redoc_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=EXTENSION_ORIGIN_PATTERN,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Collector-Token"],
)

store = CollectorStore()


@app.middleware("http")
async def protect_local_api(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "请求正文超过本地服务允许的大小"},
                )
        except ValueError:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "无效的 Content-Length"},
            )
    return await call_next(request)


def model_dict(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


@app.get("/")
def root() -> dict[str, Any]:
    return {
        "name": app.title,
        "version": APP_VERSION,
        "message": "请通过浏览器扩展配对后使用本地服务。",
    }


@app.get("/health", dependencies=[Depends(require_api_token)])
def health() -> dict[str, Any]:
    return {
        **store.stats(),
        "version": APP_VERSION,
        "schema_version": SCHEMA_VERSION,
        "token_hint": token_hint(),
    }


@app.get("/api/stats", dependencies=[Depends(require_api_token)])
def stats() -> dict[str, Any]:
    return health()


@app.post("/api/search-results/batch", dependencies=[Depends(require_api_token)])
def save_search_result_batch(payload: ShopBatch) -> dict[str, Any]:
    recorded = store.record_search_results(
        payload.shops,
        source_url=payload.source_url,
        page_number=payload.page_number or 1,
        captured_at=payload.captured_at,
        task_id=payload.task_id,
        sequence_start=payload.sequence_start,
    )
    return {
        "ok": True,
        "saved": 0,
        "recorded": recorded,
        "stats": store.stats(),
    }


@app.post("/api/shops/detail", dependencies=[Depends(require_api_token)])
def save_shop_detail(payload: ShopDetail) -> dict[str, Any]:
    offers = [
        {**offer, "店铺id": payload.shop_id}
        for offer in payload.offers
        if isinstance(offer, dict)
    ]
    missing_required = [
        field
        for field in REQUIRED_SHOP_FIELDS
        if payload.detail.get(field) in (None, "", [], {})
    ]
    if missing_required:
        raise HTTPException(
            status_code=422,
            detail=f"店铺身份字段缺失：{', '.join(missing_required)}",
        )
    if payload.offer_section_detected and not offers:
        raise HTTPException(
            status_code=422,
            detail="页面检测到团购套餐或代金券栏目，但没有解析出有效优惠",
        )

    captured_at = payload.captured_at or utc_now()
    record = store.upsert_detail(
        payload.shop_id,
        payload.detail,
        page_url=payload.page_url,
        captured_at=captured_at,
        offers=offers,
    )
    shop_id = str(record.get("店铺id") or payload.shop_id)
    offers = [{**offer, "店铺id": shop_id} for offer in offers]
    deal_count = (
        store.upsert_deals(
            offers,
            captured_at=captured_at,
            attach_to_shops=False,
        )
        if offers
        else 0
    )
    missing_optional = [
        field
        for field in OPTIONAL_SHOP_FIELDS
        if record.get(field) in (None, "", [], {})
    ]
    store.commit_shop(
        shop_id,
        captured_at=captured_at,
        missing_fields=missing_optional,
    )
    return {
        "ok": True,
        "shop_id": shop_id,
        "shop": record,
        "deal_count": deal_count,
        "missing_fields": missing_optional,
        "completeness": "complete" if not missing_optional else "partial_valid",
        "stats": store.stats(),
    }


@app.get("/api/shops/pending", dependencies=[Depends(require_api_token)])
def pending_shops(
    limit: int = Query(default=20, ge=1, le=3000),
    source_url: str = "",
    task_id: str = "",
) -> dict[str, Any]:
    shops = store.pending_shops(
        limit=limit,
        source_url=source_url,
        task_id=task_id,
    )
    return {"ok": True, "shops": shops, "count": len(shops)}


@app.post("/api/shops/completion", dependencies=[Depends(require_api_token)])
def completed_shops(payload: ShopCompletionRequest) -> dict[str, Any]:
    completed_ids = store.complete_shop_ids(payload.shop_ids)
    return {
        "ok": True,
        "completed_ids": completed_ids,
        "count": len(completed_ids),
    }


@app.post("/api/network/capture", dependencies=[Depends(require_api_token)])
def save_network_capture(payload: NetworkCapture) -> dict[str, Any]:
    capture = model_dict(payload)
    capture["captured_at"] = capture.get("captured_at") or utc_now()
    serialized_body = json.dumps(
        capture.get("body"),
        ensure_ascii=False,
        default=str,
    ).encode("utf-8")
    if len(serialized_body) > MAX_CAPTURE_BYTES:
        raise HTTPException(
            status_code=413,
            detail="网络证据正文过大，已拒绝保存",
        )

    parsed = parse_json_body(capture.get("body"))
    shop_id = extract_shop_id(
        capture.get("shop_id"),
        capture.get("tab_url"),
        capture.get("response_url"),
    )
    capture["shop_id"] = shop_id
    capture["body"] = parsed if parsed is not None else capture.get("body")

    requires_login = response_requires_login(payload.status, parsed)
    if requires_login:
        return {
            "ok": True,
            "capture_hash": "",
            "raw_file": "",
            "shop_id": shop_id,
            "deal_count": 0,
            "requires_login": True,
            "stats": store.stats(),
        }

    digest, raw_path = store.save_capture(capture)
    deals = parse_deals(parsed, shop_id=shop_id, source_url=payload.response_url)
    saved_deals = (
        store.upsert_deals(
            deals,
            captured_at=capture["captured_at"],
            attach_to_shops=False,
        )
        if deals
        else 0
    )
    return {
        "ok": True,
        "capture_hash": digest,
        "raw_file": str(raw_path),
        "shop_id": shop_id,
        "deal_count": saved_deals,
        "requires_login": False,
        "stats": store.stats(),
    }


@app.get("/api/deals", dependencies=[Depends(require_api_token)])
def deals(shop_id: str = "") -> dict[str, Any]:
    values = store.deals(shop_id=shop_id)
    return {"ok": True, "deals": values, "count": len(values)}


@app.post("/api/export-ticket", dependencies=[Depends(require_api_token)])
def create_export_ticket() -> dict[str, Any]:
    ticket = export_tickets.create()
    filename = f"dianping-stores-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return {
        "ok": True,
        "ticket": ticket,
        "filename": filename,
    }


@app.get("/api/export.csv")
def export_csv(ticket: str = Query(default="", min_length=1, max_length=128)) -> Response:
    if not export_tickets.consume(ticket):
        raise HTTPException(status_code=401, detail="导出凭证无效或已过期")
    filename = f"dianping-stores-{datetime.now().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content=store.export_csv(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
