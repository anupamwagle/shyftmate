# Gator + Shyftmate

**Gator** is an AI-powered award/EBA rule configurator. Potential customers call Gator's phone number, an AI voice agent (AWS Polly Olivia, en-AU) conducts the full award rule interview, and saves the results as a prospect in Shyftmate — before the customer even has an account.

**Shyftmate** is a full workforce management platform (Deputy competitor) with scheduling, time & attendance, leave management, team communication, and payroll export — powered by the Gator rule engine.

## Monorepo Structure

```
C:\Gator\
├── api/          # FastAPI — shared backend + telephony AI engine
├── mobile/       # Expo — Gator BA mobile app (voice-first rule interviewer)
├── shyftmate/    # Vite + React — Shyftmate manager/admin portal
├── db/           # Alembic migrations, seed SQL
├── shared/       # TypeScript type contracts
└── docker-compose.yml
```

## Quick Start (Dev)

### 1. Prerequisites
- Docker Desktop
- Python 3.11+
- Node 20+ / pnpm

### 2. Start infrastructure
```bash
docker compose up -d postgres pgadmin ollama
```

### 3. Set up environment
```bash
cp .env.example .env.dev
# Edit .env.dev with your secrets
```

### 4. Run API
```bash
cd api
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` for the interactive API docs.

### 5. Default super admin
- Email: `superadmin@gator.local`
- Password: set via `SUPER_ADMIN_PASSWORD` in `.env.dev`

## Tech Stack

| Layer | Tech |
|---|---|
| API | FastAPI 0.111, SQLAlchemy 2.0 async, Alembic, Pydantic v2 |
| DB | PostgreSQL 16 |
| LLM | Anthropic Claude (cloud) + Ollama (local dev) |
| Telephony | SignalWire + AWS Transcribe (STT) + AWS Polly Olivia (TTS) |
| Auth | JWT + RBAC + Google OAuth2 + Apple Sign-In + OTP 2FA (AWS SES) |
| Mobile | Expo SDK 51, XState v5, NativeWind v4 |
| Web | Vite 5 + React 18 + shadcn/ui + TanStack Table |

## Build Phases

- [x] Phase 1 — Foundation: monorepo, Docker, FastAPI skeleton, SQLAlchemy models, Alembic migration
- [ ] Phase 2 — Agreement API (CRUD, versioning, rollback)
- [ ] Phase 3 — LLM + Chat sessions
- [ ] Phase 3b — Telephony AI (SignalWire + Polly)
- [ ] Phase 4 — Expo mobile app
- [ ] Phase 5 — Shyftmate web scaffold + auth
- [ ] Phase 6 — Scheduling
- [ ] Phase 7 — Time & attendance
- [ ] Phase 8 — Leave management
- [ ] Phase 9 — Communication
- [ ] Phase 10 — Agreement management UI
- [ ] Phase 11 — Payroll export adapters
- [ ] Phase 12 — Hardening + CI
