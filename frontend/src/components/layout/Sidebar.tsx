import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Globe, AlertTriangle, Bell, FileText,
  Settings, Shield, ChevronLeft, ChevronRight, LogOut, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import useStore from '@/store/useStore';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  { label: 'Websites', icon: Globe, to: '/websites' },
  { label: 'Findings', icon: AlertTriangle, to: '/findings' },
  { label: 'Alerts', icon: Bell, to: '/alerts' },
  { label: 'Reports', icon: FileText, to: '/reports' },
  { label: 'Settings', icon: Settings, to: '/settings' },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, alerts, currentScan, user } = useStore();
  const navigate = useNavigate();
  const activeAlerts = alerts.filter((a) => !a.is_acknowledged).length;
  const isScanning = currentScan?.status === 'running';

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 240 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="relative flex flex-col bg-cyber-surface border-r border-cyber-border overflow-hidden shrink-0 h-screen"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-cyber-border shrink-0">
        <div className="relative shrink-0">
          <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyber-cyan" />
          </div>
          {isScanning && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-cyber-green animate-pulse" />
          )}
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col leading-tight"
            >
              <span className="text-xs font-bold text-cyber-cyan tracking-widest font-mono">THREAT SURFACE</span>
              <span className="text-xs font-semibold text-cyber-text tracking-widest font-mono">MONITOR</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* LIVE badge */}
      <AnimatePresence>
        {isScanning && !sidebarCollapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mx-3 mt-3"
          >
            <div className="flex items-center gap-2 bg-cyber-green/10 border border-cyber-green/30 rounded-lg px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-cyber-green animate-pulse" />
              <span className="text-xs font-semibold text-cyber-green font-mono tracking-wider">SCANNING LIVE</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 space-y-1 px-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative',
                isActive
                  ? 'bg-cyber-cyan/10 text-cyber-cyan border-l-2 border-cyber-cyan ml-0 pl-[10px]'
                  : 'text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-surface-2'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={clsx('w-5 h-5 shrink-0', isActive ? 'text-cyber-cyan' : 'text-cyber-text-muted group-hover:text-cyber-text-dim')}
                />
                <AnimatePresence>
                  {!sidebarCollapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
                {/* Alerts badge */}
                {item.label === 'Alerts' && activeAlerts > 0 && (
                  <AnimatePresence>
                    {!sidebarCollapsed ? (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="ml-auto text-xs bg-cyber-red text-white rounded-full px-1.5 py-0.5 font-bold min-w-[18px] text-center leading-none"
                      >
                        {activeAlerts}
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-1 right-1 w-2 h-2 bg-cyber-red rounded-full"
                      />
                    )}
                  </AnimatePresence>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-cyber-border p-3 shrink-0">
        <div className={clsx('flex items-center gap-3', sidebarCollapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-cyber-purple/20 border border-cyber-purple/40 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-cyber-purple">
              {user?.full_name?.charAt(0) ?? 'A'}
            </span>
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex-1 min-w-0"
              >
                <p className="text-xs font-semibold text-cyber-text truncate">
                  {user?.full_name ?? 'Alex Morgan'}
                </p>
                <p className="text-xs text-cyber-text-muted capitalize">{user?.role ?? 'admin'}</p>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleLogout}
                className="p-1.5 rounded-lg text-cyber-text-muted hover:text-cyber-red hover:bg-cyber-red/10 transition-all"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        {sidebarCollapsed && (
          <button
            onClick={handleLogout}
            className="mt-2 w-full p-1.5 rounded-lg text-cyber-text-muted hover:text-cyber-red hover:bg-cyber-red/10 transition-all flex justify-center"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-cyber-surface border border-cyber-border flex items-center justify-center text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/50 transition-all z-10"
      >
        {sidebarCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Subtle scan line effect */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-cyber-cyan/30 to-transparent animate-scan-line" />
        </div>
      )}

      {/* Zap icon */}
      <div className="absolute bottom-20 right-2 opacity-5">
        <Zap className="w-24 h-24 text-cyber-cyan" />
      </div>
    </motion.aside>
  );
}
