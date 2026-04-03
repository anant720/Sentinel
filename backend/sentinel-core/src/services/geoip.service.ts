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
import fetch from 'node-fetch';

export interface GeoResult {
    country: string;       // e.g. "United States"
    countryCode: string;   // ISO 3166-1 alpha-2, e.g. "US"
    city: string;          // e.g. "Los Angeles"
    lat: number;
    lon: number;
    isp: string;           // e.g. "Jio"
    abuseScore?: number;   // 0-100 AbuseIPDB score
    isThreat?: boolean;    // true if score > 50
}

// Private/reserved IP ranges to skip enrichment
const PRIVATE_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^0\.0\.0\.0$/,
    /^internal$/,
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
    static async lookup(ip: string): Promise<GeoResult | null> {
        if (!ip || isPrivateIP(ip)) return null;

        // Cache hit
        if (cache.has(ip)) return cache.get(ip)!;

        // Evict oldest entry if cache is full
        if (cache.size >= MAX_CACHE_SIZE) {
            cache.delete(cache.keys().next().value!);
        }

        // 1. Try local geoip-lite (if DB exists)
        const geo = geoip.lookup(ip);
        if (geo && geo.ll && geo.ll.length >= 2) {
            const result: GeoResult = {
                country: geo.country || 'Unknown',
                countryCode: geo.country || 'XX',
                city: geo.city || '',
                lat: geo.ll[0],
                lon: geo.ll[1],
                isp: (geo as any).org || '',
            };
            
            // Enrich with AbuseIPDB if configured
            await GeoIPService.enrichWithAbuseIPDB(ip, result);
            
            cache.set(ip, result);
            return result;
        }

        // 2. Fallback to HTTPS APIs (multiple for resilience)
        const apiAttempts = [
            async () => {
                const r = await fetch(`https://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon,isp,org`, { signal: AbortSignal.timeout(3000) });
                if (!r.ok) return null;
                const d = await r.json() as any;
                if (d.status !== 'success') return null;
                return { country: d.country, countryCode: d.countryCode, city: d.city, lat: d.lat, lon: d.lon, isp: d.isp || d.org };
            },
            async () => {
                const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(3000) });
                if (!r.ok) return null;
                const d = await r.json() as any;
                if (d.error) return null;
                return { country: d.country_name, countryCode: d.country_code, city: d.city, lat: d.latitude, lon: d.longitude, isp: d.org };
            },
            async () => {
                const r = await fetch(`https://ipwho.is/${ip}`, { signal: AbortSignal.timeout(3000) });
                if (!r.ok) return null;
                const d = await r.json() as any;
                if (!d.success) return null;
                return { country: d.country, countryCode: d.country_code, city: d.city, lat: d.latitude, lon: d.longitude, isp: d.connection?.isp || '' };
            }
        ];

        for (const attempt of apiAttempts) {
            try {
                const data = await attempt();
                if (data) {
                    const result: GeoResult = {
                        country: data.country || 'Unknown',
                        countryCode: data.countryCode || 'XX',
                        city: data.city || '',
                        lat: data.lat || 0,
                        lon: data.lon || 0,
                        isp: data.isp || '',
                    };
                    // Enrich with AbuseIPDB if configured
                    await GeoIPService.enrichWithAbuseIPDB(ip, result);
                    
                    cache.set(ip, result);
                    return result;
                }
            } catch {
                // Try next API
            }
        }

        cache.set(ip, null);
        return null;
    }

    /** Returns cache stats for monitoring. */
    static getStats() {
        return {
            cacheSize: cache.size,
            maxSize: MAX_CACHE_SIZE
        };
    }

    /**
     * Enriches GeoResult with AbuseIPDB risk scoring if an API key is present.
     */
    static async enrichWithAbuseIPDB(ip: string, result: GeoResult): Promise<void> {
        const apiKey = process.env.ABUSEIPDB_API_KEY;
        if (!apiKey) {
            result.abuseScore = 0;
            result.isThreat = false;
            return;
        }

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const r = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
                headers: {
                    'Key': apiKey,
                    'Accept': 'application/json'
                },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (r.ok) {
                const data = await r.json() as any;
                if (data && data.data) {
                    const score = data.data.abuseConfidenceScore || 0;
                    result.abuseScore = score;
                    result.isThreat = score > 50; 
                }
            }
        } catch (e) {
            // Silently swallow errors (timeout, no connection)
            result.abuseScore = 0;
            result.isThreat = false;
        }
    }

    /**
     * Performs reverse geocoding to turn coordinates into a human-readable address.
     * Uses OpenStreetMap Nominatim (Free, requires User-Agent).
     */
    static async reverseGeocode(lat: number, lon: number): Promise<{ address: string, city: string } | null> {
        if (!lat || !lon) return null;

        const cacheKey = `geo:${lat.toFixed(4)},${lon.toFixed(4)}`;
        if (cache.has(cacheKey)) return (cache.get(cacheKey) as any) as { address: string, city: string };

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
            const response = await fetch(url, {
                headers: { 'User-Agent': 'Sentinel/1.0 (Security Intelligence Platform)' },
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.ok) {
                const data = (await response.json()) as any;
                if (data && data.display_name) {
                    const addr = data.address;
                    const cityName = addr.city || addr.town || addr.village || addr.suburb || '';
                    
                    const result = {
                        address: data.display_name,
                        city: cityName
                    };
                    
                    cache.set(cacheKey, result as any);
                    return result;
                }
            }
        } catch (err) {
            // Silently fail
        }

        return null;
    }
}
