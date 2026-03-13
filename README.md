# Sentinel Security Platform (Version 26.3.0)

**A Personal Project by Anant Suthar**

![Dashboard](docs/screenshots/Dashboard.png)

## Overview
Sentinel is a professional-grade, multi-tenant cybersecurity telemetry and monitoring platform built from the ground up for Version 26.3.0. It provides real-time visibility into an organization's security posture by tracking login failures, parsing API request streams, mapping geographic IP origins, and catching brute-force scanners before they breach the perimeter.

Built as a personal project, it demonstrates deep full-stack integration, complete with a live WebSocket event pipeline, role-based access control, PostgreSQL data modeling, and a real-time React analytics dashboard.

> **What does Version 26.3.0 mean?**
> The version string `26.3.0` indicates the exact timeline of this release. **26** stands for the year 2026, **3** stands for the month of March, and **0** indicates the initial major release of this architecture.

---

## 📸 System Previews

### 1. Dashboard & Analytics
The nerve center. Provides immediate top-down visibility into detection velocity, critical threats, and historical risk trends.
![Dashboard](docs/screenshots/Dashboard.png)

### 2. Live Telemetry Stream
Watch events flow in via WebSockets in real-time, complete with payload origin maps and source application tags.
![Live Events](docs/screenshots/Live%20events.png)

### 3. Identity & Access Management
RBAC-protected user management. Control who has access to the SOC dashboard.
![Identity](docs/screenshots/Identity.png)

### 4. Organization API Keys
Multi-tenant architecture. Manage API keys with rate-limiting constraints for ingest clients.
![Organization](docs/screenshots/Organization.png)

### 5. Detection Logic Rules
Configure the heuristics engine. Enable or disable specific attack signatures (e.g., Nikto scanner detection, Dirb brute-force mapping).
![Detection logic](docs/screenshots/Detection%20logic.png)

### 6. Security Alerts
Actionable intelligence. When the backend risk-scoring engine flags an anomaly, it lands here for analysts to acknowledge, dismiss, or resolve.
![Security alerts](docs/screenshots/Security%20alerts.png)

### 7. Settings & Audit Logging
Data retention policies and full organization-wide audit trails.
![Setting](docs/screenshots/Setting.png)

### 8. Hardware-Backed Authentication
Secure entry point for administrators and analysts.
![Login page](docs/screenshots/Login%20page.png)

---

## Technical Architecture

- **Backend**: Node.js (Fastify) with a custom Intrusion Detection Engine.
- **Database**: PostgreSQL (Prisma/SQL), Redis (for session/rate-limiting).
- **Frontend**: React 18, Vite, TailwindCSS, Zustand, TanStack Query.
- **Telemetry**: Real-time WebSocket streaming paired with HTTP fallback polling.

> **Note on Data:** The backend database was hosted entirely locally during development, ensuring complete data security. For a snapshot of the actual PostgreSQL tables generated during testing, see the `frontend/sentinel-admin/README.md` file.

## System Components

1. **`backend/sentinel-core`**: The Node.js API. Handles HTTP event ingestion, runs the risk calculation engine, and broadcasts alerts over WebSockets.
2. **`frontend/sentinel-admin`**: The React Admin Console. Allows analysts to view the live event stream, manage users, and configure detection logic.
3. **`demo/acme-portal`**: A intentionally vulnerable mock application simulating a corporate employee portal. It includes a built-in Sentinel SDK middleware that captures incoming HTTP requests (extracting IPs, User-Agents, and Paths) and streams them blindly to Sentinel for analysis.

## Getting Started

1. Set up the local PostgreSQL database and start the backend.
2. Configure `.env` in `backend/sentinel-core`.
3. Boot the frontend `sentinel-admin` console.
4. Run the `demo/acme-portal` to begin generating live HTTP telemetry. (Note: Try running `nikto` or `dirb` against `localhost:4000` to watch Sentinel catch the attack in real-time on `localhost:5173`).

### License
MIT License. See [LICENSE](LICENSE) for details.
