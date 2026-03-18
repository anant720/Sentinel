import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { Building2, Key, UserPlus, Search, Mail, Send, Trash2, Plus, X, Copy, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastProvider';

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [showKeyBuilder, setShowKeyBuilder] = useState(false);
  const [rateLimit, setRateLimit] = useState(1000);
  const { showToast } = useToast();

  const { data: apiKeysResponse } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => OrgService.getApiKeys(),
  });

  const { data: invitationsResponse } = useQuery({
    queryKey: ['org-invitations'],
    queryFn: () => OrgService.getInvitations(),
  });

  const createKeyMutation = useMutation({
    mutationFn: (limit: number) => OrgService.createApiKey({ rate_limit_per_minute: limit }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewKey(data.rawKey || null);
      setKeyCopied(false);
      setShowKeyBuilder(false);
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to create API key.', 'error'),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: (id: string) => OrgService.deleteApiKey(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      showToast('API key revoked.', 'info');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to revoke key.', 'error'),
  });

  const inviteMutation = useMutation({
    mutationFn: (payload: { email: string; role: string }) => OrgService.invite(payload),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations'] });
      setInviteEmail('');
      setLastInviteLink(`${window.location.origin}/invite/${data.token}`);
      showToast('Invitation generated successfully!', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to generate invitation.', 'error'),
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (id: string) => OrgService.deleteInvitation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-invitations'] });
      showToast('Invitation revoked.', 'info');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to revoke invitation.', 'error'),
  });

  const apiKeys = apiKeysResponse?.data || [];
  const invitations = invitationsResponse?.data || [];

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-lg shadow-primary/5">
           <Building2 className="text-primary" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization Management</h1>
          <p className="text-sm text-gray-500">Manage your organization, API keys, and team members.</p>
        </div>
      </div>

      {/* API Keys Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-yellow-500">
              <Key size={16} /> API Keys
          </div>
          <button 
            onClick={() => setShowKeyBuilder(!showKeyBuilder)}
            disabled={createKeyMutation.isPending}
            className="flex items-center gap-2 px-6 py-2 bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 disabled:opacity-50 transition-all rounded-full font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-primary/10"
          >
            {showKeyBuilder ? <X size={14} className="mr-1" /> : <Plus size={14} className="mr-1" />}
            {showKeyBuilder ? 'Cancel' : 'Create Key'}
          </button>
        </div>

        {/* API Key Builder Panel */}
        {showKeyBuilder && !newKey && (
          <div className="p-6 bg-primary/5 border border-primary/20 rounded-xl space-y-6 animate-in fade-in slide-in-from-top-2">
            <div>
              <h3 className="text-sm font-bold text-primary flex items-center gap-2 uppercase tracking-widest">
                <Key size={14} /> Configure New API Key
              </h3>
              <p className="text-[10px] text-gray-500 mt-1">Set the operational limits for your new telemetry ingress key.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rate Limit (Events/Min)</label>
                <div className="px-3 py-1 bg-black/40 border border-white/5 rounded-md text-xs font-mono text-primary font-bold">
                  {rateLimit.toLocaleString()}
                </div>
              </div>
              <input
                type="range"
                min="100"
                max="10000"
                step="100"
                value={rateLimit}
                onChange={(e) => setRateLimit(Number(e.target.value))}
                className="w-full h-2 bg-[#05080f] rounded-lg appearance-none cursor-pointer accent-primary border border-white/5"
              />
              <div className="flex justify-between text-[9px] text-gray-500 font-bold">
                <span>100/min</span>
                <span>10,000/min</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-white/5">
              <button
                onClick={() => createKeyMutation.mutate(rateLimit)}
                disabled={createKeyMutation.isPending}
                className="px-6 py-2.5 bg-primary text-white hover:bg-primary/90 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-primary/20"
              >
                {createKeyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Generate Secure Key
              </button>
            </div>
          </div>
        )}

        {/* API Key Reveal Panel */}
        {newKey && (
          <div className="p-5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                  <Key size={14} className="text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-yellow-400 uppercase tracking-widest">New API Key Generated</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">This key will only be shown once. Copy it now.</p>
                </div>
              </div>
              <button onClick={() => { setNewKey(null); setKeyCopied(false); }} className="text-gray-600 hover:text-white transition-colors p-1">
                <X size={16} />
              </button>
            </div>

            {/* Key Display */}
            <div className="relative group">
              <div className="w-full bg-black/60 border border-white/10 rounded-xl py-4 px-5 font-mono text-xs text-primary tracking-widest break-all select-all pr-28 leading-relaxed">
                {newKey}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 3000);
                }}
                className={`absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  keyCopied
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                    : 'bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30'
                }`}
              >
                {keyCopied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                {keyCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {/* Security Warning */}
            <div className="flex items-start gap-2 p-3 bg-red-500/5 border border-red-500/15 rounded-lg">
              <AlertTriangle size={13} className="text-red-500/70 mt-0.5 shrink-0" />
              <p className="text-[10px] text-gray-500 leading-relaxed">
                <span className="text-red-400 font-bold">Security Notice:</span> This is the only time this key will be displayed. Store it securely — it cannot be recovered after you close this panel.
              </p>
            </div>
          </div>
        )}

        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input type="text" placeholder="Search keys…" className="w-full bg-white/5 border border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none" />
            </div>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Prefix</th>
                <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Rate Limit</th>
                <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Created</th>
                <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {apiKeys.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-500 italic">No API keys found. Create one to start ingesting events.</td></tr>
              ) : (
                apiKeys.map((key: any) => (
                  <tr key={key.id}>
                    <td className="px-6 py-4">
                      <div className="text-[10px] font-mono text-gray-200">{key.key_prefix}****************</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-bold">{key.rate_limit_per_minute ?? '—'}/min</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${key.is_active ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                        {key.is_active ? 'Active' : 'Revoked'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-bold">{new Date(key.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      {key.is_active && (
                        <button 
                          onClick={() => { if (confirm('Revoke this key?')) revokeKeyMutation.mutate(key.id); }}
                          disabled={revokeKeyMutation.isPending}
                          className="inline-flex items-center gap-1.5 text-[9px] font-bold text-red-500/80 hover:text-red-400 uppercase tracking-widest disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Invite Section */}
      <section className="glass-panel p-8 space-y-6 bg-gradient-to-br from-primary/[0.03] to-transparent">
        <div className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-primary">
           <UserPlus size={18} /> Invite Team Member
        </div>
        
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Email Address</label>
            <div className="relative group">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-primary transition-colors" size={14} />
              <input 
                type="email" value={inviteEmail} onChange={e => { setInviteEmail(e.target.value); if (lastInviteLink) setLastInviteLink(null); }}
                placeholder="colleague@company.com"
                className="w-full bg-[#05080f] border border-white/5 rounded-lg py-3 pl-10 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all"
              />
            </div>
          </div>
          <div className="w-48 space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full bg-[#05080f] border border-white/5 rounded-lg py-3 px-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none appearance-none font-bold text-gray-400">
              <option value="viewer">Viewer</option>
              <option value="security_analyst">Security Analyst</option>
            </select>
          </div>
          <div className="flex items-end">
            <button 
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={inviteMutation.isPending || !inviteEmail}
              className="bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary h-[46px] px-8 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 disabled:opacity-50"
            >
               <Send size={14} />
               {inviteMutation.isPending ? 'Sending…' : 'Send Invite'}
            </button>
          </div>
        </div>

        {lastInviteLink && (
          <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-[10px] uppercase tracking-widest">
                <Send size={12} /> Direct Invitation Link
              </div>
              <button onClick={() => setLastInviteLink(null)} className="text-gray-500 hover:text-white transition-colors"><X size={14} /></button>
            </div>
            <div className="relative group/link">
              <input readOnly value={lastInviteLink} className="w-full bg-black/40 border border-white/10 rounded-lg py-3 px-4 text-[10px] font-mono text-primary outline-none pr-20" />
              <button onClick={() => { navigator.clipboard.writeText(lastInviteLink); }} className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-md text-[9px] font-bold uppercase transition-all">Copy</button>
            </div>
            <p className="text-[10px] text-gray-500 italic">Share this link directly with the user if they don't receive the email.</p>
          </div>
        )}
      </section>

      {/* Pending Invitations */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
           <Mail size={16} /> Pending Invitations
        </div>
        <div className="glass-panel overflow-hidden bg-white/[0.01]">
          {invitations.length === 0 ? (
            <div className="p-20 text-center space-y-4">
              <Mail className="mx-auto text-gray-800" size={48} />
              <p className="text-xs text-gray-600 font-bold uppercase tracking-widest">No pending invitations.</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Email</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Role</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">Expires</th>
                  <th className="px-6 py-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invitations.map((invite: any) => (
                  <tr key={invite.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-xs font-bold text-gray-300">{invite.email}</td>
                    <td className="px-6 py-4 text-xs text-gray-500 font-bold uppercase">{invite.role?.replace(/_/g, ' ')}</td>
                    <td className="px-6 py-4 text-xs text-gray-500">{new Date(invite.expires_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => { if (confirm(`Revoke invitation for ${invite.email}?`)) revokeInviteMutation.mutate(invite.id); }}
                        disabled={revokeInviteMutation.isPending}
                        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-500/80 hover:text-red-400 uppercase tracking-widest transition-colors disabled:opacity-50"
                      >
                        <Trash2 size={12} /> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
