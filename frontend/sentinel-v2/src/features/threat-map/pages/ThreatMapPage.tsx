import { useEffect, useState, useRef, useCallback } from 'react';
import { Globe, GeoEvent } from '../components/Globe';
import { IpTable, IpRecord } from '../components/IpTable';
import { useThreatMapStream, GeoEventPayload } from '../hooks/useThreatMapStream';
import apiCore from '../../../lib/api';

const MAX_EVENTS = 60;

export function ThreatMapPage() {
    const [ips, setIps]          = useState<IpRecord[]>([]);
    const [geoEvents, setGeoEvents] = useState<GeoEvent[]>([]);
    const eventCounter = useRef(0);

    // ── Initial IP list + seed globe with historical data ──────────────────
    useEffect(() => {
        apiCore.get<{ data: IpRecord[] }>('/threat-map/ips')
            .then(res => {
                const data = res.data.data;
                setIps(data);

                // Pre-populate globe with all IPs that have valid coordinates
                const seedEvents: GeoEvent[] = data
                    .filter(ip => ip.lat != null && ip.lon != null && ip.lat !== 0 && ip.lon !== 0)
                    .map((ip, i) => ({
                        id: `seed-${i}`,
                        lat: Number(ip.lat),
                        lon: Number(ip.lon),
                        // Mark as threat if rep_score > 50
                        isThreat: Number(ip.rep_score) > 50,
                        // Stagger timestamps so they don't all disappear at once
                        // Use a long lifespan: 60 seconds for historical dots
                        timestamp: Date.now() - (i * 200),
                    }));

                if (seedEvents.length > 0) {
                    setGeoEvents(seedEvents);
                    eventCounter.current = seedEvents.length;
                }
            })
            .catch(err => console.error('Failed to load IPs', err));
    }, []);

    // ── Live event handler (WebSocket) ───────────────────────────────────
    const handleEvent = useCallback((event: GeoEventPayload) => {
        // Skip events with no valid location
        if (!event.lat || !event.lon) return;

        // Push to globe events list
        setGeoEvents(prev => {
            const next = [
                { id: `ev-${eventCounter.current++}`, lat: event.lat, lon: event.lon, isThreat: event.is_threat, timestamp: Date.now() },
                ...prev,
            ].slice(0, MAX_EVENTS);
            return next;
        });

        // Update IP table
        setIps(prev => {
            const existing = prev.find(i => i.ip === event.ip);
            if (existing) {
                return prev.map(i => i.ip === event.ip
                    ? { ...i, total_events: Number(i.total_events) + 1, last_seen: new Date().toISOString() }
                    : i
                );
            }
            return [
                { ip: event.ip, country: event.country, city: event.city, last_seen: new Date().toISOString(), total_events: 1, rep_score: event.rep_score, is_blocked: false },
                ...prev,
            ].slice(0, 100);
        });
    }, []);

    const { isConnected } = useThreatMapStream(handleEvent);

    // ── Block / Unblock ───────────────────────────────────────────────────
    const handleBlockIp = async (ip: string) => {
        try {
            await apiCore.post('/threat-map/block', { ip });
            setIps(prev => prev.map(i => i.ip === ip ? { ...i, is_blocked: true } : i));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to block IP');
        }
    };

    const handleUnblockIp = async (ip: string) => {
        try {
            await apiCore.delete(`/threat-map/block/${ip}`);
            setIps(prev => prev.map(i => i.ip === ip ? { ...i, is_blocked: false } : i));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to unblock IP');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
            {/* Header */}
            <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-icons" style={{ color: 'var(--primary)' }}>public</span>
                        Live Threat Map
                    </div>
                    <div className="page-subtitle">Real-time visualization of global ingress events and IP intelligence</div>
                </div>
                <div>
                    {isConnected ? (
                        <div className="badge badge-low" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                            <span className="pulsar pulsar-green" /> Stream Active
                        </div>
                    ) : (
                        <div className="badge badge-medium" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.8 }}>
                            <span className="material-icons" style={{ fontSize: 12 }}>sync</span> Connecting…
                        </div>
                    )}
                </div>
            </div>

            {/* Main content */}
            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>

                {/* Globe Panel */}
                <div style={{
                    flex: 2, position: 'relative', background: '#020617',
                    borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(66,71,84,0.3)',
                }}>
                    {/* Legend overlay */}
                    <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="badge" style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.1)', color: '#22c55e' }}>
                            <span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>fiber_manual_record</span> Safe Hit
                        </div>
                        <div className="badge" style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.1)', color: '#ef4444' }}>
                            <span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>fiber_manual_record</span> Threat Blocked
                        </div>
                        <div className="badge" style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(255,255,255,0.1)', color: '#60a5fa' }}>
                            <span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>adjust</span> Sentinel Server
                        </div>
                    </div>
                    {/* Globe fills entire panel */}
                    <Globe events={geoEvents} />
                </div>

                {/* IP Intelligence Panel */}
                <div style={{ flex: 1, minWidth: 350 }}>
                    <IpTable ips={ips} onBlockIp={handleBlockIp} onUnblockIp={handleUnblockIp} />
                </div>
            </div>
        </div>
    );
}
