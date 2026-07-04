# BidWise AI — Project Summary

## 1. Overview

BidWise AI is a full-stack web application that helps businesses analyze government tenders, assess bid fit, generate compliance matrices, and produce proposal drafts using AI. Users upload tender PDFs; the system extracts requirements, deadlines, budgets, and eligibility criteria via Google Gemini 2.0 Flash, scores the tender across 5 dimensions (eligibility, technical fit, financial fit, documentation, timeline), and recommends GO / NO_GO / REVIEW. A company Knowledge Vault stores certified evidence used for automatic compliance matching. The proposal workspace supports versioning and a review/approval workflow (draft → in_review → approved / changes_requested).

Multi-tenant by design: users belong to organizations with role-based access (admin, bid_manager, reviewer, employee). Production-ready with async SQLAlchemy, PostgreSQL, Docker Compose, Alembic migrations, structured logging, and CI/CD.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Backend framework | Python 3.13, FastAPI |
| ORM | SQLAlchemy 2.0 (async for routes, sync for background tasks + Alembic) |
| API validation | Pydantic v2 |
| AI | Google Gemini 2.0 Flash + local deterministic fallback |
| Database | SQLite 3 (dev) / PostgreSQL 17 (production via Docker) |
| Auth | JWT (python-jose) + HttpOnly cookies, bcrypt password hashing |
| Async driver | aiosqlite (dev) / asyncpg (production) |
| Sync driver | pypysqlite (dev) / psycopg[binary] (production) |
| Migrations | Alembic with batch mode + compare_type |
| PDF handling | pypdf, pypdfium2, pytesseract (OCR) |
| Frontend | Next.js 16.2.9, React 19.2.4, TypeScript 5, Tailwind CSS v4 |
| Charts | recharts 3.9.0 |
| PDF export | jsPDF 4.2.1 |
| Containerization | Docker Compose (4 services) |
| CI/CD | GitHub Actions (lint → test → build → Docker push to GHCR) |
| Linter | ruff 0.17.0 |
| Test framework | pytest 9.1.1 + httpx 0.28.1 |

---

## 3. Architecture

```
Client Browser
      |
      | HTTP / HTTPS
      v
Next.js (port 3000) — SSR + Client Components
      |
      | fetch() with credentials: "include"
      v
FastAPI (port 8000) — 11 route modules, 46 endpoints
      |
      |── async_engine (runtime) — aiosqlite / asyncpg
      |── sync_engine  (background tasks, Alembic) — pysqlite / psycopg
      |
      v
SQLite (dev) or PostgreSQL 17 (production)
```

In Docker Compose, 4 services run:
- `database` — PostgreSQL 17 with healthcheck
- `backend` — FastAPI + Uvicorn (CMD: `alembic upgrade head && uvicorn`)
- `frontend` — Next.js standalone build
- `reminder-worker` — standalone Python daemon polling for due reminders

---

## 4. Backend — File-by-File

### 4.1 Entry & Configuration

#### `main.py` (128 lines)
FastAPI application bootstrap. Middleware stack (outermost first):
1. `RequestIDMiddleware` — UUID per request, `X-Request-ID` response header
2. `RequestLoggingMiddleware` — structured method/path/status/duration/user logging
3. `RequestBodySizeMiddleware` — 5 MB JSON body limit
4. `CSRFTokenMiddleware` — only in production; validates `X-CSRF-Token` header against cookie
5. `RateLimitMiddleware` — 3 instances: 30 req/60s (upload, register, login, invite), 10 req/60s (proposal generate), 30 req/60s (general)
6. `CORSMiddleware` — configurable origins

Three exception handlers:
- `RequestValidationError` (422) — returns per-field errors with `request_id`
- `HTTPException` — passthrough with `request_id`
- `Exception` (500) — logs full traceback, returns generic message + `request_id`

`/health` endpoint verifies database connectivity via async query `SELECT 1`.

Registers 11 routers under `/v1` prefix.

#### `config.py` (74 lines)
Loads `.env` via `python-dotenv`. Exports:
- `_to_async_url()` — converts sync URL to async: `sqlite:///` → `sqlite+aiosqlite:///`, `postgresql+psycopg://` → `postgresql+asyncpg://`, `postgresql://` → `postgresql+asyncpg://`
- `IS_PRODUCTION` — derived from `APP_ENV == "production"`
- 21+ environment variables (see Section 17)
- Production guard: raises `RuntimeError` if `SECRET_KEY` is missing in production
- Auto-generates ephemeral `SECRET_KEY` in dev with warning

#### `database.py` (27 lines)
Creates two engines from the same `DATABASE_URL`:
- `async_engine` — via `create_async_engine(ASYNC_DATABASE_URL)` for runtime routes
- `sync_engine` — via `create_engine(DATABASE_URL)` for Alembic + background tasks
- `AsyncSessionLocal` — `async_sessionmaker(expire_on_commit=False)`
- `SyncSessionLocal` — `sessionmaker`
- `get_db()` — async context manager yielding `AsyncSession`, used as FastAPI dependency

SQLite pragma: forces `foreign_keys(1)` and `check_same_thread=False` for async engine.

### 4.2 Auth & Multi-Tenant

