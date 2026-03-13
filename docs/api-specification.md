# Sentinel Core API Specification (Version 26.3.0)

**A Personal Project by Anant Suthar**

## Overview
The Sentinel Core API drives the real-time event streaming and monitoring platform. Built using Node.js and Fastify, it's designed to handle heavy transactional event loads while isolating data per organization.

## Authentication Paradigms
Sentinel 26.3.0 features dual-layer authorization:
- **JWT (JSON Web Tokens)**: Secures all Analyst/Admin Dashboard HTTP interactions. Requires active `.acme_token` cookies or Bearer Authorization headers. 
- **API Keys**: Secures machine-to-machine integrations. Every organization can generate and revoke segmented API Keys directly from the dashboard. Format: `Authorization: Bearer sk_sentinel_...`

---

## 1. M2M Event Ingestion API

### Log an Event
`POST /events/log`

**Description:** Streams an activity log directly into the telemetry database and triggers the BullMQ risk analysis worker.

**Headers:**
`Authorization: Bearer <ORGANIZATION_API_KEY>`

**Request Body Example:**
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

**Responses:**
- `202 Accepted`: Event queued successfully.
- `401 Unauthorized`: Denied. API Key is invalid, inactive, or rate-limited.

---

## 2. Admin APIs (Internal Operations)

A massive suite of APIs support the React Dashboard. All routes require valid Active JWTs with matching RBAC claims.

### Retrieve Telemetry Feed (Polling)
`GET /events`
- Requires: `EVENT_READ` permission
- Returns paginated blocks of historical security events.

### Acknowledge / Resolve / Dismiss Security Alerts
`PATCH /alerts/:id/resolve`
`PATCH /alerts/:id/dismiss`
- Requires: `ALERT_UPDATE` permission
- Updates the investigation status of an anomaly detected by the Risk Engine.

### Identity Management and RBAC Roles
`GET /users`
`PATCH /users/:id/role`
`DELETE /users/:id`
- Scope requirement: `ORG_ADMIN` ONLY.
- Full administration over workspace analysts and viewer permissions.

### Organization & Security Settings
`GET /organizations/settings`
`PATCH /organizations/settings`
- Dynamically configures the live detection heuristic rules (e.g., enable/disable brute-force catchers, change session tracking lifetimes).
- Returns the full JSON configuration object payload to the detection engine.
