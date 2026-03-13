import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DashboardService } from '../../../lib/services/dashboard.service';
import { OrgService } from '../../../lib/services/org.service';
import { useSecurityStream } from '../../../hooks/useSecurityStream';
import { Activity, Search, Download, ShieldAlert, Database, Wifi, WifiOff } from 'lucide-react';
import { useToast } from '../../../components/ui/ToastProvider';
import { X, MapPin, Terminal } from 'lucide-react';

export default function LiveEventsPage() {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // HTTP polling as baseline data source
  const { data: eventsResponse } = useQuery({
    queryKey: ['live-events'],
    queryFn: () => DashboardService.getLiveFeed(),
    refetchInterval: 5000,
  });

  // WebSocket for real-time push events (layered on top of HTTP)
  const { events: wsEvents, isConnected } = useSecurityStream({ maxEvents: 200 });

  // Health check
  const { data: healthData } = useQuery({
    queryKey: ['health'],
    queryFn: () => fetch('/api/health/ready').then(r => r.json()),
    refetchInterval: 15000,
    retry: false,
  });

  // Merge: WS events first (newest), then HTTP events (deduplicated by id)
  const httpEvents: any[] = eventsResponse?.data || [];
  const wsEventIds = new Set(wsEvents.map((e: any) => e.id));
  const mergedEvents: any[] = [
    // Map WS events to shape
    ...wsEvents.map((e: any) => ({
      id: e.id,
      event_type: e.type,
      payload: e.payload,
      email: e.payload?.email,
      ip_address: e.payload?.ip_address,
      user_agent: e.payload?.user_agent,
      source_app: e.payload?.source_app,
      destination: e.payload?.destination,
      risk_score: e.payload?.risk_score,
      created_at: new Date(e.timestamp).toISOString(),
    })),
    // Fill in HTTP events not already in WS stream
    ...httpEvents.filter((e: any) => !wsEventIds.has(e.id)),
  ].slice(0, 500);

  const filteredEvents = searchQuery
    ? mergedEvents.filter((e: any) => {
        const q = searchQuery.toLowerCase();
        const email = (e.email || e.payload?.email || '').toLowerCase();
        const ip = (e.ip_address || e.payload?.ip_address || '').toLowerCase();
        const app = (e.source_app || e.payload?.source_app || '').toLowerCase();
        const dest = (e.destination || e.payload?.destination || '').toLowerCase();
        const type = (e.event_type || '').toLowerCase();
        return type.includes(q) || email.includes(q) || ip.includes(q) || app.includes(q) || dest.includes(q);
      })
    : mergedEvents;

  const totalCount = eventsResponse?.total || mergedEvents.length;
  const isHealthy = healthData?.status === 'ready';

  // Remove "Stream Source" from these top stats as requested
  const stats = [
    { label: 'Total Events', value: totalCount.toLocaleString(), color: 'text-gray-400', icon: Activity },
    { label: 'Critical Threats', value: mergedEvents.filter((e: any) => Number(e.risk_score ?? e.payload?.risk_score ?? 0) > 80).length, color: 'text-red-500', icon: ShieldAlert },
    { label: 'System Health', value: isHealthy ? 'Ready' : healthData ? 'Degraded' : 'Checking…', color: isHealthy ? 'text-green-400' : 'text-yellow-400', icon: Database },
  ];

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await OrgService.exportAuditLogs();
      showToast('Audit log exported successfully.', 'success');
    } catch {
      showToast('Failed to export audit log.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-500 max-w-[1600px] mx-auto pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-lg shadow-primary/5">
            <Activity className="text-primary" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Live Security Events</h1>
            <p className="text-sm text-gray-500 flex items-center gap-2">
               <span className="relative flex h-2 w-2">
                 <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                 <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
               </span>
               {isConnected ? 'WebSocket stream active — real-time push.' : 'HTTP polling — refreshes every 5 seconds.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-lg">
           {isConnected ? <Wifi size={14} className="text-green-500" /> : <WifiOff size={14} className="text-yellow-500" />}
           <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
             {isConnected ? 'WS: Connected' : 'WS: Polling'}
           </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="glass-panel p-6 relative overflow-hidden group">
            <stat.icon className="absolute -right-2 -bottom-2 text-white/[0.03] group-hover:text-primary/10 transition-colors" size={80} />
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-2">{stat.label}</span>
            <span className={`text-3xl font-bold ${stat.color} tabular-nums tracking-tight`}>{stat.value}</span>
            <div className="mt-2 h-1 w-full bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-primary/40 rounded-full" style={{ width: '35%' }} />
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel overflow-hidden border-white/10">
        <div className="p-4 border-b border-white/5 bg-white/[0.01] flex items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by user, IP, app, event type..."
              className="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-primary/50 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-3">
             <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest hidden lg:block">
               {filteredEvents.length.toLocaleString()} events
             </div>
             <button
               onClick={handleExport}
               disabled={isExporting}
               className="flex items-center gap-2 px-6 py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 disabled:opacity-50 transition-all rounded-lg font-bold text-[10px] uppercase tracking-widest shadow-lg shadow-primary/5"
             >
               <Download size={14} />
               {isExporting ? 'Exporting…' : 'Export Logs'}
             </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Event Type</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Source & Location</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Principal</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Network Context</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Resource</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Risk Index</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredEvents.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-16 text-center text-xs text-gray-600 italic">
                  {searchQuery ? 'No events match your search.' : 'No events yet. Waiting for telemetry…'}
                </td></tr>
              )}
              {filteredEvents.map((event: any, i: number) => {
                // Backend returns flat columns; WS events have nested payload — handle both
                const email = event.email || event.payload?.email || event.payload?.user_email || '—';
                const ipAddress = event.ip_address || event.payload?.ip_address || '—';
                const rawUserAgent = event.user_agent || event.payload?.user_agent || 'Unknown agent';
                
                const parseUserAgent = (ua: string) => {
                  if (!ua || ua === 'Unknown agent') return ua;
                  if (ua.includes('Edg/')) return 'Edge';
                  if (ua.includes('Brave/') || ua.match(/Chrome\/.* Safari\/.*$/) && !ua.includes('Chromium')) return 'Chrome / Brave';
                  if (ua.includes('Chrome/')) return 'Chrome';
                  if (ua.includes('Firefox/')) return 'Firefox';
                  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
                  return ua.length > 30 ? ua.substring(0, 30) + '...' : ua;
                };
                const userAgent = parseUserAgent(rawUserAgent);

                const sourceApp = event.source_app || event.payload?.source_app || '—';
                const destination = event.destination || event.payload?.destination || '/';
                const riskScore = Number(event.risk_score ?? event.payload?.risk_score ?? 0);
                const eventType = event.event_type || event.type || 'EVENT';
                const streamSource = event.payload?.stream_source || 'Sentinel Console';
                const location = event.payload?.location ? `${event.payload.location.city}, ${event.payload.location.country}` : 'Unknown Location';

                return (
                  <tr key={event.id || i} onClick={() => setSelectedEvent(event)} className="hover:bg-white/[0.05] transition-colors group cursor-pointer relative">
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${riskScore > 70 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                        {eventType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-primary/90">
                        <Terminal size={12} />
                        {streamSource}
                      </div>
                      <div className="flex items-center gap-1 text-[9px] text-gray-500 mt-1 uppercase tracking-wider">
                        <MapPin size={10} />
                        {location}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-gray-200">{email}</div>
                      <div className="text-[9px] text-gray-500 uppercase tracking-tighter">ID: {String(event.id ?? '').substring(0, 8)}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                         <span className="text-[10px] font-mono text-gray-400">{ipAddress}</span>
                      </div>
                      <div className="text-[9px] text-gray-500 mt-1 truncate max-w-[150px]" title={userAgent}>{userAgent}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-[10px] text-primary/80 font-bold max-w-[150px] truncate">{sourceApp}</div>
                      <div className="text-[9px] text-gray-600 font-mono mt-0.5">{destination}</div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex items-center gap-3">
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden max-w-[60px]">
                             <div className={`h-full rounded-full ${riskScore > 70 ? 'bg-red-500' : riskScore > 30 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${riskScore}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold ${riskScore > 70 ? 'text-red-500' : riskScore > 30 ? 'text-yellow-500' : 'text-green-500'}`}>{riskScore}</span>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right tabular-nums">
                      <div className="text-[10px] font-bold text-gray-400">{new Date(event.created_at).toLocaleTimeString()}</div>
                      <div className="text-[9px] text-gray-600 uppercase tracking-tighter">{new Date(event.created_at).toLocaleDateString()}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over JSON Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-[500px] h-full bg-[#0a0d14] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-lg font-bold">Event Details</h2>
                <div className="flex items-center gap-2 mt-1">
                   <span className="text-xs text-gray-500 font-mono">ID: {selectedEvent.id}</span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEvent(null)}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-all"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
               <div>
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Threat Context</h3>
                  <div className="grid grid-cols-2 gap-4">
                     <div className="p-4 bg-white/5 border border-white/5 rounded-lg">
                       <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Risk Score</div>
                       <div className={`text-2xl font-bold ${Number(selectedEvent.risk_score ?? selectedEvent.payload?.risk_score ?? 0) > 70 ? 'text-red-500' : 'text-green-500'}`}>
                         {Number(selectedEvent.risk_score ?? selectedEvent.payload?.risk_score ?? 0)}
                       </div>
                     </div>
                     <div className="p-4 bg-white/5 border border-white/5 rounded-lg">
                       <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Event Class</div>
                       <div className="text-sm font-bold mt-1 text-primary">{selectedEvent.event_type || selectedEvent.type}</div>
                     </div>
                  </div>
               </div>

               <div>
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">Raw JSON Payload</h3>
                 <div className="bg-black/50 border border-white/10 rounded-lg p-4 overflow-x-auto">
                   <pre className="text-[11px] font-mono text-green-400/90 leading-relaxed">
                     {JSON.stringify(selectedEvent, null, 2)}
                   </pre>
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
