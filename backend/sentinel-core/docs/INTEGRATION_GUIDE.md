# Sentinel Core — Integration Guide

> **Goal:** Get from zero to your first security alert in under 1 day of engineering effort.

---

## Step 1: Create Your Organization

**POST** `/organizations`

*Requires: Human JWT (admin account)*

```bash
curl -X POST https://your-sentinel.com/organizations \
  -H "Authorization: Bearer <your-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme Corp", "slug": "acme-corp" }'
```

**Response:**
```json
{
  "organization": { "id": "org-uuid", "name": "Acme Corp", "slug": "acme-corp" },
  "default_api_key": "sk_live_xxxxxxxxxx",
  "message": "Organization instantiated successfully. Store the default API key securely."
}
```

> ⚠️ **Store `default_api_key` immediately.** It is returned exactly once and cannot be retrieved again.

---

## Step 2: Register a Device

**POST** `/devices/register`  (*Public endpoint*)

```bash
# First, generate an RSA key pair for your server/device
openssl genrsa -out device-private.pem 2048
openssl rsa -in device-private.pem -pubout -out device-public.pem

# Register the device with the public key
curl -X POST https://your-sentinel.com/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "enrollment_token": "<token-from-enrollment-token-api>",
    "device_name": "prod-api-server-01",
    "device_type": "api_server",
    "public_key": "<contents-of-device-public.pem>"
  }'
```

**Response:**
```json
{
  "device": { "id": "device-uuid", "device_name": "prod-api-server-01" }
}
```

---

## Step 3: Install the SDK

```bash
npm install @sentinelcore/sdk
```

---

## Step 4: Send Your First Event

```typescript
import { createSign } from 'crypto';
import { readFileSync } from 'fs';
import { SentinelClient, CanonicalEventType } from '@sentinelcore/sdk';

const PRIVATE_KEY = readFileSync('./device-private.pem', 'utf-8');
const DEVICE_ID   = 'your-device-uuid';

const client = new SentinelClient({
    apiKey:  'sk_live_YOUR_KEY_HERE',
    baseUrl: 'https://your-sentinel.com',
});

function sign(payload: Record<string, unknown>): string {
    const s = createSign('SHA256');
    s.update(JSON.stringify(payload));
    return s.sign(PRIVATE_KEY, 'base64');
}

// Emit a login failure — this will trigger the RapidFailedLogins detection rule
for (let i = 0; i < 5; i++) {
    const payload = {
        user_id:       'user-123',
        timestamp:     Date.now(),
        email:         'alice@acme.com',
        reason:        'invalid_password',
        attempt_count: i + 1,
    };

    await client.logEvent({
        event_type: CanonicalEventType.LOGIN_FAILURE,
        device_id:  DEVICE_ID,
        timestamp:  Date.now(),
        payload,
        signature:  sign(payload),
    });
}

console.log('5 login_failure events sent!');
await client.destroy();
```

---

## Step 5: View Alert in Dashboard

After sending 5+ `login_failure` events for the same `email` within the detection window, Sentinel Core will:

1. **Detect** the brute-force pattern via `RapidFailedLoginsModule`
2. **Deduplicate** via `Redis SET NX` + `PostgreSQL ON CONFLICT DO NOTHING`
3. **Create** exactly 1 alert with severity `high`
4. **Surface** it on the Dashboard under `Alerts → Open`

**GET** `/alerts?status=open&severity=high`

```bash
curl https://your-sentinel.com/alerts?status=open&severity=high \
  -H "Authorization: Bearer <your-analyst-jwt>"
```

---

## Inviting Your Security Team

```bash
# As ORG_ADMIN, generate an invite for an analyst
curl -X POST https://your-sentinel.com/organizations/invite \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{ "email": "analyst@acme.com", "role": "security_analyst" }'

# The analyst follows the invite link and creates their password
curl -X POST https://your-sentinel.com/organizations/accept-invite \
  -H "Content-Type: application/json" \
  -d '{
    "invite_token": "<token-from-invite-response>",
    "full_name": "Jane Analyst",
    "password": "SecurePassword123!"
  }'
```

---

## API Reference Summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Login, receive JWT |
| `POST` | `/auth/refresh` | Cookie | Rotate refresh token |
| `POST` | `/auth/logout` | JWT | Revoke session |
| `POST` | `/organizations` | JWT (admin) | Create organization |
| `POST` | `/organizations/invite` | JWT (admin) | Invite team member |
| `POST` | `/organizations/accept-invite` | Public | Accept invite, create account |
| `POST` | `/devices/register` | Enrollment Token | Register device |
| `POST` | `/events/ingest` | `sk_live_` Key | Ingest security event |
| `GET` | `/alerts` | JWT | List alerts (paginated) |
| `PATCH` | `/alerts/:id/acknowledge` | JWT (analyst) | Acknowledge alert |
| `PATCH` | `/alerts/:id/resolve` | JWT (analyst) | Resolve alert |
| `GET` | `/health/live` | Public | Liveness probe |
| `GET` | `/health/ready` | Public | Readiness probe |
| `GET` | `/metrics` | Public | Prometheus metrics |

### Error Codes

| Code | Meaning |
|---|---|
| `400` | Bad Request — validation failure (check `details` field) |
| `401` | Unauthorized — missing or invalid JWT / API key |
| `403` | Forbidden — insufficient permissions for this action |
| `404` | Not Found — resource doesn't exist or is cross-tenant |
| `429` | Too Many Requests — rate limit exceeded |
| `500` | Internal Server Error — unexpected error, check logs |

### Rate Limits

| Scope | Default Limit |
|---|---|
| Login endpoint | 10 req/min per IP |
| Ingestion endpoint | 1000 req/min per API key (configurable) |
| Global | 100k req/min (cross-node, Redis-backed) |