#### `auth.py` (65 lines)
- `hash_password()` — bcrypt with gensalt
- `verify_password()` — constant-time comparison (via bcrypt.checkpw)
- `create_access_token()` — JWT with sub (user_id), email, iat, exp (configurable minutes)
- `get_current_user` — FastAPI dependency; checks HttpOnly cookie first, then `Authorization: Bearer` header; decodes JWT, queries user from DB; raises 401 if invalid/expired

Uses `HTTPBearer(auto_error=False)` so cookie-based auth doesn't require the header.

#### `tenant.py` (58 lines)
- `active_organization_id()` — returns `user.active_organization_id` or raises 403
- `current_membership()` — fetches `Membership` row; auto-sets `active_organization_id` if unset
- `validate_role()` — validates role string against `{"admin", "bid_manager", "reviewer", "employee"}`
- `ensure_can_invite()` — enforces role hierarchy: admin can invite any role, bid_manager can invite reviewer/employee, reviewer/employee cannot invite
- `require_roles()` — returns a FastAPI dependency that checks membership role against allowed list

Invitation hierarchy: `admin > bid_manager > reviewer > employee`

#### `dependencies.py` (26 lines)
- `visible_tender_filter()` — SQLAlchemy `or_` clause: tender belongs to current org OR tender has no org and belongs to current user (legacy data)
- `get_visible_tender()` — fetches tender by ID with visibility filter; raises 404

#### `rate_limit.py` (39 lines)
- `InMemoryRateLimiter` — per-IP sliding-window rate limiter using `deque[float]` + threading lock
- `auth_limiter` — pre-configured instance: 10 requests per 60 seconds for auth endpoints
- `reset()` — clears all hits (used in test fixtures)

### 4.3 Middleware

#### `middleware.py` (110 lines) — 5 custom ASGI middleware classes

| Middleware | Position | Purpose |
|---|---|---|
| `RequestIDMiddleware` | 1st (outermost) | Generates UUID hex[:12] request ID if `X-Request-ID` header absent; attaches to `request.state.request_id` and response header |
| `RequestLoggingMiddleware` | 2nd | Logs `req= method= path= status= duration= user=` after each request |
| `RequestBodySizeMiddleware` | 3rd | Rejects requests with `Content-Length` > 5 MB |
| `CSRFTokenMiddleware` | 4th (production only) | Validates `X-CSRF-Token` header against `csrf_token` cookie on mutating methods; sets cookie on safe methods if absent |
| `RateLimitMiddleware` | 5th | Per-IP sliding-window limiting; configurable per path prefix (3 instances registered in main.py) |

`RateLimitMiddleware` is instantiated 3 times in `main.py` with different scopes and limits.

### 4.4 Models

#### `models.py` (314 lines) — 17 SQLAlchemy ORM classes

| # | Class | Table | Description | Key Columns |
|---|-------|-------|-------------|-------------|
| 1 | `User` | `users` | User accounts with profile | id, name, email (unique, indexed), password, company, phone, capabilities, certifications, years_experience, annual_turnover, created_at, active_organization_id (FK → organizations, SET NULL) |
| 2 | `Organization` | `organizations` | Multi-tenant workspaces | id, name, slug (unique, indexed), plan (default "starter"), created_at |
| 3 | `Membership` | `memberships` | User↔Organization join | id, organization_id (FK → organizations, CASCADE), user_id (FK → users, CASCADE), role (indexed), UniqueConstraint(org, user), created_at |
| 4 | `OrganizationInvitation` | `organization_invitations` | Pending invitations | id, organization_id (FK), email (indexed), role, token (unique, indexed), invited_by (FK → users), accepted_at, expires_at, created_at |
| 5 | `Tender` | `tenders` | Uploaded tender PDF with AI analysis | id, user_id (FK), organization_id (FK, indexed), filename, filepath, tender_name, department, deadline, deadline_date (indexed), budget, budget_amount, currency, eligibility_criteria, required_documents, summary, risk_analysis, bid_success_score, 5 dimension scores, recommendation, recommendation_reasons (JSON), estimated_effort_hours, cost_estimation, source_references (JSON), analysis_confidence, analysis_error, status (indexed), is_favorite, created_at, updated_at, analysis_started_at, analysis_completed_at |
| 6 | `Proposal` | `proposals` | Generated proposal draft | id, tender_id (FK), user_id (FK), technical_proposal, cover_letter, executive_summary, scope_of_work, status, error, version, approval_status (indexed), submitted_by (FK), reviewed_by (FK), review_comment, submitted_at, reviewed_at, created_at, updated_at |
| 7 | `ProposalVersion` | `proposal_versions` | Versioned snapshots of proposal | id, proposal_id (FK), version, 4 content columns, created_at |
| 8 | `KnowledgeItem` | `knowledge_items` | Company evidence vault | id, user_id (FK), organization_id (FK), category (indexed), title, content, reference, expires_on, is_verified, created_at, updated_at |
| 9 | `ComplianceRequirement` | `compliance_requirements` | Extracted requirements with company-match status | id, tender_id (FK), requirement, category (indexed), is_mandatory, source_page, source_quote, company_match, company_evidence, missing_proof, responsible_employee, status (indexed), notes, created_at, updated_at |
| 10 | `TenderAddendum` | `tender_addenda` | Uploaded addenda with change diffs | id, tender_id (FK), filename, filepath, summary, changes (JSON), status, created_at |
| 11 | `AIAnalysisCache` | `ai_analysis_cache` | Gemini response cache (SHA256 keyed) | id, content_hash (unique, indexed), operation, model, response_json, created_at (indexed); includes `evict_expired()` classmethod |
| 12 | `Competitor` | `competitors` | Extracted competitor analysis | id, tender_id (FK), name, estimated_winning_amount, win_probability, evidence, is_ai_estimate, created_at |
| 13 | `Notification` | `notifications` | In-app/email notification records | id, user_id (FK), organization_id (FK), tender_id (FK, SET NULL), subject, body, status, error, email_sent, created_at |
| 14 | `Activity` | `activities` | Audit trail for user actions | id, user_id (FK), organization_id (FK), tender_id (FK, SET NULL), action, details, created_at |
| 15 | `ProposalReviewComment` | `proposal_review_comments` | Review workflow comments | id, proposal_id (FK), user_id (FK), action, comment, created_at |
| 16 | `Reminder` | `reminders` | Scheduled deadline/document/review reminders | id, organization_id (FK), tender_id (FK), created_by (FK), recipient_user_id (FK), remind_at (indexed), reminder_type, status (indexed), created_at |
| 17 | `TenderChatMessage` | `tender_chat_messages` | AI assistant Q&A history | id, organization_id (FK), tender_id (FK), user_id (FK), question, answer, citations (JSON), created_at |

