export interface IpRecord {
    ip: string;
    country: string;
    city: string;
    last_seen: string;
    total_events: string | number;
    rep_score: number;
    is_blocked: boolean;
}

interface IpTableProps {
    ips: IpRecord[];
    onBlockIp: (ip: string) => Promise<void>;
    onUnblockIp: (ip: string) => Promise<void>;
}

export function IpTable({ ips, onBlockIp, onUnblockIp }: IpTableProps) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--surface-container-lowest)', border: '1px solid rgba(66,71,84,0.15)', borderRadius: 8 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(66,71,84,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-icons" style={{ color: 'var(--primary)' }}>security</span>
                <span style={{ fontSize: '1rem', fontWeight: 600, fontFamily: 'var(--font-display)', color: 'var(--on-surface)' }}>IP Reputation Intelligence</span>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                {ips.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center' }}>
                        <span className="text-label-sm">No IP data available yet. Waiting for telemetry...</span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ips.map((row) => (
                            <div
                                key={row.ip}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '12px 16px', borderRadius: 6,
                                    background: 'var(--surface-container-low)',
                                    border: '1px solid rgba(66,71,84,0.15)'
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span className="mono" style={{ fontSize: '0.8125rem', color: 'var(--on-surface)', fontWeight: 600 }}>
                                            {row.ip}
                                        </span>
                                        {row.rep_score > 50 ? (
                                            <span className="badge badge-critical" style={{ fontSize: '0.625rem', padding: '2px 6px' }}>
                                                Score: {row.rep_score}
                                            </span>
                                        ) : (
                                            <span className="badge badge-low" style={{ fontSize: '0.625rem', padding: '2px 6px' }}>
                                                Score: {row.rep_score}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-dim mono" style={{ fontSize: '0.6875rem' }}>
                                        {row.city || 'Unknown'}, {row.country || 'Unknown'} 
                                        <span style={{ margin: '0 6px', opacity: 0.5 }}>•</span> 
                                        {row.total_events} events
                                    </div>
                                </div>
                                <div>
                                    {row.is_blocked ? (
                                        <button
                                            className="btn btn-sm"
                                            style={{ borderColor: 'var(--secondary)', color: 'var(--secondary)' }}
                                            onClick={() => onUnblockIp(row.ip)}
                                        >
                                            Unblock
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-sm"
                                            style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                                            onClick={() => onBlockIp(row.ip)}
                                        >
                                            <span className="material-icons" style={{ fontSize: 14, marginRight: 4 }}>block</span>
                                            Block
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
