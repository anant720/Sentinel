import { DetectionModule, DetectionContext } from '../core/detection.types.js';
import { logger } from '../lib/logger.js';
import { AlertService } from '../services/alert.service.js';
import crypto from 'crypto';

/**
 * Calculates the great-circle distance between two points (in kilometers)
 * using the Haversine formula.
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

class ImpossibleTravelModule implements DetectionModule {
    name = 'impossible_travel';

    subscribesTo(): string[] {
        return ['login_success'];
    }

    async execute(context: DetectionContext): Promise<void> {
        const { orgId, event, redis } = context;
        const email = event.payload?.email;

        if (!email) return;

        const geo = event.payload?.geo;
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') {
            return;
        }

        const currentLat = geo.lat;
        const currentLon = geo.lon;
        const currentTs = new Date(event.created_at).getTime();
        const currentIp = event.payload?.ip || 'unknown';

        const cacheKey = `user:last_loc:${orgId}:${email}`;
        
        try {
            // 1. Fetch last known location from Redis
            const lastLocStr = await redis.get(cacheKey);
            
            // Always update the cache with the newest location regardless of result
            const currentLocData = JSON.stringify({
                lat: currentLat,
                lon: currentLon,
                timestamp: currentTs,
                ip: currentIp,
                city: geo.city,
                country: geo.country
            });
            await redis.set(cacheKey, currentLocData, 'EX', 86400 * 7); // Cache for 7 days

            if (!lastLocStr) return;

            const lastLoc = JSON.parse(lastLocStr);
            
            // 2. Calculate time difference in hours
            const timeDiffMs = Math.abs(currentTs - lastLoc.timestamp);
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

            // Ignore if time difference is negligible (< 1 minute) or too long ago (> 24 hours)
            if (timeDiffHours < 0.016 || timeDiffHours > 24) return;

            // 3. Calculate physical distance in km
            const distanceKm = calculateDistance(currentLat, currentLon, lastLoc.lat, lastLoc.lon);

            // 4. Calculate velocity (km/h)
            const velocity = distanceKm / timeDiffHours;

            // Threshold: 800 km/h (roughly commercial jet speed)
            const VELOCITY_THRESHOLD = 800;

            if (velocity > VELOCITY_THRESHOLD && distanceKm > 50) {
                const fingerprint = crypto.createHash('sha256')
                    .update(`${orgId}:impossible_travel:${email}:${Math.floor(currentTs / 3600000)}`)
                    .digest('hex');

                await AlertService.createAlert(orgId, {
                    eventId: event.id,
                    type: 'impossible_travel',
                    severity: 'critical',
                    fingerprint,
                    title: 'Impossible Travel Detected',
                    description: `User ${email} logged in from ${geo.city || 'Unknown'} after previously being in ${lastLoc.city || 'Unknown'}. Speed: ${Math.round(velocity)} km/h.`,
                    metadata: {
                        distance_km: Math.round(distanceKm),
                        velocity_kmh: Math.round(velocity),
                        prev_city: lastLoc.city,
                        curr_city: geo.city,
                        time_diff_min: Math.round(timeDiffMs / 60000)
                    }
                });
            }
        } catch (err: any) {
            logger.error({ err: err.message, email }, 'ImpossibleTravel detection failure');
        }
    }
}

export default new ImpossibleTravelModule();