### 4.5 Schemas

#### `schemas.py` (358 lines) — 31+ Pydantic v2 models

| Schema | Purpose | Key fields |
|--------|---------|------------|
| `RegisterSchema` | Registration input | name (2-120), email (EmailStr), password (10-128) |
| `LoginSchema` | Login input | email, password |
| `ProfileUpdateSchema` | Profile edit (all optional) | name, company, phone, capabilities, certifications, years_experience, annual_turnover |
| `UserProfileSchema` | Profile response | id, name, email, company, phone, capabilities, certifications, years_experience, annual_turnover, created_at, active_organization_id, organization_name, role |
| `OrganizationResponse` | Org list/create response | id, name, slug, plan, role, member_count |
| `OrganizationCreate` | Org creation input | name (2-200) with whitespace normalization |
| `InvitationCreate` | Invite input | email (EmailStr), role (literal union) |
| `InvitationResponse` | Invite response | id, email, role, token, expires_at, accepted_at |
| `InvitationPreview` | Public invite preview | email, role, organization_name, expires_at |
| `MembershipResponse` | Member list item | id, user_id, name, email, role |
| `SourceReference` | Single evidence citation | field, page, quote |
| `TenderResponse` | Full tender detail | All tender columns |
| `TenderListResponse` | Tender list item | Subset of tender columns |
| `ProposalUpdateSchema` | Proposal save/update | 4 content sections with max_length constraints |
| `ProposalResponse` | Proposal response | All proposal columns + approval workflow fields |
| `ProposalReviewRequest` | Review action input | action (literal: submit/approve/request_changes/return_to_draft), comment |
| `ProposalReviewCommentResponse` | Review comment response | id, user_id, action, comment, created_at |
| `ProposalVersionResponse` | Version response | id, version, 4 content sections, created_at |
| `KnowledgeItemCreate` | Knowledge input | category (8-value literal), title, content, reference, expires_on, is_verified |
| `KnowledgeItemResponse` | Knowledge response | Extends KnowledgeItemCreate with id, created_at, updated_at |
| `ComplianceRequirementResponse` | Requirement detail | All compliance columns |
| `ComplianceRequirementUpdate` | Requirement edit | responsible_employee, status, notes, company_match, company_evidence, missing_proof |
| `AddendumResponse` | Addendum response | id, tender_id, filename, summary, changes, status, created_at |
| `TenderChatRequest` | Chat question input | question (3-2000) |
| `TenderChatResponse` | Chat response | id, question, answer, citations, created_at |
| `DecisionSummary` | Decision engine output | overall_score, scores (dict), recommendation, reasons, estimated_effort_hours, compliance_total/ready/blocked, proposal_coverage |
| `CompetitorResponse` | Competitor response | id, name, estimated_winning_amount, win_probability, evidence, is_ai_estimate |
| `NotificationResponse` | Notification response | id, subject, body, status, error, email_sent, created_at |
| `ReminderCreate` | Reminder creation input | tender_id, recipient_user_id, remind_at, reminder_type (literal) |
| `ReminderResponse` | Reminder response | id, tender_id, recipient_user_id, remind_at, reminder_type, status, created_at |
| `DashboardResponse` | Dashboard stats | total_tenders, active_bids, avg_success_score, total_revenue_opportunity, upcoming_deadlines, recent_tenders, blocked_requirements, pending_approvals, team_members |
| `AnalyzeResponse` | Tender + competitors | tender (TenderResponse), competitors (list) |
| `SendEmailSchema` | Notification send input | tender_id, notification_type (literal) |
| `ActivityResponse` | Activity feed item | id, tender_id, action, details, created_at |

---

## 5. All 46 API Endpoints

