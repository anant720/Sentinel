import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { OrgService } from '../../../lib/services/org.service';
import { useAuthStore } from '../../../lib/store';
import { OrgSettings } from '../../../types';
import api from '../../../lib/api';

// Module definition shape — mirrors backend ModuleMetadata interface
interface ModuleConfigField { key: string; label: string; default: number; }
interface DetectionModuleDef {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: 'identity' | 'network' | 'behavioral' | 'infrastructure';
  configFields: ModuleConfigField[];
  subscribedEvents: string[];
}

// Category display config
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  identity:       { label: 'Identity Attack',     color: '#4edeab' },
  network:        { label: 'Network & Perimeter',  color: '#60a5fa' },
  behavioral:     { label: 'Behavioral Analytics', color: '#f59e0b' },
  infrastructure: { label: 'Infrastructure',       color: '#a78bfa' },
};

export default function DetectionLogicPage() {
  const { e2eeEnabled } = useAuthStore();
  const [settings, setSettings] = useState<OrgSettings>({});
  const [saveMsg, setSaveMsg] = useState('');

  // ── Dynamically fetch loaded modules from the backend engine ─────────────
  // No hardcoded list. Adding a .ts file to /modules/ and redeploying = done.
  const { data: modulesData, isLoading: modulesLoading } = useQuery<{ data: DetectionModuleDef[]; total: number }>({
    queryKey: ['detection-modules'],
    queryFn: async () => { const { data } = await api.get('/detection/modules'); return data; },
    staleTime: 60 * 1000, // Cache for 1 min — modules don't change at runtime
  });

  const MODULES: DetectionModuleDef[] = modulesData?.data ?? [];

  // ── Fetch org settings (per-module enabled state + thresholds) ────────────
  const { data: settingsData } = useQuery({ queryKey: ['org-settings'], queryFn: OrgService.getSettings });
  useEffect(() => { if (settingsData?.data) setSettings(settingsData.data); }, [settingsData]);

  const mutation = useMutation({
    mutationFn: () => OrgService.updateSettings(settings),
    onSuccess: () => { setSaveMsg('Configuration saved.'); setTimeout(() => setSaveMsg(''), 3000); },
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

  // Group by category for organized display
  const categories = ['identity', 'network', 'behavioral', 'infrastructure'] as const;
  const byCategory = (cat: string) => MODULES.filter(m => m.category === cat);

  return (
    <div>
      <div className="page-header flex items-center justify-between">
        <div>
          <div className="page-title">Detection Engine Configuration</div>
          <div className="page-subtitle">
            {modulesLoading
              ? 'Loading modules from engine…'
              : `${activeCount} of ${MODULES.length} modules active • Live from backend`}
          </div>
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

      {modulesLoading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--on-surface-variant)' }}>
          <span className="material-icons" style={{ fontSize: 32, display: 'block', marginBottom: 12, opacity: 0.4 }}>radar</span>
          <span className="mono" style={{ fontSize: '0.625rem', letterSpacing: '0.1em' }}>LOADING DETECTION ENGINE REGISTRY…</span>
        </div>
      ) : (
        <>
          {categories.map(cat => {
            const mods = byCategory(cat);
            if (mods.length === 0) return null;
            const catMeta = CATEGORY_META[cat];
            return (
              <div key={cat} style={{ marginBottom: 32 }}>
                {/* Category header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ height: 1, width: 20, background: catMeta.color, opacity: 0.5 }} />
                  <span className="mono" style={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: catMeta.color }}>
                    {catMeta.label}
                  </span>
                  <div style={{ height: 1, flex: 1, background: catMeta.color, opacity: 0.15 }} />
                  <span className="mono text-dim" style={{ fontSize: '0.5rem' }}>{mods.length} modules</span>
                </div>

                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  {mods.map(m => {
                    const s = settings[m.id] || {};
                    const enabled = s.enabled !== false;
                    return (
                      <div key={m.id} className="panel" style={{ opacity: enabled ? 1 : 0.65, transition: 'opacity 0.2s', borderTop: `2px solid ${enabled ? catMeta.color : 'transparent'}30` }}>
                        {/* Header */}
                        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                          <div className="flex items-center gap-3">
                            <div style={{ width: 32, height: 32, background: enabled ? `${catMeta.color}18` : 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="material-icons" style={{ fontSize: 18, color: enabled ? catMeta.color : 'var(--outline)' }}>{m.icon}</span>
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

                        {/* Status badge + subscribed events */}
                        <div style={{ marginBottom: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.5rem', fontFamily: 'var(--font-mono)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '2px 6px', background: enabled ? `${catMeta.color}18` : 'rgba(66,71,84,0.15)', color: enabled ? catMeta.color : 'var(--outline)', border: `1px solid ${enabled ? catMeta.color : 'rgba(66,71,84,0.2)'}30` }}>
                            {enabled ? '● Active' : '○ Disabled'}
                          </span>
                          {m.subscribedEvents.slice(0, 2).map(ev => (
                            <span key={ev} style={{ fontSize: '0.45rem', fontFamily: 'var(--font-mono)', padding: '2px 5px', background: 'rgba(255,255,255,0.04)', color: 'var(--outline)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              {ev === '*' ? 'ALL EVENTS' : ev}
                            </span>
                          ))}
                          {m.subscribedEvents.length > 2 && (
                            <span style={{ fontSize: '0.45rem', fontFamily: 'var(--font-mono)', padding: '2px 5px', color: 'var(--outline)' }}>+{m.subscribedEvents.length - 2} more</span>
                          )}
                        </div>

                        {/* Description */}
                        <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', marginBottom: enabled && m.configFields.length > 0 ? 14 : 0, lineHeight: 1.6 }}>{m.description}</p>

                        {/* Config fields (only when enabled) */}
                        {enabled && m.configFields.map(f => (
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
          })}
        </>
      )}
    </div>
  );
}
