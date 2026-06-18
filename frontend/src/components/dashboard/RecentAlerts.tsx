import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowRight, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow, parseISO } from 'date-fns';
import type { Alert } from '@/types';
import { motion } from 'framer-motion';

interface Props {
  alerts: Alert[];
}

function getSeverityDotClass(severity: string) {
  if (severity === 'critical') return 'bg-cyber-red animate-pulse';
  if (severity === 'high') return 'bg-cyber-orange';
  if (severity === 'medium') return 'bg-cyber-yellow';
  if (severity === 'low') return 'bg-cyber-cyan';
  return 'bg-cyber-text-muted';
}

function getSeverityGlow(severity: string) {
  if (severity === 'critical') return 'shadow-cyber-red/20';
  if (severity === 'high') return 'shadow-cyber-orange/20';
  return '';
}

export default function RecentAlerts({ alerts }: Props) {
  const navigate = useNavigate();
  const recentAlerts = alerts.slice(0, 6);
  const unacknowledged = alerts.filter((a) => !a.is_acknowledged);

  if (alerts.length === 0) {
    return (
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
        <h3 className="text-sm font-semibold text-cyber-text mb-4">Recent Alerts</h3>
        <div className="flex flex-col items-center py-8 text-center">
          <ShieldCheck className="w-12 h-12 text-cyber-green/40 mb-3" />
          <p className="text-sm text-cyber-text-dim">No active alerts</p>
          <p className="text-xs text-cyber-text-muted mt-1">All systems nominal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-cyber-border">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-cyber-text">Recent Alerts</h3>
          {unacknowledged.length > 0 && (
            <span className="text-xs bg-cyber-red/20 text-cyber-red border border-cyber-red/30 rounded-full px-2 py-0.5 font-bold">
              {unacknowledged.length} active
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-cyber-border/50">
        {recentAlerts.map((alert, idx) => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.06 }}
            className={clsx(
              'flex items-start gap-3 px-5 py-3.5 hover:bg-cyber-surface-2/50 transition-all cursor-pointer group',
              !alert.is_acknowledged && 'bg-cyber-surface-2/20',
              alert.severity === 'critical' && !alert.is_acknowledged && `shadow-inner ${getSeverityGlow(alert.severity)}`
            )}
            onClick={() => navigate('/alerts')}
          >
            {/* Severity dot */}
            <div className="mt-1.5 shrink-0">
              <div className={clsx('w-2 h-2 rounded-full', getSeverityDotClass(alert.severity))} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <p className={clsx(
                  'text-sm font-medium truncate',
                  alert.is_acknowledged ? 'text-cyber-text-dim' : 'text-cyber-text'
                )}>
                  {alert.title}
                </p>
                {!alert.is_acknowledged && (
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-cyber-cyan mt-1.5" />
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {alert.website_url && (
                  <span className="text-xs text-cyber-text-muted font-mono truncate">
                    {alert.website_url}
                  </span>
                )}
                <span className="text-cyber-border">·</span>
                <div className="flex items-center gap-1 text-cyber-text-muted text-xs shrink-0">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true })}
                </div>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-cyber-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
          </motion.div>
        ))}
      </div>

      <div className="px-5 py-3 border-t border-cyber-border">
        <button
          onClick={() => navigate('/alerts')}
          className="w-full text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors flex items-center justify-center gap-1.5 py-1"
        >
          View All Alerts <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
