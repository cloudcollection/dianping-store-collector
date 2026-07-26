from typing import Any

from pydantic import BaseModel, Field


class ShopBatch(BaseModel):
    source_url: str = Field(default="", max_length=2048)
    page_number: int | None = Field(default=None, ge=1, le=30)
    task_id: str = Field(default="", max_length=128)
    sequence_start: int | None = Field(default=None, ge=1, le=3000)
    shops: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    captured_at: str | None = Field(default=None, max_length=64)


class ShopCompletionRequest(BaseModel):
    shop_ids: list[str] = Field(default_factory=list, max_length=100)


class ShopDetail(BaseModel):
    shop_id: str = Field(min_length=1, max_length=128)
    page_url: str = Field(default="", max_length=2048)
    detail: dict[str, Any] = Field(default_factory=dict)
    offers: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    offer_section_detected: bool = False
    captured_at: str | None = Field(default=None, max_length=64)


class NetworkCapture(BaseModel):
    shop_id: str = Field(default="", max_length=128)
    tab_url: str = Field(default="", max_length=2048)
    response_url: str = Field(min_length=1, max_length=4096)
    status: int = Field(default=0, ge=0, le=599)
    mime_type: str = Field(default="", max_length=256)
    body: Any = None
    captured_at: str | None = Field(default=None, max_length=64)