### Authentication (`/v1/auth`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| POST | `/v1/auth/register` | `register` | Create account + org + admin membership | No | — |
| POST | `/v1/auth/login` | `login` | Authenticate, set HttpOnly cookie | No | — |
| POST | `/v1/auth/logout` | `logout` | Delete session cookie | Yes | Any |
| GET | `/v1/auth/profile` | `get_profile` | Get current user + org + role | Yes | Any |
| PUT | `/v1/auth/profile` | `update_profile` | Update profile fields | Yes | Any |

### Tenders (`/v1/tenders`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| POST | `/v1/tenders/upload` | `upload_tender` | Upload PDF, queue analysis | Yes | admin, bid_manager |
| GET | `/v1/tenders` | `list_tenders` | List tenders (paginated) | Yes | Any |
| GET | `/v1/tenders/{id}` | `get_tender` | Get tender detail + competitors | Yes | Any |
| POST | `/v1/tenders/{id}/analyze` | `retry_analysis` | Re-run AI analysis | Yes | admin, bid_manager |
| POST | `/v1/tenders/{id}/favorite` | `toggle_favorite` | Toggle favorite status | Yes | Any |
| DELETE | `/v1/tenders/{id}` | `delete_tender` | Delete tender + files + child rows | Yes | admin, bid_manager |
| GET | `/v1/tenders/{id}/compliance-matrix` | `download_compliance_matrix` | Download compliance CSV | Yes | admin, bid_manager, reviewer |

### Proposals (`/v1/proposals`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| POST | `/v1/proposals/generate/{tender_id}` | `generate` | Queue proposal generation | Yes | admin, bid_manager |
| GET | `/v1/proposals/{tender_id}` | `get_proposal` | Get proposal (or status) | Yes | Any |
| PUT | `/v1/proposals/{tender_id}` | `update_proposal` | Save edited proposal + version | Yes | admin, bid_manager |
| GET | `/v1/proposals/{tender_id}/versions` | `proposal_versions` | List version history | Yes | Any |
| POST | `/v1/proposals/{tender_id}/review` | `review_proposal` | Submit/approve/request_changes/return_to_draft | Yes | Varies by action |
| GET | `/v1/proposals/{tender_id}/reviews` | `review_history` | List review comments | Yes | Any |

Review workflow transitions:
- `submit`: admin/bid_manager from draft/changes_requested → in_review
- `approve`: admin/reviewer from in_review → approved
- `request_changes`: admin/reviewer from in_review → changes_requested
- `return_to_draft`: admin/bid_manager from in_review/changes_requested → draft

### Organizations (`/v1/organizations`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/organizations` | `organizations` | List user's organizations | Yes | Any |
| POST | `/v1/organizations` | `create_organization` | Create new organization | Yes | Any |
| POST | `/v1/organizations/{id}/switch` | `switch` | Switch active organization | Yes | Member |
| GET | `/v1/organizations/members` | `members` | List members (role-sorted) | Yes | Any |
| POST | `/v1/organizations/invitations` | `invite` | Invite user by email | Yes | admin (any), bid_manager (reviewer/employee) |
| GET | `/v1/organizations/invitations/{token}` | `invitation_preview` | Preview invitation (public) | No | — |
| POST | `/v1/organizations/invitations/{token}/accept` | `accept` | Accept invitation | Yes | Email must match |
| PUT | `/v1/organizations/members/{id}/{role}` | `change_role` | Change member role | Yes | admin |
| DELETE | `/v1/organizations/members/{id}` | `remove_member` | Remove member | Yes | admin |

### Knowledge Vault (`/v1/knowledge`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/knowledge` | `list_items` | List knowledge items (paginated) | Yes | Any |
| POST | `/v1/knowledge` | `create_item` | Create knowledge item, refresh decisions | Yes | admin, bid_manager |
| PUT | `/v1/knowledge/{id}` | `update_item` | Update item, refresh decisions | Yes | admin, bid_manager |
| DELETE | `/v1/knowledge/{id}` | `delete_item` | Delete item, refresh decisions | Yes | admin, bid_manager |

### Bid Decision Engine (`/v1/tenders`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/tenders/{id}/compliance` | `compliance` | Get compliance matrix with evidence matching | Yes | Any |
| PUT | `/v1/tenders/{id}/compliance/{req_id}` | `update_compliance` | Update requirement status, refresh decision | Yes | Any |
| GET | `/v1/tenders/{id}/decision` | `decision` | Get decision summary with scores | Yes | Any |
| GET | `/v1/tenders/{id}/document` | `document` | View PDF inline | Yes | Any |
| GET | `/v1/tenders/{id}/addenda` | `list_addenda` | List addenda | Yes | Any |
| POST | `/v1/tenders/{id}/addenda` | `upload_addendum` | Upload addendum with diff detection | Yes | Any |

### Tender Assistant Chat (`/v1/tenders`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/tenders/{id}/chat` | `history` | Get chat history (last 100) | Yes | Any |
| POST | `/v1/tenders/{id}/chat` | `ask` | Ask question about tender | Yes | Any |

### Reminders (`/v1/reminders`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/reminders` | `list_reminders` | List organization reminders | Yes | Any |
| POST | `/v1/reminders` | `create_reminder` | Schedule reminder | Yes | admin, bid_manager |
| DELETE | `/v1/reminders/{id}` | `cancel_reminder` | Cancel reminder | Yes | Any |

### Dashboard (`/v1/dashboard`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/dashboard` | `dashboard` | Aggregated organization stats | Yes | Any |

