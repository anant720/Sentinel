# 🛡️ Sentinel Security Platform
**Version 26.3.2 — A Project by Anant Suthar**

---

### 🌐 Live Production Deployment
- **SOC Dashboard (Vercel):** [https://sentinel-admin-roan.vercel.app](https://sentinel-admin-roan.vercel.app)
- **API Core:** Private Service on **Render**
- **Database:** **Supabase** (AWS ap-southeast-1)
- **Real-time Layer:** **Upstash** (Serverless Redis)

---

- **🛡️ Production Hardening**: Strict "Fail-Fast" validation for environment secrets, with an auto-migrator natively integrated for robust Render deployments.
- **🔐 Total Zero-Knowledge E2EE**: Sensitive event payloads and organization detection structures are locally encrypted using **AES-GCM** with **PBKDF2** derived keys. The backend only stores ciphertext.
- **📍 High-Fidelity Geo-Intelligence**: Advanced multi-layer location resolution (GPS + Cloudflare Headers + Nominatim API) providing exact street-level accuracy and prioritizing real locations (e.g. Pune) over fallback ISP hubs.
- **🧠 Impossible Travel Detection**: A new high-frequency behavioral module tracking concurrent logins across physically impossible distances utilizing the Haversine formula.
- **💓 High Availability & Uptime**: Designed with a Fail-Closed Redis integration, database-degradation hooks into a 503 strategy, and a **10-minute automated Uptime Monitor** that guarantees the Render backend stays warm and eliminates cold starts.

---

**Sentinel** is a professional-grade, multi-tenant **cybersecurity telemetry and monitoring platform** built from the ground up. It provides real-time visibility into an organization's security posture by tracking login failures, parsing API request streams, mapping geographic IP origins, and catching brute-force scanners before they breach the perimeter.

Built as a personal full-stack engineering project, Sentinel demonstrates:
- 🔴 **Live WebSocket threat streaming** — events appear on the SOC dashboard as they happen
- 🔐 **Privileged Action Protection** — critical settings require admin password re-verification
- 🏢 **Single-Admin Lockdown** — unique security policy to prevent credential sprawl
- 🧠 **Intrinsic Risk Scoring** — automated behavioral analysis of every incoming event
- ⚡ **BullMQ async processing** — high-throughput event ingestion without blocking the HTTP layer
- 🎯 **Configurable heuristic engine** — 100+ pluggable detection rules, togglable and tunable per organization
- 📧 **Automated Email Invitations** — professional onboarding flow via Brevo Transactional API
- ☁️ **Fully Cloud Operational** — Live on Render (Backend), Vercel (Frontend), Supabase (DB), and Upstash (Redis).

> **Data Status:** This project is fully connected to a live production database. Administrative activities are tracked in a dedicated audit trail, while security telemetry streams through a high-performance Redis pub/sub layer.

---

## 2️⃣ Architecture Diagram

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENTINEL PLATFORM v26.3.2                       │
│                                                                         │
│  ┌─────────────────┐      HTTPS / E2EE      ┌────────────────────┐      │
│  │  Vercel         │ ◀─── (JWT / API Key) ──▶│  Render / Docker   │      │
│  │  (Frontend SOC) │                        │  (Sentinel Core)   │      │
│  └───────▲─────────┘                        └─────────┬──────────┘      │
│          │                                             │                │
│          │            (Optional Real-time)             │ (Critical Path)│
│  ┌───────┴─────────┐                         ┌─────────▼───────────┐    │
│  │  Upstash        │ ◀─────── /ws ───────────┤  Supabase           │    │
│  │  (Redis)        │   (Degraded Fallback)   │  (PostgreSQL)       │    │
│  └─────────────────┘                         └─────────────────────┘    │
│                                                                         │
│  Mailing: Brevo API (Transactional)                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

### 🛡️ Resilience Architecture (Self-Healing Core)
In v26.3.2, Sentinel is engineered for **High Availability** even if infrastructure components fail.
- **Fail-Soft Redis**: If Upstash/Redis becomes unreachable, the platform automatically enters **Degraded Mode**. 
- **Persistence Priority**: Security events are always persisted to Supabase first. Redis is only used for the "Live WebSocket Stream". 
- **Zero-Block Ingestion**: API requests never wait for the broadcast layer, ensuring security ingestion is never delayed by live-monitoring latency.

### Technical Data Flow
1. **Ingest** — An attacker hits your corporate portal. The Sentinel SDK/Middleware fires a POST to `/events/log`.
2. **Queue** — Fastify accepts the payload and pushes it to a BullMQ worker queue.
3. **Analyse** — A background worker runs the event through all 7 active detection rules, computing a `risk_score`.
4. **Persist** — The scored event is written to Supabase (PostgreSQL).
5. **Broadcast** — Upstash (Redis) publishes the new event and audit logs to open Pub/Sub channels.
6. **Visualise** — The Vercel-hosted Admin Console receives a WebSocket push instantly.

---

## 3️⃣ Feature List

### 🔴 Real-Time Threat Intelligence
- **Live WebSocket Event Stream** — Events appear on the SOC dashboard with sub-second latency
- **Security Alert Engine** — Automatically raises Critical/High/Warning alerts when risk thresholds are crossed
- **Risk Score Timeline** — Time-series chart of the organization's aggregate risk score

### 🛡️ Threat Detection (8 Pluggable Rules)
| Rule | What It Catches |
|------|----------------|
| `impossible_travel` | Physical login velocity exceeding commercial jet speeds (800km/h) across geographic zones. |
| `security_tool_detection` | Known scanner User-Agents (Nikto, SQLMap, Masscan, etc.) |
| `rapid_failed_logins` | Burst of failed auth attempts from a single IP or account |
| `directory_brute_force` | Rapid probing of enumerable paths (`/admin`, `/.env`, etc.) |
| `distributed_login` | Login failures from many distinct IPs targeting the same account |
| `password_spraying` | Low-and-slow logins across many accounts from one IP |
| `fingerprint_campaign` | Systematic path/header probing indicating reconnaissance |
| `risk_scoring` | Aggregate behavioral risk index across all signal types |

### 🏢 Multi-Tenant Architecture
- Every API request is logically scoped to an `organization_id`
- Multiple organizations share one instance with zero data spillage
- Per-org API Key management with configurable rate limits

### 🔐 Identity & Access Management
| Role | Capabilities |
|------|-------------|
| `org_admin` | Full control — user management, API keys, detection settings |
| `security_analyst` | Manage alerts, read events, view detection config |
| `viewer` | Read-only access to events and resolved alerts |

### 📊 SOC Dashboard
- Detection velocity charts
- Top threats summary cards
- Alert status breakdown (Active / Acknowledged / Resolved / Dismissed)
- Live heatmap of event origins
- **Email Invitation System** — Invite team members with professional HTML templates

### ⚙️ Configuration & Audit
- Toggle individual detection rules on/off per organization
- Configurable data retention policies
- **Live Management Stream** — Separate WebSocket channel for administrative actions (Invites, User management)
- Full organization-wide audit trail with real-time broadcasting

### 📧 Transactional Mailer (Brevo)
- **Invite System** — Professional onboarding with custom HTML templates.
- **REST API Integration** — Uses Brevo's V3 HTTP/REST API for high reliability and to bypass SMTP port restrictions in cloud environments (like Render).
- **Asynchronous Delivery** — Emails are triggered in the background to ensure no latency for the admin UI.

---

## 4️⃣ Screenshots

### Dashboard & Analytics
![Dashboard](docs/screenshots/Dashboard.png)

### Live Telemetry Stream
![Live Events](docs/screenshots/Live%20events.png)

### Security Alerts
![Security Alerts](docs/screenshots/Security%20alerts.png)

### Detection Logic Rules
![Detection Logic](docs/screenshots/Detection%20logic.png)

### Identity & Access Management
![Identity](docs/screenshots/Identity.png)

### Organization & API Keys
![Organization](docs/screenshots/Organization.png)

### Settings & Audit Logging
![Settings](docs/screenshots/Setting.png)

### Secure Login
![Login Page](docs/screenshots/Login%20page.png)

---

## 5️⃣ API Usage Example

Sentinel exposes a REST API secured by dual-layer authentication.

### Ingest a Security Event
```bash
curl -X POST https://your-sentinel-api.com/events/log \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk_sentinel_YOUR_KEY_HERE" \
  -d '{
    "event_type": "login_failure",
    "payload": {
      "ip_address": "203.0.113.42",
      "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      "email": "attacker@evil.com",
      "risk_score": 65
    }
  }'
```

---

## 6️⃣ SDK Integration Pattern

Sentinel is designed to integrate invisibly into any existing application via a lightweight middleware SDK.

```javascript
// Example: Integration via Middleware
const axios = require('axios');

function sentinelMiddleware(options) {
  const { sentinelUrl, apiKey } = options;

  return async function (req, res, next) {
    next();

    const payload = {
      event_type: 'http_request',
      payload: {
        ip_address: req.ip || '0.0.0.0',
        user_agent: req.headers['user-agent'] || 'unknown',
        path: req.path,
        method: req.method,
      }
    };

    axios.post(`${sentinelUrl}/events/log`, payload, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 3000,
    }).catch(() => {});
  };
}
```

---

## 7️⃣ Technical Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js, Fastify, TypeScript |
| **Database** | Supabase (PostgreSQL) |
| **Cache / Broker** | Upstash (Redis / BullMQ) |
| **Frontend** | React 18, Vite, TailwindCSS |
| **Real-Time** | WebSockets (Native) |
| **Mailing** | Brevo Transactional API |
| **Deployment** | Render (API), Vercel (Web), Supabase (DB) |

---

## License

MIT License — see [LICENSE](LICENSE) for details.
