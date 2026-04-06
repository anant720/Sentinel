import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';
import { logger } from '../lib/logger.js';

/**
 * VPN & DATACENTER DETECTION
 * Analyzes the geographic ISP metadata associated with a login event.
 * Flags connections that originate from commercial VPN providers, TOR exit nodes,
 * or cloud hosting datacenters.
 */
class VpnDatacenterModule implements DetectionModule {
    name = 'vpn_datacenter_login';

    // Keywords indicating proxy, VPN, or datacenter origin
    private riskyKeywords = [
        'vpn', 'proxy', 'tor', 'exit node', 'datacenter', 'hosting', 'cloud', 'digitalocean', 
        'amazon', 'aws', 'linode', 'ovh', 'choopa', 'm247', 'hetzner', 'nordvpn', 'expressvpn', 
        'mullvad', 'private internet access', 'surfshark', 'cyberghost', 'leaseweb', 'alibaba'
    ];

    subscribesTo(): string[] {
        return ['login_success', 'login_failed', 'login_failure'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'VPN/Datacenter Connection',
            description: 'Flags events originating from commercial VPNs, Tor exit nodes, or datacenter IPs by analyzing ISP metadata.',
            icon: 'security',
            category: 'infrastructure' as const,
            configFields: [],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event } = context;
        const payload = event.payload;
        const geo = payload?.geo;

        if (!geo || !geo.isp) return;

        const isp = (geo.isp as string).toLowerCase();

        // Check if the ISP matches any risky keyword
        const isRisky = this.riskyKeywords.some(keyword => isp.includes(keyword));

        if (isRisky) {
            const email = payload.email || 'unknown_user';
            const ip = payload.ip_address || payload.ip || 'unknown_ip';

            // Rate limit the alert to once per hour per IP/User combo
            const bucket = Math.floor(Date.now() / 3600000);
            const fp = crypto.createHash('sha256')
                .update(`${orgId}:vpn_datacenter:${ip}:${email}:${bucket}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'vpn_datacenter_login',
                severity: 'medium',
                fingerprint: fp,
                title: 'VPN or Datacenter IP Detected',
                description: `A connection attempt by ${email} originated from an anonymizing service or datacenter: ${geo.isp} (${ip}).`,
                metadata: {
                    ip,
                    email,
                    isp: geo.isp,
                    country: geo.country,
                    city: geo.city
                }
            });
            
            logger.warn({ orgId, ip, email, isp: geo.isp }, '🚨 VPN/Datacenter connection detected');
        }
    }
}

export default new VpnDatacenterModule();
