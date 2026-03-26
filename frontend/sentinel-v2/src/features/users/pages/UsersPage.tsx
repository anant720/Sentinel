import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { User, Invitation } from '../../../types';

type RoleModalData = { userId: string; currentRole: string };
type RemoveModalData = { userId: string; email: string };

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('security_analyst');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [roleModal, setRoleModal] = useState<RoleModalData | null>(null);
  const [removeModal, setRemoveModal] = useState<RemoveModalData | null>(null);
  const [newRole, setNewRole] = useState('security_analyst');
  const [password, setPassword] = useState('');
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { data: usersData } = useQuery({ queryKey: ['users'], queryFn: OrgService.getUsers });
  const { data: invData } = useQuery({ queryKey: ['invitations'], queryFn: OrgService.getInvitations });
  const users: User[] = usersData?.data || usersData || [];
  const invitations: Invitation[] = invData?.data || invData || [];

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setErrorMsg(''); setTimeout(() => setSuccessMsg(''), 4000); };
  const showError = (msg: string) => { setErrorMsg(msg); setSuccessMsg(''); setTimeout(() => setErrorMsg(''), 6000); };

  const invite = useMutation({
    mutationFn: () => OrgService.invite({ email: inviteEmail, role: inviteRole }),
    onSuccess: () => { setInviteOpen(false); setInviteEmail(''); qc.invalidateQueries({ queryKey: ['invitations'] }); showSuccess(`Invitation sent to ${inviteEmail}.`); },
    onError: (e: any) => showError(e?.response?.data?.message || 'Failed to send invitation.'),
  });

  const changeRole = useMutation({
    mutationFn: ({ id }: { id: string }) => OrgService.updateUserRole(id, newRole, password),
    onSuccess: () => {
      setRoleModal(null); setPassword(''); setErrorMsg('');
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess('Role updated successfully.');
    },
    onError: (e: any) => setErrorMsg(e?.response?.data?.message || 'Failed to change role. Verify your password.'),
  });

  const removeUser = useMutation({
    mutationFn: ({ id }: { id: string }) => OrgService.deleteUser(id, password),
    onSuccess: () => {
      setRemoveModal(null); setPassword(''); setErrorMsg('');
      qc.invalidateQueries({ queryKey: ['users'] });
      showSuccess('User removed successfully.');
    },
    onError: (e: any) => setErrorMsg(e?.response?.data?.message || 'Failed to remove user. Verify your password.'),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => OrgService.deleteInvitation(id),
    onSuccess: () => { setRevokeId(null); qc.invalidateQueries({ queryKey: ['invitations'] }); showSuccess('Invitation revoked.'); },
    onError: (e: any) => showError(e?.response?.data?.message || 'Failed to revoke invitation.'),
  });

  const presenceStatus = (u: User) => {
    if (!u.last_seen_at) return 'offline';
    const diff = Date.now() - new Date(u.last_seen_at).getTime();
    if (diff < 5 * 60000) return 'online';
    if (diff < 15 * 60000) return 'away';
    return 'offline';
  };

  const roleBadge = (role: string) => role === 'org_admin' ? 'badge-primary' : role === 'security_analyst' ? 'badge-secondary' : 'badge-surface';

  // Role options — org_admin is excluded (Single Admin Policy)
  const ASSIGNABLE_ROLES = [
    { value: 'security_analyst', label: 'Security Analyst' },
    { value: 'viewer', label: 'Viewer' },
  ];

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Identity & Access Control</div>
          <div className="page-subtitle">{users.length} members · {invitations.length} pending invitations</div>
        </div>
        <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
          <span className="material-icons" style={{ fontSize: 16 }}>person_add</span>
          INVITE USER
        </button>
      </div>

      {/* Global status messages */}
      {successMsg && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(78,222,163,0.08)', border: '1px solid rgba(78,222,163,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 14, color: 'var(--secondary)' }}>check_circle</span>
          <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--secondary)' }}>{successMsg}</span>
        </div>
      )}
      {errorMsg && !roleModal && !removeModal && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 14, color: 'var(--error)' }}>error</span>
          <span className="mono" style={{ fontSize: '0.6875rem', color: 'var(--error)' }}>{errorMsg}</span>
        </div>
      )}

      {/* Active Members */}
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-title" style={{ marginBottom: 12 }}>Active Members</div>
        <div style={{ overflowX: 'auto', background: 'var(--surface-container-lowest)' }}>
          <table className="data-table">
            <thead><tr><th>User</th><th>Role</th><th>Presence</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u, i) => {
                const presence = presenceStatus(u);
                const isCurrentUser = u.id === currentUser?.id;
                const isAdmin = u.role === 'org_admin';
                return (
                  <tr key={u.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)' }}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="sidebar-avatar" style={{ width: 32, height: 32, fontSize: '0.6875rem' }}>
                          {u.email.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{u.full_name || u.name || '—'}</div>
                          <div className="mono text-dim" style={{ fontSize: '0.625rem' }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${roleBadge(u.role)}`}>{u.role.replace(/_/g, ' ')}</span></td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`pulsar pulsar-${presence === 'online' ? 'green' : presence === 'away' ? 'amber' : ''}`}
                          style={{ background: presence === 'offline' ? 'var(--outline-variant)' : undefined, animationPlayState: presence === 'offline' ? 'paused' : 'running' }} />
                        <span className={`badge badge-${presence}`} style={{ fontSize: '0.5rem' }}>{presence}</span>
                      </div>
                    </td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      {/* Can't modify yourself or the admins */}
                      {!isCurrentUser && !isAdmin ? (
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setNewRole(u.role); setPassword(''); setErrorMsg(''); setRoleModal({ userId: u.id, currentRole: u.role }); }}>Change Role</button>
                          <button className="btn btn-danger btn-sm" onClick={() => { setPassword(''); setErrorMsg(''); setRemoveModal({ userId: u.id, email: u.email }); }}>Remove</button>
                        </div>
                      ) : (
                        <span className="text-dim" style={{ fontSize: '0.625rem' }}>{isCurrentUser ? 'You' : 'Admin'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <div className="panel">
          <div className="panel-title" style={{ marginBottom: 12 }}>Pending Invitations</div>
          <div style={{ overflowX: 'auto', background: 'var(--surface-container-lowest)' }}>
            <table className="data-table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th>Actions</th></tr></thead>
              <tbody>
                {invitations.map((inv, i) => (
                  <tr key={inv.id} style={{ background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-container-low)' }}>
                    <td className="mono" style={{ fontSize: '0.75rem' }}>{inv.email}</td>
                    <td><span className={`badge ${roleBadge(inv.role)}`}>{inv.role.replace(/_/g, ' ')}</span></td>
                    <td className="mono text-dim" style={{ fontSize: '0.6875rem' }}>{new Date(inv.expires_at).toLocaleString()}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => setRevokeId(inv.id)}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="modal-backdrop" onClick={() => setInviteOpen(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Invite User</h3>
              <button className="btn-icon" onClick={() => setInviteOpen(false)}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <div className="t-input-wrap">
                <label className="t-input-label">Email Address</label>
                <input className="t-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@org.com" />
              </div>
              <div className="t-input-wrap">
                <label className="t-input-label">Role</label>
                <select className="t-input" value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ cursor: 'pointer' }}>
                  {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ padding: '8px 10px', background: 'rgba(173,198,255,0.06)', border: '1px solid rgba(173,198,255,0.1)', marginTop: 8 }}>
                <span className="mono" style={{ fontSize: '0.5625rem', color: 'var(--on-surface-variant)' }}>
                  ℹ Single Admin Policy: Only one admin per organization. New users can be Analyst or Viewer.
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => invite.mutate()} disabled={!inviteEmail || invite.isPending}>
                {invite.isPending ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Modal */}
      {roleModal && (
        <div className="modal-backdrop" onClick={() => { setRoleModal(null); setErrorMsg(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>Change Role</h3>
              <button className="btn-icon" onClick={() => { setRoleModal(null); setErrorMsg(''); }}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <div className="t-input-wrap">
                <label className="t-input-label">New Role</label>
                <select className="t-input" value={newRole} onChange={e => setNewRole(e.target.value)}>
                  {ASSIGNABLE_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="t-input-wrap">
                <label className="t-input-label">Your Admin Password (required)</label>
                <input type="password" className="t-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password to authorize" />
              </div>
              {errorMsg && (
                <div style={{ padding: '8px 10px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)', marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--error)' }}>{errorMsg}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setRoleModal(null); setErrorMsg(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={() => changeRole.mutate({ id: roleModal.userId })} disabled={!password || changeRole.isPending}>
                {changeRole.isPending ? 'Saving...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remove Modal */}
      {removeModal && (
        <div className="modal-backdrop" onClick={() => { setRemoveModal(null); setErrorMsg(''); }}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--error)' }}>Remove User</h3>
              <button className="btn-icon" onClick={() => { setRemoveModal(null); setErrorMsg(''); }}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>Remove <strong className="mono">{removeModal.email}</strong>? This action is permanent — the account will be deactivated.</p>
              <div className="t-input-wrap" style={{ marginTop: 16 }}>
                <label className="t-input-label">Your Admin Password (required)</label>
                <input type="password" className="t-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password to authorize" />
              </div>
              {errorMsg && (
                <div style={{ padding: '8px 10px', background: 'rgba(147,0,10,0.1)', border: '1px solid rgba(255,180,171,0.2)', marginTop: 8 }}>
                  <span className="mono" style={{ fontSize: '0.625rem', color: 'var(--error)' }}>{errorMsg}</span>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => { setRemoveModal(null); setErrorMsg(''); }}>Cancel</button>
              <button className="btn btn-danger" onClick={() => removeUser.mutate({ id: removeModal.userId })} disabled={!password || removeUser.isPending}>
                {removeUser.isPending ? 'Removing...' : 'Remove User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Invite Modal */}
      {revokeId && (
        <div className="modal-backdrop" onClick={() => setRevokeId(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--error)' }}>Revoke Invitation</h3>
              <button className="btn-icon" onClick={() => setRevokeId(null)}><span className="material-icons">close</span></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.875rem' }}>The invitation will be invalidated immediately. The user will not be able to register using the invite link.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRevokeId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => revokeInvite.mutate(revokeId)} disabled={revokeInvite.isPending}>
                {revokeInvite.isPending ? 'Revoking...' : 'Revoke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
