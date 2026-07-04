import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from config import CORS_ORIGINS, IS_PRODUCTION
from database import AsyncSessionLocal
from middleware import (
    CSRFTokenMiddleware,
    RateLimitMiddleware,
    RequestBodySizeMiddleware,
    RequestIDMiddleware,
    RequestLoggingMiddleware,
)
from routes.activity_routes import router as activity_router
from routes.auth_routes import router as auth_router
from routes.dashboard_routes import router as dashboard_router
from routes.email_routes import router as email_router
from routes.knowledge_routes import router as knowledge_router
from routes.decision_routes import router as decision_router
from routes.proposal_routes import router as proposal_router
from routes.organization_routes import router as organization_router
from routes.chat_routes import router as chat_router
from routes.reminder_routes import router as reminder_router
from routes.tender_routes import router as tender_router


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("bidwise")


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("BidWise API starting")
    yield


app = FastAPI(title="BidWise AI", version="1.0.0", lifespan=lifespan)

# Middleware order: request ID outermost → logging → body size → CSRF → rate → CORS
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(RequestBodySizeMiddleware)
if IS_PRODUCTION:
    app.add_middleware(CSRFTokenMiddleware)
app.add_middleware(
    RateLimitMiddleware, requests=30, window_seconds=60,
    scopes=["/v1/tenders/upload", "/v1/auth/register", "/v1/auth/login", "/v1/organizations/invitations"],
)
app.add_middleware(
    RateLimitMiddleware, requests=10, window_seconds=60,
    scopes=["/v1/proposals/generate"],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    rid = _request_id(request)
    errors = [
        {"field": ".".join(str(p) for p in err["loc"]), "msg": err["msg"], "type": err["type"]}
        for err in exc.errors()
    ]
    logger.warning("req=%s validation_error path=%s errors=%s", rid, request.url.path, errors)
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation failed", "errors": errors, "request_id": rid},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    rid = _request_id(request)
    logger.info("req=%s http_error status=%d path=%s detail=%s", rid, exc.status_code, request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "request_id": rid},
        headers=getattr(exc, "headers", {}),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    rid = _request_id(request)
    logger.exception("req=%s unhandled_error path=%s", rid, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred", "request_id": rid},
    )


@app.get("/health", tags=["System"])
async def health():
    db_ok = False
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(select(1))
        db_ok = True
    except Exception:
        pass
    return {"status": "ok" if db_ok else "degraded", "database": "connected" if db_ok else "unreachable"}


app.include_router(auth_router, prefix="/v1")
app.include_router(tender_router, prefix="/v1")
app.include_router(proposal_router, prefix="/v1")
app.include_router(dashboard_router, prefix="/v1")
app.include_router(email_router, prefix="/v1")
app.include_router(activity_router, prefix="/v1")
app.include_router(knowledge_router, prefix="/v1")
app.include_router(decision_router, prefix="/v1")
app.include_router(organization_router, prefix="/v1")
app.include_router(chat_router, prefix="/v1")
app.include_router(reminder_router, prefix="/v1")
