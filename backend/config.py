import os
from pathlib import Path


APP_VERSION = "2.0.0"
SCHEMA_VERSION = 2

PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("DIANPING_DATA_DIR", PROJECT_DIR / "data")).resolve()
RAW_DIR = DATA_DIR / "raw"
TOKEN_FILE = Path(
    os.getenv("DIANPING_TOKEN_FILE", DATA_DIR / ".collector-token")
).resolve()

MONGO_URI = os.getenv("DIANPING_MONGO_URI", "mongodb://127.0.0.1:27017")
MONGO_DATABASE = os.getenv("DIANPING_MONGO_DATABASE", "dianping_collector")
MONGO_TIMEOUT_MS = int(os.getenv("DIANPING_MONGO_TIMEOUT_MS", "1500"))
MONGO_RETRY_SECONDS = float(os.getenv("DIANPING_MONGO_RETRY_SECONDS", "5"))

MAX_REQUEST_BYTES = int(os.getenv("DIANPING_MAX_REQUEST_BYTES", str(6 * 1024 * 1024)))
MAX_CAPTURE_BYTES = int(os.getenv("DIANPING_MAX_CAPTURE_BYTES", str(5 * 1024 * 1024)))
RAW_MAX_TOTAL_BYTES = int(
    os.getenv("DIANPING_RAW_MAX_TOTAL_BYTES", str(250 * 1024 * 1024))
)
RAW_RETENTION_DAYS = int(os.getenv("DIANPING_RAW_RETENTION_DAYS", "14"))

EXTENSION_ORIGIN_PATTERN = r"^chrome-extension://[a-p]{32}$"
