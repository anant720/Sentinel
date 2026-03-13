# Sentinel Core Security Standards

The platform operates at a "Pristine-Grade" Security baseline explicitly designed to block severe credential, authorization, and Distributed Botnet attacks natively.

## Ingestion Protections
* **Body Size Limits:** Fastify blocks any REST payload >10kb.
* **CORS & Helmet:** Hardened globally pushing HSTS preload capabilities native natively mitigating XSS payloads automatically.
* **Cryptographic Envelopes:** Every ingestion trace requires an Ed25519/RSA `SHA256` payload signature protecting against MITM payload manipulation entirely.
* **Nonce Drift:** Redis `SET NX` locks completely block millisecond replay attacks implicitly natively parsing 60s windows dynamically.

## Detection Intelligence (Phase 5)
1. **Multi-Window Bounds:** Defeats Slow-Loris evasion by evaluating (5m, 30m, 24h) `rapid-failed-logins` boundaries mathematically.
2. **Entity Correlation:** Detects `distributed-logins` natively tracking `10 IPs -> 1 Account`.
3. **Password Spray:** Evaluates `20 Accounts -> 1 IP` using SCARD bounds gracefully securely.
4. **Adaptive Throttling:** Utilizing structural risk memory (`risk:account:xyz`) driving Fastify `onRequest` hooks dynamically yielding HTTP 429 automatically locking IP addresses mapping score logic securely.
