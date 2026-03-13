# Deployment Operations Guide

Sentinel Core leverages highly optimized Multi-Stage Alpine Docker layers minimizing cold-start footprints natively securely.

## Prerequisites
- Docker Engine & Docker Compose (v2)
- Minimum 4GB RAM + 2 vCPU

## Fast Deployment
1. Ensure your `.env.production` defines critical cryptographic secrets (`JWT_SECRET`, `DATABASE_URL`).
2. Boot the cluster:
```bash
docker compose up --build -d
```
3. The cluster natively boots: PostgreSQL, PgBouncer, Redis, API, Workers (Replica=4), NGINX, and the complete Grafana Observability tier.

## Worker Scaling
The BullMQ Workers represent the CPU bottleneck natively parsing Threat Intelligence logic arrays. Scale them natively depending entirely on ingestion throughput limits:
```bash
docker compose scale workers=10
```

## CI/CD Pipeline
Continuous Integration evaluates every commit across GitHub Actions:
1. `npm run lint` evaluates strict TypeScript mappings cleanly.
2. `vitest run` evaluates 5 unique Chaos Adversarial payloads protecting the baseline natively.
3. The platform natively ships compiled Monolith boundaries to DockerHub automatically triggering remote SSH pull bindings upon Production Servers seamlessly.
