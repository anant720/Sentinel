/**
 * src/services/geoip.service.ts
 * ─────────────────────────────
 * GeoIP Enrichment Service backed by geoip-lite (offline MaxMind GeoLite2).
 *
 * Features:
 * - Zero external API calls — fully offline using the bundled MaxMind DB
 * - Lightweight in-memory cache (LRU-style Map) for performance
 * - Graceful no-op for private/loopback/unknown IPs
 */

import geoip from 'geoip-lite';

export interface GeoResult {
    country: string;       // e.g. "United States"
    countryCode: string;   // ISO 3166-1 alpha-2, e.g. "US"
    city: string;          // e.g. "Los Angeles"
    lat: number;
    lon: number;
    isp: string;           // Not in geoip-lite — we leave as empty string
}

// Private/reserved IP ranges to skip enrichment
const PRIVATE_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^localhost$/,
];

function isPrivateIP(ip: string): boolean {
    return PRIVATE_RANGES.some(r => r.test(ip));
}

// In-memory cache: IP → GeoResult (or null for misses)
const cache = new Map<string, GeoResult | null>();
const MAX_CACHE_SIZE = 5000;

export class GeoIPService {
    /**
     * Resolves an IP address to geographic metadata.
     * Returns null for private IPs, loopback, or unknown locations.
     */
    static lookup(ip: string): GeoResult | null {
        if (!ip || isPrivateIP(ip)) return null;

        // Cache hit
        if (cache.has(ip)) return cache.get(ip)!;

        // Evict oldest entry if cache is full
        if (cache.size >= MAX_CACHE_SIZE) {
            cache.delete(cache.keys().next().value!);
        }

        const geo = geoip.lookup(ip);
        if (!geo || !geo.ll || geo.ll.length < 2) {
            cache.set(ip, null);
            return null;
        }

        const result: GeoResult = {
            country: geo.country || 'Unknown',
            countryCode: geo.country || 'XX',
            city: geo.city || '',
            lat: geo.ll[0],
            lon: geo.ll[1],
            isp: (geo as any).org || '',
        };

        cache.set(ip, result);
        return result;
    }

    /** Returns cache stats for monitoring. */
    static getCacheStats() {
        return { size: cache.size, maxSize: MAX_CACHE_SIZE };
    }
}
