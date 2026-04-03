import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * SECURITY TOOL DETECTION — Enterprise Edition
 *
 * Multi-signal detection for professional penetration testing and attack automation tools.
 *
 *  Signal 1: User-Agent string matching (tools, libraries, headless clients)
 *  Signal 2: Behavioral — high request rate from a single IP
 *  Signal 3: Behavioral — high 404 rate (directory/endpoint enumeration signature)
 *  Signal 4: Cross-correlation — IP that hit both scanner UA AND directory brute force
 */
class SecurityToolDetectionModule implements DetectionModule {
    name = 'security_tool_detection';

    subscribesTo(): string[] {
        return ['scanner_detected', 'suspicious_http_request'];
    }

    // Named tool signatures — matched against User-Agent header
    private readonly NAMED_TOOLS: { pattern: string; name: string }[] = [
        // Vulnerability scanners
        { pattern: 'nikto',           name: 'Nikto' },
        { pattern: 'nessus',          name: 'Nessus' },
        { pattern: 'openvas',         name: 'OpenVAS' },
        { pattern: 'acunetix',        name: 'Acunetix' },
        { pattern: 'qualys',          name: 'Qualys' },
        { pattern: 'nmap',            name: 'Nmap' },
        { pattern: 'masscan',         name: 'Masscan' },
        { pattern: 'zmap',            name: 'ZMap' },
        { pattern: 'arachni',         name: 'Arachni' },
        { pattern: 'w3af',            name: 'W3AF' },
        // Web app proxies / intercept tools
        { pattern: 'burp',            name: 'Burp Suite' },
        { pattern: 'zaproxy',         name: 'OWASP ZAP' },
        // Directory/endpoint fuzzers
        { pattern: 'gobuster',        name: 'Gobuster' },
        { pattern: 'dirbuster',       name: 'DirBuster' },
        { pattern: 'dirb',            name: 'Dirb' },
        { pattern: 'ffuf',            name: 'FFUF' },
        { pattern: 'wfuzz',           name: 'WFuzz' },
        { pattern: 'feroxbuster',     name: 'Feroxbuster' },
        // Exploitation frameworks
        { pattern: 'metasploit',      name: 'Metasploit' },
        { pattern: 'sqlmap',          name: 'SQLMap' },
        { pattern: 'commix',          name: 'Commix' },
        { pattern: 'tplmap',          name: 'Tplmap' },
        // CMS/credential scanners
        { pattern: 'hydra',           name: 'Hydra (Password Cracker)' },
        { pattern: 'wpscan',          name: 'WPScan' },
        { pattern: 'joomscan',        name: 'JoomScan' },
        // Generic automation libraries (commonly weaponized)
        { pattern: 'python-requests', name: 'Python Requests (Automated)' },
        { pattern: 'urllib',          name: 'Python urllib (Automated)' },
        { pattern: 'aiohttp',         name: 'Python aiohttp (Automated)' },
        { pattern: 'go-http-client',  name: 'Go HTTP Client (Automated)' },
        { pattern: 'curl/',           name: 'cURL (Automated Script)' },
        { pattern: 'wget/',           name: 'Wget (Automated Script)' },
        { pattern: 'libwww',          name: 'libwww (Automated)' },
        { pattern: 'lwp-request',     name: 'Perl LWP (Automated)' },
        { pattern: 'okhttp',          name: 'OkHttp/Android Script' },
        { pattern: 'java/',           name: 'Java HTTP Client (Automated)' },
        { pattern: 'node-fetch',      name: 'Node-Fetch (Automated Script)' },
        { pattern: 'axios/',          name: 'Axios Script (Automated)' },
    ];

    private identifyTool(ua: string): string {
        if (!ua) return 'Empty User-Agent (Headless Automated Script)';
        const lua = ua.toLowerCase();
        const match = this.NAMED_TOOLS.find(t => lua.includes(t.pattern));
        if (match) return match.name;
        if (/(bot|scan|fuzz|spider|crawler|exploit|attack|inject)/.test(lua)) return 'Generic Attack Bot';
        return 'Unknown Automated Tool';
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const payload = event.payload;

        const ua     = (payload?.user_agent || '').toLowerCase();
        const ip     = payload?.ip_address || payload?.ip || 'unknown-ip';
        const url    = payload?.url || '';
        const method = payload?.method || 'GET';

        const isScannerUA = !ua || ua === '' || this.NAMED_TOOLS.some(t => ua.includes(t.pattern)) || /(bot|scan|fuzz|spider|crawler|exploit|attack|inject)/.test(ua);

        // Only process confirmed scanner events or matched UAs
        if (event.event_type !== 'scanner_detected' && !isScannerUA) return;

        const toolName = this.identifyTool(ua);
        const now = Date.now();

        // Per-IP request rate check (1-minute sliding window)
        const rateKey = `tool:rate:${orgId}:${ip}`;
        const ratePipe = redis.pipeline();
        ratePipe.zadd(rateKey, 'NX', now, `${event.id}:${now}`);
        ratePipe.zremrangebyscore(rateKey, 0, now - 60000);
        ratePipe.zcard(rateKey);
        ratePipe.expire(rateKey, 300);
        const rateResults = await ratePipe.exec();
        const requestsPerMin = (rateResults?.[2]?.[1] as number) || 0;

        // Per-IP 404 rate check (tracks enumeration pattern)
        const is404 = payload?.status_code === 404 || payload?.status_code === '404';
        const notFoundKey = `tool:404:${orgId}:${ip}`;
        if (is404) {
            const nfPipe = redis.pipeline();
            nfPipe.zadd(notFoundKey, 'NX', now, `${event.id}:${now}`);
            nfPipe.zremrangebyscore(notFoundKey, 0, now - 60000);
            nfPipe.expire(notFoundKey, 300);
            await nfPipe.exec();
        }
        const notFoundCount = await redis.zcard(notFoundKey);
        const notFoundRate = requestsPerMin > 0 ? (notFoundCount / requestsPerMin) : 0;

        // Severity determination
        let severity: 'medium' | 'high' | 'critical' = 'high';

        if (requestsPerMin >= 50 || notFoundRate >= 0.7) {
            severity = 'critical'; // Active scanner at high velocity or mostly getting 404s
        } else if (requestsPerMin >= 20 || notFoundRate >= 0.4) {
            severity = 'high';
        } else if (!ua) {
            severity = 'high'; // Empty UA = deliberate evasion attempt
        } else {
            severity = 'medium';
        }

        // Suppress re-alerts within 5-minute window per IP per tool
        const suppressKey = `tool:suppress:${orgId}:${ip}:${severity}`;
        const suppressed = await redis.set(suppressKey, '1', 'EX', 300, 'NX');
        if (!suppressed) return;

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:tool_detected:${ip}:${toolName}:${Math.floor(now / 300000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'security_tool_detected',
            severity,
            fingerprint,
            title: `Security Tool Detected: ${toolName}`,
            description: `${toolName} detected from ${ip} targeting ${url || 'backend API'}. Rate: ${requestsPerMin} req/min, 404 rate: ${Math.round(notFoundRate * 100)}%.`,
            metadata: {
                tool_name: toolName,
                user_agent: ua || null,
                ip,
                url,
                method,
                requests_per_min: requestsPerMin,
                not_found_rate: Math.round(notFoundRate * 100),
            }
        });

        logger.warn({ orgId, ip, toolName, requestsPerMin, severity }, '🚨 Security tool / scanner detected');
    }
}

export default new SecurityToolDetectionModule();
