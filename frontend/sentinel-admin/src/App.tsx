import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import AlertsPage from './features/alerts/pages/AlertsPage';
import UsersPage from './features/users/pages/UsersPage';
import LiveEventsPage from './features/events/pages/LiveEventsPage';
import OrganizationsPage from './features/organizations/pages/OrganizationsPage';
import DetectionLogicPage from './features/detection/pages/DetectionLogicPage';
import SettingsPage from './features/settings/pages/SettingsPage';
import LoginPage from './features/auth/pages/LoginPage';
import InviteAcceptPage from './features/auth/pages/InviteAcceptPage';
import DashboardLayout from './layouts/DashboardLayout';
import { useAuthStore } from './lib/store';

export default function App() {
  const { isAuthenticated } = useAuthStore();

  // Global 10-minute Refresh (Kiosk/Dashboard Stability)
  useEffect(() => {
    const TEN_MINUTES = 10 * 60 * 1000;
    const interval = setInterval(() => {
      console.log('🔄 Sentinel Global Refresh: Synchronizing all features...');
      window.location.reload();
    }, TEN_MINUTES);

    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <LoginPage /> : <Navigate to="/" replace />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/" element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" replace />}>
          <Route index element={<DashboardPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="live-events" element={<LiveEventsPage />} />
          <Route path="organizations" element={<OrganizationsPage />} />
          <Route path="identity" element={<UsersPage />} />
          <Route path="detection-logic" element={<DetectionLogicPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
