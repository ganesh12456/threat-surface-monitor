import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useEffect } from 'react';
import useStore from '@/store/useStore';
import { alertsApi, dashboardApi, websiteApi } from '@/services/api';

export default function Layout() {
  const { setAlerts, setDashboardStats, setWebsites, setUser } = useStore();

  useEffect(() => {
    // Load initial data
    const loadData = async () => {
      const [alerts, stats, websites] = await Promise.all([
        alertsApi.list(),
        dashboardApi.getStats(),
        websiteApi.list(),
      ]);
      setAlerts(alerts);
      setDashboardStats(stats);
      setWebsites(websites);

      // Mock user from localStorage
      const token = localStorage.getItem('auth_token');
      if (token) {
        setUser({
          id: 'u1',
          email: 'alex@threatmonitor.io',
          full_name: 'Alex Morgan',
          role: 'admin',
          is_active: true,
          created_at: new Date().toISOString(),
        });
      }
    };
    loadData();

    // Refresh every 30 seconds
    const interval = setInterval(async () => {
      const [alerts, stats] = await Promise.all([
        alertsApi.list(),
        dashboardApi.getStats(),
      ]);
      setAlerts(alerts);
      setDashboardStats(stats);
    }, 30000);

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
