# 📋 Sentinel Security Platform — Comprehensive Project Report
**Version 26.3.0 | Author: Anant Suthar | Generated: March 14, 2026**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Full Directory Structure (Annotated)](#2-full-directory-structure-annotated)
3. [Markdown Files — Full Content Reference](#3-markdown-files--full-content-reference)
4. [Backend — `sentinel-core`](#4-backend--sentinel-core)
5. [Frontend — `sentinel-admin`](#5-frontend--sentinel-admin)
6. [Demo Application — `acme-portal`](#6-demo-application--acme-portal)
7. [Database Schema Evolution (Migrations)](#7-database-schema-evolution-migrations)
8. [Detection Engine](#8-detection-engine)
9. [Deployment & DevOps](#9-deployment--devops)
10. [API Specification Summary](#10-api-specification-summary)
11. [Technology Stack Summary](#11-technology-stack-summary)
12. [Security Architecture](#12-security-architecture)
13. [Project Health & Issues Found](#13-project-health--issues-found)

---

## 1. Project Overview

**Sentinel** is a professional-grade, multi-tenant cybersecurity telemetry and monitoring platform. It was built from the ground up as a personal project by Anant Suthar and demonstrates deep full-stack integration across a Node.js backend, React frontend, PostgreSQL database, Redis pub/sub, and real-time WebSocket streaming.

### Version Naming Convention
The version string `26.3.0` encodes the release timeline:
- `26` → Year 2026
- `3` → Month of March
- `0` → Initial major release of this architecture

### Core Purpose
Sentinel provides real-time visibility into an organization's security posture by:
- Tracking login failures and authentication anomalies
- Parsing API request streams for malicious patterns
- Mapping geographic IP origins
- Catching brute-force scanners before they breach the perimeter
- Broadcasting live threat intelligence to SOC analysts via WebSockets

### Repository
- **GitHub:** `https://github.com/anant720/Sentinel.git`
- **Primary Branch:** `main` + `26.3.0`
- **License:** MIT

---

## 2. Full Directory Structure (Annotated)

```text
Kant Tool/  (Root — Monorepo)
│
├── README.md                     ← Primary project readme with screenshots & overview
├── DIRECTORY_STRUCTURE.md        ← Monorepo map document
├── setup.md                      ← Complete local setup guide (4-terminal walkthrough)
├── LICENSE                       ← MIT License
├── .gitignore                    ← Root-level git ignore rules
├── push_debug.log                ← Git push debug output (2.5 KB)
├── push_final.log                ← Final push result log (134 B)
│
├── .git/                         ← Git repository metadata
├── .vscode/                      ← VS Code workspace settings
├── scripts/                      ← (Empty — reserved for future scripts)
│
├── docs/                         ← Project-wide documentation
│   ├── architecture.md           ← Technical architecture document
│   ├── api-specification.md      ← API routes, auth methods, request/response shapes
│   ├── system-design.md          ← System design: tenancy, threat detection, risk scoring
│   ├── walkthrough_repo_prep.md  ← Repo preparation walkthrough for GitHub release
│   └── screenshots/              ← UI screenshots (8 images embedded in README)
│       ├── Dashboard.png
│       ├── Live events.png
│       ├── Identity.png
│       ├── Organization.png
│       ├── Detection logic.png
│       ├── Security alerts.png
│       ├── Setting.png
│       └── Login page.png
│
├── deployment/                   ← Production deployment configs
│   ├── docker-compose.prod.yml   ← Full production Docker Compose (5.8 KB)
│   └── nginx/                    ← Nginx reverse proxy configuration
│
├── backend/
│   └── sentinel-core/            ← Node.js + Fastify + PostgreSQL Core API
│       ├── src/
│       │   ├── index.ts          ← Main Fastify app entrypoint (30 KB — largest file)
│       │   ├── worker.ts         ← BullMQ worker entrypoint
│       │   ├── config/           ← Environment & app configurations
│       │   ├── controllers/      ← HTTP request handlers (10 files)
│       │   │   ├── alert.controller.ts        (3.1 KB)
│       │   │   ├── apikey.controller.ts       (2.3 KB)
│       │   │   ├── audit.controller.ts        (1.9 KB)
│       │   │   ├── auth.controller.ts         (9.2 KB) ← Largest controller
│       │   │   ├── dashboard.controller.ts    (1.4 KB)
│       │   │   ├── device.controller.ts       (3.5 KB)
│       │   │   ├── ingestion.controller.ts    (8.0 KB)
│       │   │   ├── notification.controller.ts (1.1 KB)
│       │   │   ├── org.controller.ts          (13.8 KB) ← Most complex controller
│       │   │   └── user.controller.ts         (7.4 KB)
│       │   ├── core/             ← Core application bootstrap logic
│       │   ├── db/
│       │   │   ├── client.ts     ← PostgreSQL pool client
│       │   │   └── migrations/   ← 24 SQL migration files (001–024)
│       │   ├── detection/        ← Core security logic
│       │   │   ├── engine.ts     ← Main Threat Detection Engine (3.6 KB)
│       │   │   ├── registry.ts   ← Rule registry
│       │   │   ├── types.ts      ← Detection TypeScript types
│       │   │   └── rules/        ← 7 individual heuristic rule files
│       │   ├── lib/              ← Core utilities
│       │   ├── middleware/       ← Auth, RBAC, org-isolation middleware (4 files)
│       │   ├── queues/           ← Async BullMQ task queues
│       │   ├── rbac/             ← Roles & Permissions definitions
│       │   ├── security/         ← Crypto and JWT handling utilities
│       │   ├── services/         ← Business logic layer (15 service files)
│       │   ├── types/            ← TypeScript interfaces
│       │   └── workers/          ← Background BullMQ job processors
│       ├── alertmanager/         ← Alertmanager config (for Prometheus)
│       ├── grafana/              ← Grafana dashboards
│       ├── monitoring/           ← Prometheus + monitoring setup
│       ├── nginx/                ← Backend Nginx config
│       ├── prometheus/           ← Prometheus scrape config
│       ├── tests/                ← Test suite
│       ├── dist/                 ← TypeScript compiled output
│       ├── .env                  ← Active env (not version controlled)
│       ├── .env.example          ← Safe template to share (no secrets)
│       ├── .env.development      ← Dev-mode environment
│       ├── .env.production       ← Production environment
│       ├── .env.staging          ← Staging environment
│       ├── .env.demo             ← Demo environment
│       ├── Dockerfile            ← Backend Docker image definition
│       ├── docker-compose.yml    ← Dev compose (Redis, PgBouncer, Postgres, Grafana)
│       ├── redis.conf            ← Redis configuration
│       ├── tsconfig.json         ← TypeScript compiler configuration
│       ├── package.json          ← Backend npm manifest (1.4 KB)
│       └── .eslintrc.json        ← ESLint rules
│
├── frontend/
│   └── sentinel-admin/           ← React 18 + Vite Admin Console
│       ├── src/
│       │   ├── main.tsx          ← React entrypoint
│       │   ├── App.tsx           ← Root app component with routing
│       │   ├── providers.tsx     ← React Query + global providers
│       │   ├── index.css         ← Global styles
│       │   ├── components/       ← Shared UI components (Toast, Modals, Buttons)
│       │   ├── contexts/         ← React context providers
│       │   ├── features/         ← Domain feature modules (8 features)
│       │   │   ├── alerts/       ← Security Alerts management page
│       │   │   ├── auth/         ← Login & Invitation flows
│       │   │   ├── dashboard/    ← Main stats overview
│       │   │   ├── detection/    ← Rules and settings configuration
│       │   │   ├── events/       ← Live event streaming & telemetry viewer
│       │   │   ├── organizations/← Multi-tenant org configs & API keys
│       │   │   ├── settings/     ← Audit logs & data retention
│       │   │   └── users/        ← Identity & Access management
│       │   ├── hooks/            ← Custom React hooks (e.g. useSecurityStream for WS)
│       │   ├── layouts/          ← Dashboard shell and sidebar navigation
│       │   ├── lib/
│       │   │   ├── api.ts        ← Axios client configuration
│       │   │   ├── rbac.ts       ← Frontend role-based access checks
│       │   │   ├── store.ts      ← Zustand global state (Auth & Org)
│       │   │   └── services/     ← HTTP client methods matching backend controllers
│       │   └── types/            ← Frontend TypeScript interfaces
│       ├── README.md             ← Frontend-specific readme with live DB snapshots
│       ├── index.html            ← Vite HTML entry
│       ├── vite.config.ts        ← Vite build config
│       ├── vitest.config.ts      ← Vitest test config
│       ├── tailwind.config.ts    ← TailwindCSS configuration (1.9 KB)
│       ├── tsconfig.json         ← TypeScript config
│       ├── tsconfig.node.json    ← Node-specific TS config
│       ├── postcss.config.js     ← PostCSS config
│       ├── Dockerfile            ← Frontend Docker image (multi-stage, 2.4 KB)
│       └── package.json          ← Frontend npm manifest (1.6 KB)
│
├── demo/
│   └── acme-portal/              ← Vulnerable Mock Employee Portal
│       ├── server.js             ← Express server with built-in Sentinel SDK (29.6 KB)
│       ├── index.html            ← Corporate portal UI (29.6 KB)
│       ├── start.bat             ← Windows batch launcher
│       ├── package.json          ← Portal dependencies
│       ├── public/               ← Static assets
│       └── scripts/              ← Helper scripts
│
└── sentinel-admin/               ← (Apparent duplicate/alternate location — see note)
```

> [!NOTE]
> A `sentinel-admin/` directory also appears at the root level alongside the expected `frontend/sentinel-admin/`. This may be a leftover artifact from a pre-monorepo restructuring and should be reviewed for cleanup.

---

## 3. Markdown Files — Full Content Reference

This section documents every `.md` file in the repository with its path, size, and purpose.

### 3.1 Root-Level Markdown Files

| File | Size | Purpose |
|------|------|---------|
| `README.md` | 4.1 KB | Primary project readme — overview, screenshots, tech stack, component guide, getting started |
| `DIRECTORY_STRUCTURE.md` | 3.9 KB | Visual monorepo map — annotated tree of the entire codebase |
| `setup.md` | 4.8 KB | Step-by-step local setup guide with seed scripts for creating admin users |

#### `README.md` — Key Sections
- **Platform Overview**: Describes Sentinel as a multi-tenant cybersecurity telemetry platform
- **System Previews**: 8 inline screenshots (Dashboard, Live Events, Identity, Organization, Detection Logic, Alerts, Settings, Login)
- **Technical Architecture**: Node.js/Fastify backend, PostgreSQL/Redis data layer, React 18/Vite/TailwindCSS/Zustand frontend
- **System Components**: Describes all 3 major modules
- **Getting Started**: Quick 4-step guide pointing to setup.md

#### `DIRECTORY_STRUCTURE.md` — Key Sections
- Complete annotated ASCII directory tree of the monorepo
- Documents each directory with its role and purpose
- Covers backend, frontend, demo portal, and docs directories

#### `setup.md` — Key Sections
- Prerequisites (Node.js v18+, Docker, Git)
- Docker Compose startup (PostgreSQL, PgBouncer, Redis)
- Database seed script (creates org, admin user, API key via raw Node.js)
- Frontend startup instructions
- Demo portal integration guide
- Security: Default password `Sentinel@2026!`, API key format `sk_sentinel_*`

---

### 3.2 Documentation Markdown Files (`docs/`)

| File | Size | Purpose |
|------|------|---------|
| `docs/architecture.md` | 2.3 KB | Component stack, data flow, technical decisions |
| `docs/api-specification.md` | 2.4 KB | Full API route reference with auth, methods, and schemas |
| `docs/system-design.md` | 1.7 KB | Multi-tenancy model, detection logic, risk scoring paradigm |
| `docs/walkthrough_repo_prep.md` | 2.3 KB | GitHub release preparation walkthrough |

#### `docs/architecture.md` — Key Sections
1. **Sentinel Core (Backend)**: Fastify engine, PostgreSQL for relational telemetry, Redis for WS pub/sub + BullMQ
2. **Sentinel Admin Console (Frontend)**: React 18/Vite, TailwindCSS glassmorphism dark mode, Zustand, TanStack Query
3. **Acme Corporate Portal**: Express + invisible middleware SDK scraping HTTP metadata
4. **Technical Data Flow**: 5-step pipeline from ingestion → BullMQ → PostgreSQL → Redis pub → WebSocket push

#### `docs/api-specification.md` — Key Sections
- **Auth Paradigms**: Dual-layer (JWT for dashboard, API Keys for M2M)
- **M2M Event Ingestion**: `POST /events/log` — queues events via BullMQ
- **Admin APIs**: Events feed, alert lifecycle, identity management, org settings

#### `docs/system-design.md` — Key Sections
- **Multi-Tenancy**: Logical isolation via `organization_id` on all sensitive tables
- **Threat Detection**: 3 analytical levels (Signature, Threshold, Behavioral)
- **Risk Scoring**: Score 0-100 → Info (<50), Warning (>50), Critical (>80)
- **Scalability**: BullMQ queuing, PostgreSQL cascading constraints, WS + HTTP polling sync

#### `docs/walkthrough_repo_prep.md` — Key Sections
- Monorepo consolidation steps
- Telemetry snapshots injected into README files
- Security sanitization (removed hardcoded passwords, JWT secrets)
- `.gitignore` enforcement
- Validation checklist (all tasks marked complete ✅)

---

### 3.3 Frontend Markdown File

| File | Size | Purpose |
|------|------|---------|
| `frontend/sentinel-admin/README.md` | 3.4 KB | Frontend-specific readme with live database data snapshots |

#### `frontend/sentinel-admin/README.md` — Key Sections
- **Live Data Snapshot**: 3-row snapshots from 5 PostgreSQL tables showing real test data:
  - **Users**: 3 rows (org_admin, security_analyst, viewer roles)
  - **API Keys**: 3 keys (all revoked in snapshot — `sk_sentinel_xxxxxx/yyyyyy/zzzzzz`)
  - **Live Events**: login_success (risk 0), scanner_detected (risk 85), path_scan_detected (risk 70)
  - **Security Alerts**: 3 alerts (directory-brute-force HIGH, risk-scoring CRITICAL, security-tool-detection CRITICAL)
  - **Risk History**: time-series risk scores (0, 0, 100)
- **Technical Stack**: React 18, TanStack Query v5, Zustand, Tailwind, WebSockets
- **Getting Started**: 4-step quick start

---

## 4. Backend — `sentinel-core`

### 4.1 Overview
- **Framework**: Node.js using [Fastify](https://fastify.dev/) for high-throughput HTTP
- **Language**: TypeScript (compiled to `/dist`)
- **Port**: `3000` (development)
- **Package**: `backend/sentinel-core/package.json`

### 4.2 Controllers (HTTP Handlers)

| Controller | Size | Responsibility |
|-----------|------|---------------|
| `org.controller.ts` | 13.8 KB | Organization management, API key CRUD, detection settings |
| `auth.controller.ts` | 9.2 KB | Login, logout, JWT refresh, invite flows |
| `ingestion.controller.ts` | 8.0 KB | Raw event ingestion from M2M clients |
| `user.controller.ts` | 7.4 KB | User CRUD, role management |
| `device.controller.ts` | 3.5 KB | Device session tracking and revocation |
| `alert.controller.ts` | 3.1 KB | Alert CRUD and lifecycle (acknowledge/resolve/dismiss) |
| `apikey.controller.ts` | 2.3 KB | API key generation and revocation |
| `audit.controller.ts` | 1.9 KB | Audit log retrieval |
| `dashboard.controller.ts` | 1.4 KB | Analytics aggregates for dashboard |
| `notification.controller.ts` | 1.1 KB | Push notification delivery |

### 4.3 Services (Business Logic)

| Service | Size | Responsibility |
|---------|------|---------------|
| `metrics.service.ts` | 6.2 KB | Prometheus metrics aggregation |
| `dashboard.service.ts` | 5.8 KB | Stats aggregation for the SOC dashboard |
| `device.service.ts` | 5.6 KB | Device fingerprinting and trust management |
| `alert.service.ts` | 5.4 KB | Alert lifecycle management and risk correlation |
| `ingestion.service.ts` | 4.9 KB | Event validation, enrichment, DB write |
| `auth.service.ts` | 4.7 KB | JWT signing/verification, bcrypt password ops |
| `mailer.service.ts` | 4.4 KB | Transactional email (invite tokens, alerts) |
| `retention.service.ts` | 3.9 KB | Data retention policy enforcement |
| `ratelimit.service.ts` | 3.4 KB | Redis-backed per-org rate limiting |
| `apikey.service.ts` | 4.1 KB | API key hashing (SHA-256) and validation |
| `org.service.ts` | 1.7 KB | Organization provisioning |
| `notification.service.ts` | 1.6 KB | Notification routing |
| `event.service.ts` | 1.6 KB | Event fetch and pagination |
| `broadcast.service.ts` | 1.2 KB | Redis pub/sub WebSocket broadcast relay |
| `audit.service.ts` | 1.1 KB | Audit trail write operations |

### 4.4 Middleware

| Middleware | Size | Responsibility |
|-----------|------|---------------|
| `apikey.middleware.ts` | 3.3 KB | Validates `sk_sentinel_*` API keys, checks revocation, enforces rate limits |
| `auth.middleware.ts` | 2.2 KB | Verifies JWT tokens from cookies and Authorization headers |
| `permission.middleware.ts` | 2.2 KB | RBAC permission gate — enforces granular permissions per route |
| `org-isolation.middleware.ts` | 1.3 KB | Ensures all DB queries are scoped to the authenticated org |

---

## 5. Frontend — `sentinel-admin`

### 5.1 Overview
- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **Port**: `5173` (Vite dev server)
- **Styling**: TailwindCSS (glassmorphism dark-mode aesthetic)

### 5.2 Feature Modules (`src/features/`)

| Feature | Route | Description |
|---------|-------|-------------|
| `dashboard/` | `/` | SOC overview — detection velocity, critical threats, risk trends |
| `events/` | `/live-events` | Real-time WebSocket event stream with payload viewer |
| `alerts/` | `/alerts` | Security alert management — acknowledge/resolve/dismiss |
| `detection/` | `/detection` | Configure heuristic rules (enable/disable attack signatures) |
| `organizations/` | `/organizations` | Multi-tenant org management + API key lifecycle |
| `users/` | `/users` | Identity & Access management (RBAC roles) |
| `settings/` | `/settings` | Audit logs & data retention policies |
| `auth/` | `/login` | Login page + invitation acceptance flows |

### 5.3 Core Libraries (`src/lib/`)

| File | Purpose |
|------|---------|
| `api.ts` | Axios HTTP client with JWT interceptors and base URL config |
| `store.ts` | Zustand global store — JWT persistence, user payload, org context |
| `rbac.ts` | Frontend permission check utilities matching backend RBAC model |
| `services/` | Typed HTTP client functions for each backend controller group |

### 5.4 Key Packages (`package.json`)
- `react@18`, `react-dom@18`
- `@tanstack/react-query@5` — server state management and caching
- `zustand` — client state management (persistent auth)
- `tailwindcss` — utility-first CSS framework
- `lucide-react` — icon library
- `axios` — HTTP client
- `vite` — development server and bundler
- `vitest` — unit test runner

---

## 6. Demo Application — `acme-portal`

### 6.1 Overview
The `demo/acme-portal` is an **intentionally vulnerable mock corporate employee web portal** designed to generate realistic attack telemetry for Sentinel demonstrations.

| File | Size | Description |
|------|------|-------------|
| `server.js` | 29.6 KB | Express server with built-in Sentinel SDK middleware |
| `index.html` | 29.6 KB | Corporate portal frontend UI |
| `start.bat` | 1.0 KB | Windows quick-launch batch file |

### 6.2 How It Works
1. Employees (or attackers) visit `http://<sentinel-portal>`
2. The built-in Express middleware intercepts every HTTP request
3. It extracts: **IP address**, **User-Agent string**, **Request path**, **Authentication outcome**
4. It fires an async POST to `POST /events/log` on Sentinel Core with an `Authorization: Bearer sk_sentinel_*` header
5. Sentinel receives, queues, scores, stores, and broadcasts the event

### 6.3 Attack Simulation
- Running `nikto -h localhost:4000` triggers `scanner_detected` events (risk score 85)
- Running `dirb http://localhost:4000` triggers `directory-brute-force` alerts (risk score >80)
- Repeated failed logins trigger `rapid-failed-logins` rule

---

## 7. Database Schema Evolution (Migrations)

The database schema has evolved through **24 SQL migration files**, reflecting iterative feature development:

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` (3.6 KB) | Core tables: `organizations`, `users`, `api_keys`, `events` |
| `002_enrollment_tokens.sql` | Device enrollment token support |
| `003_event_processed_at.sql` | Added `processed_at` timestamp to events |
| `004_alerts_table.sql` (1.2 KB) | `alerts` table — security anomaly records |
| `005_rapid_failed_logins_indexes.sql` | Performance indexes for login failure queries |
| `006_alert_fingerprints.sql` | Alert deduplication fingerprint column |
| `007_refresh_token_families.sql` | JWT refresh token family tracking (anti-reuse) |
| `008_alert_lifecycle.sql` (1.6 KB) | Alert status columns (acknowledged, resolved, dismissed) |
| `009_org_detection_settings.sql` | Per-org configurable detection rule settings |
| `010_device_revocation.sql` | Device session revocation support |
| `011_production_indexes.sql` (1.3 KB) | Production-grade query performance indexes |
| `013_phase1_tenant_hardening.sql` | Multi-tenant isolation improvements |
| `014_api_keys.sql` | API key table improvements (prefix, rate limit columns) |
| `015_invite_tokens.sql` | User invitation token system |
| `016_org_event_quota.sql` | Per-org event quotas |
| `017_events_partitioning.sql` (5.3 KB) | **Largest migration** — PostgreSQL table partitioning for events |
| `018_alert_indexes.sql` (1.1 KB) | Alert query performance indexes |
| `019_fix_invite_tokens.sql` | Bug fix on invite token constraints |
| `020_relax_alert_fk.sql` | Relaxed foreign key constraints on alerts |
| `021_phase5_alerts_schema.sql` | Phase 5 alert schema refinements |
| `022_production_indexes.sql` (1.2 KB) | Additional production indexes |
| `022_user_presence.sql` | User online/presence tracking |
| `023_risk_history.sql` | Time-series `risk_history` table for trend charts |
| `024_notifications_table.sql` | In-app notifications table |

> [!NOTE]
> Migration `012` is missing from the sequence. This may be an intentional skip or an accidental gap worth investigating.

---

## 8. Detection Engine

Located at `backend/sentinel-core/src/detection/`, the engine is the analytical core of Sentinel.

### 8.1 Architecture
- `engine.ts` — Orchestrates rule execution against incoming events
- `registry.ts` — Dynamic rule loader and registry
- `types.ts` — TypeScript interfaces for rules and events

### 8.2 Detection Rules (7 Rules)

| Rule File | Threat Detected |
|-----------|----------------|
| `security-tool-detection.rule.ts` (1.6 KB) | Matches known hacking tool User-Agents (Nikto, SQLMap, Masscan, etc.) → Risk: Critical (85+) |
| `rapid-failed-logins.rule.ts` (2.4 KB) | Burst detection for failed login attempts within a time window → Risk: High |
| `directory-brute-force.rule.ts` (993 B) | Rapid probe of enumerable paths (e.g., `/admin`, `/wp-login`) → Risk: High (>80) |
| `distributed-login.rule.ts` (1.6 KB) | Login failures from multiple distinct IPs targeting same account → Risk: High |
| `password-spraying.rule.ts` (1.5 KB) | Low-and-slow login attempts across many accounts → Risk: Medium-High |
| `fingerprint-campaign.rule.ts` (1.6 KB) | Coordinated fingerprinting activity (systematic path/header probing) |
| `risk-scoring.rule.ts` (2.2 KB) | Aggregate behavioral risk scoring — rolls up multi-signal threat index |

### 8.3 Detection Levels
| Level | Method | Example |
|-------|--------|---------|
| Signature | Known tool UA string match | `nikto`, `sqlmap` in User-Agent |
| Threshold | Time-bound rate anomaly | >10 login failures in 60s |
| Behavioral | Cross-signal risk aggregation | Combined score across all event types |

---

## 9. Deployment & DevOps

### 9.1 Docker Compose (Development)
`backend/sentinel-core/docker-compose.yml` (3.8 KB) defines:
- **PostgreSQL** — Primary relational database
- **PgBouncer** — PostgreSQL connection pooler
- **Redis** — In-memory cache + pub/sub broker
- **Grafana** — Dashboard visualization for metrics
- **Prometheus** — Metrics scraping

### 9.2 Docker Compose (Production)
`deployment/docker-compose.prod.yml` (5.8 KB) — Extended production stack with:
- Nginx reverse proxy (`deployment/nginx/`)
- Full service orchestration with health checks

### 9.3 Dockerfiles
| Location | Description |
|----------|-------------|
| `backend/sentinel-core/Dockerfile` | Node.js backend image (799 B) |
| `frontend/sentinel-admin/Dockerfile` | Multi-stage frontend build image (2.4 KB) — build stage + Nginx serve stage |

### 9.4 Monitoring Stack
- **Grafana** (`backend/sentinel-core/grafana/`) — Pre-configured dashboards
- **Prometheus** (`backend/sentinel-core/prometheus/`) — Scrape configs
- **Alertmanager** (`backend/sentinel-core/alertmanager/`) — Alert routing rules

### 9.5 CI/CD
- `.github/` directories present in both `backend/sentinel-core/` and `frontend/sentinel-admin/` — GitHub Actions workflows configured

---

## 10. API Specification Summary

### Authentication
| Method | Token Type | Used For |
|--------|-----------|---------|
| JWT Cookie | `acme_token` cookie | Browser dashboard access |
| Bearer JWT | `Authorization: Bearer <jwt>` | Programmatic dashboard access |
| API Key | `Authorization: Bearer sk_sentinel_*` | M2M event ingestion |

### Key API Endpoints

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| `POST` | `/events/log` | API Key | Ingest telemetry event → BullMQ queue |
| `GET` | `/events` | JWT + `EVENT_READ` | Paginated historical events |
| `PATCH` | `/alerts/:id/resolve` | JWT + `ALERT_UPDATE` | Mark alert resolved |
| `PATCH` | `/alerts/:id/dismiss` | JWT + `ALERT_UPDATE` | Dismiss alert |
| `GET` | `/users` | JWT + `ORG_ADMIN` | List org users |
| `PATCH` | `/users/:id/role` | JWT + `ORG_ADMIN` | Update user role |
| `DELETE` | `/users/:id` | JWT + `ORG_ADMIN` | Remove user |
| `GET` | `/organizations/settings` | JWT | Fetch detection config |
| `PATCH` | `/organizations/settings` | JWT | Update detection heuristics |

### Event Ingestion Schema
```json
{
  "event_type": "login_failure",
  "payload": {
    "ip_address": "8.8.8.8",
    "user_agent": "Mozilla/5.0...",
    "email": "intruder@domain.com",
    "risk_score": 65
  }
}
```

---

## 11. Technology Stack Summary

### Backend
| Technology | Version | Role |
|-----------|---------|------|
| Node.js | v18+ | Runtime |
| Fastify | — | HTTP framework (high throughput) |
| TypeScript | — | Type-safe development |
| PostgreSQL | — | Primary relational database |
| Redis | — | Pub/Sub broker + session/rate limiting |
| BullMQ | — | Background job queue (event processing) |
| bcrypt | — | Password hashing |
| JWT | — | Authentication tokens |
| SHA-256 | — | API key hashing |
| Prometheus | — | Metrics instrumentation |

### Frontend
| Technology | Version | Role |
|-----------|---------|------|
| React | 18 | UI library |
| Vite | — | Build tool + dev server |
| TypeScript | — | Type-safe development |
| TailwindCSS | — | Utility-first CSS (dark glassmorphism) |
| Zustand | — | Global client state (persistent auth) |
| TanStack Query | v5 | Server state, caching, invalidation |
| Axios | — | HTTP client |
| Lucide React | — | Icon system |
| WebSocket API | native | Real-time event stream |
| Vitest | — | Unit testing framework |

### Infrastructure
| Technology | Role |
|-----------|------|
| Docker | Containerization |
| Docker Compose | Multi-service orchestration |
| Nginx | Reverse proxy |
| PgBouncer | PostgreSQL connection pooling |
| Grafana | Metrics visualization |
| GitHub Actions | CI/CD |

---

## 12. Security Architecture

### Multi-Tenancy Isolation
Every database table containing sensitive data includes an `organization_id` foreign key. The `org-isolation.middleware.ts` automatically scopes all queries to the authenticated org — preventing cross-tenant data leakage.

### RBAC (Role-Based Access Control)
Three defined roles:

| Role | Permissions |
|------|-------------|
| `org_admin` | Full organization control — user management, API keys, settings |
| `security_analyst` | Read events, manage alerts, view detection rules |
| `viewer` | Read-only access to events and alerts |

### API Key Security
- Format: `sk_sentinel_` + 16 random bytes (hex) = 32-char suffix
- Storage: Only SHA-256 hash is stored in the database — raw key shown once at creation
- Display: Only the first 14 characters (`sk_sentinel_xxxx`) stored as `prefix` for identification
- Rate limiting: Per-org configurable (default 1000 req/min), enforced via Redis counters
- Revocation: Soft-delete with `revoked_at` timestamp

### JWT Security
- Refresh token families tracked to prevent token reuse attacks (migration 007)
- Device trust and revocation system (migrations 010, 002)
- Tokens stored in HttpOnly cookies for XSS resistance

### Data Sanitization
- All `.env` files with secrets are git-ignored
- `.env.example` provides safe templates
- No hardcoded credentials in source code

---

## 13. Project Health & Issues Found

> [!IMPORTANT]
> The following are observations noted during this analysis:

### ✅ Strengths
- **Comprehensive documentation**: 8 markdown files covering all aspects
- **Mature migration history**: 24 sequential SQL migrations showing iterative development
- **Security-first design**: RBAC, org isolation, API key hashing, JWT families
- **Production-ready infrastructure**: Grafana, Prometheus, Alertmanager, PgBouncer configured
- **Well-structured codebase**: Clear separation of controllers, services, middleware, detection engine

### ⚠️ Issues to Address

| # | Issue | Location | Severity |
|---|-------|----------|----------|
| 1 | **Missing migration `012`** | `db/migrations/` | Low — gap in sequence, worth documenting |
| 2 | **Duplicate `022` migration names** | `db/migrations/` | Medium — `022_production_indexes.sql` and `022_user_presence.sql` both numbered 022, could cause migration runner conflicts |
| 3 | **Root-level `sentinel-admin/`** | `/sentinel-admin` at root | Low — appears to be a leftover pre-restructuring directory |
| 4 | **`scripts/` directory is empty** | `/scripts/` | Low — placeholder with no content |
| 5 | **`push_debug.log` and `push_final.log` in root** | Root | Low — debug logs committed to repo; should be gitignored |
| 6 | **`cookie.txt` and `ookie-jar` files in backend** | `backend/sentinel-core/` | Medium — these appear to be test/debug artifacts left in the codebase |
| 7 | **`ts-errors.txt` in frontend** | `frontend/sentinel-admin/` | Low — TypeScript error dump committed to repo |
| 8 | **`setup.md` hardcoded GitHub URL** | `setup.md:18` | Low — `git clone https://github.com/your-username/sentinel.git` should use actual URL |

### 🔧 Recommended Quick Fixes

```gitignore
# Add to root .gitignore:
push_debug.log
push_final.log
ts-errors.txt
cookie.txt
ookie-jar
```

For the duplicate migration `022`, rename `backend/sentinel-core/src/db/migrations/022_user_presence.sql` to `025_user_presence.sql` to maintain a clean sequential history.

---

*Report generated by Antigravity AI on 2026-03-14. All file sizes and line counts are accurate as of the snapshot date.*
