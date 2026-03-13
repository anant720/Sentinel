import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';

export const directoryBruteForce: DetectionRule = {
    id: 'directory-brute-force',
    description: 'Detects directory brute force attempts and aggressive path scanning',
    evaluate: async (event: DetectionEvent, _ctx: DetectionContext): Promise<DetectionAlert | null> => {
        const targetEventTypes = ['directory_brute_force', 'path_scan_detected'];
        
        if (!targetEventTypes.includes(event.type)) {
            return null;
        }

        const severity = event.type === 'directory_brute_force' ? 'high' : 'medium';
        const entity = event.ip || event.email || 'unknown-entity';

        return {
            ruleId: directoryBruteForce.id,
            severity,
            entity,
            evidence: {
                event_type: event.type,
                timestamp: event.timestamp,
                details: event.payload
            }
        };
    }
};
