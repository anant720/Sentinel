import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { ApiKey } from '../../../types';

const RATE_LIMIT_OPTIONS = [100, 500, 1000, 2000, 5000, 10000];

export default function OrganizationsPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [showGenerate, setShowGenerate] = useState(false);
  const [rateLimit, setRateLimit] = useState(1000);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState('');

  const { data: keysData, isLoading: keysLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: OrgService.getApiKeys,
  });
  const keys: ApiKey[] = keysData?.data || keysData || [];

  const createKey = useMutation({
    mutationFn: () => OrgService.createApiKey(rateLimit),
    onSuccess: (res: any) => {
      // Backend response: { rawKey, key, message }
      const raw = res?.rawKey || res?.data?.rawKey || null;
      setNewKeyValue(raw);
      setShowGenerate(false);
      setGenerateError('');
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (e: any) => setGenerateError(e?.response?.data?.message || 'Failed to generate API key. Check permissions.'),
  });

  const revokeKey = useMutation({
    mutationFn: (id: string) => OrgService.deleteApiKey(id),
    onSuccess: () => {
      setRevokeId(null);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const org = user?.organization;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Organization Control Panel</div>
        <div className="page-subtitle">API keys, credentials, and tenant management</div>
      </div>

      {/* Org Info */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>Organization Profile</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <div className="text-label-sm">Organization Name</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--on-surface)', marginTop: 4 }}>{org?.name || '—'}</div>
          </div>
          <div>
            <div className="text-label-sm">Organization ID</div>
            <div className="mono" style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: 4, wordBreak: 'break-all' }}>{user?.organization_id}</div>
          </div>
          <div>
            <div className="text-label-sm">Your Role</div>
            <div style={{ marginTop: 4 }}><span className="badge badge-primary">{user?.role?.replace(/_/g, ' ')}</span></div>
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-header">
          <div>
            <div className="panel-title">API Key Management</div>
            <div className="text-label-sm" style={{ marginTop: 4 }}>Keys grant machine-to-machine access via <span className="mono">sk_sentinel_*</span> tokens</div>
          </div>
          <button className="btn btn-primary" onClick={() => { setShowGenerate(true); setGenerateError(''); }}>
            <span className="material-icons" style={{ fontSize: 16 }}>add</span>
            GENERATE KEY
          </button>
        </div>

        {/* Newly created key — one-time copy banner */}
        {newKeyValue && (
          <div style={{ margin: '16px 0', padding: '16px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.25)' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
              <span className="material-icons" style={{ fontSize: 16, color: '#fbbf24' }}>warning</span>
              <span className="mono" style={{ fontSize: '0.625rem', color: '#fbbf24', fontWeight: 700, letterSpacing: '0.1em' }}>COPY YOUR KEY NOW — IT WILL NEVER BE SHOWN AGAIN</span>
            </div>
            <div className="code-block" style={{ wordBreak: 'break-all', userSelect: 'all', color: 'var(--secondary)', marginBottom: 10, fontSize: '0.75rem' }}>
              {newKeyValue}
            </div>
            <div className="flex gap-3 items-center">
              <button className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(newKeyValue); setKeyCopied(true); }}>
                <span className="material-icons" style={{ fontSize: 14 }}>content_copy</span>
                {keyCopied ? 'COPIED!' : 'COPY TO CLIPBOARD'}
              </button>
              {keyCopied && (
                <button className="btn btn-ghost" onClick={() => { setNewKeyValue(null); setKeyCopied(false); }}>
                  Close
                </button>
              )}
            </div>
          </div>
        )}

        {generateError && (
          <div style={{ margin: '12px 0', padding: '8px 12px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)' }}>
            <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--error)' }}>{generateError}</span>
          </div>
        )}

        {keysLoading ? (
          <div style={{ padding: 32, textAlign: 'center' }}><span className="text-label-sm">Loading keys...</span></div>
        ) : (
          <div style={{ overflowX: 'auto', background: 'var(--surface-container-lowest)' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Key Prefix</th>
                  <th>Rate Limit</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 40 }}>
                      <span className="material-icons" style={{ fontSize: 28, color: 'var(--outline-variant)', display: 'block', marginBottom: 8 }}>vpn_key</span>
                      <span className="text-label-sm">No API keys yet. Generate one to get started.</span>
                    </td>
                  </tr>
                ) : keys.map((k, i) => (
                  <tr key={k.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)' }}>
                    <td className="mono" style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 700 }}>
                      {k.key_prefix}<span style={{ opacity: 0.4 }}>••••••••</span>
                    </td>
                    <td>
                      <span className="badge badge-surface">{k.rate_limit_per_minute?.toLocaleString()} req/min</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`pulsar ${k.is_active ? 'pulsar-green' : ''}`}
                          style={{ background: k.is_active ? undefined : 'var(--outline-variant)', animationPlayState: k.is_active ? 'running' : 'paused' }} />
                        <span className={`badge ${k.is_active ? 'badge-secondary' : 'badge-surface'}`} style={{ fontSize: '0.5rem' }}>
                          {k.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </div>
                    </td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td>
                      {k.is_active ? (
                        <button className="btn btn-danger btn-sm" onClick={() => setRevokeId(k.id)}>Revoke</button>
                      ) : (
                        <span className="text-dim" style={{ fontSize: '0.625rem' }}>Revoked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Key Modal */}
      {showGenerate && (
        <div className="modal-backdrop" onClick={() => setShowGenerate(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Generate API Key</h3>
              <button className="btn-icon" onClick={() => setShowGenerate(false)}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <div style={{ padding: '10px 12px', background: 'rgba(173,198,255,0.06)', border: '1px solid rgba(173,198,255,0.1)', marginBottom: 16 }}>
                <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--on-surface-variant)' }}>
                  ℹ The raw key is shown only once at creation. Store it securely — it cannot be retrieved later.
                </span>
              </div>
              <div className="t-input-wrap">
                <label className="t-input-label">Rate Limit (requests per minute)</label>
                <select className="t-input" value={rateLimit} onChange={e => setRateLimit(Number(e.target.value))} style={{ cursor: 'pointer' }}>
                  {RATE_LIMIT_OPTIONS.map(v => (
                    <option key={v} value={v}>{v.toLocaleString()} req/min</option>
                  ))}
                </select>
                <div className="mono" style={{ fontSize: '0.5rem', color: 'var(--outline)', marginTop: 4 }}>
                  Range: 100–10,000 requests per minute
                </div>
              </div>
              {generateError && (
                <div style={{ padding: '8px 10px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)', marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--error)' }}>{generateError}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowGenerate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => createKey.mutate()} disabled={createKey.isPending}>
                <span className="material-icons" style={{ fontSize: 14 }}>vpn_key</span>
                {createKey.isPending ? 'Generating...' : 'Generate Key'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirm Modal */}
      {revokeId && (
        <div className="modal-backdrop" onClick={() => setRevokeId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--error)' }}>Revoke API Key</h3>
              <button className="btn-icon" onClick={() => setRevokeId(null)}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>
                This will <strong>immediately invalidate</strong> the key. Any integrations or services using it will stop working.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRevokeId(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => revokeKey.mutate(revokeId)}
                disabled={revokeKey.isPending}
              >
                {revokeKey.isPending ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
