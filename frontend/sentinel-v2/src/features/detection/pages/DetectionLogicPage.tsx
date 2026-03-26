import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { OrgSettings } from '../../../types';

// All 9 detection modules — matches backend detection engine exactly
const MODULES = [
  { id: 'rapid_failed_logins', label: 'Brute Force Detection', icon: 'bolt', desc: 'Detects consecutive failed login attempts from the same IP or user within a time window.', fields: [{ key: 'threshold', label: 'Max Attempts', default: 5 }, { key: 'window', label: 'Window (sec)', default: 300 }] },
  { id: 'directory_brute_force', label: 'Directory Brute Force', icon: 'folder_open', desc: 'Detects aggressive path scanning and directory fuzzing attempts.', fields: [{ key: 'threshold', label: 'Max Attempts', default: 50 }, { key: 'window', label: 'Window (sec)', default: 60 }] },
  { id: 'distributed_login', label: 'Distributed Login Attack', icon: 'hub', desc: 'Detects logins from multiple IPs targeting a single user account.', fields: [{ key: 'threshold', label: 'Max IPs', default: 3 }, { key: 'window', label: 'Window (sec)', default: 300 }] },
  { id: 'password_spraying', label: 'Password Spraying', icon: 'manage_accounts', desc: 'Detects a single IP targeting multiple accounts with the same password.', fields: [{ key: 'threshold', label: 'Max Targets', default: 5 }, { key: 'window', label: 'Window (sec)', default: 300 }] },
  { id: 'fingerprint_campaign', label: 'Fingerprint Campaign', icon: 'fingerprint', desc: 'Detects automated tools via consistent browser/device fingerprints across many accounts.', fields: [] },
  { id: 'impossible_travel', label: 'Impossible Travel', icon: 'flight', desc: 'Flags concurrent logins from geographically impossible locations based on time and distance.', fields: [{ key: 'min_distance_km', label: 'Min Distance (km)', default: 500 }, { key: 'min_time_minutes', label: 'Min Time (min)', default: 60 }] },
  { id: 'new_device_logon', label: 'New Device / Browser', icon: 'phonelink_setup', desc: 'Alerts on first-time login from an unrecognized device fingerprint.', fields: [] },
  { id: 'security_tool_detection', label: 'Security Tool Detection', icon: 'bug_report', desc: 'Detects known hacking tools (Nmap, SQLMap, Burp Suite, etc.) via user-agent patterns.', fields: [] },
  { id: 'risk_scoring', label: 'Risk Score Threshold', icon: 'query_stats', desc: 'Behavioral risk aggregation engine — triggers alerts when composite risk score exceeds threshold.', fields: [{ key: 'threshold', label: 'Alert Threshold (0-100)', default: 70 }] },
];

export default function DetectionLogicPage() {
  const { e2eeEnabled } = useAuthStore();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [saveMsg, setSaveMsg] = useState('');

  const { data } = useQuery({ queryKey: ['org-settings'], queryFn: OrgService.getSettings });

  useEffect(() => {
    if (data?.data) setSettings(data.data);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => OrgService.updateSettings(settings),
    onSuccess: () => { setSaveMsg('Configuration saved successfully.'); setTimeout(() => setSaveMsg(''), 3000); },
    onError: (e: any) => setSaveMsg(e?.response?.data?.message || 'Failed to save. Try again.'),
  });

  const toggleModule = (moduleId: string) => {
    setSettings(prev => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], enabled: !prev[moduleId]?.enabled },
    }));
  };

  const updateField = (moduleId: string, key: string, value: number) => {
    setSettings(prev => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], [key]: value },
    }));
  };

  const activeCount = MODULES.filter(m => settings[m.id]?.enabled !== false).length;

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Detection Engine Configuration</div>
          <div className="page-subtitle">{activeCount} of {MODULES.length} modules active</div>
        </div>
        <div className="flex gap-3 items-center">
          {saveMsg && (
            <span className="mono" style={{ fontSize: '0.625rem', color: saveMsg.includes('Failed') ? 'var(--error)' : 'var(--secondary)' }}>{saveMsg}</span>
          )}
          <button className="btn btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <span className="material-icons" style={{ fontSize: 16 }}>save</span>
            {mutation.isPending ? (e2eeEnabled ? 'ENCRYPTING...' : 'SAVING...') : 'SAVE CONFIGURATION'}
          </button>
        </div>
      </div>

      {e2eeEnabled && (
        <div style={{ marginBottom: 20, padding: '8px 14px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-icons" style={{ fontSize: 14, color: '#fbbf24' }}>lock</span>
          <span className="mono" style={{ fontSize: '0.5625rem', color: '#fbbf24', fontWeight: 600, letterSpacing: '0.1em' }}>E2EE ACTIVE — Configuration is encrypted using your master key before transmission</span>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {MODULES.map(m => {
          const s = settings[m.id] || {};
          const enabled = s.enabled !== false; // default: enabled
          return (
            <div key={m.id} className="panel" style={{ opacity: enabled ? 1 : 0.65, transition: 'opacity 0.2s' }}>
              {/* Header */}
              <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 32, height: 32, background: enabled ? 'rgba(78,222,163,0.12)' : 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-icons" style={{ fontSize: 18, color: enabled ? 'var(--secondary)' : 'var(--outline)' }}>{m.icon}</span>
                  </div>
                  <div>
                    <div className="panel-title" style={{ fontSize: '0.75rem' }}>{m.label}</div>
                    <div className="mono text-dim" style={{ fontSize: '0.5rem', letterSpacing: '0.06em' }}>{m.id}</div>
                  </div>
                </div>
                <label className="toggle" title={enabled ? 'Disable module' : 'Enable module'}>
                  <input type="checkbox" checked={enabled} onChange={() => toggleModule(m.id)} />
                  <span className="toggle-track" />
                </label>
              </div>

              {/* Status badge */}
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', background: enabled ? 'rgba(78,222,163,0.1)' : 'rgba(66,71,84,0.15)', color: enabled ? 'var(--secondary)' : 'var(--outline)', border: `1px solid ${enabled ? 'rgba(78,222,163,0.2)' : 'rgba(66,71,84,0.2)'}` }}>
                  {enabled ? '● Active' : '○ Disabled'}
                </span>
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginBottom: enabled && m.fields.length > 0 ? 14 : 0, lineHeight: 1.6 }}>{m.desc}</p>

              {/* Fields (only when enabled) */}
              {enabled && m.fields.map(f => (
                <div key={f.key} className="t-input-wrap" style={{ marginBottom: 12 }}>
                  <label className="t-input-label">{f.label}</label>
                  <input
                    type="number"
                    className="t-input"
                    value={s[f.key] ?? f.default}
                    min={0}
                    onChange={e => updateField(m.id, f.key, Number(e.target.value))}
                  />
                </div>
              ))}

              {s.last_triggered && (
                <div className="mono text-dim" style={{ fontSize: '0.5625rem', marginTop: 8 }}>
                  Last triggered: {new Date(s.last_triggered).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
