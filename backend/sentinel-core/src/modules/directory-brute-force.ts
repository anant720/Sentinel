import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * DIRECTORY BRUTE FORCE / PATH SCANNING — Enterprise Edition
 *
 * Detects automated directory scanning and web application enumeration attacks.
 * Uses Redis counters with sliding windows to avoid spamming one alert per HTTP request.
 *
 * Key improvements:
 * - Rate-based alerting: alert once per burst, not once per request
 * - 80+ known attack paths from real-world scanners (OWASP, Shodan, Nikto wordlists)
 * - Path-sensitivity tier: critical paths (.env, .git, passwd) vs generic (/backup, /admin)
 */
class DirectoryBruteForceModule implements DetectionModule {
    name = 'directory_brute_force';

    subscribesTo(): string[] {
        return ['scanner_detected', 'suspicious_http_request'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Directory / Path Scanning',
            description: 'Rate-based path enumeration with 80+ attack paths in 3 tiers. Critical: .env/.git/passwd. High: /admin/actuator. Alerts once per burst (not per request).',
            icon: 'folder_open',
            category: 'network' as const,
            configFields: [
                { key: 'threshold', label: 'Requests/min threshold', default: 10 },
            ],
            subscribedEvents: this.subscribesTo(),
        };
    }

    // Tiered path lists — severity increases with sensitivity of the target
    private readonly CRITICAL_PATHS = [
        '/.env', '/.env.local', '/.env.production', '/.env.backup',
        '/.git', '/.git/config', '/.git/HEAD', '/.git/logs',
        '/etc/passwd', '/etc/shadow', '/etc/hosts',
        '/proc/self/environ', '/proc/version',
        '/.ssh', '/.ssh/id_rsa', '/.ssh/authorized_keys',
        '/wp-config.php', '/config.php', '/database.yml', '/secrets.yml',
        '/credentials', '/credentials.json', '/.aws/credentials',
        '/app.config', '/web.config', '/appsettings.json',
    ];

    private readonly HIGH_PATHS = [
        '/admin', '/administrator', '/wp-admin', '/wp-login.php',
        '/phpmyadmin', '/phpinfo.php', '/server-status', '/server-info',
        '/actuator', '/actuator/env', '/actuator/health', '/actuator/beans',
        '/api/swagger', '/swagger-ui', '/swagger.json', '/openapi.json',
        '/graphql', '/__graphql', '/graphiql',
        '/console', '/shell', '/cmd', '/exec',
        '/_src', '/_next', '/_v', '/__webpack',
        '/backup', '/backups', '/db_backup', '/dump',
        '/old', '/temp', '/tmp', '/test',
    ];

    private readonly MEDIUM_PATHS = [
        '/robots.txt', '/sitemap.xml', '/.well-known',
        '/login', '/signin', '/auth', '/oauth',
        '/user', '/users', '/account', '/accounts',
        '/api', '/api/v1', '/api/v2', '/rest',
        '/metrics', '/status', '/ping', '/debug',
        '/upload', '/uploads', '/files', '/static',
        '/assets', '/vendor', '/node_modules', '/bower_components',
    ];

    private getPathSeverity(path: string): 'critical' | 'high' | 'medium' | null {
        const lp = path.toLowerCase();
        if (this.CRITICAL_PATHS.some(p => lp.startsWith(p) || lp.includes(p))) return 'critical';
        if (this.HIGH_PATHS.some(p => lp.startsWith(p) || lp.includes(p))) return 'high';
        if (this.MEDIUM_PATHS.some(p => lp.startsWith(p))) return 'medium';
        return null;
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;

        const path   = payload?.url || payload?.path || '';
        const ip     = payload?.ip_address || payload?.ip || 'unknown-ip';
        const ua     = payload?.user_agent || '';
        const method = payload?.method || 'GET';

        const pathSeverity = this.getPathSeverity(path);

        // Only process if explicit scanner_detected event OR a path we care about
        if (event.event_type !== 'scanner_detected' && !pathSeverity) return;

        const now = Date.now();

        // Per-IP sliding window counter — rate-based, not per-request
        const rateKey = `attack:dir_scan:${orgId}:${ip}:rate`;
        const pipe = redis.pipeline();
        pipe.zadd(rateKey, 'NX', now, `${path}:${now}`);
        pipe.zremrangebyscore(rateKey, 0, now - 60 * 1000); // 1-minute window
        pipe.zcard(rateKey);
        pipe.expire(rateKey, 300);
        const results = await pipe.exec();
        if (!results) return;
        const requestsPerMinute = (results[2]?.[1] as number) || 0;

        // Determine final severity
        let severity: 'medium' | 'high' | 'critical' = pathSeverity || 'medium';

        // Volume escalation: high request rate = active scanner = escalate severity
        if (requestsPerMinute >= 30) severity = 'critical';
        else if (requestsPerMinute >= 10 && severity === 'medium') severity = 'high';

        // Only alert once per 2-minute window per IP (avoid alert spam during active scan)
        const suppressKey = `attack:dir_scan:${orgId}:${ip}:suppress:${severity}`;
        const suppressed  = await redis.set(suppressKey, '1', 'EX', 120, 'NX');
        if (!suppressed) return; // Already alerted in this window

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:dir_brute:${ip}:${severity}:${Math.floor(now / 120000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'directory_brute_force',
            severity,
            fingerprint,
            title: severity === 'critical' ? 'Active Directory Scanner Detected' : 'Suspicious Path Enumeration',
            description: `IP ${ip} probed ${requestsPerMinute > 1 ? `${requestsPerMinute} paths/min including` : 'sensitive path'} ${path || '(various)'}. Method: ${method}. UA: ${ua || 'none'}.`,
            metadata: {
                path,
                ip,
                user_agent: ua,
                method,
                requests_per_minute: requestsPerMinute,
                path_classification: pathSeverity
            }
        });
    }
}

export default new DirectoryBruteForceModule();
