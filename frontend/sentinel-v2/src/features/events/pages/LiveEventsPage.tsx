import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../../lib/store';
import { useSecurityStream } from '../../../hooks/useSecurityStream';
import { SecurityEvent } from '../../../types';
import api from '../../../lib/api';

// Real backend event_type values (field aliased as 'type' in the SELECT)
const EVENT_TYPES = [
  { value: 'ALL', label: 'All Events' },
  { value: 'login_success', label: 'Login Success' },
  { value: 'login_failure', label: 'Login Failure' },
  { value: 'user_role_updated', label: 'Role Updated' },
  { value: 'user_deleted', label: 'User Deleted' },
  { value: 'device_enrolled', label: 'Device Enrolled' },
  { value: 'user_invite', label: 'User Invite' },
];

async function fetchEvents(eventType?: string): Promise<{ data: SecurityEvent[]; total: number }> {
  const params: any = { limit: 200, page: 1 };
  if (eventType && eventType !== 'ALL') params.type = eventType;
  const { data } = await api.get('/events', { params });
  return data;
}

export default function LiveEventsPage() {
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const { events: wsEvents, isConnected } = useSecurityStream({ maxEvents: 200 });

  const { data, isLoading } = useQuery({
    queryKey: ['events', filter],
    queryFn: () => fetchEvents(filter),
    refetchInterval: 15000,
  });

  // Backend aliases event_type → 'type'; rows look like { type: 'login_success', ... }
  const httpEvents: SecurityEvent[] = (data?.data || []).map((e: any) => ({
    ...e,
    event_type: e.type || e.event_type || '—', // normalize to event_type for UI
  }));

  // Merge with WebSocket live events (already have event_type set)
  const allEvents: SecurityEvent[] = wsEvents.length > 0
    ? [
        ...wsEvents.map(e => ({
          ...e,
          event_type: e.type || (e as any).event_type || '—',
          payload: e.payload,
          created_at: new Date((e as any).timestamp).toISOString(),
          risk_score: (e as any).severity === 'critical' ? 95 : (e as any).severity === 'high' ? 70 : (e as any).severity === 'medium' ? 40 : 15,
        } as unknown as SecurityEvent)),
        ...httpEvents,
      ].slice(0, 200)
    : httpEvents;

  // Client-side search filter on top of server-side type filter
  const filtered = search
    ? allEvents.filter(e => {
        const s = search.toLowerCase();
        return (
          (e.event_type || '').toLowerCase().includes(s) ||
          (e.payload?.email || e.payload?.user_email || e.email || '').toLowerCase().includes(s) ||
          (e.payload?.ip_address || e.ip_address || '').toLowerCase().includes(s)
        );
      })
    : allEvents;

  const getEventBadge = (type: string) => {
    if (type?.includes('fail') || type?.includes('failure')) return 'badge-critical';
    if (type?.includes('success')) return 'badge-secondary';
    if (type?.includes('device') || type?.includes('enroll')) return 'badge-primary';
    if (type?.includes('role') || type?.includes('delete')) return 'badge-high';
    if (type?.includes('invite')) return 'badge-surface';
    return 'badge-surface';
  };

  const getRiskColor = (r: number) => r > 70 ? 'var(--error)' : r > 40 ? '#fbbf24' : 'var(--secondary)';

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Live Telemetry Explorer</div>
          <div className="flex items-center gap-3 mt-1">
            <div className={`pulsar ${isConnected ? 'pulsar-green' : 'pulsar-amber'}`} />
            <span className="mono" style={{ fontSize: '0.5625rem', color: isConnected ? 'var(--secondary)' : '#fbbf24', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              {isConnected ? 'STREAMING' : 'POLLING'}
            </span>
            <span className="text-label-sm">{filtered.length.toLocaleString()} events</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="filter-chips" style={{ flex: 1 }}>
          {EVENT_TYPES.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${filter === f.value ? 'active' : ''}`}
              onClick={() => { setFilter(f.value); setExpanded(null); }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          className="t-input"
          style={{ width: 200, fontSize: '0.75rem', height: 30, padding: '4px 10px' }}
          placeholder="Search identity, IP…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid rgba(66,71,84,0.15)', overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>Identity</th>
              <th>Source IP</th>
              <th>User Agent</th>
              <th>Risk Score</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}>
                <span className="text-label-sm">Loading events...</span>
              </td></tr>
            )}
            {!isLoading && filtered.map((ev, i) => {
              const risk = ev.risk_score ?? (ev.payload?.risk_score as number) ?? 0;
              const ip = ev.payload?.ip_address || ev.ip_address || '—';
              const identity = ev.payload?.email || ev.payload?.user_email || ev.email || '—';
              const ua = ev.payload?.user_agent || ev.user_agent || '—';
              const evType = ev.event_type || '—';
              const rowId = ev.id || String(i);
              const isHiRisk = risk > 70;
              return (
                <>
                  <tr
                    key={rowId}
                    onClick={() => setExpanded(expanded === rowId ? null : rowId)}
                    style={{
                      cursor: 'pointer',
                      boxShadow: isHiRisk ? 'inset 3px 0 0 var(--error)' : undefined,
                      background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)',
                    }}
                  >
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className={`badge ${getEventBadge(evType)}`}>{evType}</span>
                    </td>
                    <td className="mono" style={{ fontSize: '0.75rem', maxWidth: 180 }}>
                      <span className="truncate" style={{ display: 'inline-block', maxWidth: 180 }}>{identity}</span>
                    </td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>{ip}</td>
                    <td className="mono text-dim" style={{ fontSize: '0.5625rem', maxWidth: 140 }}>
                      <span className="truncate" style={{ display: 'inline-block', maxWidth: 140 }}>{ua}</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="risk-bar-track">
                          <div className="risk-bar-fill" style={{ width: `${risk}%`, background: getRiskColor(risk) }} />
                        </div>
                        <span className="mono" style={{ fontSize: '0.6875rem', color: getRiskColor(risk), minWidth: 28 }}>{risk}</span>
                      </div>
                    </td>
                  </tr>
                  {expanded === rowId && (
                    <tr key={`exp-${rowId}`}>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div style={{ padding: '12px 24px', background: 'var(--surface-container-lowest)', borderTop: '1px solid rgba(66,71,84,0.15)' }}>
                          <div className="text-overline" style={{ marginBottom: 8 }}>Raw Payload</div>
                          <pre className="code-block">{JSON.stringify(ev.payload, null, 2)}</pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 48 }}>
                <span className="material-icons" style={{ fontSize: 36, color: 'var(--outline-variant)', display: 'block', marginBottom: 8 }}>event_note</span>
                <span className="text-label-sm">No events match the current filter</span>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mono" style={{ fontSize: '0.5625rem', color: 'var(--outline)', marginTop: 8, textAlign: 'right' }}>
        Showing {filtered.length} of {data?.total ?? allEvents.length} events
      </div>
    </div>
  );
}
