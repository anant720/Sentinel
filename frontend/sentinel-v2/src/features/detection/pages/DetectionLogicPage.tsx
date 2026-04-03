import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { OrgSettings } from '../../../types';

// All 13 detection modules — matches backend detection engine exactly
const MODULES = [
  // ── Identity Attack Detection ────────────────────────────────────────────
  { id: 'rapid_failed_logins',    label: 'Brute Force Detection',      icon: 'bolt',             desc: 'Detects consecutive failed login attempts per account AND per IP using true sliding windows. Dual-axis detection: protects both the identity and catches the attacker.', fields: [{ key: 'threshold5m', label: 'Max Failures (5 min)', default: 5 }, { key: 'threshold15m', label: 'Max Failures (15 min)', default: 15 }, { key: 'ipThreshold5m', label: 'Max IP Failures (5 min)', default: 10 }] },
  { id: 'password_spraying',      label: 'Password Spraying',          icon: 'manage_accounts',  desc: 'Detects a single IP targeting many accounts (one password, many users). Uses NIST 800-63B recommended threshold of 5+ unique accounts. Catches attackers bypassing per-account lockouts.', fields: [{ key: 'threshold5m', label: 'Unique Accounts (5 min)', default: 5 }, { key: 'threshold30m', label: 'Unique Accounts (30 min)', default: 20 }] },
  { id: 'distributed_login',      label: 'Distributed Brute Force',    icon: 'hub',              desc: 'Detects many IPs targeting one account — the botnet/credential-stuffing pattern. Includes country-diversity scoring: global botnet (5+ countries) = Critical.', fields: [{ key: 'threshold', label: 'Unique IPs (10 min)', default: 4 }] },
  { id: 'impossible_travel',      label: 'Impossible Travel',          icon: 'flight',           desc: 'Flags concurrent sessions from physically impossible locations. Detects VPN mid-session switching and cross-continent logins faster than commercial aviation speed. 72h sliding window.', fields: [] },
  { id: 'new_device_logon',       label: 'New Device / Browser',       icon: 'phonelink_setup',  desc: 'Alerts on first login from an unrecognized device for users with established login history. Composite risk scoring includes country change, off-hours, and high-risk country detection.', fields: [] },
  { id: 'privilege_escalation',   label: 'Privilege Escalation',       icon: 'admin_panel_settings', desc: 'Detects role elevation to admin/owner. Self-promotion (actor escalating their own account) and rapid campaign escalation (3+ accounts in 30 min) trigger Critical alerts.', fields: [] },

  // ── Network & Perimeter Attack Detection ────────────────────────────────
  { id: 'directory_brute_force',  label: 'Directory / Path Scanning',  icon: 'folder_open',      desc: 'Rate-based detection of path enumeration with 80+ known attack paths in 3 sensitivity tiers (Critical: .env/.git/passwd, High: /admin/actuator, Medium: /backup). Alerts once per burst, not per request.', fields: [{ key: 'threshold', label: 'Requests/min threshold', default: 10 }] },
  { id: 'security_tool_detection',label: 'Security Tool Detection',    icon: 'bug_report',       desc: 'Detects 35+ named penetration testing tools (Burp, SQLMap, Nikto, etc.), generic automated HTTP libraries, and empty User-Agents. Behavioral 404-rate pattern catches tools with spoofed UAs.', fields: [] },

  // ── Behavioral & Cross-Signal Analytics ─────────────────────────────────
  { id: 'fingerprint_campaign',   label: 'Automated Campaign',         icon: 'fingerprint',      desc: 'Tracks IP+UA fingerprints across all event types using a 1-hour sliding window. Detects automated attacks that rotate between event types. Headless/empty UA treated as high-confidence scanner.', fields: [{ key: 'thresholdHigh', label: 'High Alert threshold', default: 10 }, { key: 'thresholdCritical', label: 'Critical Alert threshold', default: 50 }] },
  { id: 'risk_scoring',           label: 'Risk Score Aggregation',     icon: 'query_stats',      desc: 'Cross-module cumulative risk engine with time-decay (4h TTL). 20+ event types mapped to risk weights. login_success reduces score. 3-tier thresholds: Medium (50), High (75), Critical (100).', fields: [{ key: 'thresholdMedium', label: 'Medium Tier threshold', default: 50 }, { key: 'thresholdHigh', label: 'High Tier threshold', default: 75 }, { key: 'thresholdCritical', label: 'Critical Tier threshold', default: 100 }] },
  { id: 'ip_reputation',          label: 'IP Reputation Engine',       icon: 'gpp_bad',          desc: 'NEW: Cross-module IP reputation scoring aggregated from all other detection rules. 3 tiers: Monitor (100), Block (200), Ban (350). Ban recommendation can be fed to WAF/Cloudflare for automatic IP blocking.', fields: [{ key: 'thresholdWarn', label: 'Monitor threshold', default: 100 }, { key: 'thresholdBlock', label: 'Block threshold', default: 200 }, { key: 'thresholdBan', label: 'Ban threshold', default: 350 }] },
  { id: 'device_anomaly_burst',   label: 'Device Anomaly (Burst)',     icon: 'devices',          desc: 'Detects devices emitting events at abnormal rates — potential malware beaconing or compromised agent. Pure Redis-based sliding window (no DB hit). Rate-multiplier severity: 2x = High, 3x = Critical.', fields: [{ key: 'threshold', label: 'Events/min threshold', default: 20 }] },
  { id: 'enrollment_token_abuse', label: 'Enrollment Token Abuse',     icon: 'token',            desc: 'Detects replay attacks and harvest attempts against organization enrollment tokens. Fires on expired, already-used, or invalid token usage attempts.', fields: [] },
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
