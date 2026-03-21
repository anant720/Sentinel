import { DetectionRule, DetectionEvent, DetectionContext, DetectionAlert } from '../types.js';
import { logger } from '../../lib/logger.js';

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

export const impossibleTravelRule: DetectionRule = {
    id: 'impossible_travel',
    description: 'Detects logins from geographically distant locations within a physically impossible timeframe (>800 km/h)',
    evaluate: async (event: DetectionEvent, ctx: DetectionContext): Promise<DetectionAlert | null> => {
        // Only trigger on successful logins
        if (event.type !== 'login_success' || !event.email) {
            return null;
        }

        // We need geolocation data to be present in the payload (enriched by worker)
        const geo = event.payload?.geo;
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lon !== 'number') {
            return null;
        }

        const currentLat = geo.lat;
        const currentLon = geo.lon;
        const currentTs = event.timestamp;
        const currentIp = event.ip || 'unknown';

        const cacheKey = `user:last_loc:${ctx.orgId}:${event.email}`;
        
        // 1. Fetch last known location from Redis
        const lastLocStr = await ctx.redis.get(cacheKey);
        
        // Always update the cache with the newest location regardless of result
        const currentLocData = JSON.stringify({
            lat: currentLat,
            lon: currentLon,
            timestamp: currentTs,
            ip: currentIp,
            city: geo.city,
            country: geo.country
        });
        await ctx.redis.set(cacheKey, currentLocData, 'EX', 86400 * 7); // Cache for 7 days

        if (!lastLocStr) {
            return null; // First login seen for this window
        }

        try {
            const lastLoc = JSON.parse(lastLocStr);
            
            // 2. Calculate time difference in hours
            const timeDiffMs = Math.abs(currentTs - lastLoc.timestamp);
            const timeDiffHours = timeDiffMs / (1000 * 60 * 60);

            // Ignore if time difference is negligible (e.g., < 1 minute) or too long ago (> 24 hours)
            if (timeDiffHours < 0.016 || timeDiffHours > 24) {
                return null;
            }

            // 3. Calculate physical distance in km
            const distanceKm = calculateDistance(currentLat, currentLon, lastLoc.lat, lastLoc.lon);

            // 4. Calculate velocity (km/h)
            const velocity = distanceKm / timeDiffHours;

            // Threshold: 800 km/h (roughly commercial jet speed)
            const VELOCITY_THRESHOLD = 800;

            if (velocity > VELOCITY_THRESHOLD && distanceKm > 50) {
                return {
                    ruleId: 'impossible_travel',
                    severity: 'critical',
                    entity: event.email,
                    evidence: {
                        current_location: `${geo.city || 'Unknown'}, ${geo.country || 'Unknown'}`,
                        previous_location: `${lastLoc.city || 'Unknown'}, ${lastLoc.country || 'Unknown'}` || 'Unknown',
                        distance_km: Math.round(distanceKm),
                        time_diff_min: Math.round(timeDiffMs / 60000),
                        velocity_kmh: Math.round(velocity),
                        current_ip: currentIp,
                        previous_ip: lastLoc.ip
                    }
                };
            }
        } catch (err) {
            logger.error({ err, cacheKey }, 'Failed to parse last login location from Redis');
        }

        return null;
    }
};
