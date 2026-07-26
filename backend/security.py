import hmac
import secrets
import threading
import time
from pathlib import Path

from fastapi import Header, HTTPException, status

from .config import TOKEN_FILE


def load_or_create_token(path: Path = TOKEN_FILE) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        token = path.read_text(encoding="utf-8").strip()
        if token:
            return token
    token = secrets.token_urlsafe(32)
    path.write_text(token, encoding="utf-8")
    return token


API_TOKEN = load_or_create_token()


def token_hint() -> str:
    return f"••••{API_TOKEN[-4:]}"


def require_api_token(
    x_collector_token: str = Header(default="", alias="X-Collector-Token"),
) -> None:
    if not x_collector_token or not hmac.compare_digest(
        x_collector_token.encode("utf-8"),
        API_TOKEN.encode("utf-8"),
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="本地服务尚未配对或令牌无效",
        )


class ExportTicketStore:
    def __init__(self, ttl_seconds: int = 60) -> None:
        self.ttl_seconds = ttl_seconds
        self._tickets: dict[str, float] = {}
        self._lock = threading.Lock()

    def create(self) -> str:
        ticket = secrets.token_urlsafe(24)
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            self._tickets[ticket] = now + self.ttl_seconds
        return ticket

    def consume(self, ticket: str) -> bool:
        now = time.monotonic()
        with self._lock:
            self._cleanup(now)
            expires_at = self._tickets.pop(ticket, 0)
        return expires_at >= now

    def _cleanup(self, now: float) -> None:
        expired = [key for key, expires_at in self._tickets.items() if expires_at < now]
        for key in expired:
            self._tickets.pop(key, None)


export_tickets = ExportTicketStore()
