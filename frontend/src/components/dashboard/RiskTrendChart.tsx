import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import type { TrendData } from '@/types';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface Props {
  data: TrendData[];
}

function getGrade(score: number) {
  if (score <= 20) return 'A';
  if (score <= 40) return 'B';
  if (score <= 60) return 'C';
  if (score <= 80) return 'D';
  return 'F';
}

function getGradeColor(grade: string) {
  if (grade === 'A') return '#00ff88';
  if (grade === 'B') return '#00d4ff';
  if (grade === 'C') return '#ffd700';
  if (grade === 'D') return '#ff8c42';
  return '#ff3366';
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const score = payload[0].value;
  const grade = getGrade(score);
  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-cyber-text-muted mb-1">
        {label ? format(parseISO(label), 'MMM d, yyyy') : ''}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-cyber-text font-mono">{score.toFixed(1)}</span>
        <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ color: getGradeColor(grade), backgroundColor: getGradeColor(grade) + '20' }}>
          {grade}
        </span>
      </div>
    </div>
  );
}

export default function RiskTrendChart({ data }: Props) {
  const latest = data[data.length - 1]?.avg_score ?? 0;
  const first = data[0]?.avg_score ?? 0;
  const delta = latest - first;
  const improved = delta < 0;

  const safeDateFormat = (val: string) => {
    try { return format(parseISO(val), 'MMM d'); } catch { return val; }
  };

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-cyber-text">Risk Score Trend</h3>
          <p className="text-xs text-cyber-text-muted">Last 30 days — portfolio average</p>
        </div>
        {data.length > 0 && (
          <div className="flex items-center gap-2">
            {improved ? (
              <TrendingDown className="w-4 h-4 text-cyber-green" />
            ) : (
              <TrendingUp className="w-4 h-4 text-cyber-red" />
            )}
            <span className={`text-sm font-bold font-mono ${improved ? 'text-cyber-green' : 'text-cyber-red'}`}>
              {improved ? '' : '+'}{delta.toFixed(1)}
            </span>
            <span className="text-xs text-cyber-text-muted">vs 30d ago</span>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-[200px] flex flex-col items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-cyber-surface-2 border border-cyber-border flex items-center justify-center opacity-40">
            <TrendingUp className="w-6 h-6 text-cyber-text-muted" />
          </div>
          <p className="text-xs text-cyber-text-muted text-center">
            No scan history yet.<br />
            Run your first scan to start tracking risk trends.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickFormatter={safeDateFormat}
              tickLine={false}
              axisLine={false}
              interval={6}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#475569', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={20} stroke="#00ff8820" strokeDasharray="4 4" label={{ value: 'A', fill: '#00ff8860', fontSize: 10 }} />
            <ReferenceLine y={40} stroke="#00d4ff20" strokeDasharray="4 4" label={{ value: 'B', fill: '#00d4ff60', fontSize: 10 }} />
            <ReferenceLine y={60} stroke="#ffd70020" strokeDasharray="4 4" label={{ value: 'C', fill: '#ffd70060', fontSize: 10 }} />
            <ReferenceLine y={80} stroke="#ff8c4220" strokeDasharray="4 4" label={{ value: 'D', fill: '#ff8c4260', fontSize: 10 }} />
            <Area
              type="monotone"
              dataKey="avg_score"
              stroke="#00d4ff"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={false}
              activeDot={{ r: 4, fill: '#00d4ff', stroke: '#0f1629', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
