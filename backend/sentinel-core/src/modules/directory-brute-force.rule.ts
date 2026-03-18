import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../detection/types.js';

export const directoryBruteForce: DetectionRule = {
    id: 'directory_brute_force',
    description: 'Detects directory brute force attempts and aggressive path scanning',
    evaluate: async (event: DetectionEvent, _ctx: DetectionContext): Promise<DetectionAlert | null> => {
        if (!event.payload) {
            return null;
        }

        const suspiciousPaths = ['/admin', '/.env', '/wp-admin', '/.git', '/config', '/api/v1/secrets'];
        const isSuspicious = event.payload?.path && suspiciousPaths.some(p => event.payload?.path.includes(p));
        
        if (event.type !== 'directory_brute_force' && !isSuspicious) {
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
