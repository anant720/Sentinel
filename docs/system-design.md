# System Design (Version 26.3.0)

**A Personal Project by Anant Suthar**

## Multi-Tenancy Architecture
Sentinel uses logical isolation via `organization_id` on all sensitive tables to ensure that multiple companies can use the platform without data spillage. Every API request is scoped to an organization using either JWT claims (for analysts inside the dashboard) or API Keys (for machine-to-machine ingestion).

## Threat Detection Logic
The Version 26.3.0 detection engine is capable of processing thousands of events per minute and operates on three distinct analytical levels:
1. **Signature-based**: Immediate flagging of known hacking tool user-agents (e.g., Nikto, SQLMap) or malicious path probing patterns.
2. **Threshold-based**: Rate limiting and burst detection. Identifying directory brute forcing based on time-bound request anomalies.
3. **Behavioral**: Aggregated risk scoring across multiple telemetry types resulting in a unified event risk index.

## Risk Scoring Paradigm
Each incoming telemetry event inherently carries a calculated `risk_score` (0-100).
- **Critical Alerts**: Score > 80 (e.g., Directory Brute Force, Malicious UA).
- **Warning Alerts**: Score > 50 (e.g., Elevated API failure rates).
- **Info Events**: Score < 50 (e.g., Standard User Logins, Dashboard Interactions).

## Scalability Considerations
- **Event Queueing**: High-throughput processing routes through memory-optimized workers.
- **Relational Integrity**: Complete PostgreSQL cascading constraints handle massive data deletion cleanly and securely.
- **Real-Time Data Streams**: Stateful WebSocket connections are bridged with HTTP polling mechanisms ensuring perfect synchronization across client dashboards.
