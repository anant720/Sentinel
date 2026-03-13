# Incident Response Playbook

## 1. HighLoginFailureRate / Credential Stuffing
* **Symptom:** Alertmanager fires Notification. Grafana 'Failed Logins' spike to >50/minute natively.
* **Action Plan:**
  1. The platform will *automatically* assign structural Risk Points and Throttle standard actors natively.
  2. For highly distributed (2000+ IPs) evasions, navigate to NGINX configuring restrictive Geo-Blocking.
  3. Validate Loki to verify the targeted Endpoint schema natively parsing `ip` attributes systematically.

## 2. Infrastructure Catastrophe (Redis Eviction)
* **Symptom:** Redis triggers `OOM_COMMAND_ONLY`. Memory caps at 512MB implicitly natively.
* **Action Plan:**
  1. This is a non-fatal occurrence natively mapping Fail-Open limits systematically tracking ingestion safely natively. 
  2. Expand `maxmemory` constraints inside `redis.conf` and issue a container rebuild natively implicitly restoring the cache bounds automatically.

## 3. WorkerQueueOverflow
* **Symptom:** Alertmanager triggers queue depth >10,000 bounds.
* **Action Plan:**
  1. The Postgres Database is absorbing IO mapping ingestion safely, but the computations are lagging violently gracefully.
  2. Immediate Fix: Trigger a replica scaling event securely cleanly allocating 12 workers dynamically bounding load requirements. `docker compose scale workers=12`.
