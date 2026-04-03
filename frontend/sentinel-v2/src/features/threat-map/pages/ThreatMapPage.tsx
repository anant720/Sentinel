import { useEffect, useState, useRef } from 'react';
import { Globe } from '../components/Globe';
import { IpTable, IpRecord } from '../components/IpTable';
import { useThreatMapStream, GeoEventPayload } from '../hooks/useThreatMapStream';
import apiCore from '../../../lib/api';

export function ThreatMapPage() {
    const globeRef = useRef<{ addEvent: (lat: number, lon: number, isThreat: boolean) => void }>(null);
    const [ips, setIps] = useState<IpRecord[]>([]);

    // Fetch initial IP list from backend
    useEffect(() => {
        const fetchIps = async () => {
            try {
                const res = await apiCore.get<{ data: IpRecord[] }>('/threat-map/ips');
                setIps(res.data.data);
            } catch (err) {
                console.error('Failed to load IPs', err);
            }
        };
        fetchIps();
    }, []);

    // WebSocket hook drives live UI
    const { isConnected } = useThreatMapStream((event: GeoEventPayload) => {
        // Plot on Globe
        if (globeRef.current) {
            globeRef.current.addEvent(event.lat, event.lon, event.is_threat);
        }

        // Update IP Table
        setIps(prev => {
            const existing = prev.find(i => i.ip === event.ip);
            if (existing) {
                return prev.map(i => i.ip === event.ip ? { ...i, total_events: Number(i.total_events) + 1, last_seen: new Date().toISOString() } : i);
            } else {
                return [{
                    ip: event.ip,
                    country: event.country,
                    city: event.city,
                    last_seen: new Date().toISOString(),
                    total_events: 1,
                    rep_score: event.rep_score,
                    is_blocked: false
                }, ...prev].slice(0, 100); // Keep top 100
            }
        });
    });

    const handleBlockIp = async (ip: string) => {
        try {
            await apiCore.post('/threat-map/block', { ip });
            alert(`IP ${ip} permanently blocked.`);
            setIps(prev => prev.map(i => i.ip === ip ? { ...i, is_blocked: true } : i));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to block IP');
        }
    };

    const handleUnblockIp = async (ip: string) => {
        try {
            await apiCore.delete(`/threat-map/block/${ip}`);
            alert(`IP ${ip} unblocked.`);
            setIps(prev => prev.map(i => i.ip === ip ? { ...i, is_blocked: false } : i));
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to unblock IP');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, height: '100%' }}>
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
                            <span className="material-icons" style={{ fontSize: 12 }}>sync</span> Connecting...
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
                {/* Visualizer Panel (Left) */}
                <div style={{ 
                    flex: 2, position: 'relative', background: '#020617', 
                    borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(66,71,84,0.3)' 
                }}>
                    <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="badge" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--secondary)' }}>
                            <span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>fiber_manual_record</span> Safe Hit
                        </div>
                        <div className="badge" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)', color: 'var(--error)' }}>
                            <span className="material-icons" style={{ fontSize: 12, marginRight: 4 }}>fiber_manual_record</span> Threat Blocked
                        </div>
                    </div>
                    <Globe ref={globeRef} />
                </div>

                {/* Intelligence Panel (Right) */}
                <div style={{ flex: 1, minWidth: 350 }}>
                    <IpTable 
                        ips={ips} 
                        onBlockIp={handleBlockIp} 
                        onUnblockIp={handleUnblockIp} 
                    />
                </div>
            </div>
        </div>
    );
}
