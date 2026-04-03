import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardService } from '../../../lib/services/dashboard.service';
import { useAuthStore } from '../../../lib/store';
import { CryptoService } from '../../../lib/services/crypto.service';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

type RangeKey = '1d' | '15d' | '1m';

export default function DashboardPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [range, setRange] = useState<RangeKey>('1d');

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => DashboardService.getStats(),
    refetchInterval: 30000,
  });

  const { data: historicalRisk, dataUpdatedAt } = useQuery({
    queryKey: ['historical-risk', range],
    queryFn: () => DashboardService.getHistoricalRisk(range),
    refetchInterval: 60000,
  });

  const { data: liveFeed } = useQuery({
    queryKey: ['live-feed-mini'],
    queryFn: () => DashboardService.getLiveFeed(),
    refetchInterval: 5000,
  });

  const [scanResult, setScanResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const scanMutation = useMutation({
    mutationFn: () => DashboardService.runScan(),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['stats'] });
      qc.invalidateQueries({ queryKey: ['historical-risk', range] });
      setScanResult({ ok: true, msg: `Scan complete — Risk Score: ${data?.riskScore ?? data?.risk_score ?? '—'}` });
      setTimeout(() => setScanResult(null), 5000);
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Unknown error';
      setScanResult({ ok: false, msg: `Scan failed: ${detail}` });
      setTimeout(() => setScanResult(null), 8000);
    }
  });

  // Map historical risk — backend returns array of {timestamp, score}
  const trend = (Array.isArray(historicalRisk) ? historicalRisk : []).map((d: any) => {
    const date = new Date(d.timestamp);
    let timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (range === '1m') timeLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    else if (range === '15d') timeLabel = `${date.toLocaleDateString([], { day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit' })}`;
    return { time: timeLabel, risk: d.score, fullDate: date.toLocaleString() };
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  // Stats — EXACT field names from backend DashboardService.getAggregateMetrics
  const kpi = [
    { label: 'Active Interventions', value: stats?.activeInterventions ?? 0, sub: 'Inline blocks (24h)', icon: 'shield', color: 'var(--secondary)' },
    { label: 'Total Identities', value: stats?.totalIdentities ?? 0, sub: 'Active accounts', icon: 'people', color: 'var(--primary)' },
    { label: 'Critical Threats', value: stats?.criticalThreats ?? 0, sub: 'Open alerts', icon: 'warning_amber', color: '#f59e0b' },
    { label: 'Detection Velocity', value: stats?.detectionVelocity ?? '0/hr', sub: 'Events last hour', icon: 'bolt', color: '#ef4444' },
    { label: 'Source IPs (24h)', value: stats?.geographicNodes ?? 0, sub: 'Unique nodes', icon: 'public', color: '#a78bfa' },
  ];

  const recentEvents = liveFeed?.data?.slice(0, 8) || liveFeed?.slice?.(0, 8) || [];

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Command Center</div>
          <div className="page-subtitle">Real-time surveillance across distributed identity clusters.</div>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
        >
          <span className="material-icons" style={{ fontSize: 16 }}>radar</span>
          {scanMutation.isPending ? 'SCANNING...' : 'RUN SECURITY SCAN'}
        </button>
      </div>

      {/* Scan Result Banner */}
      {scanResult && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: scanResult.ok ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          border: `1px solid ${scanResult.ok ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
          color: scanResult.ok ? '#10b981' : '#ef4444',
          fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span className="material-icons" style={{ fontSize: 16 }}>
            {scanResult.ok ? 'check_circle' : 'error'}
          </span>
          {scanResult.msg}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
        {kpi.map(card => (
          <div key={card.label} className="panel" style={{ padding: '20px 24px' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span className="text-overline">{card.label}</span>
              <span className="material-icons" style={{ fontSize: 20, color: card.color }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--on-surface)', lineHeight: 1 }}>
              {card.value}
            </div>
            <div className="text-label-sm" style={{ marginTop: 8 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts + Events */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* Risk Matrix Chart */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s ease-in-out infinite' }} />
                <span className="text-overline" style={{ color: '#ef4444' }}>Risk Analytics (Live Index)</span>
              </div>
              <div className="text-label-sm">Historical risk score with real backend data</div>
            </div>
            <div className="flex gap-1" style={{ background: 'var(--surface-container-lowest)', padding: 4 }}>
              {(['1d', '15d', '1m'] as RangeKey[]).map(k => (
                <button
                  key={k}
                  onClick={() => setRange(k)}
                  className={`btn ${range === k ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  style={{ padding: '4px 10px', fontSize: '0.625rem' }}
                >{k.toUpperCase()}</button>
              ))}
            </div>
          </div>

          <div style={{ height: 280 }}>
            {trend.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: '100%', flexDirection: 'column', gap: 8 }}>
                <span className="material-icons" style={{ fontSize: 40, color: 'var(--outline)' }}>show_chart</span>
                <span className="text-label-sm">No chart data available</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="time" stroke="#424754" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#424754' }} interval="preserveStartEnd" />
                  <YAxis stroke="#424754" fontSize={9} tickLine={false} axisLine={false} tick={{ fill: '#424754' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 10 }}
                    itemStyle={{ color: '#ef4444', fontWeight: 700 }}
                  />
                  <Area type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2} fill="url(#rg)" animationDuration={600} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="flex items-center justify-between" style={{ borderTop: '1px solid var(--outline-variant)', paddingTop: 12, marginTop: 12 }}>
            <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="material-icons" style={{ fontSize: 10 }}>database</span>DATA INTEGRITY: VERIFIED
            </span>
            <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--outline)' }}>LAST UPDATED: {lastUpdated}</span>
          </div>
        </div>

        {/* Live Event Feed */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header">
            <div className="flex items-center gap-2">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: recentEvents.length > 0 ? 'var(--secondary)' : '#f59e0b', animation: 'pulse 2s ease-in-out infinite' }} />
              <span className="panel-title" style={{ fontSize: '0.6875rem' }}>Live Event Feed</span>
            </div>
            <span className="mono text-dim" style={{ fontSize: '0.5625rem' }}>{recentEvents.length > 0 ? `${recentEvents.length} recent events` : 'Connecting...'}</span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {recentEvents.length === 0 ? (
              <div className="flex items-center justify-center" style={{ height: 200, flexDirection: 'column', gap: 8 }}>
                <span className="material-icons" style={{ fontSize: 40, color: 'var(--outline)' }}>sensors</span>
                <span className="text-label-sm">No recent events</span>
              </div>
            ) : recentEvents.map((ev: any) => (
              <EventRow key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: any }) {
  const masterKey = useAuthStore(s => s.masterKey);
  const [payload, setPayload] = useState<any>(event.payload);

  useEffect(() => {
    if (typeof event.payload === 'string' && masterKey) {
      CryptoService.decryptPayload(event.payload, masterKey).then(d => d && setPayload(d)).catch(() => {});
    } else {
      setPayload(event.payload);
    }
  }, [event.payload, masterKey]);

  const isBlocked = event.event_type === 'PRE_AUTH_BLOCKED';
  const isHigh = (event.risk_score || 0) > 70;

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
      background: isBlocked ? 'rgba(239,68,68,0.06)' : 'var(--surface-container-low)',
      border: `1px solid ${isBlocked ? 'rgba(239,68,68,0.2)' : 'var(--outline-variant)'}`,
    }}>
      <span className="material-icons" style={{ fontSize: 14, color: isBlocked || isHigh ? '#ef4444' : 'var(--primary)', marginTop: 2 }}>
        {isBlocked ? 'block' : 'shield'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center justify-between">
          <span className="mono" style={{ fontSize: '0.5625rem', fontWeight: 700, color: isBlocked ? '#ef4444' : 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {event.event_type || event.type}
          </span>
          <span className="mono text-dim" style={{ fontSize: '0.5rem' }}>
            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
        <div style={{ fontSize: '0.625rem', color: 'var(--on-surface-variant)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {payload?.email || payload?.user_email || payload?.ip_address || 'System event'}
        </div>
      </div>
    </div>
  );
}
