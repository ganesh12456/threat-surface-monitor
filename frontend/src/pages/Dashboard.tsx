import { useEffect, useState } from 'react';
import { motion as framerMotion } from 'framer-motion';
import { Shield, RefreshCw, AlertOctagon, Terminal, Clock } from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import StatsCards from '@/components/dashboard/StatsCards';
import PipelineVisualizer from '@/components/dashboard/PipelineVisualizer';
import RiskTrendChart from '@/components/dashboard/RiskTrendChart';
import WebsiteRankings from '@/components/dashboard/WebsiteRankings';
import RecentAlerts from '@/components/dashboard/RecentAlerts';
import useStore from '@/store/useStore';
import { dashboardApi, findingsApi, scanApi } from '@/services/api';
import { MOCK_TREND_DATA, MOCK_WEBSITE_RANKINGS } from '@/services/api';
import type { TrendData, WebsiteRanking, Finding, Scan } from '@/types';
import { clsx } from 'clsx';

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <span className="font-mono text-xs text-cyber-text-muted">
      {format(time, 'PPpp')}
    </span>
  );
}

export default function Dashboard() {
  const { dashboardStats, alerts, currentScan, websites } = useStore();
  const [trendData, setTrendData] = useState<TrendData[]>(MOCK_TREND_DATA);
  const [rankings, setRankings] = useState<WebsiteRanking[]>(MOCK_WEBSITE_RANKINGS);
  const [criticalFindings, setCriticalFindings] = useState<Finding[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const selectedWebsiteId = websites[0]?.id;

  const loadData = async () => {
    setRefreshing(true);
    try {
      const [trends, ranks, findingsList, scansList] = await Promise.all([
        dashboardApi.getTrends(30),
        dashboardApi.getWebsiteRankings(),
        findingsApi.listAll('critical'),
        scanApi.listAll(),
      ]);
      setTrendData(trends);
      setRankings(ranks);
      setCriticalFindings(findingsList.slice(0, 5));
      setRecentScans(scansList.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [websites]);

  // Helper to resolve website name from ID
  const getWebsiteName = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.name : 'Unknown Target';
  };

  const getWebsiteUrl = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.url.replace('https://', '') : 'target';
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <framerMotion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyber-cyan" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-cyber-text tracking-wide uppercase">
              Website Threat Surface Monitor
            </h1>
            <LiveClock />
          </div>
        </div>
        <button
          onClick={loadData}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/30 transition-all text-xs font-semibold bg-cyber-surface/35"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Force Sync
        </button>
      </framerMotion.div>

      {/* Stats Cards (Sites, Risk, Alerts, Grade) */}
      {dashboardStats && <StatsCards stats={dashboardStats} />}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column (2/3 width) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Security Monitoring Pipeline Visualizer */}
          <PipelineVisualizer scan={currentScan} selectedWebsiteId={selectedWebsiteId} />
          
          {/* Risk Trend Chart */}
          <RiskTrendChart data={trendData} />

          {/* Top Critical Findings & Recent Scans Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Critical Findings */}
            <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4 border-b border-cyber-border pb-3">
                  <AlertOctagon className="w-4 h-4 text-cyber-red animate-pulse" />
                  <h3 className="text-sm font-semibold text-cyber-text">Top Critical Findings</h3>
                </div>
                <div className="space-y-3">
                  {criticalFindings.length === 0 ? (
                    <p className="text-xs text-cyber-text-muted py-4 text-center">No critical security exposures active.</p>
                  ) : (
                    criticalFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="p-3 rounded-lg border border-cyber-red/20 bg-cyber-red/5 flex flex-col gap-1 hover:border-cyber-red/40 transition-all"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyber-red bg-cyber-red/15 px-2 py-0.5 rounded border border-cyber-red/30">
                            Critical
                          </span>
                          <span className="text-[10px] font-mono text-cyber-text-muted">
                            {getWebsiteUrl(finding.website_id)}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-cyber-text truncate mt-1">
                          {finding.title}
                        </p>
                        <p className="text-[10px] text-cyber-text-dim line-clamp-2">
                          {finding.description}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Recent Scans */}
            <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4 border-b border-cyber-border pb-3">
                <Terminal className="w-4 h-4 text-cyber-cyan" />
                <h3 className="text-sm font-semibold text-cyber-text">Recent Scans</h3>
              </div>
              <div className="space-y-3">
                {recentScans.length === 0 ? (
                  <p className="text-xs text-cyber-text-muted py-4 text-center">No recent scan history.</p>
                ) : (
                  recentScans.map((scan) => (
                    <div
                      key={scan.id}
                      className="p-3 rounded-lg border border-cyber-border bg-cyber-surface-2/45 flex items-center justify-between gap-3 hover:border-cyber-cyan/30 transition-all"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-cyber-text truncate">
                          {getWebsiteName(scan.website_id)}
                        </p>
                        <p className="text-[9px] text-cyber-text-muted font-mono flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {scan.started_at
                            ? formatDistanceToNow(parseISO(scan.started_at), { addSuffix: true })
                            : 'Pending'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span
                          className={clsx(
                            'text-[9px] font-bold uppercase px-2 py-0.5 rounded border',
                            scan.status === 'completed' && 'text-cyber-green bg-cyber-green/10 border-cyber-green/20',
                            scan.status === 'running' && 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/20 animate-pulse',
                            scan.status === 'failed' && 'text-cyber-red bg-cyber-red/10 border-cyber-red/20',
                            scan.status === 'pending' && 'text-cyber-text-muted bg-cyber-surface-2 border-cyber-border'
                          )}
                        >
                          {scan.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right column (1/3 width) */}
        <div className="space-y-6">
          <RecentAlerts alerts={alerts} />
        </div>
      </div>

      {/* Website Rankings (Highest Risk Websites) */}
      <WebsiteRankings rankings={rankings} />
    </div>
  );
}
