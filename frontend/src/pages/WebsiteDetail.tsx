import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Play, FileText, ExternalLink, Brain, Shield,
  Lock, Server, Globe, ChevronDown, ChevronUp, CheckCircle,
  AlertTriangle, Clock, Loader2, Activity, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import toast from 'react-hot-toast';
import { websiteApi, findingsApi, scanApi, riskApi, aiApi, dashboardApi } from '@/services/api';
import type { Website, Finding, RiskScore, Recommendation, Scan, TrendData } from '@/types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function getGradeStyle(grade: string) {
  const map: Record<string, string> = {
    A: 'text-cyber-green border-cyber-green/40',
    B: 'text-cyber-cyan border-cyber-cyan/40',
    C: 'text-cyber-yellow border-cyber-yellow/40',
    D: 'text-cyber-orange border-cyber-orange/40',
    F: 'text-cyber-red border-cyber-red/40',
  };
  return map[grade] ?? map['C'];
}

function getSeverityBadgeClass(severity: string) {
  const map: Record<string, string> = {
    critical: 'cyber-badge-critical',
    high: 'cyber-badge-high',
    medium: 'cyber-badge-medium',
    low: 'cyber-badge-low',
    informational: 'cyber-badge-informational',
  };
  return map[severity] ?? map['informational'];
}

