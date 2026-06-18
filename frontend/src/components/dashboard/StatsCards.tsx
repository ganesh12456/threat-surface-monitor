import { motion } from 'framer-motion';
import {
  Globe, AlertOctagon, Activity, Shield, Bell, Zap,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { DashboardStats } from '@/types';

interface Props {
  stats: DashboardStats;
}

function getGradeColor(grade: string) {
  if (grade === 'A') return 'text-cyber-green';
  if (grade === 'B') return 'text-cyber-cyan';
  if (grade === 'C') return 'text-cyber-yellow';
  if (grade === 'D') return 'text-cyber-orange';
  return 'text-cyber-red';
}

function getScoreColor(score: number) {
  if (score <= 30) return 'text-cyber-green';
  if (score <= 50) return 'text-cyber-cyan';
  if (score <= 70) return 'text-cyber-yellow';
  if (score <= 85) return 'text-cyber-orange';
  return 'text-cyber-red';
}

interface CardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ReactNode;
  iconBg: string;
  valueClass?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendText?: string;
  glow?: string;
  delay?: number;
  badge?: React.ReactNode;
}

function StatCard({ title, value, subtitle, icon, iconBg, valueClass, trend, trendText, glow, delay = 0, badge }: CardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className={clsx(
        'relative overflow-hidden bg-cyber-surface border border-cyber-border rounded-xl p-5 transition-all duration-300',
        'hover:border-cyber-cyan/30 hover:shadow-lg hover:shadow-cyber-cyan/5',
        glow && `hover:${glow}`
      )}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent to-cyber-surface-2/50 pointer-events-none" />

      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">{title}</p>
          <div className="flex items-end gap-2">
            <span className={clsx('text-3xl font-bold font-mono', valueClass ?? 'text-cyber-text')}>
              {value}
            </span>
            {badge}
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-cyber-red" />}
            {trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-cyber-green" />}
            {trend === 'neutral' && <Minus className="w-3.5 h-3.5 text-cyber-text-muted" />}
            <span className="text-xs text-cyber-text-dim">{subtitle}</span>
          </div>
        </div>
        <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          {icon}
        </div>
      </div>

      {/* Bottom accent line */}
      <div className={clsx('absolute bottom-0 left-0 h-0.5 w-1/3 rounded-full', 
        valueClass?.includes('cyan') ? 'bg-cyber-cyan/40' :
        valueClass?.includes('red') ? 'bg-cyber-red/40' :
        valueClass?.includes('green') ? 'bg-cyber-green/40' :
        valueClass?.includes('orange') ? 'bg-cyber-orange/40' :
        'bg-cyber-border'
      )} />
    </motion.div>
  );
}

export default function StatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        title="Sites"
        value={stats.total_websites}
        subtitle="Registered targets"
        icon={<Globe className="w-5 h-5 text-cyber-cyan" />}
        iconBg="bg-cyber-cyan/10 border border-cyber-cyan/20"
        valueClass="text-cyber-cyan"
        delay={0}
      />
      <StatCard
        title="Risk"
        value={stats.avg_risk_score.toFixed(1)}
        subtitle="Average score"
        icon={<Activity className="w-5 h-5 text-cyber-orange" />}
        iconBg="bg-cyber-orange/10 border border-cyber-orange/20"
        valueClass={getScoreColor(stats.avg_risk_score)}
        delay={0.08}
      />
      <StatCard
        title="Alerts"
        value={stats.active_alerts}
        subtitle="Awaiting review"
        icon={<Bell className="w-5 h-5 text-cyber-red" />}
        iconBg="bg-cyber-red/10 border border-cyber-red/20"
        valueClass={stats.active_alerts > 0 ? 'text-cyber-red' : 'text-cyber-green'}
        glow="shadow-cyber-red"
        delay={0.16}
        badge={
          stats.active_alerts > 0 ? (
            <span className="w-2 h-2 rounded-full bg-cyber-red animate-pulse mb-1" />
          ) : undefined
        }
      />
      <StatCard
        title="Grade"
        value={stats.security_grade}
        subtitle="Portfolio-wide"
        icon={<Shield className="w-5 h-5 text-cyber-purple" />}
        iconBg="bg-cyber-purple/10 border border-cyber-purple/20"
        valueClass={getGradeColor(stats.security_grade)}
        delay={0.24}
      />
    </div>
  );
}
