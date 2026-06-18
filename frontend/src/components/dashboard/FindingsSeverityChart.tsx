import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import type { TrendData } from '@/types';

interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
}

interface Props {
  severityCounts: SeverityCount;
  trendData: TrendData[];
}

const SEVERITY_COLORS = {
  critical: '#ff3366',
  high: '#ff8c42',
  medium: '#ffd700',
  low: '#00d4ff',
  informational: '#94a3b8',
};

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
}

function CustomPieTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold capitalize" style={{ color: item.fill }}>{item.name}</p>
      <p className="text-sm font-bold text-cyber-text font-mono">{item.value} findings</p>
    </div>
  );
}

function CustomBarTooltip({ active, payload, label }: TooltipProps & { label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-cyber-text-muted mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
          <span className="capitalize text-cyber-text-dim">{p.name}:</span>
          <span className="font-bold font-mono" style={{ color: p.fill }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function FindingsSeverityChart({ severityCounts, trendData }: Props) {
  const pieData = Object.entries(severityCounts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const barData = trendData.slice(-14).map((d) => ({
    date: d.date.slice(5),
    Critical: d.critical,
    High: d.high,
    Medium: d.medium,
    Low: d.low,
  }));

  const total = Object.values(severityCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-cyber-text">Findings Overview</h3>
        <span className="text-xs text-cyber-text-muted font-mono">{total} total</span>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div>
          <p className="text-xs text-cyber-text-muted mb-2 text-center">By Severity</p>
          <div className="relative">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={SEVERITY_COLORS[entry.name as keyof typeof SEVERITY_COLORS]}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <p className="text-xl font-bold font-mono text-cyber-text">{total}</p>
                <p className="text-xs text-cyber-text-muted">Issues</p>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-1 mt-2">
            {Object.entries(severityCounts).map(([sev, count]) => (
              <div key={sev} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] }} />
                <span className="text-xs text-cyber-text-dim capitalize truncate">{sev}</span>
                <span className="text-xs font-bold font-mono ml-auto" style={{ color: SEVERITY_COLORS[sev as keyof typeof SEVERITY_COLORS] }}>{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stacked Bar Chart */}
        <div>
          <p className="text-xs text-cyber-text-muted mb-2 text-center">14-Day Trend</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9, fontFamily: 'JetBrains Mono' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomBarTooltip />} />
              <Bar dataKey="Critical" stackId="a" fill={SEVERITY_COLORS.critical} radius={[0, 0, 0, 0]} />
              <Bar dataKey="High" stackId="a" fill={SEVERITY_COLORS.high} />
              <Bar dataKey="Medium" stackId="a" fill={SEVERITY_COLORS.medium} />
              <Bar dataKey="Low" stackId="a" fill={SEVERITY_COLORS.low} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
