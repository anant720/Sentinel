import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useToast } from '../../../components/ui/ToastProvider';
import { useRoleAccess } from '../../../lib/rbac';
import { useAuthStore } from '../../../lib/store';
import { Settings, User, Bell, Shield, Database, Github, Download, Loader2, X, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

export default function SettingsPage() {
  const { canManageSettings, canExportLogs } = useRoleAccess();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const [exporting, setExporting] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteForm, setDeleteForm] = useState({ orgName: '', password: '' });

  const { data: settingsRes } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => OrgService.getSettings(),
  });

  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, any>) => OrgService.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      showToast('Settings saved.', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to save settings.', 'error'),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      await OrgService.exportAuditLogs();
      showToast('Audit logs exported.', 'success');
    } catch {
      showToast('Failed to export audit logs.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => {
       if (!user?.organization_id) throw new Error("Missing organization ID");
       return OrgService.deleteOrganization(user.organization_id, deleteForm);
    },
    onSuccess: () => {
      showToast('Organization deleted permanently.', 'success');
      setShowDeleteModal(false);
      logout();
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to delete organization.', 'error'),
  });

  const settings = settingsRes?.data || {};

  const sections = [
    { 
      icon: User, 
      label: 'Profile Settings', 
      desc: 'Manage your personal account and preferences.',
      action: () => setActiveMenu('profile'),
    },
    { 
      icon: Bell, 
      label: 'Notifications', 
      desc: 'Configure alert routing and webhook integrations.',
      action: () => setActiveMenu('notifications'),
    },
    { 
      icon: Shield, 
      label: 'Security & Access', 
      desc: 'Manage two-factor authentication and session keys.',
      action: () => setActiveMenu('security'),
    },
    { 
      icon: Database, 
      label: 'Data Retention', 
      desc: 'Configure log storage and archival policies.',
      action: canManageSettings ? () => saveMutation.mutate({ ...settings, data_retention_days: 90 }) : undefined,
      badge: canManageSettings ? 'Save' : undefined,
    },
    { 
      icon: Github, 
      label: 'Integrations', 
      desc: 'Connect with third-party security tools and repos.',
      action: () => setActiveMenu('integrations'),
    },
  ];

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-lg shadow-primary/5">
           <Settings className="text-primary" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Console Settings</h1>
          <p className="text-sm text-gray-500">Manage organization-wide configurations and account security.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sections.map((section) => (
          <button 
            key={section.label} 
            onClick={section.action || undefined}
            disabled={saveMutation.isPending}
            className="glass-panel p-6 text-left hover:border-primary/30 transition-all hover:bg-white/[0.03] group disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all">
                 <section.icon className="text-gray-400 group-hover:text-primary transition-colors" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-200">{section.label}</h3>
                <p className="text-[10px] text-gray-500 font-medium mt-1 uppercase tracking-tight">{section.desc}</p>
              </div>
              {section.badge && (
                <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded uppercase tracking-widest">
                  {section.badge}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Export Audit Logs */}
      {canExportLogs && (
        <div className="glass-panel p-6 flex items-center justify-between border-blue-500/10 bg-blue-500/[0.02]">
          <div>
            <h3 className="text-sm font-bold text-blue-400">Export Audit Logs</h3>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">Download full audit trail as CSV.</p>
          </div>
          <button 
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-6 py-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      )}

      {/* Danger Zone */}
      <div className="glass-panel p-8 bg-red-500/[0.02] border-red-500/10 flex items-center justify-between">
         <div>
            <h3 className="text-sm font-bold text-red-500">Danger Zone</h3>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">Actions performed here cannot be reversed.</p>
         </div>
         {canManageSettings ? (
           <button 
             onClick={() => setShowDeleteModal(true)}
             className="px-6 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-500/20 transition-all"
           >
              Delete Organization
           </button>
         ) : (
           <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Admin access required</span>
         )}
      </div>

      {/* Settings Modal Layer */}
      {activeMenu && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0a0d14] border border-white/10 rounded-2xl shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h2 className="text-lg font-bold text-white tracking-tight capitalize">
                {activeMenu.replace('-', ' ')}
              </h2>
              <button 
                onClick={() => setActiveMenu(null)}
                className="p-2 text-gray-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8">
              {activeMenu === 'security' && !useAuthStore.getState().e2eeEnabled ? (
                <div className="space-y-6">
                  <div className="w-16 h-16 mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20">
                    <Shield className="text-yellow-500" size={28} />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-bold text-gray-200">Upgrade to End-to-End Encryption</h3>
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                      Secure your account with E2EE. This will ensure your password and sensitive telemetry are never visible to the server.
                    </p>
                  </div>
                  
                  <div className="space-y-4">
                     <div className="space-y-2 text-left">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Confirm Password</label>
                        <input 
                          type="password"
                          id="upgrade-password"
                          placeholder="Enter your current password"
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        />
                     </div>
                     <button 
                       onClick={async () => {
                         const pwdInput = document.getElementById('upgrade-password') as HTMLInputElement;
                         const password = pwdInput.value;
                         if (!password) return showToast('Password is required', 'error');
                         
                         try {
                           const { AuthService } = await import('../../../lib/services/auth.service');
                           const { CryptoService } = await import('../../../lib/services/crypto.service');
                           
                           // 1. Upgrade on server
                           await AuthService.upgradeToE2EE(password);
                           
                           // 2. Derive & Store Master Key locally
                           const masterKey = await CryptoService.deriveMasterKey(password, user?.email || '');
                           useAuthStore.getState().setMasterKey(masterKey);
                           useAuthStore.getState().setE2eeEnabled(true);
                           
                           showToast('Security upgraded to E2EE successfully!', 'success');
                           setActiveMenu(null);
                         } catch (err: any) {
                           showToast(err.response?.data?.message || 'Upgrade failed', 'error');
                         }
                       }}
                       className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20"
                     >
                       Begin Secure Upgrade
                     </button>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center border border-primary/20">
                    {activeMenu === 'security' && useAuthStore.getState().e2eeEnabled ? <Shield className="text-primary" size={28} /> : <Settings className="text-primary" size={28} />}
                  </div>
                  <h3 className="text-sm font-bold text-gray-200">
                    {activeMenu === 'security' && useAuthStore.getState().e2eeEnabled ? 'E2EE Protection Active' : 'Coming Soon'}
                  </h3>
                  <p className="text-xs text-gray-500 max-w-[280px] mx-auto leading-relaxed">
                    {activeMenu === 'security' && useAuthStore.getState().e2eeEnabled 
                      ? 'Your account is fully protected with End-to-End Encryption. Telemetry is decrypted locally using your session-only master key.'
                      : `We are currently building out the ${activeMenu} configuration panel. Check back in the next release.`}
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex justify-end">
              <button 
                onClick={() => setActiveMenu(null)}
                className="px-6 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Organization Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0a0d14] border border-red-500/30 shadow-2xl shadow-red-500/10 rounded-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 bg-red-500/10 border-b border-red-500/20 flex items-center gap-3 text-red-500">
               <AlertTriangle size={24} />
               <h2 className="text-lg font-bold">Delete Organization</h2>
            </div>
            <div className="p-6 space-y-6">
               <p className="text-sm text-gray-400 leading-relaxed">
                 You are about to permanently delete your organization. This action will immediately and irreversibly destroy all devices, events, alerts, API keys, and audit logs. This cannot be undone.
               </p>
               
               <div className="space-y-4">
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400">Type the organization name <span className="text-white">({user?.organization?.name})</span> to confirm:</label>
                   <input 
                     type="text"
                     value={deleteForm.orgName}
                     onChange={(e) => setDeleteForm(f => ({...f, orgName: e.target.value}))}
                     placeholder="Organization Name"
                     autoComplete="off"
                     className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-red-500/50 outline-none transition-all placeholder:text-gray-600"
                   />
                 </div>
                 
                 <div className="space-y-2">
                   <label className="text-xs font-bold text-gray-400">Admin Password:</label>
                   <input 
                     type="password"
                     value={deleteForm.password}
                     onChange={(e) => setDeleteForm(f => ({...f, password: e.target.value}))}
                     placeholder="Confirm with your password"
                     autoComplete="new-password"
                     className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:ring-2 focus:ring-red-500/50 outline-none transition-all placeholder:text-gray-600"
                   />
                 </div>
               </div>
            </div>
            
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3 justify-end">
               <button 
                 onClick={() => { setShowDeleteModal(false); setDeleteForm({ orgName: '', password: '' }); }}
                 className="px-6 py-2.5 text-gray-400 hover:text-white rounded-lg text-xs font-bold transition-colors"
                 disabled={deleteMutation.isPending}
               >
                 Cancel
               </button>
               <button 
                 onClick={() => deleteMutation.mutate()}
                 disabled={deleteForm.orgName !== user?.organization?.name || !deleteForm.password || deleteMutation.isPending}
                 className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:hover:bg-red-500"
               >
                 {deleteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
                 {deleteMutation.isPending ? 'Deleting...' : 'Permanently Delete Everything'}
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
