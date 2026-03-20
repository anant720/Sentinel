import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardService } from '../../../lib/services/dashboard.service';
import { useAuthStore } from '../../../lib/store';
import { useToast } from '../../../components/ui/ToastProvider';
import { 
  Shield, 
  Activity, 
  Users, 
  Zap, 
  Globe,
  RefreshCw,
  Database,
  BrainCircuit
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { RiskDataPoint } from '../../../types';

type RangeKey = '1d' | '15d' | '1m';

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [range, setRange] = useState<RangeKey>('1d');

  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => DashboardService.getStats(),
    refetchInterval: 30000,
  });

  const { data: historicalRisk, dataUpdatedAt } = useQuery({
    queryKey: ['historical-risk', range],
    queryFn: () => DashboardService.getHistoricalRisk(range),
    refetchInterval: 60000,
  });

  const { data: liveFeed } = useQuery({
    queryKey: ['live-feed-mini'],
    queryFn: () => DashboardService.getLiveFeed(),
    refetchInterval: 5000,
  });


  const scanMutation = useMutation({
    mutationFn: () => DashboardService.runScan(),
    onSuccess: (result) => {
      const msg = result?.threatLevel
        ? `Scan complete — Threat Level: ${result.threatLevel} (Risk: ${result.riskScore})`
        : 'Security scan completed successfully.';
      showToast(msg, 'success');
      queryClient.invalidateQueries({ queryKey: ['stats'] });
      queryClient.invalidateQueries({ queryKey: ['historical-risk', range] });
    },
    onError: () => {
      showToast('Failed to trigger security scan.', 'error');
    }
  });

  const trend = (historicalRisk || []).map((d: RiskDataPoint) => {
    const date = new Date(d.timestamp);
    let timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (range === '1m') {
      timeLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } else if (range === '15d') {
      timeLabel = `${date.toLocaleDateString([], { day: 'numeric' })} ${date.toLocaleTimeString([], { hour: '2-digit' })}`;
    }
    
    return {
      time: timeLabel,
      risk: d.score,
      fullDate: date.toLocaleString()
    };
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  const cards = [
    { label: 'Total Identities', value: stats?.totalIdentities ?? 0, subValue: 'Active accounts', icon: Users, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Critical Threats', value: stats?.criticalThreats ?? 0, subValue: 'Open critical alerts', icon: Shield, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Detection Velocity', value: stats?.detectionVelocity || 'N/A', subValue: 'Events last hour', icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10' },
    { label: 'Source IPs (24h)', value: stats?.geographicNodes ?? 0, subValue: 'Unique nodes detected', icon: Globe, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  const recentEvents = liveFeed?.data?.slice(0, 5) || [];

  const rangeLabels: Record<RangeKey, string> = { '1d': '1D', '15d': '15D', '1m': '1M' };

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time surveillance across distributed identity clusters.</p>
        </div>
        <button 
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all rounded-lg font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/5"
        >
          <RefreshCw size={14} className={scanMutation.isPending ? 'animate-spin' : ''} />
          {scanMutation.isPending ? 'Scanning...' : 'Force Re-scan'}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="glass-panel p-6 hover:border-white/10 transition-all group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{card.label}</span>
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <Icon className={card.color} size={18} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{card.value}</span>
              </div>
              <div className="flex items-center gap-1 mt-2 text-[10px] font-medium text-gray-400">
                <Activity size={10} className="text-green-500" />
                <span>{card.subValue}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Risk Analytics Chart */}
        <div className="xl:col-span-2 glass-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-500 mb-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Risk Analytics (Live Index)
              </div>
              <p className="text-[10px] text-gray-500">Historical risk score with real backend data</p>
            </div>
            <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
              {(Object.keys(rangeLabels) as RangeKey[]).map((key) => (
                <button 
                  key={key}
                  onClick={() => setRange(key)}
                  className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${range === key ? 'bg-primary text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {rangeLabels[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="riskGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis 
                  dataKey="time" 
                  stroke="#4b5563" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  tick={{ fill: '#4b5563' }}
                  interval="preserveStartEnd"
                  minTickGap={range === '1d' ? 60 : 100}
                />
                <YAxis 
                  stroke="#4b5563" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tick={{ fill: '#4b5563' }}
                  domain={[0, 100]}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#05080f', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}
                  itemStyle={{ color: '#f43f5e', fontSize: '10px', fontWeight: 'bold' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="risk" 
                  stroke="#f43f5e" 
                  strokeWidth={2} 
                  fillOpacity={1} 
                  fill="url(#riskGradient)" 
                  animationDuration={800}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-white/5">
            <div className="flex items-center gap-2 text-[10px] font-bold text-green-500/80">
              <Database size={12} />
              DATA INTEGRITY: VERIFIED
            </div>
            <div className="text-[10px] text-gray-500 font-bold">
              LAST UPDATED: {lastUpdated}
            </div>
          </div>
        </div>

        {/* Attack Timeline */}
        <div className="glass-panel p-8 flex flex-col">
          <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-green-500/10 rounded-lg">
                 <BrainCircuit className="text-green-500" size={16} />
               </div>
               <div>
                 <h3 className="text-xs font-bold uppercase tracking-widest">Detection Engine</h3>
                 <p className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">7 Core Rules Active</p>
               </div>
             </div>
             <div className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[9px] text-green-500 font-bold uppercase tracking-tighter">Monitoring</span>
             </div>
          </div>
          
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-2 mb-4">
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                <span className="text-[9px] font-bold text-gray-400 uppercase">Live Telemetry</span>
                <span className="text-[9px] font-bold text-green-500 uppercase">Operational</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2 bg-white/[0.02] border border-white/5 rounded-lg">
                <span className="text-[9px] font-bold text-gray-400 uppercase">Heuristic Analysis</span>
                <span className="text-[9px] font-bold text-green-500 uppercase">Active</span>
              </div>
            </div>

            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">Recent Activity</div>
            {recentEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                <Activity className="text-white/10" size={48} />
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">No recent events detected.</p>
              </div>
            ) : (
              recentEvents.map((event: any) => (
                <DecryptedEventItem key={event.id} event={event} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DecryptedEventItem({ event }: { event: any }) {
  const masterKey = useAuthStore(state => state.masterKey);
  const [decryptedPayload, setDecryptedPayload] = useState<any>(event.payload);
  const [isDecrypting, setIsDecrypting] = useState(false);

  useEffect(() => {
    async function decrypt() {
      if (typeof event.payload === 'string' && masterKey) {
        setIsDecrypting(true);
        try {
          const { CryptoService } = await import('../../../lib/services/crypto.service');
          const decrypted = await CryptoService.decryptPayload(event.payload, masterKey);
          setDecryptedPayload(decrypted);
        } catch (err) {
          console.error('Decryption failed for event', event.id, err);
        } finally {
          setIsDecrypting(false);
        }
      } else {
        setDecryptedPayload(event.payload);
      }
    }
    decrypt();
  }, [event.payload, masterKey]);

  return (
    <div className="flex gap-3 items-start p-3 bg-white/[0.02] border border-white/5 rounded-lg">
      <div className={`p-1.5 rounded bg-white/5 ${(event.risk_score || 0) > 70 ? 'text-red-500' : 'text-primary'}`}>
        <Shield size={12} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <span className="text-[10px] font-bold text-gray-300 truncate uppercase">{event.event_type || event.type}</span>
          <span className="text-[9px] text-gray-600 tabular-nums">{new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        </div>
        <div className="text-[10px] text-gray-500 truncate mt-0.5">
          {isDecrypting ? 'Decrypting...' : (decryptedPayload?.email || decryptedPayload?.user_email || 'System')}
        </div>
      </div>
    </div>
  );
}
