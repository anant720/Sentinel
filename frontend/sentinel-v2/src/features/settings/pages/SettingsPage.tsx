import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { AuthService } from '../../../lib/services/auth.service';

export default function SettingsPage() {
  const { user, e2eeEnabled, setE2eeEnabled, setMasterKey } = useAuthStore();
  const [e2eePassword, setE2eePassword] = useState('');
  const [e2eeOpen, setE2eeOpen] = useState(false);
  const [e2eeLoading, setE2eeLoading] = useState(false);
  const [e2eeMsg, setE2eeMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleteConfirmPw, setDeleteConfirmPw] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const handleE2eeUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setE2eeLoading(true); setE2eeMsg('');
    try {
      const { CryptoService } = await import('../../../lib/services/crypto.service');
      const masterKey = await CryptoService.deriveMasterKey(e2eePassword, user?.email || '');
      await AuthService.upgradeToE2EE(e2eePassword);
      setMasterKey(masterKey);
      setE2eeEnabled(true);
      setE2eeOpen(false);
      setE2eePassword('');
      setE2eeMsg('E2EE activated successfully.');
    } catch (err: any) {
      setE2eeMsg(err.response?.data?.message || 'E2EE upgrade failed.');
    } finally { setE2eeLoading(false); }
  };

  const handleExport = async () => {
    setExporting(true);
    try { await OrgService.exportAuditLogs(); }
    finally { setExporting(false); }
  };

  const deleteOrg = useMutation({
    mutationFn: () => OrgService.deleteOrganization(user?.organization_id || '', {
      password: deleteConfirmPw,
      orgName: deleteConfirmName,
    }),
    onSuccess: () => window.location.href = '/login',
    onError: (e: any) => setDeleteError(e?.response?.data?.message || 'Failed to delete organization.'),
  });

  const initials = user?.email?.substring(0, 2).toUpperCase() || '??';
  const org = user?.organization;

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Settings & Compliance</div>
        <div className="page-subtitle">Operator profile and security configuration</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left: Profile + Security */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Profile Card */}
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 16 }}>Operator Profile</div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div className="sidebar-avatar" style={{ width: 64, height: 64, fontSize: '1.25rem', margin: '0 auto 10px' }}>{initials}</div>
              <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--on-surface)' }}>{user?.full_name || user?.name || '—'}</div>
              <div className="mono text-dim" style={{ fontSize: '0.6875rem', marginTop: 3 }}>{user?.email}</div>
            </div>
            <div className="flex items-center justify-between ghost-border-b" style={{ paddingBottom: 8, marginBottom: 8 }}>
              <span className="text-label-sm">Role</span>
              <span className={`badge ${user?.role === 'org_admin' ? 'badge-primary' : user?.role === 'security_analyst' ? 'badge-secondary' : 'badge-surface'}`}>
                {user?.role?.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-label-sm">Organization</span>
              <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--on-surface)' }}>{org?.name}</span>
            </div>
          </div>

          {/* E2EE Security */}
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 16 }}>Security Configuration</div>
            {e2eeEnabled ? (
              <div style={{ padding: '12px', background: 'rgba(78,222,163,0.06)', border: '1px solid rgba(78,222,163,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="material-icons" style={{ fontSize: 20, color: 'var(--secondary)' }}>lock</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--secondary)' }}>E2EE ACTIVE</div>
                  <div className="text-label-sm" style={{ marginTop: 2 }}>AES-256-GCM + PBKDF2</div>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ padding: '12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span className="material-icons" style={{ fontSize: 20, color: '#fbbf24' }}>lock_open</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#fbbf24' }}>E2EE INACTIVE</div>
                    <div className="text-label-sm" style={{ marginTop: 2 }}>Data not encrypted client-side</div>
                  </div>
                </div>
                <button className="btn btn-primary w-full" onClick={() => setE2eeOpen(true)}>
                  <span className="material-icons" style={{ fontSize: 14 }}>security</span>
                  UPGRADE TO E2EE
                </button>
              </div>
            )}
            {e2eeMsg && (
              <div style={{ marginTop: 10, padding: '6px 10px', background: 'rgba(78,222,163,0.06)', border: '1px solid rgba(78,222,163,0.15)' }}>
                <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--secondary)' }}>{e2eeMsg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Audit Export + Danger Zone */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Audit Export */}
          <div className="panel">
            <div className="panel-title" style={{ marginBottom: 12 }}>Compliance & Audit</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: 16 }}>
              Export the full audit trail of all admin actions, alert transitions, and user management events as a CSV file.
            </p>
            <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
              <span className="material-icons" style={{ fontSize: 14 }}>download</span>
              {exporting ? 'EXPORTING...' : 'EXPORT AUDIT LOG CSV'}
            </button>
          </div>

          {/* Danger Zone — org_admin only */}
          {user?.role === 'org_admin' ? (
            <div className="panel" style={{ border: '1px solid rgba(255,180,171,0.25)' }}>
              <div className="panel-title" style={{ color: 'var(--error)', marginBottom: 8 }}>⚠ Danger Zone</div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--on-surface-variant)', marginBottom: 16 }}>
                Permanently delete this organization. All members, data, alerts, events, and logs will be erased. This cannot be undone.
              </p>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="t-input-wrap">
                  <label className="t-input-label">Type organization name to confirm</label>
                  <input className="t-input" placeholder={org?.name || 'org name'} value={deleteConfirmName} onChange={e => setDeleteConfirmName(e.target.value)} />
                </div>
                <div className="t-input-wrap">
                  <label className="t-input-label">Your admin password</label>
                  <input type="password" className="t-input" value={deleteConfirmPw} onChange={e => setDeleteConfirmPw(e.target.value)} />
                </div>
              </div>
              {deleteError && (
                <div style={{ padding: '6px 10px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)', marginBottom: 10 }}>
                  <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--error)' }}>{deleteError}</span>
                </div>
              )}
              <button
                className="btn btn-danger"
                disabled={deleteConfirmName !== (org?.name || '') || !deleteConfirmPw || deleteOrg.isPending}
                onClick={() => deleteOrg.mutate()}
              >
                <span className="material-icons" style={{ fontSize: 14 }}>delete_forever</span>
                {deleteOrg.isPending ? 'DELETING...' : 'DELETE ORGANIZATION'}
              </button>
            </div>
          ) : (
            <div className="panel" style={{ opacity: 0.6 }}>
              <div className="flex items-center gap-2">
                <span className="material-icons" style={{ fontSize: 16, color: 'var(--outline)' }}>lock</span>
                <span className="text-label-sm">Organization management is restricted to administrators only.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* E2EE Upgrade Modal */}
      {e2eeOpen && (
        <div className="modal-backdrop" onClick={() => setE2eeOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Activate E2EE</h3>
              <button className="btn-icon" onClick={() => setE2eeOpen(false)}><span className="material-icons">close</span></button>
            </div>
            <form onSubmit={handleE2eeUpgrade}>
              <div className="modal-body">
                <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', marginBottom: 16 }}>
                  <p style={{ fontSize: '0.75rem', color: '#fbbf24', fontFamily: 'var(--font-mono)', margin: 0 }}>
                    ⚠ Your master key is derived from your password. If you forget your password, encrypted data cannot be recovered.
                  </p>
                </div>
                <div className="t-input-wrap">
                  <label className="t-input-label">Your Password</label>
                  <input type="password" className="t-input" value={e2eePassword} onChange={e => setE2eePassword(e.target.value)} required placeholder="Enter current password" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setE2eeOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!e2eePassword || e2eeLoading}>
                  {e2eeLoading ? 'DERIVING MASTER KEY...' : 'ACTIVATE E2EE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
