import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../lib/store';
import { useRoleAccess } from '../lib/rbac';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../lib/services/org.service';
import { queryClient } from '../providers';
import { Notification } from '../types';

const NAV_GENERAL = [
  { label: 'Dashboard', icon: 'dashboard', path: '/' },
  { label: 'Security Alerts', icon: 'warning', path: '/alerts' },
  { label: 'Live Events', icon: 'event_note', path: '/live-events' },
  { label: 'Threat Map', icon: 'public', path: '/threat-map' },
];
const NAV_MANAGEMENT = [
  { label: 'Organizations', icon: 'corporate_fare', path: '/organizations' },
  { label: 'Identity', icon: 'fingerprint', path: '/identity' },
  { label: 'Detection Logic', icon: 'query_stats', path: '/detection-logic' },
];

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, e2eeEnabled } = useAuthStore();
  const { canViewManagement } = useRoleAccess();
  const [notifOpen, setNotifOpen] = useState(false);
  const qc = useQueryClient();
  const initials = user?.email?.substring(0, 2).toUpperCase() || '??';

  const { data: notifRes } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => OrgService.getNotifications(),
    refetchInterval: 15000,
    enabled: notifOpen,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => OrgService.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const clearAll = useMutation({
    mutationFn: () => OrgService.clearNotifications(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications: Notification[] = notifRes?.data || [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const pageLabel = () => {
    const p = location.pathname;
    if (p === '/') return 'Command Center';
    if (p === '/alerts') return 'Security Alerts';
    if (p === '/live-events') return 'Live Events';
    if (p === '/threat-map') return 'Threat Map';
    if (p === '/organizations') return 'Organizations';
    if (p === '/identity') return 'Identity';
    if (p === '/detection-logic') return 'Detection Logic';
    if (p === '/settings') return 'Settings';
    return 'Console';
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <div className="main-layout" onClick={() => setNotifOpen(false)}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <span className="material-icons" style={{ fontSize: 18, color: '#002e6a' }}>shield</span>
          </div>
          <span className="sidebar-logo-text">SENTINEL</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          <div className="sidebar-section-label">General</div>
          {NAV_GENERAL.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="material-icons">{item.icon}</span>
              {item.label}
            </Link>
          ))}

          {canViewManagement && (
            <>
              <div className="sidebar-section-label" style={{ marginTop: 8 }}>Management</div>
              {NAV_MANAGEMENT.map(item => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar-link ${isActive(item.path) ? 'active' : ''}`}
                >
                  <span className="material-icons">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </div>

        <div style={{ padding: '8px' }}>
          <div className="sidebar-user-card">
            <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
              <div className="sidebar-avatar">{initials}</div>
              <div className="flex-1 min-w-0">
                <div className="truncate mono" style={{ fontSize: '0.6875rem', color: 'var(--on-surface)' }}>{user?.email}</div>
                <div className="text-overline" style={{ marginTop: 2 }}>{user?.organization?.name || 'Sentinel'}</div>
              </div>
            </div>
            <div className="text-label-sm" style={{ marginLeft: 38 }}>{user?.role?.replace(/_/g, ' ')}</div>
          </div>
          <button
            onClick={() => navigate('/settings')}
            className={`sidebar-link ${isActive('/settings') ? 'active' : ''}`}
            style={{ marginTop: 4 }}
          >
            <span className="material-icons">settings</span>
            Settings
          </button>
          <button
            onClick={() => { queryClient.clear(); logout(); window.location.href = '/login'; }}
            className="sidebar-link"
            style={{ color: 'var(--on-surface-variant)' }}
          >
            <span className="material-icons">logout</span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-content">
        <header className="header" onClick={e => e.stopPropagation()}>
          {/* Breadcrumb */}
          <div className="flex items-center gap-2">
            <span className="mono" style={{ fontSize: '0.5625rem', fontWeight: 600, color: 'var(--outline)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>SENTINEL</span>
            <span style={{ color: 'var(--outline-variant)' }}>/</span>
            <span className="mono" style={{ fontSize: '0.5625rem', fontWeight: 600, color: 'var(--primary)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>{pageLabel()}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* E2EE */}
            {!e2eeEnabled && (
              <button
                onClick={() => navigate('/settings')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                  background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)',
                  color: '#fbbf24', cursor: 'pointer', fontSize: '0.5625rem',
                  fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase'
                }}
              >
                <span className="material-icons" style={{ fontSize: 12 }}>security</span>
                Upgrade to E2EE
              </button>
            )}

            {/* Notifications */}
            <div style={{ position: 'relative' }}>
              <button
                className="btn-icon"
                onClick={(e) => { e.stopPropagation(); setNotifOpen(o => !o); }}
                style={{ position: 'relative' }}
              >
                <span className="material-icons" style={{ fontSize: 20 }}>notifications</span>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 0, right: 0,
                    width: 16, height: 16, background: 'var(--error)',
                    borderRadius: '50% !important', fontSize: '0.5rem', fontWeight: 700,
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="notif-panel" onClick={e => e.stopPropagation()}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(66,71,84,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="text-overline">Notifications</span>
                    <div className="flex gap-2">
                      {notifications.length > 0 && (
                        <button className="btn-icon" onClick={() => clearAll.mutate()}>
                          <span className="material-icons" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      )}
                      <button className="btn-icon" onClick={() => setNotifOpen(false)}>
                        <span className="material-icons" style={{ fontSize: 16 }}>close</span>
                      </button>
                    </div>
                  </div>
                  <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                    {notifications.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center' }}>
                        <span className="material-icons" style={{ fontSize: 28, color: 'var(--outline-variant)', display: 'block', marginBottom: 8 }}>notifications_none</span>
                        <span className="text-label-sm">No notifications</span>
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} style={{
                        padding: '10px 16px',
                        borderBottom: '1px solid rgba(66,71,84,0.12)',
                        background: !n.is_read ? 'rgba(173,198,255,0.03)' : 'transparent'
                      }}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>{n.title}</p>
                            <p style={{ fontSize: '0.6875rem', color: 'var(--on-surface-variant)', margin: '3px 0 0' }}>{n.message}</p>
                            <p className="mono" style={{ fontSize: '0.5625rem', color: 'var(--outline)', marginTop: 4 }}>
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                          {!n.is_read && (
                            <button className="btn-icon" onClick={() => markRead.mutate(n.id)} title="Mark read">
                              <span className="material-icons" style={{ fontSize: 14, color: 'var(--primary)' }}>done_all</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* WS Indicator */}
            <div className="flex items-center gap-2" style={{
              padding: '4px 10px',
              background: 'rgba(78,222,163,0.06)',
              border: '1px solid rgba(78,222,163,0.15)'
            }}>
              <span className="pulsar pulsar-green" style={{ animation: 'pulsar 1.5s ease-in-out infinite' }} />
              <span className="mono" style={{ fontSize: '0.5rem', fontWeight: 600, color: 'var(--secondary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                Secure Tunnel
              </span>
            </div>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
