import { db } from '../lib/database.js';

export class DashboardService {
    static async getAggregateMetrics(orgId: string) {
        // Total identities
        const usersResult = await db.query(
            `SELECT COUNT(*) as count FROM users WHERE organization_id = $1`,
            [orgId]
        );
        const totalIdentities = parseInt(usersResult.rows[0].count, 10);

        // Critical Threats (unresolved alerts with critical severity)
        const alertsResult = await db.query(
            `SELECT COUNT(*) as count FROM alerts WHERE organization_id = $1 AND severity = 'critical' AND status != 'RESOLVED'`,
            [orgId]
        );
        const criticalThreats = parseInt(alertsResult.rows[0].count, 10);

        // Detection Velocity: count telemetry events in last hour
        const velocityResult = await db.query(
            `SELECT COUNT(*) as count FROM events WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
            [orgId]
        );
        const eventCount = parseInt(velocityResult.rows[0].count, 10);
        const detectionVelocity = `${eventCount}/hr`;

        // Geographic Nodes: distinct attacker IPs seen in the last 24 hours
        const nodesResult = await db.query(
            `SELECT COUNT(DISTINCT (payload->>'ip_address')) as count FROM events WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
            [orgId]
        );
        const geographicNodes = parseInt(nodesResult.rows[0].count, 10) || 0;

        // Active Detection Rules
        const rulesResult = await db.query(
            `SELECT COUNT(*) as count FROM organization_detection_settings WHERE organization_id = $1 AND is_enabled = true`,
            [orgId]
        );
        const activeRules = parseInt(rulesResult.rows[0].count, 10) || 0;

        return {
            totalIdentities,
            criticalThreats,
            detectionVelocity,
            geographicNodes,
            activeRules
        };
    }

    static async getRiskDistribution(orgId: string) {
        // Compute real risk scores per user: weighted by alert count matching entity (email)
        const result = await db.query(
            `SELECT
                u.id AS "userId",
                u.email,
                LEAST(100, COALESCE(COUNT(a.id) * 15, 0))::int AS "riskScore"
            FROM users u
            LEFT JOIN alerts a
                ON a.organization_id = u.organization_id
                AND a.status != 'RESOLVED'
                AND a.entity = u.email
            WHERE u.organization_id = $1
            GROUP BY u.id, u.email
            ORDER BY "riskScore" DESC
            LIMIT 50`,
            [orgId]
        );
        return result.rows;
    }

    static async runSecurityScan(orgId: string, windowInMinutes = 1440) {
        const interval = `${windowInMinutes} minutes`;
        // Aggregate real threat indicators from the last window
        const [alertsRes, ipsRes] = await Promise.all([
            db.query(
                `SELECT severity, type, COUNT(*) as count
                 FROM alerts
                 WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '${interval}'
                 AND status != 'RESOLVED'
                 GROUP BY severity, type`,
                [orgId]
            ),
            db.query(
                `SELECT COUNT(DISTINCT (payload->>'ip_address')) as count
                 FROM events
                 WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '${interval}'`,
                [orgId]
            ),
        ]);

        const alerts = alertsRes.rows;
        const uniqueIps = parseInt(ipsRes.rows[0]?.count ?? '0', 10);
        const attackTypes = [...new Set(alerts.map((r: any) => r.type))];

        // Compute risk score weighted by severity
        const severityWeights: Record<string, number> = { critical: 25, high: 15, medium: 8, low: 2 };
        let riskScore = 0;
        for (const row of alerts) {
            const weight = severityWeights[row.severity] ?? 1;
            riskScore += weight * parseInt(row.count, 10);
        }
        riskScore = Math.min(100, riskScore);

        let threatLevel: string;
        if (riskScore >= 80) threatLevel = 'CRITICAL';
        else if (riskScore >= 60) threatLevel = 'HIGH';
        else if (riskScore >= 30) threatLevel = 'MEDIUM';
        else if (riskScore > 0) threatLevel = 'LOW';
        else threatLevel = 'SAFE';

        return {
            riskScore,
            threatLevel,
            attacksDetected: attackTypes,
            uniqueSourceIps: uniqueIps,
            totalAlerts: alerts.reduce((s: number, r: any) => s + parseInt(r.count, 10), 0),
            scannedAt: new Date().toISOString(),
        };
    }

    /**
     * Snapshots the current aggregate risk score for an organization.
     * Uses a short 10-minute window for a "Live Feed" feel.
     */
    static async snapshotRiskScore(orgId: string) {
        const scan = await this.runSecurityScan(orgId, 1440); // 24-hour window for meaningful risk index
        await db.query(
            `INSERT INTO risk_history (organization_id, risk_score) VALUES ($1, $2)`,
            [orgId, scan.riskScore]
        );
        return scan.riskScore;
    }

    /**
     * Retrieves historical risk data for the specified time range.
     */
    static async getHistoricalRisk(orgId: string, range: string) {
        let interval = '1 day';
        let bucket = 'minute'; // Default for 1d

        if (range === '15d') {
            interval = '15 days';
            bucket = 'hour';
        } else if (range === '1m') {
            interval = '31 days';
            bucket = 'hour'; // Using hour instead of day to keep the chart dynamic even for new projects
        }

        // Use MAX(risk_score) to capture peak threats (AVG would hide them)
        const query = range === '1d' 
            ? `SELECT risk_score as score, timestamp
               FROM risk_history
               WHERE organization_id = $1 AND timestamp > NOW() - INTERVAL '1 day'
               ORDER BY timestamp ASC`
            : `SELECT MAX(risk_score)::int as score, date_trunc('${bucket}', timestamp) as timestamp
               FROM risk_history
               WHERE organization_id = $1 AND timestamp > NOW() - INTERVAL '${interval}'
               GROUP BY date_trunc('${bucket}', timestamp)
               ORDER BY timestamp ASC`;

        const result = await db.query(query, [orgId]);

        return result.rows.map((row: any) => ({
            score: row.score,
            timestamp: row.timestamp.getTime()
        }));
    }

}
