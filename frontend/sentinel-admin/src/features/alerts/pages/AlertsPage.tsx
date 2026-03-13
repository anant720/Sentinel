import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertService } from '../../../lib/services/alert.service';
import { useToast } from '../../../components/ui/ToastProvider';
import { useRoleAccess } from '../../../lib/rbac';
import { ShieldAlert, Fingerprint, CheckCircle2, AlertTriangle, ChevronDown, EyeOff, SortAsc, SortDesc } from 'lucide-react';
import { Alert } from '../../../types';

type FilterTab = 'all' | 'critical' | 'unresolved';
type SortDir = 'desc' | 'asc';

export default function AlertsPage() {
  const { canUpdateAlerts } = useRoleAccess();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const { showToast } = useToast();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts', activeTab],
    queryFn: () => {
      const params: { status?: string; limit?: number } = { limit: 200 };
      if (activeTab === 'unresolved') params.status = 'OPEN';
      return AlertService.getAlerts(params);
    },
  });

  const queryClient = useQueryClient();

  const mutate = (fn: () => Promise<any>, successMsg: string) => {
    fn()
      .then(() => {
        showToast(successMsg, 'success');
        queryClient.invalidateQueries({ queryKey: ['alerts'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
        setOpenMenu(null);
      })
      .catch((e: any) => {
        const msg = e.response?.data?.message || 'Action failed. Please try again.';
        showToast(msg, 'error');
      });
  };

  const getSeverityStyles = (sev: string) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'high': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  let displayAlerts: Alert[] = alerts?.data || [];

  // Client-side filter for critical tab
  if (activeTab === 'critical') {
    displayAlerts = displayAlerts.filter(a => a.severity === 'critical');
  }

  // Sort by created_at
  displayAlerts = [...displayAlerts].sort((a, b) => {
    const t = (d: string) => new Date(d).getTime();
    return sortDir === 'desc' ? t(b.created_at) - t(a.created_at) : t(a.created_at) - t(b.created_at);
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All Alerts' },
    { key: 'critical', label: 'Critical' },
    { key: 'unresolved', label: 'Unresolved' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-red-500/10 rounded-xl border border-red-500/20 shadow-lg shadow-red-500/5">
           <ShieldAlert className="text-red-500" size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Security Alerts</h1>
          <p className="text-sm text-gray-400">Review and respond to automated threat detection triggers.</p>
        </div>
      </div>

      <div className="glass-panel overflow-hidden border border-white/5 bg-white/[0.01]">
        <div className="p-6 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
           <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
              {tabs.map(({ key, label }) => (
                <button 
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`px-4 py-1.5 text-[10px] font-bold rounded-md transition-all ${activeTab === key ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {label.toUpperCase()}
                </button>
              ))}
           </div>
           <button 
             onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
             title="Toggle sort order"
             className="p-2 bg-white/5 border border-white/5 rounded-lg text-gray-500 hover:text-white transition-all"
           >
              {sortDir === 'desc' ? <SortDesc size={16} /> : <SortAsc size={16} />}
           </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Severity</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Alert Policy</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Detected</th>
                {canUpdateAlerts && (
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-center">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-xs text-gray-500">Loading alerts…</td></tr>
              ) : displayAlerts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-16 text-center text-xs text-gray-500 italic">No alerts found.</td></tr>
              ) : displayAlerts.map((alert: Alert) => (
                <tr key={alert.id} className="hover:bg-white/[0.02] transition-colors group relative">
                  <td className="px-6 py-5">
                     <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border w-fit ${getSeverityStyles(alert.severity)}`}>
                        {alert.severity}
                     </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/5 rounded-lg border border-white/5">
                         <Fingerprint size={14} className="text-gray-500 group-hover:text-primary transition-colors" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-200">{alert.title}</p>
                        <p className="text-[10px] text-gray-500 mt-1 font-medium">{alert.description}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight ${
                      alert.status === 'RESOLVED' ? 'text-green-500' :
                      alert.status === 'ACKNOWLEDGED' ? 'text-blue-400' :
                      alert.status === 'DISMISSED' ? 'text-gray-500' :
                      'text-yellow-500'
                    }`}>
                      {alert.status === 'RESOLVED' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
                      {alert.status}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-right text-[10px] font-bold text-gray-600 uppercase tracking-tighter tabular-nums">
                    {new Date(alert.created_at || Date.now()).toLocaleTimeString()}
                  </td>
                  {canUpdateAlerts && (
                    <td className="px-6 py-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {alert.status === 'OPEN' && (
                          <button 
                            onClick={() => mutate(() => AlertService.acknowledge(alert.id), 'Alert acknowledged.')}
                            className="px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded text-[9px] font-bold uppercase hover:bg-blue-500/20 transition-all"
                          >
                            Ack
                          </button>
                        )}
                        {alert.status !== 'RESOLVED' && (
                          <button 
                            onClick={() => mutate(() => AlertService.resolve(alert.id), 'Alert resolved.')}
                            className="px-2 py-1 bg-green-500/10 text-green-500 border border-green-500/20 rounded text-[9px] font-bold uppercase hover:bg-green-500/20 transition-all"
                          >
                            Resolve
                          </button>
                        )}
                        {alert.status !== 'DISMISSED' && alert.status !== 'RESOLVED' && (
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenu(openMenu === alert.id ? null : alert.id)}
                              className="p-1.5 text-gray-600 hover:text-white transition-colors hover:bg-white/5 rounded-md"
                            >
                              <ChevronDown size={14} />
                            </button>
                            {openMenu === alert.id && (
                              <div className="absolute right-0 top-8 z-30 bg-[#0a0d14] border border-white/10 rounded-lg shadow-2xl min-w-[120px] py-1 animate-in fade-in duration-150">
                                <button
                                  onClick={() => mutate(() => AlertService.dismiss(alert.id), 'Alert dismissed.')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all text-left uppercase"
                                >
                                  <EyeOff size={12} />
                                  Dismiss
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