### Notifications (`/v1/notifications`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| POST | `/v1/notifications/send` | `send_notification` | Queue and send email | Yes | Any |
| GET | `/v1/notifications` | `list_notifications` | List notifications (paginated) | Yes | Any |

### Activities (`/v1/activities`)

| Method | Path | Handler | Purpose | Auth | Roles |
|--------|------|---------|---------|------|-------|
| GET | `/v1/activities` | `list_activities` | List activity timeline (paginated) | Yes | Any |

### System

| Method | Path | Handler | Purpose | Auth |
|--------|------|---------|---------|------|
| GET | `/health` | `health` | Health check with DB verification | No |

---

## 6. Services

### `gemini_service.py` (401 lines)
- `_get_client()` — singleton Gemini client (google-genai SDK)
- `_call_gemini()` — core AI call with retry (3 attempts), SHA256 caching, quota detection, temperature
- `_page_chunks()` — splits PDF text into ~24K-char page-range chunks
- `_extract_chunk()` — per-chunk extraction of facts + requirements
- `analyze_tender_pdf()` — full pipeline: chunk → extract → verify evidence → synthesize → validate with `TenderAnalysis` Pydantic model
- `generate_proposal()` — generates 4 sections independently (technical, cover letter, exec summary, scope of work)
- `local_analyze_tender_pdf()` — deterministic regex-based extraction when Gemini quota is exhausted
- `local_generate_proposal()` — template-based proposal when Gemini is unavailable
- `is_gemini_configured()` — checks `GEMINI_API_KEY` presence
- `QuotaExceededError` — custom exception for 429 / RESOURCE_EXHAUSTED

Evidence verification: cross-checks AI quotes against actual PDF text page-by-page; discards hallucinated quotes.

### `job_service.py` (195 lines)
Sync background job runners (use `SyncSessionLocal`):
- `process_tender_analysis()` — status progression: queued → extracting → analyzing → analyzed (or failed); runs AI analysis + compliance enrichment + decision scoring
- `process_proposal_generation()` — generates 4-section proposal via Gemini, saves version snapshot
- `process_notification()` — sends email via SMTP, updates notification status

All three handle `QuotaExceededError` with local fallback, rollback on failure, and activity logging.

### `decision_service.py` (97 lines)
- `match_requirement()` — term-overlap scoring between requirement text and knowledge items; returns (match, evidence, missing_proof)
- `enrich_requirements()` — batch-updates company_match/company_evidence/missing_proof on all requirements
- `calculate_decision()` — 5-dimension weighted scoring: eligibility (30%), technical (25%), financial (20%), documentation (15%), timeline (10%); recommends GO (≥70, no mandatory gaps) / NO_GO (mandatory gaps) / REVIEW
- `apply_decision()` — writes all scores to Tender model

### `pdf_service.py` (170 lines)
- `save_uploaded_pdf()` — async upload with magic-byte validation (%PDF-), content-type check, size limit (15 MB), path traversal protection, UUID filename
- `_validate_pdf()` — pypdf validation: encryption check, page count (max 250), readability
- `extract_text_from_pdf()` — hybrid extraction: pypdf for text-based pages + OCR (pypdfium2 + pytesseract) for scanned/blank pages
- `_extract_text_hybrid()` — per-page logic: if page text is empty and OCR available, render + OCR; otherwise use pypdf
- `delete_uploaded_file()` — safe deletion with path traversal guard

### `analytics_service.py` (38 lines)
- `get_dashboard_stats()` — sync query aggregating: total tenders, active bids, avg success score, total revenue (INR formatted: Cr/L/₹), upcoming deadlines, recent tenders, blocked requirements, pending approvals, team size
- `_format_inr()` — formats Decimal as ₹X.XCr / ₹X.XL / ₹X,XXX

### `chat_service.py` (29 lines)
- `answer_question()` — keyword matching against PDF pages; returns top 4 cited excerpts + Gemini-enriched answer (or direct citation response if quota exhausted)

### `email_service.py` (38 lines)
- `send_email()` — SMTP with STARTTLS; returns boolean success
- `build_notification_body()` — templates for 3 notification types (deadline_reminder, missing_document, proposal_ready)

### `reminder_service.py` (26 lines)
- `process_due_reminders()` — sync polling: finds scheduled reminders past due, sends email, creates in-app Notification row, marks reminder as sent

---

## 7. Background Worker

### `reminder_worker.py` (33 lines)
Standalone daemon (`python -m reminder_worker`) that:
- Polls `reminders` table every 30 seconds for due reminders
- Calls `process_due_reminders()`
- Handles SIGTERM/SIGINT for graceful shutdown
- Runs as a separate Docker Compose service (`reminder-worker`)

---

## 8. Database Migrations

### `env.py` (50 lines)
- Reads `DATABASE_URL` from config, passes to Alembic (escaped `%` → `%%`)
- Renders as batch (SQLite compatibility)
- `compare_type=True` for column-level diff detection
- Imports models to register metadata

### Migration Versions

