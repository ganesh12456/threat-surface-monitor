import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, ChevronDown, ChevronUp, Search,
  CheckCircle, ArrowUpRight, ShieldAlert,
  Loader2, RefreshCw, Filter, Shield, Clock
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { findingsApi } from '@/services/api';
import useStore from '@/store/useStore';
import type { Finding } from '@/types';

function getSeverityBadgeClass(severity: string) {
  const map: Record<string, string> = {
    critical: 'cyber-badge-critical',
    high: 'cyber-badge-high',
    medium: 'cyber-badge-medium',
    low: 'cyber-badge-low',
    informational: 'cyber-badge-informational',
  };
  return map[severity] ?? map['cyber-badge-informational'];
}

function FindingRow({
  finding,
  websiteName,
  websiteUrl,
}: {
  finding: Finding;
  websiteName: string;
  websiteUrl: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  return (
    <div className="border-b border-cyber-border/50 last:border-0">
      <div
        className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 px-5 py-4 hover:bg-cyber-surface-2/50 cursor-pointer transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 shrink-0">
          <span className={getSeverityBadgeClass(finding.severity)}>{finding.severity}</span>
          {finding.cvss_score && (
            <span className="text-xs font-mono font-bold text-cyber-orange">CVSS {finding.cvss_score}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-cyber-text truncate">{finding.title}</p>
            {finding.is_new && (
              <span className="text-[10px] bg-cyber-cyan/15 text-cyber-cyan border border-cyber-cyan/30 px-1.5 py-0.5 rounded-full font-bold">
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-cyber-text-muted mt-0.5">
            <span>{finding.category}</span>
            <span>•</span>
            <span className="text-cyber-cyan-dim font-mono">{websiteUrl}</span>
            <span>•</span>
            <span className="font-semibold text-cyber-text-dim">{websiteName}</span>
          </div>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 text-xs mt-2 md:mt-0">
          <span className="text-cyber-text-muted flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(parseISO(finding.first_seen_at), { addSuffix: true })}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-cyber-text-muted shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-cyber-text-muted shrink-0" />
          )}
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-2 space-y-4 bg-cyber-surface-2/30 border-t border-cyber-border/30">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">
                      Description
                    </p>
                    <p className="text-sm text-cyber-text-dim leading-relaxed">{finding.description}</p>
                  </div>
                  {finding.affected_url && (
                    <div>
                      <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">
                        Affected URL
                      </p>
                      <p className="text-xs font-mono text-cyber-cyan bg-cyber-surface rounded-lg px-3 py-2 border border-cyber-border break-all">
                        {finding.affected_url}
                      </p>
                    </div>
                  )}
                  {finding.evidence && (
                    <div>
                      <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1">
                        Evidence
                      </p>
                      <pre className="text-xs font-mono text-cyber-text-dim bg-cyber-surface rounded-lg px-3 py-2 border border-cyber-border whitespace-pre-wrap break-all">
                        {finding.evidence}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {finding.remediation && (
                    <div>
                      <p className="text-xs font-semibold text-cyber-green uppercase tracking-wider mb-1">
                        Remediation
                      </p>
                      <p className="text-xs text-cyber-text-dim leading-relaxed bg-cyber-green/5 border border-cyber-green/20 rounded-lg px-3 py-3 font-sans">
                        {finding.remediation}
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      onClick={() => navigate(`/websites/${finding.website_id}`)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-cyber-cyan border border-cyber-cyan/30 bg-cyber-cyan/5 rounded-lg hover:bg-cyber-cyan/15 hover:border-cyber-cyan/50 transition-all shadow-cyber-cyan/5"
                    >
                      View Target Details <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Findings() {
  const { websites } = useStore();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'fixed'>('all');

  const loadFindings = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const allFindings = await findingsApi.listAll();
      setFindings(allFindings);
    } catch (err) {
      console.error('Failed to load findings:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFindings();
  }, []);

  const getWebsiteName = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.name : 'Unknown Target';
  };

  const getWebsiteUrl = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.url.replace('https://', '') : 'target';
  };

  // Metrics calculations (unfiltered findings)
  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const highCount = findings.filter((f) => f.severity === 'high').length;
  const mediumCount = findings.filter((f) => f.severity === 'medium').length;
  const lowCount = findings.filter((f) => f.severity === 'low' || f.severity === 'informational').length;

  // Filtered findings list
  const filteredFindings = findings.filter((f) => {
    // Search filter
    const matchesSearch =
      f.title.toLowerCase().includes(search.toLowerCase()) ||
      f.category.toLowerCase().includes(search.toLowerCase()) ||
      f.description.toLowerCase().includes(search.toLowerCase()) ||
      getWebsiteName(f.website_id).toLowerCase().includes(search.toLowerCase()) ||
      getWebsiteUrl(f.website_id).toLowerCase().includes(search.toLowerCase());

    // Severity filter
    const matchesSeverity =
      severityFilter === 'all' ||
      (severityFilter === 'low'
        ? f.severity === 'low' || f.severity === 'informational'
        : f.severity === severityFilter);

    // Status filter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' ? !f.is_fixed : f.is_fixed);

    return matchesSearch && matchesSeverity && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyber-red/10 border border-cyber-red/20 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-cyber-red animate-pulse" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-cyber-text tracking-wide uppercase">
              Global Vulnerability Findings
            </h1>
            <p className="text-xs text-cyber-text-muted font-mono">
              Total Exposures Detected: {findings.length}
            </p>
          </div>
        </div>

        <button
          onClick={() => loadFindings(true)}
          disabled={refreshing || loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/30 transition-all text-xs font-semibold bg-cyber-surface/35"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          Sync findings
        </button>
      </div>

      {/* Stats row */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-cyber-surface border border-cyber-border rounded-xl h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Critical',
              count: criticalCount,
              color: 'text-cyber-red',
              border: 'border-cyber-red/20 hover:border-cyber-red/35',
              bg: 'bg-cyber-red/5',
              shadow: 'hover:shadow-cyber-red/5',
              desc: 'Immediate Fix Required',
            },
            {
              label: 'High',
              count: highCount,
              color: 'text-cyber-orange',
              border: 'border-cyber-orange/20 hover:border-cyber-orange/35',
              bg: 'bg-cyber-orange/5',
              shadow: 'hover:shadow-cyber-orange/5',
              desc: 'High Priority Exposure',
            },
            {
              label: 'Medium',
              count: mediumCount,
              color: 'text-cyber-yellow',
              border: 'border-cyber-yellow/20 hover:border-cyber-yellow/35',
              bg: 'bg-cyber-yellow/5',
              shadow: 'hover:shadow-cyber-yellow/5',
              desc: 'Routine Patch Window',
            },
            {
              label: 'Low / Info',
              count: lowCount,
              color: 'text-cyber-cyan',
              border: 'border-cyber-cyan/20 hover:border-cyber-cyan/35',
              bg: 'bg-cyber-cyan/5',
              shadow: 'hover:shadow-cyber-cyan/5',
              desc: 'Best Practice Recommendations',
            },
          ].map((card) => (
            <div
              key={card.label}
              className={clsx(
                'bg-cyber-surface border rounded-xl p-4 transition-all duration-300 hover:shadow-lg cursor-pointer',
                card.border,
                card.shadow,
                severityFilter === card.label.toLowerCase().split(' ')[0] && 'bg-cyber-surface-2 ring-1 ring-cyber-cyan/20'
              )}
              onClick={() => {
                const cleanKey = card.label.toLowerCase().split(' ')[0] as any;
                setSeverityFilter(severityFilter === cleanKey ? 'all' : cleanKey);
              }}
            >
              <div className="flex justify-between items-start">
                <span className="text-xs text-cyber-text-dim font-medium">{card.label}</span>
                <span className={clsx('text-xs font-bold font-mono px-2 py-0.5 rounded', card.bg, card.color)}>
                  {Math.round((card.count / (findings.length || 1)) * 100)}%
                </span>
              </div>
              <p className={clsx('text-2xl font-bold font-mono mt-1.5', card.color)}>{card.count}</p>
              <p className="text-[10px] text-cyber-text-muted truncate mt-0.5 font-sans">{card.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* Main Filter & List Section */}
      <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
        {/* Filter Toolbar */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-5 border-b border-cyber-border/70 bg-cyber-surface-2/15">
          {/* Left panel: Search & Filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
              <input
                type="text"
                placeholder="Search by vulnerability title, category, URL, website name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-cyber-surface-2/65 border border-cyber-border rounded-lg pl-10 pr-4 py-2 text-xs text-cyber-text placeholder:text-cyber-text-muted focus:outline-none focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/20 w-full transition-all"
              />
            </div>

            {/* Severity Tabs */}
            <div className="flex items-center border border-cyber-border rounded-lg p-0.5 bg-cyber-surface-2/30">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setSeverityFilter(level)}
                  className={clsx(
                    'px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-all',
                    severityFilter === level
                      ? 'bg-cyber-cyan text-cyber-bg'
                      : 'text-cyber-text-dim hover:text-cyber-text'
                  )}
                >
                  {level === 'low' ? 'Low/Info' : level}
                </button>
              ))}
            </div>
          </div>

          {/* Right panel: Status */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-cyber-text-muted flex items-center gap-1 font-mono">
              <Filter className="w-3.5 h-3.5 text-cyber-text-muted" /> Status:
            </span>
            <div className="flex items-center border border-cyber-border rounded-lg p-0.5 bg-cyber-surface-2/30">
              {(['all', 'active', 'fixed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={clsx(
                    'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider rounded transition-all',
                    statusFilter === status
                      ? 'bg-cyber-surface-2 text-cyber-cyan border border-cyber-cyan/20'
                      : 'text-cyber-text-dim hover:text-cyber-text'
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Findings List */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-cyber-cyan animate-spin" />
            <p className="text-xs text-cyber-text-muted font-mono">Scanning findings vault...</p>
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="p-16 text-center">
            <CheckCircle className="w-12 h-12 text-cyber-green/30 mx-auto mb-3" />
            <p className="text-sm font-semibold text-cyber-text">No matching exposures found</p>
            <p className="text-xs text-cyber-text-muted mt-1 max-w-sm mx-auto font-sans">
              All filters cleared or no active items detected matching your query params.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-cyber-border/40">
            {filteredFindings.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                websiteName={getWebsiteName(finding.website_id)}
                websiteUrl={getWebsiteUrl(finding.website_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
