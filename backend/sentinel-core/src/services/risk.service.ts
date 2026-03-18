/**
 * src/services/risk.service.ts
 * ──────────────────────────
 * Automated Intrinsic Risk Assessment Engine.
 *
 * Scoring Heuristics:
 * - Direct scanner detection (intrinsic type) -> 100
 * - Known scanner User-Agents -> 95
 * - Access to sensitive paths (/.env, /admin) -> 80
 * - Authentication failures -> 15 (base)
 * - Generic telemetry -> 0
 */

export class RiskAssessmentService {
    /**
     * Evaluates an event and returns an intrinsic risk score (0-100).
     */
    static evaluate(event: { type: string; payload: any }): number {
        const { type, payload } = event;
        const ua = (payload?.user_agent || payload?.userAgent || '').toString().toLowerCase();
        const path = (payload?.path || payload?.destination || '').toString().toLowerCase();

        let score = 0;

        // 1. Explicit scanner detection
        if (type === 'scanner_detected') {
            score = 100;
        }
        // 2. Known scanner User-Agents
        else {
            const scanners = ['nikto', 'sqlmap', 'nmap', 'zaproxy', 'masscan', 'custom-scanner'];
            if (scanners.some(s => ua.includes(s))) {
                score = 95;
            }
            // 3. Sensitive path probing
            else {
                const sensitivePaths = ['/.env', '/admin', '/config', '/.git', '/etc/passwd', '/wp-admin', '/setup.php'];
                if (type === 'http_request' && sensitivePaths.some(p => path.includes(p))) {
                    score = 80;
                }
                // 4. Authentication failures
                else if (type === 'login_failure' || type === 'login_failed' || type === 'auth_failure') {
                    score = payload?.risk_score ? Number(payload.risk_score) : 15;
                }
                else {
                    score = payload?.risk_score ? Number(payload.risk_score) : 0;
                }
            }
        }

        return score;
    }

    /**
     * Maps a risk score to a readable severity level.
     */
    static getSeverity(score: number): 'low' | 'medium' | 'high' | 'critical' {
        if (score >= 90) return 'critical';
        if (score >= 70) return 'high';
        if (score >= 30) return 'medium';
        return 'low';
    }
}
