import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Bell, Filter, CheckCircle, AlertTriangle, Clock, Globe,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';
import { alertsApi, MOCK_ALERTS } from '@/services/api';
import type { Alert } from '@/types';

function getSeverityDotClass(severity: string) {
  const map: Record<string, string> = {
    critical: 'bg-cyber-red shadow-[0_0_6px_rgba(255,51,102,0.8)]',
    high: 'bg-cyber-orange shadow-[0_0_6px_rgba(255,140,66,0.8)]',
    medium: 'bg-cyber-yellow shadow-[0_0_6px_rgba(255,215,0,0.8)]',
    low: 'bg-cyber-cyan',
    informational: 'bg-cyber-text-muted',
  };
  return map[severity] ?? map['informational'];
}

function getSeverityBadge(severity: string) {
  const map: Record<string, string> = {
    critical: 'cyber-badge-critical',
    high: 'cyber-badge-high',
    medium: 'cyber-badge-medium',
    low: 'cyber-badge-low',
    informational: 'cyber-badge-informational',
  };
  return map[severity] ?? map['informational'];
}

function AlertCard({ alert, onAcknowledge }: { alert: Alert; onAcknowledge: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        'bg-cyber-surface border rounded-xl overflow-hidden transition-all duration-300',
        !alert.is_acknowledged && alert.severity === 'critical'
          ? 'border-cyber-red/40 shadow-md shadow-cyber-red/10'
          : !alert.is_acknowledged
          ? 'border-cyber-border hover:border-cyber-cyan/30'
          : 'border-cyber-border/50 opacity-60'
      )}
    >
      <div
        className="flex items-start gap-4 p-5 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Severity dot */}
        <div className={clsx('w-2.5 h-2.5 rounded-full mt-1.5 shrink-0',
          getSeverityDotClass(alert.severity),
          alert.severity === 'critical' && !alert.is_acknowledged && 'animate-pulse'
        )} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={getSeverityBadge(alert.severity)}>{alert.severity}</span>
            <p className={clsx('text-sm font-semibold', alert.is_acknowledged ? 'text-cyber-text-dim line-through' : 'text-cyber-text')}>
              {alert.title}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-1">
            {alert.website_url && (
              <span className="flex items-center gap-1 text-xs text-cyber-text-muted font-mono">
                <Globe className="w-3 h-3" /> {alert.website_url}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-cyber-text-muted">
              <Clock className="w-3 h-3" />
              {formatDistanceToNow(parseISO(alert.created_at), { addSuffix: true })}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!alert.is_acknowledged && (
            <button
              onClick={(e) => { e.stopPropagation(); onAcknowledge(alert.id); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyber-green/10 border border-cyber-green/30 text-cyber-green hover:bg-cyber-green/20 transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Acknowledge
            </button>
          )}
          {alert.is_acknowledged && (
            <span className="text-xs text-cyber-text-muted flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-cyber-green" /> Acknowledged
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-cyber-text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-cyber-text-muted" />
          )}
        </div>
      </div>

      {/* Expanded message */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="px-5 pb-5 pt-0 border-t border-cyber-border/50 bg-cyber-surface-2/30"
        >
          <p className="text-sm text-cyber-text-dim leading-relaxed pt-4">{alert.message}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-cyber-text-muted">
            <span className="font-mono">Type: {alert.alert_type.replace(/_/g, ' ')}</span>
            {alert.scan_id && <span className="font-mono">Scan: {alert.scan_id}</span>}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default function AlertsPage() {
  const { alerts: storeAlerts, setAlerts } = useStore();
  const alerts = storeAlerts.length > 0 ? storeAlerts : MOCK_ALERTS;

  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'acknowledged'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = alerts.filter((a) => {
    if (severityFilter && a.severity !== severityFilter) return false;
    if (statusFilter === 'active' && a.is_acknowledged) return false;
    if (statusFilter === 'acknowledged' && !a.is_acknowledged) return false;
    return true;
  });

  const activeCount = alerts.filter((a) => !a.is_acknowledged).length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.is_acknowledged).length;
  const acknowledgedCount = alerts.filter((a) => a.is_acknowledged).length;

  const handleAcknowledge = async (alertId: string) => {
    await alertsApi.acknowledge(alertId);
    setAlerts(alerts.map((a) => a.id === alertId ? { ...a, is_acknowledged: true } : a));
    toast.success('Alert acknowledged');
  };

  const handleBulkAcknowledge = async () => {
    const active = alerts.filter((a) => !a.is_acknowledged);
    for (const alert of active) {
      await alertsApi.acknowledge(alert.id);
    }
    setAlerts(alerts.map((a) => ({ ...a, is_acknowledged: true })));
    toast.success(`${active.length} alerts acknowledged`);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-cyber-text">Alerts</h1>
          <p className="text-xs text-cyber-text-muted">Monitor and acknowledge security alerts</p>
        </div>
        {activeCount > 0 && (
          <button onClick={handleBulkAcknowledge} className="cyber-btn-secondary flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-cyber-green" />
            Acknowledge All ({activeCount})
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Active Alerts', value: activeCount, color: 'text-cyber-orange', bg: 'bg-cyber-orange/10 border-cyber-orange/20', icon: <Bell className="w-4 h-4 text-cyber-orange" /> },
          { label: 'Critical', value: criticalCount, color: 'text-cyber-red', bg: 'bg-cyber-red/10 border-cyber-red/20', icon: <AlertTriangle className="w-4 h-4 text-cyber-red" /> },
          { label: 'Acknowledged', value: acknowledgedCount, color: 'text-cyber-green', bg: 'bg-cyber-green/10 border-cyber-green/20', icon: <CheckCircle className="w-4 h-4 text-cyber-green" /> },
        ].map((stat) => (
          <div key={stat.label} className={clsx('border rounded-xl p-4 flex items-center gap-3', stat.bg)}>
            <div className="w-9 h-9 rounded-lg bg-cyber-surface flex items-center justify-center shrink-0">{stat.icon}</div>
            <div>
              <p className={clsx('text-2xl font-bold font-mono', stat.color)}>{stat.value}</p>
              <p className="text-xs text-cyber-text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyber-text-muted" />
          <span className="text-xs text-cyber-text-muted">Status:</span>
          {(['all', 'active', 'acknowledged'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all',
                statusFilter === s
                  ? 'bg-cyber-cyan/20 border-cyber-cyan/50 text-cyber-cyan'
                  : 'bg-cyber-surface-2 border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/30'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-cyber-text-muted">Severity:</span>
          {(['', 'critical', 'high', 'medium', 'low'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize transition-all',
                severityFilter === s
                  ? 'bg-cyber-cyan/20 border-cyber-cyan/50 text-cyber-cyan'
                  : 'bg-cyber-surface-2 border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/30'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 bg-cyber-surface border border-cyber-border rounded-xl">
            <CheckCircle className="w-12 h-12 text-cyber-green/40 mx-auto mb-3" />
            <p className="text-sm text-cyber-text-muted">No alerts match your filters</p>
          </div>
        ) : (
          filtered.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAcknowledge={handleAcknowledge} />
          ))
        )}
      </div>
    </div>
  );
}
