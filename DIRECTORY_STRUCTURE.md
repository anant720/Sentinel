# Sentinel Directory Structure

This document outlines the organization of the Sentinel monorepo for Version 26.3.0.

```text
sentinel/
├── backend/sentinel-core/       # Node.js + Fastify + PostgreSQL Core API
│   ├── src/
│   │   ├── config/              # Environment & app configurations
│   │   ├── controllers/         # HTTP request handlers (Events, Auth, Org, etc.)
│   │   ├── db/
│   │   │   └── migrations/      # SQL schema definitions & updates (001-020)
│   │   ├── detection/           # Core security logic
│   │   │   ├── engine.ts        # The main Threat Detection Engine
│   │   │   └── rules/           # Individual heuristic rules (Brute force, scanner UA, etc.)
│   │   ├── lib/                 # Core utilities (Postgres client, Redis client, Logger)
│   │   ├── middleware/          # Express/Fastify request middleware (Auth, Isolation, RBAC)
│   │   ├── queues/              # Async task queues (Event workers)
│   │   ├── rbac/                # Roles & Permissions definitions
│   │   ├── security/            # Crypto and JWT handling utilities
│   │   ├── services/            # Business logic (Dashboard, Alerts, Ingestion, Orgs)
│   │   ├── types/               # TypeScript definitions
│   │   └── workers/             # Background job processors
│   ├── docker-compose.yml       # Production services (Redis, Grafana, Prom, PG)
│   └── package.json             # Backend dependencies
│
├── frontend/sentinel-admin/     # React + Vite Admin Console
│   ├── src/
│   │   ├── components/ui/       # Shared UI components (Toast, Modals, Buttons)
│   │   ├── features/            # Domain-specific pages and logic
│   │   │   ├── alerts/          # Security Alerts management
│   │   │   ├── auth/            # Login & Invitation flows
│   │   │   ├── dashboard/       # Main statistics overview
│   │   │   ├── detection/       # Rules and settings configuration
│   │   │   ├── events/          # Live event streaming & telemetry viewer
│   │   │   ├── organizations/   # Multi-tenant organization configs & API keys
│   │   │   ├── settings/        # Audit logs & retention
│   │   │   └── users/           # Identity & Access management
│   │   ├── hooks/               # Custom React hooks (e.g. useSecurityStream for WS)
│   │   ├── layouts/             # Dashboard shell and sidebar navigations
│   │   ├── lib/                 # Shared utilities
│   │   │   ├── api.ts           # Axios client configuration
│   │   │   ├── rbac.ts          # Frontend role-based access checks
│   │   │   ├── store.ts         # Zustand global state (Auth & Org)
│   │   │   └── services/        # HTTP client methods matching backend controllers
│   │   └── types/               # Frontend TypeScript interfaces
│   └── package.json             # Frontend dependencies
│
├── demo/acme-portal/            # The vulnerable Mock Employee Portal
│   ├── public/                  # Static HTML/CSS/JS for the portal
│   ├── server.js                # Express server with Sentinel Intrusion Detection middleware built-in
│   └── package.json             # Portal dependencies
│
└── docs/                        # Project Documentation
    ├── screenshots/             # UI Screenshots
    ├── api-specification.md     # Sentinel Core API paths & methods
    ├── architecture.md          # Technical architecture
    ├── system-design.md         # High-level system requirements
    └── walkthrough_repo_prep.md # Setup guide
```
