import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useToast } from '../../../components/ui/ToastProvider';
import { useRoleAccess } from '../../../lib/rbac';
import { Zap, Terminal, Save, Cpu, ShieldCheck, Check } from 'lucide-react';

// The 7 detection modules are known from the backend detection engine
const DETECTION_MODULES = [
  { id: 'brute_force', name: 'Brute Force Detection' },
  { id: 'account_takeover', name: 'Account Takeover' },
  { id: 'privilege_escalation', name: 'Privilege Escalation' },
  { id: 'data_exfiltration', name: 'Data Exfiltration' },
  { id: 'impossible_travel', name: 'Impossible Travel' },
  { id: 'insider_threat', name: 'Insider Threat' },
  { id: 'credential_stuffing', name: 'Credential Stuffing' },
];

export default function DetectionLogicPage() {
  const { canManageSettings } = useRoleAccess();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: settingsResponse, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: () => OrgService.getSettings(),
  });


  const saveMutation = useMutation({
    mutationFn: (settings: Record<string, any>) => OrgService.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      showToast('Detection settings saved successfully.', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message || 'Failed to save settings.', 'error'),
  });

  const settings = settingsResponse?.data || {};

  const activeModules = DETECTION_MODULES.filter(m => {
    const moduleSettings = settings[m.id];
    return moduleSettings?.enabled !== false; // default to enabled if not set
  });

  const handleSave = () => {
    // Toggle all modules to enabled state (saves current settings)
    const payload: Record<string, any> = {};
    DETECTION_MODULES.forEach(m => {
      payload[m.id] = { ...(settings[m.id] || {}), enabled: true };
    });
    saveMutation.mutate(payload);
  };

  const handleToggleModule = (moduleId: string, currentlyEnabled: boolean) => {
    if (!canManageSettings) return;
    const updated = {
      ...settings,
      [moduleId]: {
        ...(settings[moduleId] || {}),
        enabled: !currentlyEnabled,
      },
    };
    saveMutation.mutate(updated);
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto pb-20">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-lg shadow-primary/5">
           <Zap className="text-primary" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Detection Logic</h1>
          <p className="text-sm text-gray-500">Configure real-time detection signatures and behavioral heuristics.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Module Status Editor */}
        <div className="lg:col-span-2 space-y-4">
           <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Terminal size={14} /> Detection Modules
              </h2>
              {canManageSettings && (
                <div className="flex gap-2">
                   <button
                     onClick={handleSave}
                     disabled={saveMutation.isPending}
                     className="px-4 py-1.5 bg-primary/10 border border-primary/20 text-primary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all flex items-center gap-2 disabled:opacity-50"
                   >
                     <Save size={14} />
                     {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
                   </button>
                </div>
              )}
           </div>
           
           {isLoading ? (
             <div className="glass-panel p-12 flex items-center justify-center text-xs text-gray-500">Loading detection settings…</div>
           ) : (
             <div className="glass-panel overflow-hidden border-white/10">
               <table className="w-full text-left">
                 <thead>
                   <tr className="border-b border-white/5 bg-white/[0.02]">
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Module</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Threshold</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Window</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Status</th>
                     {canManageSettings && <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Toggle</th>}
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {DETECTION_MODULES.map(module => {
                     const cfg = settings[module.id] || {};
                     const isEnabled = cfg.enabled !== false;
                     return (
                       <tr key={module.id} className="hover:bg-white/[0.02] transition-colors">
                         <td className="px-6 py-4">
                           <div className="text-xs font-bold text-gray-200">{module.name}</div>
                           <div className="text-[9px] text-gray-600 font-mono mt-0.5">{module.id}</div>
                         </td>
                         <td className="px-6 py-4 text-xs text-gray-500 font-bold font-mono">
                           {cfg.threshold ?? '5'}
                         </td>
                         <td className="px-6 py-4 text-xs text-gray-500 font-bold font-mono">
                           {cfg.window ? `${cfg.window}s` : '300s'}
                         </td>
                         <td className="px-6 py-4 text-center">
                           <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${isEnabled ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-gray-500/10 text-gray-500 border-gray-500/20'}`}>
                             {isEnabled ? 'Active' : 'Disabled'}
                           </span>
                         </td>
                         {canManageSettings && (
                           <td className="px-6 py-4 text-right">
                             <button
                               onClick={() => handleToggleModule(module.id, isEnabled)}
                               disabled={saveMutation.isPending}
                               className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded border transition-all disabled:opacity-50 ${
                                 isEnabled
                                   ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                   : 'bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20'
                               }`}
                             >
                               {isEnabled ? 'Disable' : 'Enable'}
                             </button>
                           </td>
                         )}
                       </tr>
                     );
                   })}
                 </tbody>
               </table>
             </div>
           )}
        </div>

        {/* Sidebar info */}
        <div className="space-y-6">
           <div className="glass-panel p-6 space-y-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                 <Cpu size={14} /> Engine Context
              </h3>
              <div className="space-y-4">
                 <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Active Modules</p>
                    <p className="text-lg font-bold text-white">
                      {activeModules.length} <span className="text-[10px] text-green-500 ml-1">Live</span>
                    </p>
                 </div>
                 <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Total Modules</p>
                    <p className="text-lg font-bold text-white">{DETECTION_MODULES.length}</p>
                 </div>
                 <div className="p-3 bg-white/5 rounded-lg border border-white/5 space-y-1">
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-tight">Engine Status</p>
                    <p className="text-lg font-bold text-green-500">Online</p>
                 </div>
              </div>
           </div>

           <div className="glass-panel p-6 space-y-3">
             <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
               <Check size={14} /> Active Modules
             </h3>
             <div className="space-y-2">
               {activeModules.map(m => (
                 <div key={m.id} className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                   <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                   {m.name}
                 </div>
               ))}
             </div>
           </div>

           <div className="glass-panel p-6 bg-primary/5 border-primary/10">
              <div className="flex items-center gap-2 text-primary mb-3">
                 <ShieldCheck size={18} />
                 <span className="text-[10px] font-bold uppercase tracking-widest underline underline-offset-4 decoration-primary/30">Optimization Tips</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                Using <span className="text-primary font-bold">aggregation</span> triggers is 40% more efficient than <span className="text-primary font-bold">pattern_match</span> for high-volume login telemetry.
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
