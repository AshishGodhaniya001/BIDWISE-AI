# BidWise AI

BidWise AI is a tender-analysis workspace built with FastAPI, SQLAlchemy, Next.js, and Gemini. It uploads and validates tender PDFs, extracts evidence-linked requirements, compares them with a company profile, tracks deadlines, and creates editable proposal drafts.

## What is included

- HttpOnly cookie authentication, rate limiting, tenant-scoped queries, and restricted CORS
- Streamed PDF uploads with magic-byte, size, page-count, path, and encryption validation
- Background analysis/proposal/email states with retryable failures
- Normalized dates and monetary values plus Alembic migrations
- Evidence quotes verified against extracted PDF text
- Company-aware fit scoring; no score is shown until a useful company profile exists
- Editable, versioned proposal drafts
- Page-by-page compliance matrix with ownership, readiness, and verified source evidence
- Explainable Go/No-Go decisions across eligibility, technical, financial, documentation, and timeline fit
- Human-verified company knowledge vault used as the only source for proposal claims
- Addendum change detection, proposal coverage, true version snapshots, chunked AI analysis, retries, and response caching
- Docker Compose, CI, typed frontend APIs, and backend integration tests

AI output remains a review aid. Users must verify all requirements and proposal claims against the source tender.

## Local development

Requirements: Python 3.13, Node.js 22, and optionally Tesseract OCR.

1. Copy `.env.example` to `backend/.env` and set `SECRET_KEY` and `GEMINI_API_KEY`.
2. Start the backend:

   ```powershell
   cd backend
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements-dev.txt
   alembic upgrade head
   uvicorn main:app --reload
   ```

3. Start the frontend in another terminal:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

Open `http://localhost:3000`. API documentation is at `http://localhost:8000/docs`.

## Docker

Create a root `.env` containing at least a strong `SECRET_KEY`, then run:

```powershell
docker compose up --build
```

The Compose setup uses PostgreSQL and persistent volumes for database and uploaded files. Set `COOKIE_SECURE=true` and HTTPS origins in a real deployment.

## Verification

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest -q
.\venv\Scripts\python.exe -m alembic check

cd ..\frontend
npm run lint
npm run build
npm audit --omit=dev
```

## Database migrations

The project uses Alembic for schema versioning. Migrations run automatically on Docker startup (`alembic upgrade head` in the CMD). For local development:

```powershell
cd backend
.\venv\Scripts\python.exe -m alembic upgrade head      # apply pending
.\venv\Scripts\python.exe -m alembic check              # verify models match DB
.\venv\Scripts\python.exe -m alembic history            # show migration chain
.\venv\Scripts\python.exe -m alembic current            # show current revision
```

Or use the helper script:

```powershell
.\scripts\migrate.ps1           # upgrade to head
.\scripts\migrate.ps1 check     # verify sync
.\scripts\migrate.ps1 new       # auto-generate migration from model changes
.\scripts\migrate.ps1 history   # list all migrations
```

Alembic `env.py` reads `DATABASE_URL` from config (sync driver — `psycopg` for PostgreSQL, `sqlite` for local dev). The async engine is a separate concern used only at runtime. To generate a new migration after changing `models.py`:

```powershell
.\scripts\migrate.ps1 new -Message "Add column X to table Y"
```

## Production notes

- Run `alembic upgrade head` before starting the API.
- Store secrets in the platform secret manager, not `.env` files in source control.
- Use object storage and malware scanning for public, multi-tenant deployments.
- FastAPI background tasks keep local setup simple. For multi-instance deployment, route jobs through a durable queue such as Redis/Celery and make workers idempotent.
- Replace the included single-process rate limiter with a shared Redis-backed limiter when scaling horizontally.
