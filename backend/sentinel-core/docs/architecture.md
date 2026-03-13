# Sentinel Core Architecture

## System Topography

Sentinel Core relies on a heavily decoupled distributed microservices architecture built atop Node.js (Fastify) explicitly engineered for extreme telemetry throughput and immediate threat correlation. 

```mermaid
graph TD
    Internet-->|HTTPS/TCP| Cloudflare[CDN / Edge]
    Cloudflare-->NGINX[API Gateway / TLS Termination]
    NGINX-->|Rate Limited 10kb| API[Sentinel Fastify API]
    API-->|O(1) Memory| Redis[Redis Security Layer]
    API-->|Async| BullMQ[Job Queues]
    BullMQ-->|Scale| Workers[Detection Workers]
    Workers-->|Session Pooled| PgBouncer[Connection Supervisor]
    PgBouncer-->PostgreSQL[(Core Database)]
    
    API-->|Logs| Loki[Grafana Loki]
    API-->|RED| Prometheus[Metrics Engine]
```

## Architectural Goals

1. **Horizontal Scalability:** The `docker-compose` topology specifically delineates the HTTP ingestion `api` cluster out from the intensive computational boundary of the `workers`. Each boundary can scale to dozens of replicas natively relying on Redis Pub/Sub locking securely.
2. **Stateful High Throughput:** Using PgBouncer avoids Postgres out-of-memory errors by natively pooling physical connections.
3. **Canonical Payloads:** Ensuring JSON inputs are cryptographically formatted natively catching all Reversal drifts.
