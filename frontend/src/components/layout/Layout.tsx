import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useEffect } from 'react';
import useStore from '@/store/useStore';
import { alertsApi, dashboardApi, websiteApi, authApi } from '@/services/api';

export default function Layout() {
  const { setAlerts, setDashboardStats, setWebsites, setUser } = useStore();

  useEffect(() => {
    const loadData = async () => {
      try {
        const [alerts, stats, websites] = await Promise.all([
          alertsApi.list(),
          dashboardApi.getStats(),
          websiteApi.list(),
        ]);
        setAlerts(alerts);
        setDashboardStats(stats);
        setWebsites(websites);
      } catch (err) {
        console.error('Failed to load layout data:', err);
      }

      // Load real user profile
      try {
        const me = await authApi.me();
        if (me) {
          setUser({
            id: me.id ?? me.sub ?? 'u1',
            email: me.email ?? '',
            full_name: me.full_name ?? me.name ?? 'User',
            role: me.role ?? 'admin',
            is_active: me.is_active ?? true,
            created_at: me.created_at ?? new Date().toISOString(),
          });
        }
      } catch {
        // Auth/me not available — use token claims if available
        const token = localStorage.getItem('auth_token');
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUser({
              id: payload.sub ?? 'u1',
              email: payload.email ?? '',
              full_name: payload.full_name ?? payload.name ?? 'User',
              role: payload.role ?? 'admin',
              is_active: true,
              created_at: new Date().toISOString(),
            });
          } catch {
            // keep user null — will show fallback
          }
        }
      }
    };

    loadData();

    // Refresh alerts + stats every 15 seconds
    const interval = setInterval(async () => {
      try {
        const [alerts, stats, websites] = await Promise.all([
          alertsApi.list(),
          dashboardApi.getStats(),
          websiteApi.list(),
        ]);
        setAlerts(alerts);
        setDashboardStats(stats);
        setWebsites(websites);
      } catch (err) {
        console.warn('Background refresh failed:', err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [setAlerts, setDashboardStats, setWebsites, setUser]);

  return (
    <div className="flex h-screen overflow-hidden bg-cyber-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto grid-bg">
          <div className="p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
