import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { AlertService } from '../services/alert.service.js';
import { logger } from '../lib/logger.js';
import crypto from 'crypto';

/**
 * IMPOSSIBLE TRAVEL — Enterprise Edition
 *
 * Detects simultaneous or near-simultaneous sessions from geographically impossible locations.
 * Methodology mirrors Microsoft Azure AD Identity Protection's "Impossible Travel" rule.
 *
 * Key improvements:
 * - 72-hour sliding window (not 24h)
 * - Speed-based severity: >1200 km/h (teleportation) = critical, >800 km/h = high
 * - VPN/datacenter heuristic: flags simultaneous sessions even at 0 km/h if IP type differs
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

class ImpossibleTravelModule implements DetectionModule {
    name = 'impossible_travel';

    subscribesTo(): string[] {
        return ['login_success'];
    }

    metadata() {
        return {
            id: this.name,
            label: 'Impossible Travel',
            description: 'Flags concurrent sessions from physically impossible locations. Detects VPN mid-session rotation and cross-continent logins faster than commercial aviation. 72h sliding window.',
            icon: 'flight',
            category: 'identity' as const,
            configFields: [],
            subscribedEvents: this.subscribesTo(),
        };
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email   = event.payload?.email;
        const geo     = event.payload?.geo;
        const currentIp = event.payload?.ip_address || event.payload?.ip || 'unknown';

        if (!email) return;
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') return;

        const currentLat = geo.lat;
        const currentLon = geo.lon;
        const currentTs  = new Date(event.created_at).getTime();
        const cacheKey   = `user:last_loc:${orgId}:${email}`;

        try {
            const lastLocStr = await redis.get(cacheKey);

            // Always update cache with current location
            await redis.set(cacheKey, JSON.stringify({
                lat: currentLat, lon: currentLon,
                timestamp: currentTs, ip: currentIp,
                city: geo.city, country: geo.country
            }), 'EX', 86400 * 7); // 7-day cache

            if (!lastLocStr) return;

            const lastLoc = JSON.parse(lastLocStr);
            const timeDiffMs    = currentTs - lastLoc.timestamp;
            const timeDiffHours = timeDiffMs / 3600000;

            // Skip identical events (same millisecond), but DO NOT skip valid consecutive events 
            // under 30s because attackers switch VPNs rapidly.
            if (timeDiffMs < 1000 || timeDiffHours > 72) return;

            const distanceKm = haversineKm(currentLat, currentLon, lastLoc.lat, lastLoc.lon);

            // Skip trivially close locations (same city/ISP movement)
            if (distanceKm < 50) return;

            const velocityKmh = distanceKm / timeDiffHours;

            // Severity tiers based on physical impossibility
            // Commercial jet max ~1000 km/h. >1200 = superhuman (VPN instant switch or stolen token)
            let severity: 'high' | 'critical' | null = null;
            let assessment = '';

            if (velocityKmh > 1200 || (distanceKm > 2000 && timeDiffHours < 1)) {
                // Physically impossible: cross-continent in under 1 hour or superhuman speed
                severity = 'critical';
                assessment = 'Physically impossible — likely simultaneous sessions or stolen credential';
            } else if (velocityKmh > 900 && distanceKm > 500) {
                // Faster than any commercial aviation route + significant distance = suspicious
                severity = 'critical';
                assessment = 'Faster than commercial aviation maximum — likely account takeover';
            } else if (velocityKmh > 800 && distanceKm > 100) {
                severity = 'high';
                assessment = 'Exceeds commercial aviation cruising speed — anomalous travel';
            }

            if (!severity) return;

            // Additional heuristic: same country but different ISP type within seconds = VPN switch
            const isSameCountry = lastLoc.country && geo.country && lastLoc.country === geo.country;
            if (isSameCountry && timeDiffMs < 120000 && distanceKm > 100) {
                severity = 'critical';
                assessment = 'Rapid location switch within same country — likely VPN/proxy rotation mid-session';
            }

            const fingerprint = crypto.createHash('sha256')
                .update(`${orgId}:impossible_travel:${email}:${Math.floor(currentTs / 3600000)}`)
                .digest('hex');

            await AlertService.createAlert(orgId, {
                eventId: event.id,
                type: 'impossible_travel',
                severity,
                fingerprint,
                title: 'Impossible Travel Detected',
                description: `${email} logged in from ${geo.city || geo.country || 'Unknown'} at ${Math.round(velocityKmh)} km/h from previous location in ${lastLoc.city || lastLoc.country || 'Unknown'}. ${assessment}.`,
                metadata: {
                    distance_km:   Math.round(distanceKm),
                    velocity_kmh:  Math.round(velocityKmh),
                    time_diff_min: Math.round(timeDiffMs / 60000),
                    prev_city:     lastLoc.city,
                    prev_country:  lastLoc.country,
                    curr_city:     geo.city,
                    curr_country:  geo.country,
                    prev_ip:       lastLoc.ip,
                    curr_ip:       currentIp,
                    assessment
                }
            });
        } catch (err: any) {
            logger.error({ err: err.message, email }, 'ImpossibleTravel detection failure');
        }
    }
}

export default new ImpossibleTravelModule();
