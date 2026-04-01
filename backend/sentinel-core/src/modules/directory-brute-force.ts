import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

class DirectoryBruteForceModule implements DetectionModule {
    name = 'directory_brute_force';

    subscribesTo(): string[] {
        return ['*']; // Scan all HTTP events for suspicious paths
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;
        const payload = event.payload;

        const suspiciousPaths = ['/admin', '/.env', '/wp-admin', '/.git', '/config', '/api/v1/secrets', '/etc/passwd'];
        const path = payload?.path || payload?.url || '';
        const isSuspicious = path && suspiciousPaths.some(p => path.toLowerCase().includes(p.toLowerCase()));
        
        if (event.event_type !== 'directory_brute_force' && !isSuspicious) {
            return;
        }

        const severity = event.event_type === 'directory_brute_force' ? 'high' : 'medium';
        const entity = payload?.ip_address || payload?.ip || 'unknown-ip';
        
        const fingerprint = crypto.createHash('sha256')
            .update(`${orgId}:dir_brute:${entity}:${path}:${Math.floor(Date.now() / 3600000)}`)
            .digest('hex');

        await AlertService.createAlert(orgId, {
            eventId: event.id,
            type: 'directory_brute_force',
            severity,
            fingerprint,
            title: 'Directory Brute Force / Path Scanning',
            description: `Detected suspicious access attempt to ${path} from ${entity}.`,
            metadata: {
                path,
                ip: entity,
                method: payload?.method
            }
        });
    }
}

export default new DirectoryBruteForceModule();