| Version | Purpose |
|---------|---------|
| `0001_production_foundation` | Initial schema from models |
| `0002_bid_decision_engine` | Adds decision scores, knowledge_items, compliance_requirements, tender_addenda, proposal_versions, ai_analysis_cache |
| `0003_team_saas` | Adds organizations, memberships, invitations, proposal_review_comments, reminders, tender_chat_messages; adds organization_id + approval_status columns |
| `314c4ccd7b9d_sync_model_constraints_and_indexes` | Idempotently adds 33 missing indexes + FK on `users.active_organization_id` |

---

## 9. Frontend — Page-by-Page

### 9.1 Public Pages

| Route | File | Lines | Purpose |
|-------|------|-------|---------|
| `/` | `page.tsx` | 71 | Landing page with hero, feature cards, CTA buttons |
| `/login` | `login/page.tsx` | 75 | Login form with email/password, error handling, redirect support |
| `/register` | `register/page.tsx` | 84 | Registration form with name/email/password |
| `/invite/[token]` | `invite/[token]/page.tsx` | 99 | Invitation acceptance: previews org/role/expiry, handles auth/email mismatch states |

### 9.2 Authenticated Pages (under `(app)` layout)

| Route | File | Lines | Purpose |
|-------|------|-------|---------|
| `/dashboard` | `dashboard/page.tsx` | 128 | KPI cards, bar chart (bid scores), pie chart (pipeline), upcoming deadlines, recent tenders |
| `/tenders` | `tenders/page.tsx` | 99 | Card grid with status/score/budget, favorite toggle, delete with confirm, upload CTA |
| `/tenders/[id]` | `tenders/[id]/page.tsx` | 242 | Detail view: metrics bar, ExecutiveSummary, BriefCards, DecisionWorkbench, AI chat, deadline reminders, addenda |
| `/tenders/upload` | `tenders/upload/page.tsx` | 78 | Drag-drop PDF upload with file validation, progress indicator |
| `/proposals/[tenderId]` | `proposals/[tenderId]/page.tsx` | 205 | 4-section editor, generate/save/export PDF, version history, approval workflow, compliance readiness |
| `/knowledge` | `knowledge/page.tsx` | 50 | Knowledge Vault CRUD: form + card grid, category/verified/expiry fields |
| `/team` | `team/page.tsx` | 290 | Member list with role dropdown, invite with role selection/permissions, company switcher/creator |
| `/calendar` | `calendar/page.tsx` | 97 | Month navigation, deadline dots per day, sorted deadline list |
| `/compare` | `compare/page.tsx` | 105 | Side-by-side comparison (up to 3 tenders): table with key metrics |
| `/activities` | `activities/page.tsx` | 77 | Activity timeline with icons per action type, tender links |
| `/notifications` | `notifications/page.tsx` | 53 | Notification list with email status, subject/body, timestamps |
| `/profile` | `profile/page.tsx` | 81 | Company profile editor: name/company/phone/experience/turnover/capabilities/certifications |

### 9.3 Layouts

| File | Lines | Purpose |
|------|-------|---------|
| `layout.tsx` (root) | ~10 | Root layout with html/body tags |
| `(app)/layout.tsx` | 27 | Authenticated layout: AuthProvider + AuthGuard + Sidebar + Navbar + scrollable main area |

### 9.4 Components

| Component | Lines | Purpose |
|-----------|-------|---------|
| `AuthGuard.tsx` | 39 | Redirects unauthenticated users to `/login`, unauthorized roles to `/tenders`, loading spinner |
| `DecisionWorkbench.tsx` | 117 | Tabbed panel: Decision (score bars), Compliance (requirement cards with owner/status/evidence), Evidence (PDF iframe), Addenda (upload with diff) |
| `Navbar.tsx` | 16 | Top bar with hamburger menu (mobile), system status indicator |
| `Sidebar.tsx` | 75 | Role-filtered nav items, branding, user avatar/name/org, logout, mobile overlay |
| `Toast.tsx` | 54 | Auto-dismissing success/error/info toasts, global `showToast()` |
| `ToastProvider.tsx` | 7 | Thin wrapper rendering `ToastContainer` in root layout |

### 9.5 Lib

#### `api.ts` (150 lines)
Typed API client with `request<T>()` helper:
- Automatic `credentials: "include"` for cookies
- JSON/FormData content-type detection
- 401 redirect to `/login` (browser only)
- Error parsing from response body
- `download()` helper for blob responses
- `uploadFile()` / `uploadAddendum()` for multipart uploads

API namespaces: `auth`, `tenders`, `proposals`, `organizations`, `notifications`, `dashboard`, `activities`, `knowledge`, `reminders`, `chat` (12 namespaces, 30+ methods)

#### `types.ts` (270 lines)
24 TypeScript interfaces: `UserProfile`, `ProfileUpdate`, `TenderSummary`, `Tender`, `Competitor`, `TenderDetail`, `Proposal`, `ProposalVersion`, `ProposalUpdate`, `DashboardStats`, `Activity`, `Notification`, `KnowledgeItem`, `KnowledgeItemInput`, `ComplianceRequirement`, `DecisionSummary`, `Addendum`, `Organization`, `Membership`, `Invitation`, `InvitationPreview`, `Reminder`, `TenderChatMessage`, `ProposalReviewComment`

Plus helpers: `errorMessage()`, `displayScore()`, `scoreColor()`

#### `AuthContext.tsx` (67 lines)
React Context for auth state:
- `useAuth()` hook exposing: `user`, `loading`, `login`, `register`, `logout`, `refreshUser`
- Auto-fetches profile on mount
- `login()` / `register()` call API then `refreshUser()`
- `logout()` clears state + redirects to `/login`

