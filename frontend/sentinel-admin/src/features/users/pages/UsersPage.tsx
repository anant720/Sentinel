import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useRoleAccess } from '../../../lib/rbac';
import { Users, Trash2, Search, UserPlus, X, Mail, Send, ChevronDown } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastProvider';
import { User } from '../../../types';

const ROLES = ['viewer', 'security_analyst', 'org_admin'] as const;
type RoleValue = typeof ROLES[number];

export default function IdentityPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { canManageUsers } = useRoleAccess();
  
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<RoleValue>('viewer');
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleMenuOpen, setRoleMenuOpen] = useState<string | null>(null);

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => OrgService.getUsers(),
  });

  const { data: meRes } = useQuery({
    queryKey: ['me'],
    queryFn: () => OrgService.getMe(),
  });

  const { data: invitationsRes } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => OrgService.getInvitations(),
    enabled: canManageUsers,
  });

  const currentUser = meRes?.user;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => OrgService.deleteUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast('User identity removed.', 'info');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to remove user.', 'error'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => OrgService.updateUserRole(id, role),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      showToast(`Role updated to ${vars.role}.`, 'success');
      setRoleMenuOpen(null);
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to update role.', 'error'),
  });

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) => OrgService.invite(payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      const baseUrl = window.location.origin;
      setLastInviteLink(`${baseUrl}/invite/${data.token}`);
      showToast('Invitation generated successfully!', 'success');
      setInviteEmail('');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to send invitation.', 'error'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => OrgService.deleteInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      showToast('Invitation revoked.', 'info');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to revoke invitation.', 'error'),
  });

  const getRoleBadge = (role: string) => {
    const base = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ';
    const r = role?.toLowerCase();
    if (r === 'org_admin') return base + 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
    if (r === 'security_analyst') return base + 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    return base + 'bg-gray-500/10 text-gray-400 border border-gray-500/20';
  };

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'never';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getPresence = (user: User) => {
    const p = (user as any).presence?.toLowerCase() || 'offline';
    const lastSeenStr = formatTimeAgo((user as any).last_seen_at);
    const dotColor = p === 'online' ? 'bg-green-500 shadow-sm shadow-green-500/50' : p === 'away' ? 'bg-yellow-500' : 'bg-gray-600';
    const textColor = p === 'online' ? 'text-gray-300' : p === 'away' ? 'text-gray-400' : 'text-gray-500';
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
          <span className={`text-xs font-semibold ${textColor}`}>{p.charAt(0).toUpperCase() + p.slice(1)}</span>
        </div>
        <span className="text-[9px] text-gray-600 font-bold ml-3.5 italic lowercase">{lastSeenStr}</span>
      </div>
    );
  };

  const allUsers: User[] = users?.data || [];
  const invitations = invitationsRes?.data || [];

  const displayUsers = searchQuery
    ? allUsers.filter(u => {
        const q = searchQuery.toLowerCase();
        return (
          u.email?.toLowerCase().includes(q) ||
          (u as any).full_name?.toLowerCase().includes(q) ||
          u.role?.toLowerCase().includes(q)
        );
      })
    : allUsers;

  const stats = [
    { label: 'Total Identities', value: allUsers.length },
    { label: 'Org Admin', value: allUsers.filter(u => u.role?.toLowerCase() === 'org_admin').length },
    { label: 'Security Analyst', value: allUsers.filter(u => u.role?.toLowerCase() === 'security_analyst').length },
    { label: 'Viewer', value: allUsers.filter(u => u.role?.toLowerCase() === 'viewer').length },
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto relative pb-20" onClick={() => setRoleMenuOpen(null)}>
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-lg shadow-primary/5">
           <Users className="text-primary" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Identity Management</h1>
          <p className="text-sm text-gray-500">All identities registered in this organization.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-panel p-6 hover:translate-y-[-2px] transition-all duration-300">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">{stat.label}</span>
            <span className="text-3xl font-bold">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">
          <Users size={12} /> Active Identities
        </div>
        <div className="glass-panel overflow-hidden">
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <div className="relative flex-1 max-w-md group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" size={14} />
              <input 
                type="text" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by email, name, or role..."
                className="w-full bg-white/5 border border-white/5 rounded-lg py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
            </div>
            {canManageUsers && (
              <button 
                onClick={() => setIsInviteModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-primary/5"
              >
                <UserPlus size={14} /> Invite User
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Name</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Role</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Presence</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Account</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Member Since</th>
                  {canManageUsers && <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayUsers.map((user: User) => {
                  const isCurrentUser = user.email === currentUser?.email;
                  const isAdmin = user.role?.toLowerCase() === 'org_admin';
                  const canDelete = canManageUsers && !isCurrentUser && !isAdmin;
                  const canChangeRole = canManageUsers && !isCurrentUser && !isAdmin;

                  return (
                    <tr key={user.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-6 py-5 text-xs font-semibold text-gray-200">{user.email}</td>
                      <td className="px-6 py-5 text-xs text-gray-400">{(user as any).full_name || '—'}</td>
                      <td className="px-6 py-5">
                        {canChangeRole ? (
                          <div className="relative" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => setRoleMenuOpen(roleMenuOpen === user.id ? null : user.id)}
                              className={`${getRoleBadge(user.role)} flex items-center gap-1 cursor-pointer hover:opacity-80`}
                            >
                              {user.role?.replace(/_/g, ' ') || 'viewer'}
                              <ChevronDown size={10} className="ml-1" />
                            </button>
                            {roleMenuOpen === user.id && (
                              <div className="absolute left-0 top-7 z-30 bg-[#0a0d14] border border-white/10 rounded-lg shadow-2xl min-w-[150px] py-1 animate-in fade-in duration-150">
                                {ROLES.filter(r => r !== user.role?.toLowerCase()).map(r => (
                                  <button
                                    key={r}
                                    onClick={() => updateRoleMutation.mutate({ id: user.id, role: r })}
                                    className="w-full text-left px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 uppercase tracking-widest transition-all"
                                  >
                                    {r.replace(/_/g, ' ')}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className={getRoleBadge(user.role)}>
                            {user.role?.replace(/_/g, ' ') || 'viewer'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-5">{getPresence(user)}</td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                           <div className={`w-1 h-1 rounded-full ${(user as any).is_active ? 'bg-green-500' : 'bg-red-500'}`} />
                           <span className={`text-[9px] font-bold uppercase tracking-tight ${(user as any).is_active ? 'text-green-500' : 'text-red-500'}`}>
                              {(user as any).is_active ? 'Enabled' : 'Disabled'}
                           </span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-xs text-gray-500 font-bold">
                        {(user as any).created_at ? new Date((user as any).created_at).toLocaleDateString() : '—'}
                      </td>
                      {canManageUsers && (
                        <td className="px-6 py-5 text-right">
                          <button 
                            onClick={() => {
                              if (confirm(`Remove ${user.email}?`)) deleteMutation.mutate(user.id);
                            }}
                            disabled={!canDelete || deleteMutation.isPending}
                            title={
                              isCurrentUser ? 'Cannot delete your own account' :
                              isAdmin ? 'Org Admins cannot be deleted' :
                              'Remove identity'
                            }
                            className={`p-1.5 transition-colors border border-white/5 rounded-md ${
                              canDelete
                                ? 'text-gray-600 hover:text-red-400 bg-white/5 hover:bg-red-500/10'
                                : 'opacity-20 cursor-not-allowed bg-white/5 text-gray-600'
                            }`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 border-t border-white/5 bg-white/[0.01]">
             <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
               {displayUsers.length} / {allUsers.length} identities shown
             </p>
          </div>
        </div>
      </div>

      {/* Pending Invitations */}
      {canManageUsers && invitations.length > 0 && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest ml-1">
            <Mail size={12} /> Pending Invitations
          </div>
          <div className="glass-panel overflow-hidden border-primary/10">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Target Role</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Expires</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invitations.map((invite: any) => (
                  <tr key={invite.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-gray-300">{invite.email}</td>
                    <td className="px-6 py-4">
                      <span className={getRoleBadge(invite.role)}>{invite.role?.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="px-6 py-4 text-[10px] text-gray-500 font-bold tabular-nums">
                      {new Date(invite.expires_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => { if (confirm(`Revoke invitation for ${invite.email}?`)) revokeMutation.mutate(invite.id); }}
                        className="text-[10px] font-bold text-red-500/80 hover:text-red-400 uppercase tracking-widest transition-colors flex items-center gap-1.5 ml-auto"
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invitation Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#05080f]/80 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="glass-panel w-full max-w-md p-8 space-y-6 shadow-2xl border-white/10 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-primary uppercase font-bold tracking-widest text-sm">
                <UserPlus size={18} /> Invite Member
              </div>
              <button onClick={() => { setIsInviteModalOpen(false); setLastInviteLink(null); }} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {lastInviteLink ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                    <Send size={12} /> Invitation Link Ready
                  </div>
                  <div className="relative group/link">
                    <input readOnly value={lastInviteLink} className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 text-[10px] font-mono text-primary outline-none pr-16" />
                    <button 
                      onClick={() => { navigator.clipboard.writeText(lastInviteLink); showToast('Link copied!', 'success'); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-md text-[9px] font-bold uppercase transition-all"
                    >Copy</button>
                  </div>
                </div>
                <button onClick={() => { setIsInviteModalOpen(false); setLastInviteLink(null); }} className="w-full py-3 bg-white/5 border border-white/5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-white hover:bg-white/10 transition-all">Close</button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
                    <div className="relative group">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={14} />
                      <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="w-full bg-white/5 border border-white/5 rounded-lg py-3 pl-10 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Assigned Role</label>
                    <div className="grid grid-cols-3 gap-2">
                      {ROLES.map(role => (
                        <button key={role} onClick={() => setInviteRole(role)} className={`py-2 px-1 rounded-lg text-[9px] font-bold uppercase tracking-tight border transition-all ${inviteRole === role ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/10'}`}>
                          {role.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="pt-4 flex gap-3">
                  <button onClick={() => setIsInviteModalOpen(false)} className="flex-1 py-3 border border-white/5 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-all">Cancel</button>
                  <button onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })} disabled={inviteMutation.isPending || !inviteEmail} className="flex-1 py-3 bg-primary/20 border border-primary/30 text-primary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary/30 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
                    <Send size={14} />
                    {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
