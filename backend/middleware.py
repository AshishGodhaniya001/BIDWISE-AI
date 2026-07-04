import logging
import secrets
import time
import uuid
from collections import defaultdict, deque
from threading import Lock

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

logger = logging.getLogger("bidwise.middleware")


class RequestIDMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", uuid.uuid4().hex[:12])
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration = time.monotonic() - start
        rid = getattr(request.state, "request_id", "")
        user_id = getattr(request.state, "user_id", "anonymous")
        logger.info(
            "req=%s method=%s path=%s status=%d duration=%.1fms user=%s",
            rid, request.method, request.url.path,
            response.status_code, duration * 1000, user_id,
        )
        return response


class RequestBodySizeMiddleware(BaseHTTPMiddleware):
    MAX_JSON_BYTES = 5 * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.MAX_JSON_BYTES:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": f"Request body exceeds {self.MAX_JSON_BYTES // 1024 // 1024}MB limit"},
                    )
            except ValueError:
                pass
        return await call_next(request)


class CSRFTokenMiddleware(BaseHTTPMiddleware):
    SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}

    async def dispatch(self, request: Request, call_next):
        if request.method not in self.SAFE_METHODS:
            cookie_token = request.cookies.get("csrf_token")
            header_token = request.headers.get("X-CSRF-Token")
            if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "CSRF token missing or invalid"},
                )
        response = await call_next(request)
        if request.method in self.SAFE_METHODS and "csrf_token" not in request.cookies:
            token = secrets.token_hex(32)
            response.set_cookie(
                key="csrf_token",
                value=token,
                httponly=True,
                samesite="lax",
                secure=request.url.scheme == "https",
                max_age=86400,
            )
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, requests: int, window_seconds: int, scopes: list[str]):
        super().__init__(app)
        self.requests = requests
        self.window_seconds = window_seconds
        self.scopes = scopes
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    async def dispatch(self, request: Request, call_next):
        matched = any(request.url.path.startswith(scope) for scope in self.scopes)
        if not matched:
            return await call_next(request)
        client_ip = request.client.host if request.client else "unknown"
        key = f"{request.url.path}:{client_ip}"
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and hits[0] <= now - self.window_seconds:
                hits.popleft()
            if len(hits) >= self.requests:
                retry_after = max(1, int(self.window_seconds - (now - hits[0])))
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests. Try again later."},
                    headers={"Retry-After": str(retry_after)},
                )
            hits.append(now)
        return await call_next(request)
