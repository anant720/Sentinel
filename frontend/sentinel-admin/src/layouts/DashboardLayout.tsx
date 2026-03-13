import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Activity, 
  Building2, 
  Users, 
  Fingerprint, 
  Settings, 
  LogOut,
  Search,
  Bell,
  ShieldCheck,
  X,
  CheckCheck,
  Trash2
} from 'lucide-react';
import { useAuthStore } from '../lib/store';
import { useRoleAccess } from '../lib/rbac';
import { queryClient } from '../providers';
import { ToastProvider } from '../components/ui/ToastProvider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { OrgService } from '../lib/services/org.service';
import { Notification } from '../types';

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { canViewManagement } = useRoleAccess();
  const [notifOpen, setNotifOpen] = useState(false);
  const qc = useQueryClient();

  const { data: notifRes } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => OrgService.getNotifications(),
    refetchInterval: 15000,
    enabled: notifOpen,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => OrgService.markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const clearMutation = useMutation({
    mutationFn: () => OrgService.clearNotifications(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const notifications: Notification[] = notifRes?.data || [];
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const primaryNav = [
    { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { label: 'Security Alerts', icon: ShieldAlert, path: '/alerts' },
    { label: 'Live Events', icon: Activity, path: '/live-events' },
  ];

  const managementNav = [
    { label: 'Organizations', icon: Building2, path: '/organizations' },
    { label: 'Identity', icon: Users, path: '/identity' },
    { label: 'Detection Logic', icon: Fingerprint, path: '/detection-logic' },
  ];

  return (
    <ToastProvider>
      <div className="flex h-screen bg-[#05080f] text-gray-100 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-white/5 flex flex-col bg-[#05080f] select-none">
          <div className="p-6 flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldCheck className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Sentinel</h1>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-6">
            {/* General Nav — always visible */}
            <div>
              <p className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">General</p>
              <nav className="space-y-1">
                {primaryNav.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`sidebar-link ${isActive ? 'sidebar-link-active' : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'}`}
                    >
                      <Icon size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Management Nav — admin only */}
            {canViewManagement && (
              <div>
                <p className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Management</p>
                <nav className="space-y-1">
                  {managementNav.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={`sidebar-link ${isActive ? 'sidebar-link-active' : 'text-gray-400 hover:text-gray-100 hover:bg-white/5'}`}
                      >
                        <Icon size={18} />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>

          <div className="p-4 space-y-2">
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                  {user?.email?.substring(0, 2).toUpperCase() || '??'}
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs font-semibold truncate">{user?.email || 'Unknown User'}</p>
                  <p className="text-[10px] text-gray-500 uppercase font-bold">
                    {user?.organization?.name || 'No Organization'}
                  </p>
                </div>
              </div>
              <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest ml-11">{user?.role?.replace(/_/g,' ')}</p>
            </div>
            <button 
              onClick={() => navigate('/settings')}
              className={`sidebar-link w-full text-gray-400 hover:text-gray-100 hover:bg-white/5 ${location.pathname === '/settings' ? 'sidebar-link-active' : ''}`}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
            <button 
              onClick={() => {
                queryClient.clear();
                logout();
                window.location.href = '/login';
              }}
              className="sidebar-link w-full text-gray-400 hover:text-red-400 hover:bg-red-500/5"
            >
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-white/5 flex items-center justify-between px-8 bg-[#05080f]/50 backdrop-blur-md z-20">
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-gray-500">
              <span>Sentinel</span>
              <span className="text-gray-700">/</span>
              <span className="text-gray-300">{location.pathname === '/' ? 'Command Center' :
                location.pathname === '/alerts' ? 'Security Alerts' :
                location.pathname === '/live-events' ? 'Live Events' :
                location.pathname === '/organizations' ? 'Organizations' :
                location.pathname === '/identity' ? 'Identity' :
                location.pathname === '/detection-logic' ? 'Detection Logic' :
                location.pathname === '/settings' ? 'Settings' : 'Console'
              }</span>
            </div>

            <div className="flex items-center gap-6">
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-primary transition-colors" size={14} />
                <input 
                  type="text" 
                  placeholder="Search telemetry..."
                  className="bg-white/5 border border-white/5 rounded-full py-1.5 pl-9 pr-4 text-xs w-64 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                />
              </div>
              
              <div className="flex items-center gap-3 border-l border-white/10 pl-6">
                {/* Notification Bell */}
                <div className="relative">
                  <button 
                    onClick={() => setNotifOpen(o => !o)}
                    className="text-gray-400 hover:text-gray-100 transition-colors p-1 relative"
                  >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications panel */}
                  {notifOpen && (
                    <div className="absolute right-0 top-10 z-50 w-80 bg-[#0a0d14] border border-white/10 rounded-xl shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-widest">Notifications</h3>
                        <div className="flex items-center gap-2">
                          {notifications.length > 0 && (
                            <button
                              onClick={() => clearMutation.mutate()}
                              disabled={clearMutation.isPending}
                              title="Clear all"
                              className="text-gray-600 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          <button onClick={() => setNotifOpen(false)} className="text-gray-600 hover:text-white transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center">
                            <Bell className="mx-auto text-gray-800 mb-2" size={32} />
                            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">No notifications</p>
                          </div>
                        ) : notifications.map(n => (
                          <div key={n.id} className={`p-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors ${!n.is_read ? 'bg-primary/[0.03]' : ''}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-xs font-bold text-gray-200">{n.title}</p>
                                <p className="text-[10px] text-gray-500 mt-1">{n.message}</p>
                                <p className="text-[9px] text-gray-700 mt-1 tabular-nums">
                                  {new Date(n.created_at).toLocaleString()}
                                </p>
                              </div>
                              {!n.is_read && (
                                <button
                                  onClick={() => markReadMutation.mutate(n.id)}
                                  title="Mark as read"
                                  className="text-primary/60 hover:text-primary transition-colors mt-0.5 flex-shrink-0"
                                >
                                  <CheckCheck size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-tighter">Secure Tunnel</span>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-8 bg-transparent" onClick={() => setNotifOpen(false)}>
            <Outlet />
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
