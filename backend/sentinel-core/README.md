# ⚙️ Sentinel Core API

**Version 26.3.2 — Production Hardened**

Sentinel Core is the high-performance telemetry engine that powers the platform. This directory contains the Node.js (Fastify) backend and the core threat detection logic.

## 🛡️ Security First (v26.3.2 Hardening)
This version has been strictly hardened for production readiness:
- **Zero Hardcoded Secrets**: All default passwords and JWT secrets have been removed.
- **Fail-Fast Validation**: The server will refuse to start if critical environment variables (JWT, DB, Redis, SMTP) are missing or insecure.
- **Lean Runtime**: All legacy demo scripts and local testing junk have been permanently excised.

---

## 🚀 Quick Start (Production)

### 1. Configure Environment
Copy the example production config and fill in your secure secrets:
```bash
cp .env.production .env
```
**Required Variables:**
- `DATABASE_URL`: Your PostgreSQL connection string.
- `REDIS_URL`: Your Redis connection string.
- `JWT_SECRET`: Minimum 32-character secure string.
- `SMTP_PASS`: Your Brevo/SMTP transactional key.

### 2. Deployment (Docker)
```bash
docker compose up -d
```

---

## 📂 Key Modules
- `src/detection/`: The core Heuristic Engine and threat rules.
- `src/db/migrations/`: SQL schema definitions (001-020).
- `src/queues/`: Async event processing via BullMQ.
- `src/rbac/`: Multi-tenant role definitions.

---

## 📜 Metadata
- **Framework**: Fastify + TypeScript
- **Runtime**: Node.js 20+
- **Port**: 3001
