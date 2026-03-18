import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';

export const securityToolDetection: DetectionRule = {
    id: 'security_tool_detection',
    description: 'Detects various hacking tools, scanners, and brute force attempts',
    evaluate: async (event: DetectionEvent, _ctx: DetectionContext): Promise<DetectionAlert | null> => {
        const toolEventTypes = [
            'scanner_detected',
            'path_scan_detected',
            'burst_scan_detected',
            'directory_brute_force'
        ];
        
        if (!toolEventTypes.includes(event.type)) {
            return null;
        }

        // Determine severity based on event type
        let severity: 'low' | 'medium' | 'high' | 'critical' = 'medium';
        if (event.type === 'directory_brute_force' || event.type === 'burst_scan_detected') {
            severity = 'high';
        } else if (event.type === 'scanner_detected') {
            severity = 'critical'; // Explicit use of a hacking tool is critical
        }

        const entity = event.ip || event.email || 'unknown-entity';

        return {
            ruleId: securityToolDetection.id,
            severity,
            entity,
            evidence: {
                event_type: event.type,
                threat_type: event.payload?.threat_type || 'Unknown Threat',
                details: event.payload?.details || event.payload,
                user_agent: event.userAgent,
                destination: event.payload?.destination
            }
        };
    }
};
