import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class SecurityToolDetectionModule implements DetectionModule {
    name = 'security_tool_detection';

    subscribesTo(): string[] {
        return ['scanner_detected', 'http_request'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;
        const payload = event.payload;

        const ua = (payload?.user_agent || payload?.userAgent || '').toLowerCase();
        
        // Comprehensive list of common Security Scanners, Fuzzers, and Intruder Tools
        const knownScanners = [
            'nikto', 'sqlmap', 'nmap', 'burp', 'zap', 'dirbuster', 'gobuster', 'dirb',
            'ffuf', 'wfuzz', 'wpscan', 'acunetix', 'nessus', 'qualys', 'hydra', 
            'metasploit', 'commix', 'tplmap', 'lfi-check', 'masscan'
        ];
        
        const isScannerUA = knownScanners.some(s => ua.includes(s));
        
        if (event.event_type !== 'scanner_detected' && !isScannerUA) {
            return;
        }

        const entity = payload?.ip_address || payload?.ip || 'unknown-ip';
        const scannerName = knownScanners.find(s => ua.includes(s)) || payload?.threat_type || 'Unknown Scanner';

        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:scanner_detected:${entity}:${scannerName}:${Math.floor(Date.now() / 3600000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'security_tool_detected',
            severity: 'critical',
            fingerprint,
            title: 'Security Scanning Tool Detected',
            description: `Detected use of ${scannerName} from ${entity}.`,
            metadata: {
                scanner: scannerName,
                user_agent: payload?.user_agent,
                ip: entity
            }
        });
    }
}

export default new SecurityToolDetectionModule();
