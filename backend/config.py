import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _to_async_url(url: str) -> str:
    if url.startswith("sqlite"):
        return url.replace("sqlite:///", "sqlite+aiosqlite:///", 1)
    return url.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1).replace("postgresql://", "postgresql+asyncpg://", 1)


def _as_bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _as_origins(value: str) -> list[str]:
    return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]


APP_ENV = os.getenv("APP_ENV", "development").strip().lower()
IS_PRODUCTION = APP_ENV == "production"

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "uploads"))).resolve()
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'bidwise.db'}")
ASYNC_DATABASE_URL = _to_async_url(DATABASE_URL)
if IS_PRODUCTION and DATABASE_URL.startswith("sqlite"):
    logging.getLogger("bidwise.config").warning(
        "Using SQLite in production is not recommended. Set DATABASE_URL to a PostgreSQL connection string."
    )

SECRET_KEY = os.getenv("SECRET_KEY", "").strip()
if not SECRET_KEY:
    if IS_PRODUCTION:
        raise RuntimeError("SECRET_KEY is required when APP_ENV=production")
    SECRET_KEY = secrets.token_urlsafe(48)
    logging.getLogger("bidwise.config").warning(
        "SECRET_KEY is not configured; using an ephemeral development key"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
RESET_TOKEN_EXPIRE_MINUTES = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "30"))
AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "bidwise_session")
COOKIE_SECURE = _as_bool("COOKIE_SECURE", IS_PRODUCTION)
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()
if COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    raise RuntimeError("COOKIE_SAMESITE must be lax, strict, or none")

CORS_ORIGINS = _as_origins(
    os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(15 * 1024 * 1024)))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "250"))
MAX_AI_INPUT_CHARS = int(os.getenv("MAX_AI_INPUT_CHARS", "120000"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", GEMINI_MODEL)
AI_MAX_RETRIES = int(os.getenv("AI_MAX_RETRIES", "3"))
AI_CHUNK_CHARS = int(os.getenv("AI_CHUNK_CHARS", "24000"))
AI_CACHE_TTL_DAYS = int(os.getenv("AI_CACHE_TTL_DAYS", "30"))

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "noreply@bidwise.ai")
