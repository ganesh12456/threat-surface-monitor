import { useLocation } from 'react-router-dom';
import { Bell, Search, Loader2, User } from 'lucide-react';
import { clsx } from 'clsx';
import useStore from '@/store/useStore';
import { useState, useEffect } from 'react';

const breadcrumbMap: Record<string, string> = {
  '/': 'Dashboard',
  '/websites': 'Websites',
  '/alerts': 'Alerts',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/findings': 'Findings',
};

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="font-mono text-xs text-cyber-text-muted tabular-nums">
      {time.toUTCString().replace('GMT', 'UTC')}
    </span>
  );
}

export default function TopBar() {
  const location = useLocation();
  const { alerts, currentScan, user } = useStore();
  const [search, setSearch] = useState('');
  const activeAlerts = alerts.filter((a) => !a.is_acknowledged).length;
  const isScanning = currentScan?.status === 'running';

  const pathParts = location.pathname.split('/').filter(Boolean);
  const crumbs: { label: string; path: string }[] = [{ label: 'SOC', path: '/' }];

  if (pathParts.length > 0) {
    const mainPath = '/' + pathParts[0];
    crumbs.push({ label: breadcrumbMap[mainPath] ?? pathParts[0], path: mainPath });
    if (pathParts.length > 1) {
      crumbs.push({ label: pathParts[1].substring(0, 8) + '...', path: location.pathname });
    }
  }

  return (
    <header className="h-14 bg-cyber-surface/80 backdrop-blur-sm border-b border-cyber-border flex items-center gap-4 px-6 shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-cyber-text-muted">
        {crumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && <span className="text-cyber-border mx-1">/</span>}
            <span className={clsx(i === crumbs.length - 1 ? 'text-cyber-text' : 'text-cyber-text-muted')}>
              {crumb.label}
            </span>
          </span>
        ))}
      </div>

      <div className="flex-1" />

      {/* Live clock */}
      <LiveClock />

      {/* Scan status */}
      {isScanning && (
        <div className="flex items-center gap-2 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-lg px-3 py-1.5">
          <Loader2 className="w-3.5 h-3.5 text-cyber-cyan animate-spin" />
          <span className="text-xs font-semibold text-cyber-cyan font-mono tracking-wider">
            SCANNING {currentScan?.pipeline_stage?.replace('scanning_', '').toUpperCase()}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-cyber-surface-2 border border-cyber-border rounded-lg pl-9 pr-4 py-1.5 text-sm text-cyber-text placeholder:text-cyber-text-muted focus:outline-none focus:border-cyber-cyan/50 w-44 transition-all focus:w-56"
        />
      </div>

      {/* Notifications */}
      <button className="relative p-2 rounded-lg text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-surface-2 transition-all">
        <Bell className="w-5 h-5" />
        {activeAlerts > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-cyber-red rounded-full text-white text-xs flex items-center justify-center font-bold">
            {activeAlerts > 9 ? '9+' : activeAlerts}
          </span>
        )}
      </button>

      {/* User avatar */}
      <div className="flex items-center gap-2 pl-2 border-l border-cyber-border">
        <div className="w-7 h-7 rounded-full bg-cyber-purple/20 border border-cyber-purple/40 flex items-center justify-center">
          <User className="w-4 h-4 text-cyber-purple" />
        </div>
        <div className="hidden sm:block">
          <p className="text-xs font-semibold text-cyber-text">{user?.full_name ?? 'Alex Morgan'}</p>
          <p className="text-xs text-cyber-text-muted capitalize">{user?.role ?? 'admin'}</p>
        </div>
      </div>
    </header>
  );
}
