<div align="center">

# BidWise AI

### AI-Powered Tender Analysis & Proposal Management Platform

![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-2ea44f?style=for-the-badge)

BidWise AI helps organizations analyze tender documents, evaluate bidding opportunities, manage compliance requirements, and generate high-quality proposal drafts using Artificial Intelligence.

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Workflow](#workflow)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Docker](#docker)
- [Verification](#verification)
- [Database Migrations](#database-migrations)
- [Security](#security)
- [My Contributions](#my-contributions)
- [Roadmap](#roadmap)
- [Production Recommendations](#production-recommendations)
- [Disclaimer](#disclaimer)
- [Author](#author)

---

## Overview

Organizations spend significant time reviewing tender documents, verifying eligibility, preparing compliance matrices, and drafting proposals. BidWise AI automates this using AI, document processing, and workflow automation, so teams can make faster, better-informed bidding decisions.

**The platform enables organizations to:**

| Capability | Description |
|---|---|
| 📄 Tender Analysis | Automatically analyze uploaded tender documents |
| ✅ Requirement Extraction | Extract eligibility and compliance requirements |
| 📊 Bid Readiness | Evaluate how ready the organization is to bid |
| 🚦 GO / NO-GO | Generate data-backed bidding recommendations |
| 📋 Compliance Tracking | Track compliance status against requirements |
| ✍️ Proposal Drafting | Generate AI-assisted proposal content |
| 🤝 Collaboration | Work together across teams and organizations |

---

## Features

<table>
<tr>
<td width="50%" valign="top">

### 🧠 AI-Powered Tender Analysis
- Tender PDF analysis
- Eligibility criteria extraction
- Requirement categorization
- Deadline & budget detection
- Risk assessment
- AI-generated summaries
- Evidence-linked requirement extraction

### ⚖️ Bid Decision Engine
- GO / NO-GO / REVIEW recommendations
- Eligibility scoring
- Technical capability scoring
- Financial fit analysis
- Documentation readiness
- Timeline feasibility
- Explainable recommendation reasons

### 📋 Compliance Management
- Compliance matrix generation
- Requirement ownership
- Readiness tracking
- Missing document identification
- Evidence verification
- Compliance monitoring

</td>
<td width="50%" valign="top">

### 📝 Proposal Generation
- Executive summaries
- Technical proposals
- Cover letters
- Scope of work generation
- Version management

### 🗄️ Knowledge Vault
- Company capabilities
- Certifications
- Experience records
- Evidence repository
- Organizational knowledge base

### 👥 Collaboration
- Multi-organization support
- Role-Based Access Control (RBAC)
- Review workflows
- Activity tracking
- Notifications
- Team management

### 💬 Tender Assistant
- AI-powered tender Q&A
- Context-aware responses
- Citation-supported answers
- Tender-specific conversations

### 📈 Dashboard
- Tender pipeline
- Revenue opportunities
- Upcoming deadlines
- Bid performance metrics
- Team insights

</td>
</tr>
</table>

---

## System Architecture

```mermaid
flowchart TD
    A[Next.js Frontend] --> B[FastAPI Backend]
    B --> C[Authentication Service]
    B --> D[Tender Analysis Engine]
    B --> E[Compliance Engine]
    B --> F[Bid Evaluation Engine]
    B --> G[Proposal Generator]
    B --> H[Notification Service]
    B --> I[Knowledge Vault]
    B --> J[AI Integration Layer]
    C --> K[(PostgreSQL Database)]
    D --> K
    E --> K
    F --> K
    G --> K
    H --> K
    I --> K
    J --> L[[Google Gemini AI]]
```

---

## Workflow

```mermaid
flowchart LR
    A[Upload Tender] --> B[AI Requirement Extraction]
    B --> C[Bid Readiness Evaluation]
    C --> D{GO / NO-GO Recommendation}
    D --> E[Compliance Matrix Generation]
    E --> F[Proposal Generation]
    F --> G[Review & Approval]
    G --> H[Submission Ready]
```

---

## Technology Stack

<table>
<tr>
<td valign="top" width="25%">

**Backend**
- FastAPI
- Python 3.12+
- SQLAlchemy 2.0
- Pydantic v2
- Alembic
- Uvicorn

</td>
<td valign="top" width="25%">

**Frontend**
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Recharts

</td>
<td valign="top" width="25%">

**AI & Document Processing**
- Google Gemini 2.0 Flash
- PyPDF
- PyPDFium2
- Tesseract OCR

</td>
<td valign="top" width="25%">

**Database & Security**
- PostgreSQL
- SQLite (Dev)
- JWT Authentication
- RBAC
- bcrypt

</td>
</tr>
</table>

**DevOps:** Docker · Docker Compose · GitHub Actions · Dependabot · CI/CD

---

## Project Structure

```text
BidWise-AI
│
├── backend/
│   ├── app/
│   ├── alembic/
│   ├── tests/
│   └── requirements-dev.txt
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── public/
│   └── package.json
│
├── docker-compose.yml
├── README.md
└── .env.example
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 22+
- PostgreSQL
- Tesseract OCR (Optional)

### Backend Setup

```bash
cd backend
python -m venv venv
```

**Windows**
```powershell
.\venv\Scripts\Activate.ps1
```

**Linux / macOS**
```bash
source venv/bin/activate
```

**Install dependencies**
```bash
pip install -r requirements-dev.txt
```

**Run database migrations**
```bash
alembic upgrade head
```

**Start the server**
```bash
uvicorn app.main:app --reload
```

| Service | URL |
|---|---|
| Backend | `http://localhost:8000` |
| API Docs | `http://localhost:8000/docs` |

### Frontend Setup

```bash
cd frontend
npm ci
npm run dev
```

| Service | URL |
|---|---|
| Frontend | `http://localhost:3000` |

---

## Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/bidwise
SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
```

---

## Docker

**Build and start services**
```bash
docker compose up --build -d
```

**Stop services**
```bash
docker compose down
```

---

## Verification

**Backend**
```bash
pytest -q
alembic upgrade head
```

**Frontend**
```bash
npm run lint
npm run build
```

---

## Database Migrations

```bash
# Apply migrations
alembic upgrade head

# Create a migration
alembic revision --autogenerate -m "migration_name"

# Migration history
alembic history

# Current migration
alembic current
```

---

## Security

- JWT Authentication
- HttpOnly Cookies
- CSRF Protection
- Role-Based Access Control (RBAC)
- Multi-Tenant Isolation
- Rate Limiting
- Secure Password Hashing
- PDF Validation
- Input Validation

---

## My Contributions

<div align="center">

![Backend Developer](https://img.shields.io/badge/Role-Backend%20Developer-2563EB?style=for-the-badge)
![AI Integration Engineer](https://img.shields.io/badge/Role-AI%20Integration%20Engineer-7C3AED?style=for-the-badge)
![FastAPI Developer](https://img.shields.io/badge/Role-FastAPI%20Developer-059669?style=for-the-badge)

</div>

> [!IMPORTANT]
> As **Backend Developer & AI Integration Engineer**, I owned the core backend architecture and the AI-driven decision engines that power BidWise AI end-to-end.

<table>
<tr>
<td valign="top" width="33%">

**Architecture & API**
- Backend architecture using FastAPI
- Complete REST API layer
- Database schema design
- SQLAlchemy ORM
- Alembic migrations

</td>
<td valign="top" width="33%">

**AI & Intelligence Engines**
- Google Gemini AI integration
- Tender requirement extraction
- Bid evaluation engine
- GO / NO-GO recommendation engine
- Proposal generation workflows
- OCR & document processing

</td>
<td valign="top" width="33%">

**Security & Infrastructure**
- JWT Authentication & RBAC
- Docker deployment
- GitHub Actions CI/CD

</td>
</tr>
</table>

---

## Roadmap

- [ ] Redis Integration
- [ ] Celery Background Workers
- [ ] Multi-language Tender Support
- [ ] Advanced Analytics Dashboard
- [ ] Bid Success Prediction
- [ ] Tender Recommendation Engine
- [ ] Cloud Storage
- [ ] Enterprise SSO
- [ ] Email Automation
- [ ] Mobile Application

---

## Production Recommendations

- PostgreSQL
- HTTPS
- Secure Cookies
- Secret Management
- Object Storage
- Centralized Logging
- Background Workers
- Redis-backed Rate Limiting
- Automated Backups

---

## Disclaimer

> [!NOTE]
> AI-generated outputs are intended to assist users during tender evaluation, compliance management, and proposal preparation. Users should independently verify all extracted requirements, generated content, recommendations, compliance evidence, and submission materials against the original tender documents before submission. BidWise AI is a decision-support platform and should not replace professional review.

---

## Author

<div align="center">

**Ashish Godhaniya**

Backend Developer • AI Integration Engineer • FastAPI Developer • Python Developer

</div>

---