### 9.6 Config Files

| File | Lines | Purpose |
|------|-------|---------|
| `next.config.ts` | 7 | `output: "standalone"` for Docker builds |
| `package.json` | 32 | Dependencies: Next.js 16.2.9, React 19.2.4, recharts 3.9.0, jsPDF 4.2.1 |
| `tsconfig.json` | 34 | ES2017 target, bundler resolution, strict mode, `@/*` path alias |
| `eslint.config.mjs` | 18 | ESLint flat config: Next.js core-web-vitals + TypeScript rules |
| `postcss.config.mjs` | 7 | PostCSS config: Tailwind CSS v4 plugin |

---

## 10. AI Integration

### Model
- Primary: `gemini-2.0-flash` (configurable via `GEMINI_MODEL`)
- Fast extraction: `gemini-2.0-flash` (configurable via `GEMINI_FAST_MODEL`)

### Pipeline
1. **Upload** → PDF saved to `uploads/{user_id}/{uuid}.pdf`
2. **Extraction** → text extracted via pypdf (+ OCR fallback)
3. **Chunking** → text split into ~24K-char page-range chunks
4. **Per-chunk extraction** → each chunk processed by fast model for facts + requirements
5. **Synthesis** → all chunks combined, bounded to 120K chars, sent to main model for structured analysis
6. **Evidence verification** → all AI citations cross-checked against actual PDF text
7. **Deduplication** → duplicate requirements removed
8. **Compliance enrichment** → requirements matched against Knowledge Vault via term overlap
9. **Decision scoring** → 5-dimension weighted calculation

### Caching
- SHA256 hash of `operation:model:prompt` as key
- SQLite/PostgreSQL `ai_analysis_cache` table
- TTL: 30 days (configurable via `AI_CACHE_TTL_DAYS`)
- `evict_expired()` classmethod for cleanup

### Fallback
When Gemini quota is exhausted (429/RESOURCE_EXHAUSTED):
- `local_analyze_tender_pdf()` uses regex patterns to extract tender title, authority, deadline, budget, requirements (via normative sentence matching)
- `local_generate_proposal()` creates template-based proposal with `[REVIEW REQUIRED]` markers

### Prompt Design
- System instructions explicitly state the source is untrusted (prompt injection defense)
- JSON-only responses with Pydantic validation
- Each proposal section generated independently (4 separate prompts)
- Evidence citations required with exact page numbers and quotes

---

## 11. Security

| Layer | Mechanism |
|---|---|
| Authentication | JWT (HS256) in HttpOnly cookies, optional Bearer header |
| Password storage | bcrypt with gensalt |
| Password policy | minimum 10 characters |
| CSRF | Token in cookie + `X-CSRF-Token` header (production only) |
| Rate limiting | 3 scopes: auth endpoints (10/60s), upload+register+login+invite (30/60s), proposal generate (10/60s) |
| Input validation | Pydantic schemas on all endpoints |
| Path traversal | Upload path resolved + checked against allowed directory |
| File validation | Magic bytes (%PDF-), content-type, size limit (15 MB), page limit (250), encryption check |
| Multi-tenant isolation | All queries scoped by `organization_id` via `visible_tender_filter()` |
| Role-based access | 4 roles: admin > bid_manager > reviewer > employee; enforced via `require_roles()` |
| Session expiry | JWT configurable lifetime (default 60 min) |
| Cookie flags | HttpOnly, SameSite=lax (configurable), Secure in production |
| CORS | Configurable origins, credentials allowed, methods restricted |

---

## 12. Infrastructure

### Docker Compose (4 services)

| Service | Image | Port | Healthcheck | Restart |
|---------|-------|------|-------------|---------|
| `database` | postgres:17-alpine | — | `pg_isready -U bidwise` (5s interval, 10 retries) | unless-stopped |
| `backend` | ./backend | 8000 | HTTP GET `/health` (10s interval, 5 retries, 30s start_period) | unless-stopped |
| `frontend` | ./frontend | 3000 | — | unless-stopped |
| `reminder-worker` | ./backend | — | — | unless-stopped |

Volumes: `postgres_data` (persistent DB), `uploads` (shared PDF storage)

### Dockerfile (backend)
- Base: `python:3.13-slim`
- Installs: Tesseract OCR, Python dependencies from `requirements.txt`
- User: non-root `bidwise`
- CMD: `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers`

### CI/CD

#### CI (`.github/workflows/ci.yml`)
Triggers: push/PR to `main`
Jobs:
1. **backend** (ubuntu-latest): install Tesseract + Python deps → `ruff check .` → `alembic check` → `pytest -q --tb=short`
2. **frontend** (ubuntu-latest): `npm ci` → `npm run lint` → `npm run build`
3. **docker** (on main only, needs backend + frontend): Build backend + frontend images with GitHub Actions cache

#### Publish (`.github/workflows/publish.yml`)
Triggers: tag `v*`
- Builds + pushes backend and frontend Docker images to `ghcr.io/{repo}/backend` and `ghcr.io/{repo}/frontend`
- Tags: semver pattern (e.g., `v1.2.3` → `1.2.3`)
- Cache: GitHub Actions cache