function FindingRow({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-cyber-border/50 last:border-0">
      <div
        className="flex items-center gap-4 px-5 py-3.5 hover:bg-cyber-surface-2/50 cursor-pointer transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={getSeverityBadgeClass(finding.severity)}>{finding.severity}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-cyber-text truncate">{finding.title}</p>
            {finding.is_new && (
              <span className="text-xs bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/30 px-1.5 py-0.5 rounded-full font-semibold">NEW</span>
            )}
          </div>
          <p className="text-xs text-cyber-text-muted">{finding.category}</p>
        </div>
        {finding.cvss_score && (
          <span className="text-xs font-mono font-bold text-cyber-orange">CVSS {finding.cvss_score}</span>
        )}
        <span className="text-xs text-cyber-text-muted hidden sm:block">
          {formatDistanceToNow(parseISO(finding.first_seen_at), { addSuffix: true })}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-cyber-text-muted shrink-0" /> : <ChevronDown className="w-4 h-4 text-cyber-text-muted shrink-0" />}
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 space-y-4 bg-cyber-surface-2/30">
              <div>
                <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">Description</p>
                <p className="text-sm text-cyber-text-dim leading-relaxed">{finding.description}</p>
              </div>
              {finding.affected_url && (
                <div>
                  <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">Affected URL</p>
                  <p className="text-xs font-mono text-cyber-cyan bg-cyber-surface rounded-lg px-3 py-2 border border-cyber-border">{finding.affected_url}</p>
                </div>
              )}
              {finding.evidence && (
                <div>
                  <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">Evidence</p>
                  <p className="text-xs font-mono text-cyber-text-dim bg-cyber-surface rounded-lg px-3 py-2 border border-cyber-border">{finding.evidence}</p>
                </div>
              )}
              {finding.remediation && (
                <div>
                  <p className="text-xs font-semibold text-cyber-green uppercase tracking-wider mb-1">Remediation</p>
                  <p className="text-sm text-cyber-text-dim leading-relaxed bg-cyber-green/5 border border-cyber-green/20 rounded-lg px-3 py-2">{finding.remediation}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type TabKey = 'overview' | 'findings' | 'technical' | 'ai' | 'history';

export default function WebsiteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [website, setWebsite] = useState<Website | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [riskScore, setRiskScore] = useState<RiskScore | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const loadData = async () => {
      setLoading(true);
      const [w, f, rs, ai, s] = await Promise.all([
        websiteApi.get(id),
        findingsApi.listByWebsite(id),
        riskApi.getLatest(id),
        aiApi.getRecommendations(id),
        scanApi.listByWebsite(id),
      ]);
      setWebsite(w);
      setFindings(f);
      setRiskScore(rs);
      setRecommendation(ai);
      setScans(s);

      // Load trend data for this website
      try {
        const trends = await dashboardApi.getTrends(30);
        setTrendData(trends);
      } catch {
        setTrendData([]);
      }

      setLoading(false);
    };
    loadData();
  }, [id]);

  const handleScan = async () => {
    if (!id) return;
    setScanning(true);
    try {
      await scanApi.triggerScan(id);
      toast.success('Scan started!');
    } catch {
      toast.error('Failed to start scan');
    } finally {
      setTimeout(() => setScanning(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-cyber-cyan animate-spin" />
      </div>
    );
  }

  if (!website) {
    return (
      <div className="text-center py-16">
        <p className="text-cyber-text-muted">Website not found</p>
      </div>
    );
  }

  const fc = website.finding_counts;
  const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Activity className="w-3.5 h-3.5" /> },
    { key: 'findings', label: `Findings (${findings.length})`, icon: <AlertTriangle className="w-3.5 h-3.5" /> },
    { key: 'technical', label: 'Technical Details', icon: <Server className="w-3.5 h-3.5" /> },
    { key: 'ai', label: 'AI Risk Analysis', icon: <Brain className="w-3.5 h-3.5" /> },
    { key: 'history', label: 'Scan History', icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/websites')}
        className="flex items-center gap-2 text-xs text-cyber-text-dim hover:text-cyber-cyan transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Inventory
      </button>

      {/* Header card */}
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-6">
        <div className="flex flex-wrap items-start gap-6">
          {/* Site info */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-cyber-surface-2 border border-cyber-border flex items-center justify-center shrink-0">
              <span className="text-xl font-bold text-cyber-text-dim">{website.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-cyber-text">{website.name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <a href={website.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-cyber-cyan font-mono flex items-center gap-1 hover:underline"
                  onClick={(e) => e.stopPropagation()}>
                  {website.url} <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {website.last_scan_at && (
                <p className="text-xs text-cyber-text-muted mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last scanned {formatDistanceToNow(parseISO(website.last_scan_at), { addSuffix: true })}
                </p>
              )}
            </div>
          </div>

          {/* Score + Grade */}
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-center">
              <p className="text-xs text-cyber-text-muted mb-1">Risk Score</p>
              <p className={clsx('text-4xl font-bold font-mono',
                (website.last_risk_score ?? 0) <= 30 ? 'text-cyber-green' :
                (website.last_risk_score ?? 0) <= 50 ? 'text-cyber-cyan' :
                (website.last_risk_score ?? 0) <= 70 ? 'text-cyber-yellow' :
                (website.last_risk_score ?? 0) <= 85 ? 'text-cyber-orange' : 'text-cyber-red'
              )}>
                {website.last_risk_score ?? 'N/A'}
              </p>
            </div>
            {website.last_grade && (
              <div className="text-center">
                <p className="text-xs text-cyber-text-muted mb-1">Grade</p>
                <p className={clsx('text-5xl font-bold font-mono border-b-2 pb-1', getGradeStyle(website.last_grade))}>
                  {website.last_grade}
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleScan}
              disabled={scanning}
              className="cyber-btn-primary flex items-center gap-2 text-sm"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Scan Now
            </button>
            <button className="cyber-btn-secondary flex items-center gap-2 text-sm">
              <FileText className="w-4 h-4" /> Download Report
            </button>
          </div>
        </div>

        {/* Finding count mini-cards */}
        {fc && (
          <div className="grid grid-cols-5 gap-3 mt-6 pt-6 border-t border-cyber-border">
            {[
              { label: 'Critical', count: fc.critical, color: 'text-cyber-red', bg: 'bg-cyber-red/10 border-cyber-red/20' },
              { label: 'High', count: fc.high, color: 'text-cyber-orange', bg: 'bg-cyber-orange/10 border-cyber-orange/20' },
              { label: 'Medium', count: fc.medium, color: 'text-cyber-yellow', bg: 'bg-cyber-yellow/10 border-cyber-yellow/20' },
              { label: 'Low', count: fc.low, color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/10 border-cyber-cyan/20' },
              { label: 'Info', count: fc.informational, color: 'text-cyber-text-muted', bg: 'bg-cyber-surface-2 border-cyber-border' },
            ].map(({ label, count, color, bg }) => (
              <div key={label} className={clsx('rounded-xl border p-3 text-center', bg)}>
                <p className={clsx('text-2xl font-bold font-mono', color)}>{count}</p>
                <p className="text-xs text-cyber-text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scan Flow Pipeline Visualizer */}
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
        <h3 className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-4">Scan Flow</h3>
        <div className="flex items-center justify-between gap-2 overflow-x-auto py-2">
          {[
            { label: 'Website', sub: 'Target Site', status: 'completed' },
            { label: 'Scanner', sub: '7 Async Modules', status: website.last_scan_at ? 'completed' : 'pending' },
            { label: 'Sola MCP', sub: 'Security Overlay', status: website.last_scan_at ? 'completed' : 'pending' },
            { label: 'Analysis', sub: 'AI Risk Engine', status: website.last_scan_at ? 'completed' : 'pending' },
            { label: 'Storage', sub: 'Supabase Sync', status: website.last_scan_at ? 'completed' : 'pending' },
          ].map((step, idx, arr) => (
            <div key={step.label} className="flex items-center gap-4 flex-1">
              <div className={clsx(
                'flex flex-col items-center p-3 rounded-lg border flex-1 text-center min-w-[120px]',
                step.status === 'completed'
                  ? 'border-cyber-cyan/45 bg-cyber-cyan/5 text-cyber-cyan'
                  : 'border-cyber-border bg-cyber-surface-2/30 text-cyber-text-muted'
              )}>
                <span className="text-xs font-bold">{step.label}</span>
                <span className="text-[10px] text-cyber-text-muted mt-0.5">{step.sub}</span>
              </div>
              {idx < arr.length - 1 && (
                <span className={clsx('text-xs font-mono font-bold shrink-0', step.status === 'completed' ? 'text-cyber-cyan' : 'text-cyber-border')}>➔</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-cyber-border">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all',
                activeTab === tab.key
                  ? 'border-cyber-cyan text-cyber-cyan'
                  : 'border-transparent text-cyber-text-dim hover:text-cyber-text hover:border-cyber-border'
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cyber-text mb-4">Risk Trend — Last 30 Days</h3>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={trendData.slice(-30)} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="wsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00d4ff" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} interval={6}
                      tickFormatter={(v) => v.slice(5)} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0f1629', border: '1px solid #1e2d4e', borderRadius: '8px', fontSize: '12px' }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Area type="monotone" dataKey="avg_score" stroke="#00d4ff" strokeWidth={2} fill="url(#wsTrend)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                {trendData.length === 0 && (
                  <p className="text-xs text-cyber-text-muted text-center py-4">No trend data yet — run a scan to start tracking.</p>
                )}
              </div>

              {/* Recent findings preview */}
              <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-cyber-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-cyber-text">Recent Findings</h3>
                  <button onClick={() => setActiveTab('findings')} className="text-xs text-cyber-cyan hover:underline font-semibold">
                    View all
                  </button>
                </div>
                <div className="divide-y divide-cyber-border/50">
                  {findings.slice(0, 5).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                      <span className={getSeverityBadgeClass(f.severity)}>{f.severity}</span>
                      <span className="text-sm text-cyber-text flex-1 truncate">{f.title}</span>
                      {f.is_new && <span className="text-xs text-cyber-cyan font-mono font-bold">NEW</span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FINDINGS TAB */}
          {activeTab === 'findings' && (
            <div className="space-y-6">
              {[
                { key: 'critical', label: 'Critical', color: 'text-cyber-red', icon: '🔴' },
                { key: 'high', label: 'High', color: 'text-cyber-orange', icon: '🟠' },
                { key: 'medium', label: 'Medium', color: 'text-cyber-yellow', icon: '🟡' },
                { key: 'low', label: 'Low / Info', color: 'text-cyber-cyan', icon: '🔵' },
              ].map((group) => {
                const groupFindings = findings.filter(f => 
                  group.key === 'low'
                    ? f.severity === 'low' || f.severity === 'informational'
                    : f.severity === group.key
                );

                if (groupFindings.length === 0) return null;

                return (
                  <div key={group.key} className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-cyber-border/50 bg-cyber-surface-2/30 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{group.icon}</span>
                        <h4 className={clsx('text-xs font-bold uppercase tracking-wider', group.color)}>
                          {group.label} Findings ({groupFindings.length})
                        </h4>
                      </div>
                    </div>
                    <div className="divide-y divide-cyber-border/50">
                      {groupFindings.map((f) => <FindingRow key={f.id} finding={f} />)}
                    </div>
                  </div>
                );
              })}

              {findings.length === 0 && (
                <div className="bg-cyber-surface border border-cyber-border rounded-xl p-12 text-center">
                  <CheckCircle className="w-10 h-10 text-cyber-green/40 mx-auto mb-2" />
                  <p className="text-sm text-cyber-text-muted">No security findings active.</p>
                </div>
              )}
            </div>
          )}

          {/* TECHNICAL TAB */}
          {activeTab === 'technical' && (() => {
            // Derive check results from actual findings
            const hasCategory = (cat: string) => findings.some(f => f.category?.toLowerCase().includes(cat.toLowerCase()));
            const hasFinding = (keyword: string) => findings.some(f =>
              f.title?.toLowerCase().includes(keyword.toLowerCase()) ||
              f.description?.toLowerCase().includes(keyword.toLowerCase())
            );

            const sections = [
              {
                title: 'Security Headers', icon: <Shield className="w-4 h-4 text-cyber-cyan" />,
                items: [
                  { label: 'Content-Security-Policy', pass: !hasFinding('Content-Security-Policy') },
                  { label: 'X-Frame-Options', pass: !hasFinding('X-Frame-Options') },
                  { label: 'X-Content-Type-Options', pass: !hasFinding('X-Content-Type-Options') },
                  { label: 'Strict-Transport-Security (HSTS)', pass: !hasFinding('Strict-Transport-Security') && !hasFinding('HSTS') },
                  { label: 'Referrer-Policy', pass: !hasFinding('Referrer-Policy') },
                  { label: 'Permissions-Policy', pass: !hasFinding('Permissions-Policy') },
                ],
              },
              {
                title: 'SSL / TLS', icon: <Lock className="w-4 h-4 text-cyber-green" />,
                items: [
                  { label: 'Valid Certificate', pass: !hasFinding('certificate') && !hasFinding('SSL') },
                  { label: 'TLS 1.3 Supported', pass: !hasFinding('TLS 1.3') },
                  { label: 'TLS 1.2 Supported', pass: !hasFinding('TLS 1.2') },
                  { label: 'TLS 1.0/1.1 Disabled', pass: !hasFinding('TLS 1.0') && !hasFinding('TLS 1.1') },
                  { label: 'HSTS Enabled', pass: !hasFinding('HSTS') },
                  { label: 'Mixed Content', pass: !hasFinding('Mixed Content') },
                ],
              },
              {
                title: 'DNS Records', icon: <Globe className="w-4 h-4 text-cyber-purple" />,
                items: [
                  { label: 'SPF Record', pass: !hasFinding('SPF') },
                  { label: 'DMARC Record', pass: !hasFinding('DMARC') },
                  { label: 'DKIM Record', pass: !hasFinding('DKIM') },
                  { label: 'DNSSEC', pass: !hasFinding('DNSSEC') },
                  { label: 'CAA Record', pass: !hasFinding('CAA') },
                ],
              },
              {
                title: 'WordPress', icon: <Zap className="w-4 h-4 text-cyber-orange" />,
                items: [
                  { label: 'WordPress Detected', pass: !hasCategory('WordPress') },
                  { label: 'Core Up-to-date', pass: !hasFinding('WordPress Core') && !hasFinding('outdated') },
                  { label: 'Admin URL Hidden', pass: !hasFinding('wp-admin') && !hasFinding('admin') },
                  { label: 'Debug Mode Off', pass: !hasFinding('debug') },
                  { label: 'File Editing Disabled', pass: !hasFinding('file edit') },
                ],
              },
            ];

            return (
              <div className="space-y-4">
                {findings.length === 0 && (
                  <div className="bg-cyber-yellow/5 border border-cyber-yellow/20 rounded-xl px-4 py-3 text-xs text-cyber-yellow flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    No scan data available yet. Run a scan first to see technical results.
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {sections.map((section) => (
                    <div key={section.title} className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-5 py-3 border-b border-cyber-border">
                        {section.icon}
                        <h3 className="text-sm font-semibold text-cyber-text">{section.title}</h3>
                        <span className="ml-auto text-[10px] font-mono text-cyber-text-muted">
                          {section.items.filter(i => i.pass).length}/{section.items.length} pass
                        </span>
                      </div>
                      <div className="divide-y divide-cyber-border/50">
                        {section.items.map((item) => (
                          <div key={item.label} className="flex items-center justify-between px-5 py-2.5">
                            <span className="text-sm text-cyber-text-dim">{item.label}</span>
                            {item.pass ? (
                              <span className="flex items-center gap-1 text-xs text-cyber-green font-semibold">
                                <CheckCircle className="w-3.5 h-3.5" /> Pass
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-cyber-red font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5" /> Fail
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* AI ANALYSIS TAB */}
          {activeTab === 'ai' && recommendation && (
            <div className="space-y-5">
              {/* MCP badge */}
              <div className="flex items-center gap-3 bg-cyber-purple/10 border border-cyber-purple/30 rounded-xl px-5 py-3">
                <Brain className="w-5 h-5 text-cyber-purple animate-pulse" />
                <div>
                  <p className="text-sm font-semibold text-cyber-purple">Powered by Sola MCP Intelligence</p>
                  <p className="text-xs text-cyber-text-muted">AI-generated security analysis via Model Context Protocol</p>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cyber-text mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyber-cyan" /> Executive Summary
                </h3>
                <p className="text-sm text-cyber-text-dim leading-relaxed">{recommendation.executive_summary}</p>
              </div>

              {/* Recommended Actions */}
              <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cyber-text mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-cyber-green" /> Recommended Actions
                </h3>
                <ol className="space-y-3 font-mono text-xs">
                  {recommendation.remediation_steps.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-3 p-3 bg-cyber-surface-2/40 rounded-lg border border-cyber-border">
                      <span className="text-cyber-green font-bold shrink-0">{idx + 1}.</span>
                      <div className="flex-1">
                        <span className="text-cyber-text font-semibold">{step.action}</span>
                        <div className="flex gap-4 mt-1.5 text-[10px] text-cyber-text-muted">
                          <span>Effort: {step.effort}</span>
                          <span>Impact: {step.impact}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Top Risks */}
              <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cyber-text mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-cyber-red" /> Top Risks
                </h3>
                <div className="space-y-2">
                  {recommendation.top_risks.map((risk, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-cyber-surface-2/50 rounded-lg border border-cyber-border/50">
                      <span className="text-xs font-bold font-mono text-cyber-text-muted w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={getSeverityBadgeClass(risk.severity)}>{risk.severity}</span>
                          <p className="text-sm font-medium text-cyber-text">{risk.title}</p>
                        </div>
                        <p className="text-xs text-cyber-text-muted">{risk.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Business Impact */}
              <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
                <h3 className="text-sm font-semibold text-cyber-text mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyber-orange" /> Business Impact
                </h3>
                <p className="text-sm text-cyber-text-dim leading-relaxed">{recommendation.business_impact}</p>
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {activeTab === 'history' && (
            <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-cyber-border">
                <h3 className="text-sm font-semibold text-cyber-text">Scan History</h3>
              </div>
              {scans.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="w-10 h-10 text-cyber-text-muted/30 mx-auto mb-2" />
                  <p className="text-sm text-cyber-text-muted">No scans yet</p>
                </div>
              ) : (
                <div className="divide-y divide-cyber-border/50">
                  {scans.map((scan) => (
                    <div key={scan.id} className="flex items-center gap-4 px-5 py-4">
                      <div className={clsx('w-2 h-2 rounded-full',
                        scan.status === 'completed' ? 'bg-cyber-green' :
                        scan.status === 'running' ? 'bg-cyber-cyan animate-pulse' :
                        scan.status === 'failed' ? 'bg-cyber-red' : 'bg-cyber-text-muted'
                      )} />
                      <div className="flex-1">
                        <p className="text-sm font-mono text-cyber-text">{scan.id}</p>
                        <p className="text-xs text-cyber-text-muted">
                          {scan.started_at ? format(parseISO(scan.started_at), 'MMM d, yyyy HH:mm') : 'Pending'}
                        </p>
                      </div>
                      <span className={clsx('text-xs font-semibold uppercase',
                        scan.status === 'completed' ? 'text-cyber-green' :
                        scan.status === 'running' ? 'text-cyber-cyan' :
                        scan.status === 'failed' ? 'text-cyber-red' : 'text-cyber-text-muted'
                      )}>
                        {scan.status}
                      </span>
                      {scan.duration_seconds && (
                        <span className="text-xs text-cyber-text-muted font-mono">{scan.duration_seconds}s</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
