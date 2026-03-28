# Gator + Shyftmate

**Gator** is an AI-powered award/EBA rule configurator with two interfaces:
- **Telephony AI agent** — A fully automated inbound phone system. When a potential customer calls Gator's number, an AI voice agent (AWS Polly Olivia, en-AU, GenerativeNeural) answers, conducts the full award rule interview, and saves the results as a prospect in Shyftmate — before the customer has an account.
- **Mobile app** — An Expo React Native app for BAs to conduct manual outbound rule interviews (voice-first with chat fallback).

**Shyftmate** is a full workforce management platform targeting Deputy feature parity, with the Gator rule engine as its core differentiator. Includes scheduling, time & attendance, leave management, team communication, employee management, agreement/EBA management, and payroll export.

Both systems share a single PostgreSQL 16 database and FastAPI middleware.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Monorepo Structure](#monorepo-structure)
4. [Prerequisites](#prerequisites)
5. [Quick Start — Dev](#quick-start--dev)
6. [API Server](#api-server)
7. [Shyftmate Web Portal](#shyftmate-web-portal)
8. [Gator Mobile App](#gator-mobile-app)
9. [Environment Variables](#environment-variables)
10. [Database](#database)
11. [Telephony AI Agent](#telephony-ai-agent)
12. [LLM Configuration](#llm-configuration)
13. [Payroll Export Adapters](#payroll-export-adapters)
14. [Authentication & RBAC](#authentication--rbac)
15. [Running Tests](#running-tests)
16. [CI/CD](#cicd)
17. [Default Credentials](#default-credentials)
18. [Useful Commands](#useful-commands)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND CALL FLOW                        │
│                                                                 │
│  Caller → SignalWire → POST /telephony/inbound                  │
│        → WS /telephony/stream/{id}                              │
│        → AWS Transcribe (STT, en-AU, real-time)                 │
│        → Claude / Ollama (17-node LLM interview FSM)            │
│        → AWS Polly Olivia (TTS, en-AU GenerativeNeural)         │
│        → Prospect + Draft Agreement saved in DB                 │
│        → Admin notified via AWS SES                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      MOBILE APP FLOW                            │
│                                                                 │
│  BA opens Expo app → Voice/Chat interview                       │
│  → POST /chat/sessions/{id}/messages (rate limited 10/min)      │
│  → LLM extracts rule data (17-node XState v5 state machine)     │
│  → Agreement draft saved → Shyftmate admin reviews              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   SHYFTMATE ADMIN FLOW                          │
│                                                                 │
│  Admin reviews /prospects → "Provision Account"                 │
│  → Organisation created → AWS SES invite email sent            │
│  → New org manages scheduling / T&A / leave / payroll export   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **API** | FastAPI 0.111, SQLAlchemy 2.0 async (asyncpg), Alembic, Pydantic v2 |
| **Database** | PostgreSQL 16 |
| **LLM (cloud)** | Anthropic Claude `claude-sonnet-4-5` via `anthropic` SDK |
| **LLM (local/dev)** | Ollama REST API (`llama3` or `mistral`) — no API key needed |
| **Telephony** | SignalWire (Twilio-compatible, ~75% cheaper) + WebSocket Media Streams |
| **STT** | AWS Transcribe Streaming (real-time, en-AU) |
| **TTS** | AWS Polly `Olivia` (en-AU, GenerativeNeural) |
| **Email** | AWS SES via `boto3` |
| **Auth** | JWT + RBAC + Google OAuth2 + Apple Sign-In + mandatory OTP 2FA |
| **Rate limiting** | slowapi |
| **Mobile** | Expo SDK 54, Expo Router v6, XState v5, NativeWind v4, Reanimated v4 |
| **Web** | Vite 5, React 18, TypeScript, shadcn/ui, TanStack Query v5, TanStack Table v8, FullCalendar |
| **Font** | Inter |
| **Icons** | Lucide React / `@expo/vector-icons` |
| **Toasts** | Sonner |

---

## Monorepo Structure

```
C:\Gator\
├── api/                          # FastAPI backend
│   ├── app/
│   │   ├── main.py               # App factory, middleware, routers, startup validation
│   │   ├── config.py             # Pydantic Settings (ENV=dev|prod)
│   │   ├── cache.py              # Redis get/set/del with graceful fallback
│   │   ├── limiter.py            # slowapi Limiter singleton (avoids circular import)
│   │   ├── database.py           # Async SQLAlchemy engine + session factory
│   │   ├── dependencies.py       # get_current_user, require_roles()
│   │   ├── security.py           # JWT create/verify, bcrypt hashing
│   │   ├── models/               # SQLAlchemy ORM models (37 tables)
│   │   │   ├── user.py           # Organisation, User, RefreshToken, OTPCode, KronosToken
│   │   │   ├── agreement.py      # Agreement, EmployeeTypeConfig, RuleLine, Allowance,
│   │   │   │                     # LeavePaycode, WageGrade, KronosConfig, KronosPaycode,
│   │   │   │                     # AwardConstant
│   │   │   ├── workforce.py      # Location, EmployeeProfile, EmployeeAvailability,
│   │   │   │                     # EmployeeSkill, EmployeeDocument, ShiftTemplate,
│   │   │   │                     # Roster, Shift, ShiftSwap, ClockEvent, Timesheet,
│   │   │   │                     # TimesheetEntry, LeaveType, LeaveBalance, LeaveRequest,
│   │   │   │                     # Announcement, Message, MessageGroup, PayrollExportJob
│   │   │   ├── conversation.py   # ConversationSession, ChatMessage, Prospect
│   │   │   └── audit.py          # AuditLog (append-only)
│   │   ├── schemas/              # Pydantic v2 request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py           # 7 auth endpoints (token, refresh, social, OTP)
│   │   │   ├── users.py          # Orgs, users, locations, org context switch
│   │   │   ├── agreements.py     # Full agreement CRUD + versioning + all sub-resources
│   │   │   ├── rules.py          # Rule line PATCH/DELETE/reorder
│   │   │   ├── chat.py           # Mobile chat sessions + LLM messages (rate-limited)
│   │   │   ├── telephony.py      # SignalWire webhook + WebSocket media stream
│   │   │   ├── workforce.py      # Scheduling, T&A, leave, comms, reports, live clock
│   │   │   ├── export.py         # Payroll export trigger + job polling
│   │   │   ├── audit.py          # Audit log query
│   │   │   └── health.py         # GET /health
│   │   ├── services/
│   │   │   ├── llm_service.py    # AnthropicProvider + OllamaProvider, 17-node FSM
│   │   │   ├── telephony_service.py  # CallSession store, audio pipeline
│   │   │   ├── stt_service.py    # AWS Transcribe Streaming
│   │   │   ├── tts_service.py    # AWS Polly Olivia → mulaw audio
│   │   │   ├── email_service.py  # AWS SES — OTP, welcome, invite, prospect alert
│   │   │   └── audit_service.py  # log_action() helper
│   │   └── core/
│   │       └── payroll_adapters/
│   │           ├── base.py       # PayrollAdapter ABC
│   │           ├── kronos.py     # UKG Pro WFM (OAuth2 push)
│   │           ├── keypay.py     # KeyPay / Employment Hero (REST push)
│   │           ├── myob.py       # MYOB (CSV download)
│   │           └── xero.py       # Xero Payroll (CSV download)
│   ├── alembic/
│   │   └── versions/
│   │       ├── 001_initial_schema.py      # All core tables
│   │       ├── 002_add_export_jobs.py     # payroll_export_jobs
│   │       └── 003_add_missing_tables.py  # shift_swaps, message_groups, employee_skills,
│   │                                      # employee_documents, shift_templates,
│   │                                      # award_constants, kronos_tokens
│   ├── tests/                    # pytest — auth, agreements, health
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── Dockerfile
│   └── pyproject.toml
│
├── mobile/                       # Expo SDK 51 — Gator BA mobile app
│   ├── app/
│   │   ├── _layout.tsx           # Root layout (Inter font, QueryClient, SplashScreen)
│   │   ├── (auth)/
│   │   │   ├── login.tsx         # Email/password + Google + Apple
│   │   │   └── otp.tsx           # 6-digit OTP with auto-advance + countdown
│   │   └── (app)/
│   │       ├── index.tsx         # Main screen: voice mode + chat mode toggle
│   │       └── settings.tsx      # Voice picker, LLM provider selector
│   ├── src/
│   │   ├── machines/
│   │   │   └── conversationMachine.ts  # XState v5 — 17-node award interview FSM
│   │   ├── services/
│   │   │   ├── apiClient.ts      # Axios + JWT attach + 401 refresh rotation
│   │   │   ├── voiceService.ts   # expo-speech female voice TTS (en-AU preferred)
│   │   │   ├── sttService.ts     # expo-av recording → base64 → backend transcription
│   │   │   └── persistenceService.ts  # AsyncStorage + server reconciliation
│   │   ├── stores/
│   │   │   └── authStore.ts      # Zustand + expo-secure-store token persistence
│   │   └── components/
│   │       ├── MicButton.tsx     # Reanimated v3 dual-ring pulsing mic button
│   │       ├── VoiceWaveform.tsx # Staggered animated audio bars
│   │       ├── ChatBubble.tsx    # User/AI message bubbles with avatar + timestamp
│   │       ├── ChatHistory.tsx   # FlatList with auto-scroll + typing indicator
│   │       └── NodeProgress.tsx  # Interview section progress strip
│   ├── assets/                   # ⚠ Add icon.png (1024×1024) + splash.png (1284×2778)
│   ├── app.json
│   ├── package.json
│   ├── metro.config.js           # NativeWind v4 CSS processing
│   └── babel.config.js
│
├── shyftmate/                    # Vite 5 + React 18 — Admin/manager portal
│   ├── src/
│   │   ├── App.tsx               # React Router v6 full route tree
│   │   ├── components/
│   │   │   ├── OrgSwitcher.tsx   # Super-admin org context switcher (header)
│   │   │   ├── LiveClockPanel.tsx # Real-time clocked-in users, 30s refresh
│   │   │   ├── DataTable.tsx     # Reusable TanStack Table wrapper
│   │   │   ├── ConfirmDialog.tsx # Destructive action confirmation modal
│   │   │   ├── EmptyState.tsx    # Empty state with CTA
│   │   │   ├── StatusBadge.tsx   # Semantic colour badges
│   │   │   ├── layout/           # AppLayout, Header (OrgSwitcher), Sidebar
│   │   │   └── ui/               # Full shadcn/ui component set
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx          # KPIs + LiveClockPanel + pending approvals
│   │   │   ├── auth/                      # LoginPage, OTPPage
│   │   │   ├── schedule/                  # SchedulePage (FullCalendar), OpenShiftsPage
│   │   │   ├── timesheets/                # TimesheetsPage (approve/reject)
│   │   │   ├── leave/                     # LeavePage (requests + balances)
│   │   │   ├── messages/                  # MessagesPage (announcements + direct)
│   │   │   ├── reports/                   # LabourCost, Overtime, LeaveLiability,
│   │   │   │                              # AwardCompliance
│   │   │   ├── agreements/                # AgreementsListPage + AgreementDetailPage
│   │   │   │   ├── AgreementMetadataTab.tsx
│   │   │   │   ├── EmployeeTypesTab.tsx
│   │   │   │   ├── RuleLinesTab.tsx       # Full rule grid with ↑↓ reorder
│   │   │   │   ├── AllowancesTab.tsx      # C/D/R/P classification
│   │   │   │   ├── LeavePaycodesTab.tsx
│   │   │   │   ├── WageTableTab.tsx
│   │   │   │   ├── KronosConfigTab.tsx
│   │   │   │   ├── RecurringAllowancesTab.tsx
│   │   │   │   └── AgreementHistoryTab.tsx  # Version chain + inline rollback
│   │   │   ├── paycodes/                  # PaycodesPage — global Kronos library
│   │   │   ├── prospects/                 # ProspectsPage + Provision Account
│   │   │   ├── export/                    # ExportPage (Kronos/KeyPay/MYOB/Xero)
│   │   │   ├── audit/                     # AuditPage — diff viewer, pagination
│   │   │   └── admin/                     # Orgs, Users, Locations, LeaveTypes, Settings
│   │   ├── hooks/                # useAuth, usePermission
│   │   ├── lib/                  # api.ts (axios + interceptors), queryClient, utils
│   │   ├── store/
│   │   │   └── authStore.ts      # Zustand — tokens, user, orgId, role, setOrgContext
│   │   └── types/index.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
│
├── db/
│   ├── seeds/
│   │   ├── super_admin.sql       # Seeds platform org + superadmin@gator.local
│   │   └── kronos_paycodes.sql   # Seeds global Kronos paycode library
│   └── scripts/
│       └── reset.sh              # Drop + recreate dev database
│
├── shared/
│   └── src/types/
│       └── AgreementPayload.ts   # Canonical TS type for full agreement structure
│
├── .github/
│   └── workflows/
│       └── ci.yml                # Lint + test + build on push to master
├── docker-compose.yml            # postgres, pgadmin, redis, api (Ollama is external)
├── .env.example                  # Template — copy to .env.dev or .env.prod
├── .gitignore
└── README.md
```

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Docker Desktop | Latest | Runs PostgreSQL, pgAdmin, Redis, and the API |
| Node.js | 20 LTS+ | Shyftmate web portal + Gator mobile app (Node 18 not supported by Expo SDK 54) |
| npm | 9+ | Package management |
| Expo Go app | Latest | Mobile testing on iOS/Android device |

Python is **not required** on your host — the API runs inside Docker (`python:3.11-slim`).

**Running on Windows?** Use WSL2 (Ubuntu). All `bash` and `docker compose` commands should be run from within WSL.

**Optional — for telephony:**
- [SignalWire account](https://signalwire.com) (~$5 free dev credit, AU numbers available)
- AWS account (Transcribe + Polly + SES)

**Ollama** runs externally at `http://192.168.4.150:11434/v1` — no local GPU required.

---

## Quick Start — Dev

### 1. Clone and set up environment

```bash
git clone git@github.com:anupamwagle/shyftmate.git
cd shyftmate

cp .env.example .env.dev
```

Edit `.env.dev` with the following minimum values. Use Docker service names (`postgres`, `ollama`) as hosts — this is what the API container uses internally:

```env
ENV=dev

# Docker service hostnames — do NOT use localhost here
DATABASE_URL=postgresql+asyncpg://gator:gator_dev_password@postgres:5432/gator_dev
DATABASE_URL_SYNC=postgresql://gator:gator_dev_password@postgres:5432/gator_dev

JWT_SECRET=          # openssl rand -hex 32
SUPER_ADMIN_PASSWORD=  # min 12 chars

LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://192.168.4.150:11434/v1   # External Ollama host
OLLAMA_MODEL=llama3

REDIS_URL=redis://redis:6379   # Docker service name

CORS_ORIGINS=http://localhost:5173,http://localhost:8081

# Optional — required for OTP emails
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
SES_FROM_EMAIL=       # must be SES-verified
```

### 2. Start all services

```bash
# Builds the API image and starts postgres, pgadmin, and the API
docker compose up --build -d
```

Services:
- **API**: http://localhost:8000 (Swagger UI: http://localhost:8000/docs)
- **PostgreSQL**: `localhost:5432`
- **Redis**: `localhost:6379`
- **pgAdmin**: http://localhost:5050 (`admin@gator.com` / `admin`)
- **Ollama**: external at `http://192.168.4.150:11434/v1`

### 3. Run migrations and seed the database

Run these once after first `docker compose up`, and again after any schema change:

```bash
# Apply all Alembic migrations
docker exec gator_api alembic upgrade head

# Seed super admin + Kronos paycodes
docker exec -i gator_postgres psql -U gator -d gator_dev < db/seeds/super_admin.sql
docker exec -i gator_postgres psql -U gator -d gator_dev < db/seeds/kronos_paycodes.sql
```

> The API container mounts `./api` with `--reload` — code changes are reflected immediately without rebuilding.

### 4. Start the Shyftmate web portal

```bash
cd shyftmate
npm install
npm run dev
# → http://localhost:5173
```

### 5. Start the Gator mobile app

```bash
cd mobile
npm install --legacy-peer-deps   # --legacy-peer-deps required for Expo 51 peer dep conflicts

# Generate placeholder app assets (required by Expo on first run)
node scripts/create_assets.js
```

**Running on a physical device via WSL?** The device cannot reach WSL's internal IP directly. Use tunnel mode:

```bash
npx expo start --tunnel
```

Or if you know your Windows host IP (run `ipconfig` in Windows cmd, find Wi-Fi IPv4):

```bash
REACT_NATIVE_PACKAGER_HOSTNAME=<your-windows-ip> npx expo start --host lan
```

For emulators (Android Studio / iOS Simulator), plain `npm start` works fine.

Scan the QR code with **Expo Go** on your phone, or press:
- `i` → iOS simulator
- `a` → Android emulator

> **Before production builds:** replace `mobile/assets/icon.png` (1024×1024 px) and `mobile/assets/splash.png` (1284×2778 px) with real assets.

---

## API Server

### Base URL
```
http://localhost:8000/api/v1
```

### Endpoint Summary

| Group | Routes | Notes |
|---|---|---|
| **Auth** | `POST /auth/login` `/refresh` `/logout` `/social/google` `/social/apple` `/otp/request` `/otp/verify` | OTP mandatory after social login |
| **Orgs & Users** | `GET/POST /orgs` · `GET/PATCH/DELETE /orgs/{id}` · `GET/POST /orgs/{id}/users` · `GET/PATCH /users/{id}` · `GET /users/me` · `POST /orgs/switch` | Org context switch for super_admin |
| **Locations** | `GET/POST /orgs/{id}/locations` · `PATCH/DELETE /locations/{id}` | |
| **Agreements** | `GET/POST /agreements` · `GET/PATCH /agreements/{id}` · `/history` · `/activate` · `/rollback/{ver}` | Append-only version chain |
| **Emp Types** | `GET/POST /agreements/{id}/employee-types` · `GET/PATCH/DELETE /agreements/{id}/employee-types/{et}` | |
| **Rule Lines** | `GET/POST /agreements/{id}/employee-types/{et}/rule-lines` · `PATCH/DELETE /rule-lines/{id}` · `POST /rule-lines/{id}/reorder` | Sub-rules via parent_rule_id |
| **Allowances** | `GET/POST /agreements/{id}/allowances` | C/D/R/P classes |
| **Leave Paycodes** | `GET/POST /agreements/{id}/leave-paycodes` | |
| **Wage Table** | `GET/POST /agreements/{id}/wage-table` | |
| **Kronos Config** | `GET/POST /agreements/{id}/kronos-config` · `GET/PUT /agreements/{id}/recurring-allowances` | |
| **Paycodes** | `GET/POST /paycodes` | Global Kronos library |
| **Chat** | `POST /chat/sessions` · `GET/PUT /chat/sessions/{id}` · `POST /chat/sessions/{id}/messages` | Rate limited: 10/min |
| **Telephony** | `POST /telephony/inbound` · `WS /telephony/stream/{id}` · `POST /telephony/status` | SignalWire webhook + media stream |
| **Prospects** | `GET /prospects` · `GET/PATCH /prospects/{id}` · `POST /prospects/{id}/provision` | |
| **Scheduling** | `GET/POST /rosters` · `GET/PATCH /rosters/{id}` · `POST /rosters/{id}/publish` · `GET/POST /rosters/{id}/shifts` · `PATCH /shifts/{id}` · `GET/POST /shift-swaps` · `/approve` `/reject` | |
| **T&A** | `POST /clock` · `GET /clock/live` · `GET/POST /timesheets` · `GET/PATCH /timesheets/{id}` · `/submit` `/approve` | Clock rate limited: 2/min |
| **Leave** | `GET/POST /leave-types` · `GET /leave-balances` · `GET/POST /leave-requests` · `/approve` `/reject` `/cancel` | |
| **Communication** | `GET/POST /announcements` · `GET/POST /messages` · `GET/POST/PATCH/DELETE /message-groups` | |
| **Reports** | `GET /reports/labour-cost` `/overtime` `/leave-liability` `/award-compliance` | |
| **Export** | `GET /export/platforms` · `POST /export/trigger` · `GET /export/jobs` · `GET /export/jobs/{id}` | |
| **Audit** | `GET /audit` | Filterable, paginated |
| **Health** | `GET /health` | DB connectivity check |

### Error format
```json
{
  "error_code": "AGREEMENT_NOT_FOUND",
  "message": "Agreement not found.",
  "detail": null
}
```
In `ENV=dev`, `detail` includes the raw exception for debugging.

---

## Shyftmate Web Portal

```
http://localhost:5173
```

Log in with `superadmin@gator.local` and your `SUPER_ADMIN_PASSWORD`.

### Page Map

| Route | Description |
|---|---|
| `/dashboard` | KPI widgets, LiveClockPanel (30s refresh), pending approvals |
| `/schedule` | FullCalendar week view, drag-and-drop shift assignment, roster publish |
| `/schedule/open` | Open shifts board + shift swap requests |
| `/timesheets` | Submit / approve timesheet queue |
| `/leave` | Leave request queue — approve / reject / cancel |
| `/messages` | Broadcast announcements + team messages |
| `/reports/labour-cost` | Actual vs forecast cost by period/location |
| `/reports/overtime` | Overtime hours by employee |
| `/reports/leave-liability` | Outstanding leave balances |
| `/reports/award-compliance` | Timesheet entries flagged against award rules |
| `/agreements` | All agreements (Modern Award + EBA) |
| `/agreements/:id` | 9-tab detail: metadata · employee types · rule lines (↑↓ reorder) · allowances · leave paycodes · wage table · Kronos config · recurring allowances · history + rollback |
| `/paycodes` | Global Kronos paycodes library CRUD |
| `/prospects` | Gator AI call leads — review + Provision Account |
| `/export` | Payroll export: Kronos / KeyPay / MYOB / Xero |
| `/audit` | Immutable audit log with before/after diff viewer |
| `/admin/orgs` | Organisation CRUD (super_admin) |
| `/admin/users` | User CRUD + role assignment + invite email |
| `/admin/locations` | Location management |
| `/admin/leave-types` | Leave type configuration |
| `/admin/settings` | Org settings — payroll, T&A, notifications, security |

### OrgSwitcher (super_admin only)
The header shows a dropdown to switch org context. Calls `POST /orgs/switch` which issues a re-scoped JWT — all subsequent queries run in the context of the selected org.

### Production build
```bash
cd shyftmate
VITE_API_URL=https://api.yourdomain.com/api/v1 npm run build
# Output: shyftmate/dist/
```

---

## Gator Mobile App

A **voice-first, single-purpose tool** for BAs to configure award rules through an AI conversation.

### Screens

| Screen | Description |
|---|---|
| Login | Email/password, Google OAuth, Apple Sign-In |
| OTP | 6-digit auto-advancing input, 10-min countdown, resend |
| Conversation | Voice mode (pulsing mic) + chat mode (toggle) |
| Settings | Female voice picker, LLM provider, Ollama URL |

### Conversation state machine (17 nodes)

```
idle → loading → intro
  → agreement_metadata       (name, number, type, dates, payroll freq, pay day)
  → agreement_leave_rules    (cashout policy, notice periods, probation)
  → employee_types_intro
  → [loop per employee type]:
      emp_type_basics         (hours/week, hours/day, RDO accrual, span of hours)
      shift_definitions       (ordinary, afternoon, night shift spans)
      day_scenarios           (Mon–Fri, Sat/Sun scheduled/unscheduled)
      public_holiday_rules
      leave_rules             (annual leave + loading, personal, shift leave)
      night_shift_rules
      workers_comp_rules
      other_scenarios         (passive time, travel, training, stand down)
  → allowances                (LAFHA, site, leading hand — C/D/R/P class)
  → leave_paycodes
  → wage_rate_table
  → grade_names
  → kronos_config
  → payrule_mappings
  → recurring_allowances
  → review → submitting → complete
```

### Session persistence

Every transition saves to `AsyncStorage` and syncs to `PUT /chat/sessions/{id}`. On app reopen, the session resumes at the exact node — server timestamp wins on conflict.

### Production build
```bash
cd mobile
npx eas build --platform ios     # requires EAS account
npx eas build --platform android
```

---

## Environment Variables

Copy `.env.example` to `.env.dev` (development) or `.env.prod` (production).

```bash
cp .env.example .env.dev
```

### Core

| Variable | Description | Required |
|---|---|---|
| `ENV` | `dev` or `prod` | ✅ |
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` | ✅ |
| `DATABASE_URL_SYNC` | `postgresql://user:pass@host:5432/db` (seeds + tests) | ✅ |
| `JWT_SECRET` | `openssl rand -hex 32` | ✅ |
| `JWT_ACCESS_EXPIRE_MINUTES` | Default: `30` | |
| `JWT_REFRESH_EXPIRE_DAYS` | Default: `7` | |
| `SUPER_ADMIN_EMAIL` | Default: `superadmin@gator.local` | ✅ |
| `SUPER_ADMIN_PASSWORD` | Min 12 chars | ✅ |
| `CORS_ORIGINS` | Comma-separated, e.g. `http://localhost:5173` | ✅ |
| `REDIS_URL` | Default: `redis://redis:6379` (Docker service name) | |

### LLM

| Variable | Description | Required |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` or `ollama` | ✅ |
| `ANTHROPIC_API_KEY` | Required if `LLM_PROVIDER=anthropic` | |
| `OLLAMA_BASE_URL` | Default: `http://localhost:11434` | |
| `OLLAMA_MODEL` | Default: `llama3` | |

### Social Auth

| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `APPLE_CLIENT_ID` | Apple Sign-In bundle ID |
| `APPLE_TEAM_ID` | Apple developer team ID |
| `APPLE_KEY_ID` | Apple Sign-In key ID |
| `APPLE_PRIVATE_KEY_PATH` | Path to `.p8` private key |

### AWS (SES + Transcribe + Polly)

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM user with SES + Transcribe + Polly permissions |
| `AWS_SECRET_ACCESS_KEY` | |
| `AWS_SES_REGION` | Default: `ap-southeast-2` |
| `SES_FROM_EMAIL` | Must be SES-verified |
| `SES_FROM_NAME` | Default: `Gator` |
| `AWS_TRANSCRIBE_REGION` | Default: `ap-southeast-2` |
| `AWS_POLLY_REGION` | Default: `ap-southeast-2` |
| `POLLY_VOICE_ID` | Default: `Olivia` |
| `POLLY_ENGINE` | Default: `neural` |

### Telephony (SignalWire)

| Variable | Description |
|---|---|
| `SIGNALWIRE_PROJECT_ID` | SignalWire project UUID |
| `SIGNALWIRE_TOKEN` | SignalWire API token |
| `SIGNALWIRE_SPACE_URL` | `your-project.signalwire.com` |
| `SIGNALWIRE_PHONE_NUMBER` | E.164 format — e.g. `+61299999999` |

### Payroll (Kronos)

| Variable | Description |
|---|---|
| `KRONOS_BASE_URL` | UKG Pro WFM API base URL |
| `KRONOS_CLIENT_ID` | OAuth2 client ID |
| `KRONOS_CLIENT_SECRET` | OAuth2 client secret |
| `KRONOS_COMPANY_SHORT_NAME` | Company identifier |

---

## Database

### Migrations

```bash
# Apply all pending migrations (via Docker)
docker exec gator_api alembic upgrade head

# Create a new migration after model changes
docker exec gator_api alembic revision --autogenerate -m "add xyz column"

# Rollback one step
docker exec gator_api alembic downgrade -1

# Show current state
docker exec gator_api alembic current
docker exec gator_api alembic history
```

### Migration chain

| File | Tables added |
|---|---|
| `001_initial_schema.py` | All core tables (organisations, users, agreements, workforce, conversation, audit) |
| `002_add_export_jobs.py` | `payroll_export_jobs` |
| `003_add_missing_tables.py` | `shift_swaps`, `message_groups`, `employee_skills`, `employee_documents`, `shift_templates`, `award_constants`, `kronos_tokens` |

### Seeds

```bash
# Run once after alembic upgrade head (via Docker)
docker exec -i gator_postgres psql -U gator -d gator_dev < db/seeds/super_admin.sql
docker exec -i gator_postgres psql -U gator -d gator_dev < db/seeds/kronos_paycodes.sql
```

### Reset dev database

```bash
# Requires DATABASE_URL_SYNC env var to be exported first
export DATABASE_URL_SYNC=postgresql://gator:gator_dev_password@localhost:5432/gator_dev
export DATABASE_URL=postgresql+asyncpg://gator:gator_dev_password@localhost:5432/gator_dev
bash db/scripts/reset.sh
```

### pgAdmin

http://localhost:5050 — `admin@gator.com` / `admin`

Add server: host `postgres`, port `5432`, user `gator`, password `gator_dev_password`, db `gator_dev`

---

## Telephony AI Agent

### SignalWire setup

1. Create account at https://signalwire.com ($5 free credit to start)
2. Purchase an AU phone number
3. Set the number's webhook URL to `https://your-api.com/api/v1/telephony/inbound`
4. Set status callback to `https://your-api.com/api/v1/telephony/status`
5. Fill `SIGNALWIRE_*` env vars

### Local testing with ngrok

```bash
# Expose your local API to the internet for SignalWire webhooks
ngrok http 8000
# Use the HTTPS ngrok URL as your webhook in SignalWire dashboard
```

### End-to-end call flow

1. Caller dials the SignalWire AU number
2. SignalWire POSTs to `/telephony/inbound` → SWML response opens a Media Streams WebSocket
3. Mulaw 8kHz audio arrives at `WS /telephony/stream/{session_id}`
4. Each audio chunk → **AWS Transcribe Streaming** (en-AU) → transcript text
5. Transcript → **LLM** (same `llm_service.py` as mobile, 17-node FSM) → reply text
6. Reply → **AWS Polly Olivia** (en-AU, GenerativeNeural) → mulaw audio bytes
7. Audio played back to caller via SignalWire WebSocket
8. On interview complete → `Agreement` draft + `Prospect` record saved in DB
9. Admin receives AWS SES email notification
10. Admin reviews `/prospects` in Shyftmate → clicks **Provision Account** → org created + invite email sent

---

## LLM Configuration

Switch providers via `LLM_PROVIDER` env var — no code changes required.

### Anthropic (recommended for production)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Uses `claude-sonnet-4-5`. Structured rule extraction via `<rule_delta>` XML tags in responses.

### Ollama (external host)

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://192.168.4.150:11434/v1
OLLAMA_MODEL=llama3
```

Ollama runs on an external machine at `192.168.4.150:11434`. The `OLLAMA_BASE_URL` env var is set in both `.env.dev` and `docker-compose.yml` (docker-compose takes precedence for the API container).

---

## Payroll Export Adapters

| Platform | Auth method | Delivery |
|---|---|---|
| **UKG Pro WFM (Kronos)** | OAuth2 client credentials | REST push to Kronos API |
| **KeyPay / Employment Hero** | HTTP Basic auth | REST push |
| **MYOB Payroll/Exo** | N/A | CSV file download |
| **Xero Payroll** | N/A | CSV file download |

### Trigger an export

```bash
# Via Shyftmate web: /export → select platform → Run Export

# Or directly via API:
curl -X POST http://localhost:8000/api/v1/export/trigger \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform": "myob", "mode": "timesheets"}'

# Poll status
curl http://localhost:8000/api/v1/export/jobs/{job_id} \
  -H "Authorization: Bearer $TOKEN"
```

---

## Authentication & RBAC

### Mandatory OTP 2FA

All users — regardless of login method — must complete email OTP before getting a full-access JWT:

1. Login (email/password, Google, or Apple) → provisional JWT issued (`scope: otp_pending`)
2. OTP sent to verified email via AWS SES (6-digit, 10-minute TTL, max 3 attempts)
3. `POST /auth/otp/verify` with code → full-scope JWT + refresh token issued
4. All protected endpoints reject `otp_pending` tokens with `403`

### Role hierarchy

```
super_admin  >  admin  >  manager  >  reviewer  >  employee
```

| Role | Key permissions |
|---|---|
| `super_admin` | All orgs, all data, org context switching, prospect provisioning |
| `admin` | Full access within own org |
| `manager` | Rosters, timesheet approval, leave approval, announcements |
| `reviewer` | Read agreements, validate rule lines |
| `employee` | Own timesheets, own clock events, own leave requests |

### Getting a token (curl)

```bash
# Step 1: Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@gator.local","password":"your-password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Step 2: Request OTP (sent to email)
curl -X POST http://localhost:8000/api/v1/auth/otp/request \
  -H "Authorization: Bearer $TOKEN"

# Step 3: Verify OTP
FULL_TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/otp/verify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"123456"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

---

## Running Tests

```bash
cd api

# All tests
pytest tests/ -v

# Specific file
pytest tests/test_auth.py -v

# With coverage report
pytest tests/ --cov=app --cov-report=html
```

Tests use an isolated `gator_test` database. The `conftest.py` fixture runs `alembic upgrade head` automatically before the suite.

Required environment for tests:
```bash
export DATABASE_URL=postgresql+asyncpg://gator:gator_dev_password@localhost:5432/gator_test
export DATABASE_URL_SYNC=postgresql://gator:gator_dev_password@localhost:5432/gator_test
export JWT_SECRET=test-secret-do-not-use
export LLM_PROVIDER=ollama
export SUPER_ADMIN_PASSWORD=TestPassword123!
```

---

## CI/CD

GitHub Actions runs on every push to `master` or `develop`, and on every PR to `master`.

### Jobs

| Job | What it does |
|---|---|
| **API — Lint & Test** | Python 3.11 · ruff lint · mypy type check · alembic migrate · pytest |
| **Shyftmate — Build** | Node 20 · npm ci · tsc --noEmit · vite build |
| **Mobile — Type Check** | Node 20 · npm ci · tsc --noEmit |

Workflow file: `.github/workflows/ci.yml`

### Required GitHub Secrets

| Secret | Value |
|---|---|
| *(none currently required)* | CI uses ephemeral Postgres service container and test-only JWT secret hardcoded in workflow |

---

## Default Credentials

### Super Admin (API + Shyftmate web)

| | |
|---|---|
| Email | `superadmin@gator.local` |
| Password | Value of `SUPER_ADMIN_PASSWORD` in your `.env.dev` |
| Role | `super_admin` |
| Org | `Gator Platform` |

### pgAdmin

| | |
|---|---|
| URL | http://localhost:5050 |
| Email | `admin@gator.com` |
| Password | `admin` |

### PostgreSQL

| | |
|---|---|
| Host | `localhost` (or `postgres` from within Docker) |
| Port | `5432` |
| Database | `gator_dev` |
| User | `gator` |
| Password | `gator_dev_password` |

---

## Useful Commands

```bash
# Generate a secure JWT secret
openssl rand -hex 32

# Watch API logs live
docker logs gator_api -f

# Connect to Postgres directly
psql postgresql://gator:gator_dev_password@localhost:5432/gator_dev

# Reset dev database (drops + recreates + re-runs seeds)
bash db/scripts/reset.sh

# Run Expo on iOS simulator
cd mobile && npx expo run:ios

# Run Expo on Android emulator
cd mobile && npx expo run:android

# Type-check the Shyftmate web app
cd shyftmate && npx tsc --noEmit

# Type-check the mobile app
cd mobile && npx tsc --noEmit

# Build Shyftmate for production
cd shyftmate && npm run build

# List all API routes
curl -s http://localhost:8000/openapi.json \
  | python3 -c "import sys,json; [print(p) for p in json.load(sys.stdin)['paths']]"

# Check migration state
docker exec gator_api alembic current

# Tail alembic history
docker exec gator_api alembic history --verbose
```