#### Dependabot (`.github/dependabot.yml`)
Weekly updates for: pip, npm, Docker; monthly for GitHub Actions

---

## 13. Production Readiness Checklist

| Phase | Status | Details |
|-------|--------|---------|
| 1. Async SQLAlchemy | ✅ | All 11 route files, auth, dependencies, tenant converted to `async def` with `select()`; dual engine pattern (async for routes, sync for background) |
| 2. PostgreSQL + Docker | ✅ | Docker Compose with healthchecks + restart policies; `_to_async_url()` conversion for async driver; `.env.example` files |
| 3. Alembic Migrations | ✅ | 4 migration files synced with models; `compare_type=True`; `alembic check` passes clean; idempotent index/FK creation |
| 4. Structured Logging | ✅ | `RequestIDMiddleware` (UUID per request), `RequestLoggingMiddleware` (key=value format), consistent `req=` prefix |
| 5. Error Handling | ✅ | 3 exception handlers (422/HTTP/500) all include `request_id`; validation errors return per-field details |
| 6. CI/CD | ✅ | GitHub Actions: lint → test → build → Docker push; Dependabot for dependency updates |

---

## 14. Project Stats

| Category | Count |
|----------|-------|
| Backend Python files | 12 |
| Route files | 11 |
| Route handlers | 46 |
| Background job functions | 3 |
| Service files | 8 |
| Service functions | 15 |
| Database models | 17 |
| Migration versions | 4 |
| Pydantic schemas | 31 |
| Custom middleware classes | 5 |
| Test files | 6 |
| Test cases | 16 (all passing) |
| Frontend page files | 15 |
| Frontend components | 6 |
| Frontend lib files | 3 |
| Frontend TypeScript interfaces | 24 |
| Frontend config files | 6 |
| Docker Compose services | 4 |
| CI/CD workflows | 3 (ci, publish, dependabot) |
| Environment variables | 23 (21 settable + 2 computed) |
| Total backend Python lines | ~2,900 |
| Total frontend TSX/TS lines | ~2,200 |

---

## 15. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_ENV` | `development` | Environment; `production` enables strict mode, CSRF, secure cookies |
| `DATABASE_URL` | `sqlite:///./bidwise.db` | Sync DB connection string (SQLite or PostgreSQL+psycopg) |
| `SECRET_KEY` | (auto-generated in dev) | JWT signing secret; **required in production** |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT token lifetime |
| `AUTH_COOKIE_NAME` | `bidwise_session` | HttpOnly session cookie name |
| `COOKIE_SECURE` | `false` (true in production) | Secure flag for session cookie |
| `COOKIE_SAMESITE` | `lax` | SameSite policy (lax/strict/none) |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed CORS origins |
| `UPLOAD_DIR` | `backend/uploads` | PDF upload directory |
| `MAX_UPLOAD_BYTES` | `15728640` (15 MB) | Maximum PDF upload size |
| `MAX_PDF_PAGES` | `250` | Maximum allowed PDF pages |
| `MAX_AI_INPUT_CHARS` | `120000` | Max characters sent to Gemini per request |
| `GEMINI_API_KEY` | `""` | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Primary Gemini model |
| `GEMINI_FAST_MODEL` | `gemini-2.0-flash` | Fast model for chunk extraction |
| `AI_MAX_RETRIES` | `3` | Gemini API call retry count |
| `AI_CHUNK_CHARS` | `24000` | Characters per page-range chunk |
| `AI_CACHE_TTL_DAYS` | `30` | Days before AI response cache eviction |
| `SMTP_SERVER` | `smtp.gmail.com` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USERNAME` | `""` | SMTP auth username |
| `SMTP_PASSWORD` | `""` | SMTP auth password |
| `EMAIL_FROM` | `noreply@bidwise.ai` | Sender email address |

Computed (not settable directly):
- `ASYNC_DATABASE_URL` — derived from `DATABASE_URL` via `_to_async_url()`
- `IS_PRODUCTION` — derived from `APP_ENV == "production"`

---

## 16. Key Design Decisions

1. **Dual engine pattern**: Sync engine (`psycopg`/`pysqlite`) for Alembic + background tasks; async engine (`asyncpg`/`aiosqlite`) for runtime routes. Routes use `AsyncSession`, background jobs use `SyncSessionLocal`.

2. **Flat import style**: No `try/except ImportError` guard blocks anywhere in the codebase.

3. **Cookie-first auth**: JWT stored in HttpOnly cookie; Bearer header supported as fallback for API clients.

4. **AI fallback**: When Gemini quota is exhausted, deterministic local analysis ensures tender work never becomes unavailable.

5. **Evidence verification**: All AI-generated citations are cross-checked against actual PDF text; hallucinated quotes are discarded.

6. **Multi-tenant isolation**: All tender/knowledge/activity queries are scoped by `organization_id`. Legacy tenders without `organization_id` fall back to `user_id` match.

7. **Background tasks use sync DB**: `BackgroundTasks.add_task()` + `SyncSessionLocal()` avoids async context issues in thread pool workers.

8. **Idempotent migrations**: Index/FK creation uses `IF NOT EXISTS` checks — safe to run multiple times.

9. **Migrations run at container start**: Docker CMD runs `alembic upgrade head` before starting Uvicorn.
