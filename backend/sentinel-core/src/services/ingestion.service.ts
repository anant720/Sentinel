/**
 * src/services/ingestion.service.ts
 * ───────────────────────────────────
 * Event ingestion data layer.
 *
 * LIFECYCLE:
 *   Validate → Hash → Insert (processed=false) → Enqueue (id + orgId only)
 *
 * RULES:
 *  - Schema validation BEFORE any DB operation — invalid events are rejected
 *  - Integrity hash covers deviceId + eventType + timestamp + payload string
 *  - processed is always false at insert time — worker sets it to true
 *  - Queue receives only (eventId, orgId) — never the full payload
 *  - No detection logic here
 *  - No crypto imports — all from security layer
 */
import { z } from 'zod';
import { db } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { enqueueEvent } from '../queues/event.queue.js';
import { computeIntegrityHash } from '../security/index.js';
import { validateCanonicalEvent } from '../types/events.js';

// ── Event Schema ─────────────────────────────────────────────────────────────

/** Maximum JSONB payload size: 64 KB */
const MAX_PAYLOAD_BYTES = 64 * 1024;

export const IngestEventSchema = z.object({
    event: z.object({
        device_id: z.string().uuid('device_id must be a valid UUID'),
        event_type: z.string().min(1, 'event_type must not be empty').max(100),
        timestamp: z.number().int().positive('timestamp must be a positive Unix epoch ms'),
        nonce: z.string().uuid('nonce must be a valid UUID'),
        payload: z.union([
            z.record(z.unknown()).refine(
                (p) => Buffer.byteLength(JSON.stringify(p)) <= MAX_PAYLOAD_BYTES,
                { message: `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes` },
            ),
            z.string().max(MAX_PAYLOAD_BYTES, `Payload exceeds maximum size of ${MAX_PAYLOAD_BYTES} bytes`)
        ])
    }),
    signature: z.string().min(1),
});

export type IngestEventInput = z.infer<typeof IngestEventSchema>;

// ── Service ──────────────────────────────────────────────────────────────────

export class IngestionService {
    /**
     * Validate, hash, persist, and enqueue a single event.
     *
     * @param orgId     Always from req.orgId (JWT) — never from client body.
     * @param rawInput  Unvalidated inbound data — validated here before use.
     * @param clientIp  Optional server-verified client IP.
     */
    static async ingest(orgId: string, rawInput: unknown, clientIp?: string, geoOverride?: any) {
        // ── 1. Schema validation ──────────────────────────────────────────
        const parsed = IngestEventSchema.safeParse(rawInput);
        if (!parsed.success) {
            throw Object.assign(new Error('Event schema validation failed'), {
                statusCode: 400,
                validationErrors: parsed.error.format(),
            });
        }

        const { event, signature } = parsed.data;
        const payload = (event.payload as any) || {};

        // ── 2. Canonical contract validation ─────────────────────────────
        const contractCheck = validateCanonicalEvent(event.event_type, event.payload);
        if (!contractCheck.valid) {
            throw Object.assign(new Error('Event contract validation failed'), {
                statusCode: 400,
                validationErrors: contractCheck.errors,
            });
        }

        // ── 2.5 Multi-Source Geo Enrichment (The "New Way") ───────────────
        const { GeoIPService } = await import('./geoip.service.js');
        const geoLookup = await GeoIPService.lookup(clientIp || '');

        // GPS Overrides (Coordinates)
        const lat = parseFloat(geoOverride?.lat || payload.lat || payload.latitude);
        const lon = parseFloat(geoOverride?.lon || payload.lon || payload.longitude || payload.lng || payload.long);
        
        // If we have GPS, do high-fidelity reverse geocoding
        let gpsData: { address: string, city: string } | null = null;
        if (!isNaN(lat) && !isNaN(lon)) {
            gpsData = await GeoIPService.reverseGeocode(lat, lon);
        }

        // Merge sources: GPS (Address/City) > Override (Headers/Country) > Lookup (API/DB)
        const geo = {
            country: geoOverride?.country || geoLookup?.country || null,
            countryCode: geoOverride?.countryCode || geoLookup?.countryCode || null,
            city: gpsData?.city || geoOverride?.city || geoLookup?.city || null,
            lat: !isNaN(lat) ? lat : (geoLookup?.lat || null),
            lon: !isNaN(lon) ? lon : (geoLookup?.lon || null),
            isp: geoOverride?.isp || geoLookup?.isp || null,
            address: gpsData?.address || null
        };

        const canonicalDict = Object.fromEntries(
            Object.keys(event).sort().map(key => [key, (event as any)[key]])
        );
        const integrityHash = computeIntegrityHash(JSON.stringify(canonicalDict));

        // ── 3. DB insert (enriched immediately) ──────────────────────────
        const result = await db.query(
            `INSERT INTO events
                 (organization_id, device_id, event_type, payload, signature, integrity_hash, processed, 
                  ip_address, geo_country, geo_country_code, geo_city, geo_lat, geo_lon, geo_isp, geo_address)
             VALUES ($1, $2, $3, $4, $5, $6, false, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id, created_at`,
            [
                orgId, 
                event.device_id, 
                event.event_type, 
                event.payload, 
                signature, 
                integrityHash, 
                clientIp,
                geo.country,
                geo.countryCode,
                geo.city,
                geo.lat,
                geo.lon,
                geo.isp,
                geo.address
            ],
        );

        const stored = result.rows[0];

        logger.debug(
            { eventId: stored.id, orgId, device_id: event.device_id, event_type: event.event_type },
            'Event persisted',
        );

        // ── 4. Queue (id + orgId only — queue is a pointer, not a bus) ────
        await enqueueEvent(stored.id, orgId);

        return stored;
    }
}
