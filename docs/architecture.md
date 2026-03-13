# Sentinel Platform Architecture (Version 26.3.0)

**A Personal Project by Anant Suthar**

## Overview
Sentinel 26.3.0 is a highly decoupled, multi-tenant cybersecurity intelligence platform designed for deep application integration and real-time threat analysis. Built as a full-stack node ecosystem, it demonstrates advanced technical architecture patterns.

## Component Stack

### 1. Sentinel Core (Backend API)
- **Engine**: Node.js utilizing the Fastify framework for extreme throughput.
- **Database**: PostgreSQL handles the massive relational telemetry data (Events, Alerts, Identities).
- **In-Memory Cache & Broker**: Redis is utilized for both WebSocket session Pub/Sub broadcasting and background BullMQ processing.
- **Security Logic Engine**: Custom-built risk scoring algorithms, pattern detection heuristics, and RBAC authorization gateways.

### 2. Sentinel Admin Console (Frontend SOC)
- **Framework**: React 18 / Vite lightning-fast build pipeline.
- **Styling**: TailwindCSS provides a custom glass-morphism dark-mode aesthetic.
- **State Initialization**: Zustand strictly manages JWT persistence and nested user payload roles.
- **Data Lifecycle**: TanStack Query (React Query) aggressively caches and seamlessly invalidates stale analytics.

### 3. Acme Corporate Portal (Dummy Integration Target)
- **Framework**: Node.js / Express
- **Middleware SDK**: Contains a custom invisible middleware that scrapes inbound HTTP metadata (User-Agent string, Origin IP, Request Path) and streams it asynchronously to the Sentinel Core API via rate-limited API Keys.
- **Purpose**: Simulates an actual business application being actively tracked and under attack for real-world visualization.

## Technical Data Flow
1. **Ingestion**: A rogue user attacks the Acme Portal. The built-in SDK fires a payload to `/events/log`.
2. **Analysis**: Fastify intercepts the payload. BullMQ queues worker processes that calculate a `risk_score` by referencing active detection rules.
3. **Storage**: The event is structurally validated, serialized, and inserted into PostgreSQL.
4. **Broadcast**: Redis immediately publishes the successful detection to an open channel.
5. **Visualization**: A connected Sentinel Admin Console receives the WebSocket push, instantly prepending the alert string to the UI without requiring an HTTP refresh.
