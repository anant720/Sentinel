import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertService } from '../../../lib/services/alert.service';
import { Alert } from '../../../types';
import { useRoleAccess } from '../../../lib/rbac';

type AlertStatus = 'ALL' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';
type AlertSev = 'ALL' | 'critical' | 'high' | 'medium' | 'low';

interface ActionModal { alertId: string; action: 'acknowledge'|'resolve'|'dismiss'; title: string; color: string; }

function EvidencePanel({ evidence, onClose }: { evidence: any; onClose: () => void }) {
  return (
    <div style={{ padding: '12px 24px 12px 24px', background: 'var(--surface-container-lowest)', borderTop: '1px solid rgba(66,71,84,0.15)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span className="text-overline">Evidence Payload</span>
        <button className="btn-icon" onClick={onClose}><span className="material-icons" style={{ fontSize: 14 }}>close</span></button>
      </div>
      <pre className="code-block">{JSON.stringify(evidence, null, 2)}</pre>
    </div>
  );
}

export default function AlertsPage() {
  const [statusFilter, setStatusFilter] = useState<AlertStatus>('ALL');
  const [sevFilter, setSevFilter] = useState<AlertSev>('ALL');
  const [openEvidence, setOpenEvidence] = useState<string|null>(null);
  const [modal, setModal] = useState<ActionModal|null>(null);
  const [note, setNote] = useState('');
  const qc = useQueryClient();
  const { canUpdateAlerts } = useRoleAccess();

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', statusFilter],
    queryFn: () => AlertService.getAlerts(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    refetchInterval: 30000,
  });
  const alerts: Alert[] = data?.data || [];

  const filtered = alerts.filter(a => {
    if (sevFilter !== 'ALL' && a.severity !== sevFilter) return false;
    return true;
  });

  const mutation = useMutation({
    mutationFn: async ({ id, action, note }: { id: string; action: string; note?: string }) => {
      if (action === 'acknowledge') return AlertService.acknowledge(id, note);
      if (action === 'resolve') return AlertService.resolve(id, note);
      if (action === 'dismiss') return AlertService.dismiss(id, note);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['alerts'] }); setModal(null); setNote(''); },
  });

  const openModal = (a: Alert, action: 'acknowledge'|'resolve'|'dismiss') => {
    setModal({
      alertId: a.id,
      action,
      title: action === 'acknowledge' ? 'Acknowledge Alert' : action === 'resolve' ? 'Resolve Alert' : 'Dismiss Alert',
      color: action === 'dismiss' ? 'var(--outline)' : action === 'acknowledge' ? '#fbbf24' : 'var(--secondary)',
    });
    setNote('');
  };

  const confirmAction = () => {
    if (!modal) return;
    mutation.mutate({ id: modal.alertId, action: modal.action, note });
  };

  const SEV_COLORS: Record<string, string> = {
    critical: 'var(--error)', high: '#fbbf24', medium: 'var(--primary)', low: 'var(--secondary)'
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Security Alerts</div>
        <div className="page-subtitle">Triage center — threat investigation queue</div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-col" style={{ marginBottom: 20 }}>
        <div className="flex items-center gap-3">
          <span className="text-label-sm">Status:</span>
          <div className="filter-chips">
            {(['ALL','OPEN','ACKNOWLEDGED','RESOLVED','DISMISSED'] as AlertStatus[]).map(s => (
              <button key={s} className={`filter-chip ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-label-sm">Severity:</span>
          <div className="filter-chips">
            {(['ALL','critical','high','medium','low'] as AlertSev[]).map(s => (
              <button key={s} className={`filter-chip ${sevFilter === s ? 'active' : ''}`} onClick={() => setSevFilter(s)} style={{ textTransform: 'uppercase' }}>{s}</button>
            ))}
          </div>
          <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--outline)', marginLeft: 'auto' }}>{filtered.length} alert{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div style={{ background: 'var(--surface-container-lowest)', border: '1px solid rgba(66,71,84,0.15)' }}>
        {isLoading ? (
          <div style={{ padding: 48, textAlign: 'center' }}><span className="text-label-sm">Loading alerts...</span></div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <span className="material-icons" style={{ fontSize: 36, color: 'var(--outline-variant)', display: 'block', marginBottom: 8 }}>security</span>
            <span className="text-label-sm">No alerts found</span>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 8 }}>SEV</th>
                <th>Threat Name</th>
                <th>Identity</th>
                <th>Timestamp</th>
                <th>Status</th>
                <th>Evidence</th>
                {canUpdateAlerts && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, i) => (
                <>
                  <tr key={a.id}
                    className={`${a.severity === 'critical' ? 'row-bg-critical' : ''} severity-accent-${a.severity}`}
                    style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)' }}
                  >
                    <td style={{ paddingLeft: 16 }}>
                      <span className={`badge badge-${a.severity}`}>{a.severity}</span>
                      {a.status === 'OPEN' && <span className="pulsar pulsar-red" style={{ marginLeft: 6 }} />}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--on-surface)' }}>{a.title}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginTop: 2 }}>{a.description?.substring(0, 60)}{(a.description?.length || 0) > 60 ? '…' : ''}</div>
                      {/* Show resolution note if it exists */}
                      {a.resolution_note && (
                        <div style={{ marginTop: 4, padding: '3px 6px', background: 'rgba(78,222,163,0.06)', border: '1px solid rgba(78,222,163,0.1)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span className="material-icons" style={{ fontSize: 9, color: 'var(--secondary)' }}>comment</span>
                          <span className="mono" style={{ fontSize: '0.5rem', color: 'var(--secondary)' }}>{a.resolution_note}</span>
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: '0.75rem' }}>{a.entity || '—'}</td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>{new Date(a.created_at).toLocaleString()}</td>
                    <td><span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span></td>
                    <td>
                      {a.evidence ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => setOpenEvidence(openEvidence === a.id ? null : a.id)}>
                          {openEvidence === a.id ? 'Hide' : 'View'}
                        </button>
                      ) : <span className="text-dim" style={{ fontSize: '0.6875rem' }}>None</span>}
                    </td>
                    {canUpdateAlerts && (
                      <td>
                        <div className="flex gap-2">
                          {a.status === 'OPEN' && <button className="btn btn-ghost btn-sm" onClick={() => openModal(a, 'acknowledge')}>ACK</button>}
                          {(a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--secondary)', borderColor: 'rgba(78,222,163,0.2)' }} onClick={() => openModal(a, 'resolve')}>RESOLVE</button>}
                          {/* Dismiss only for OPEN or ACKNOWLEDGED — never for RESOLVED or DISMISSED */}
                          {(a.status === 'OPEN' || a.status === 'ACKNOWLEDGED') && <button className="btn btn-icon btn-sm" title="Dismiss" onClick={() => openModal(a, 'dismiss')}><span className="material-icons" style={{ fontSize: 14 }}>block</span></button>}
                        </div>
                      </td>
                    )}
                  </tr>
                  {openEvidence === a.id && (
                    <tr key={`ev-${a.id}`}>
                      <td colSpan={canUpdateAlerts ? 7 : 6} style={{ padding: 0 }}>
                        <EvidencePanel evidence={a.evidence} onClose={() => setOpenEvidence(null)} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Action Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: modal.color }}>{modal.title}</h3>
              <button className="btn-icon" onClick={() => setModal(null)}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <div className="t-input-wrap">
                <label className="t-input-label">Analyst Note (Optional)</label>
                <textarea className="t-input" value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Add context or investigation notes..." style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmAction} disabled={mutation.isPending}
                style={{ background: modal.color === 'var(--secondary)' ? 'rgba(78,222,163,0.15)' : undefined, color: modal.color }}>
                {mutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
