import { useEffect, useState, useCallback } from 'react';
import { motion as framerMotion } from 'framer-motion';
import { Shield, RefreshCw, AlertOctagon, Terminal, Clock, Database } from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import StatsCards from '@/components/dashboard/StatsCards';
import PipelineVisualizer from '@/components/dashboard/PipelineVisualizer';
import AiAnalysisSummary from '@/components/dashboard/AiAnalysisSummary';
import RiskTrendChart from '@/components/dashboard/RiskTrendChart';
import WebsiteRankings from '@/components/dashboard/WebsiteRankings';
import RecentAlerts from '@/components/dashboard/RecentAlerts';
import useStore from '@/store/useStore';
import { dashboardApi, findingsApi, scanApi, websiteApi, alertsApi, aiApi } from '@/services/api';
import type { TrendData, WebsiteRanking, Finding, Scan, Recommendation } from '@/types';
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
  const { dashboardStats, alerts, currentScan, websites, setDashboardStats, setAlerts, setWebsites, setCurrentScan } = useStore();
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [rankings, setRankings] = useState<WebsiteRanking[]>([]);
  const [criticalFindings, setCriticalFindings] = useState<Finding[]>([]);
  const [recentScans, setRecentScans] = useState<Scan[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | undefined>(undefined);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);

  // Set initial selected website
  useEffect(() => {
    if (websites.length > 0 && !selectedWebsiteId) {
      setSelectedWebsiteId(websites[0].id);
    }
  }, [websites, selectedWebsiteId]);

  const fetchRecommendation = useCallback(async (siteId: string) => {
    setLoadingRecommendation(true);
    try {
      const rec = await aiApi.getRecommendations(siteId);
      setRecommendation(rec);
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
      setRecommendation(null);
    } finally {
      setLoadingRecommendation(false);
    }
  }, []);

  // Fetch recommendation when selected website changes
  useEffect(() => {
    if (selectedWebsiteId) {
      fetchRecommendation(selectedWebsiteId);
    } else {
      setRecommendation(null);
    }
  }, [selectedWebsiteId, fetchRecommendation]);

  // Sync latest scan when selected website changes
  useEffect(() => {
    if (!selectedWebsiteId) return;

    const syncLatestScan = async () => {
      try {
        const scans = await scanApi.listByWebsite(selectedWebsiteId);
        if (scans.length > 0) {
          scans.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          setCurrentScan(scans[0]);
        } else {
          setCurrentScan(null);
        }
      } catch (err) {
        console.error('Failed to sync latest scan for website:', err);
      }
    };

    syncLatestScan();
  }, [selectedWebsiteId, setCurrentScan]);


  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [trends, ranks, findingsList, scansList, stats, newAlerts, newWebsites] = await Promise.all([
        dashboardApi.getTrends(30),
        dashboardApi.getWebsiteRankings(),
        findingsApi.listAll('critical'),
        scanApi.listAll(),
        dashboardApi.getStats(),
        alertsApi.list(),
        websiteApi.list(),
      ]);
      setTrendData(trends);
      setRankings(ranks);
      setCriticalFindings(findingsList.slice(0, 5));
      setRecentScans(scansList.slice(0, 5));
      setDashboardStats(stats);
      setAlerts(newAlerts);
      setWebsites(newWebsites);
      setDataLoaded(true);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setRefreshing(false);
    }
  }, [setDashboardStats, setAlerts, setWebsites]);

  // Initial load
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [loadData]);

  const getWebsiteName = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.name : 'Unknown Target';
  };

  const getWebsiteUrl = (websiteId: string) => {
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.url.replace(/^https?:\/\//, '') : 'target';
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
              AI-Powered Unified Attack Surface Monitor
            </h1>
            <LiveClock />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {dataLoaded && (
            <div className="flex items-center gap-1.5 text-xs text-cyber-green bg-cyber-green/10 border border-cyber-green/20 px-2.5 py-1 rounded-full">
              <Database className="w-3 h-3" />
              <span className="font-mono">LIVE DATA</span>
            </div>
          )}
          <button
            id="force-sync-btn"
            onClick={loadData}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-cyber-border text-cyber-text-dim hover:text-cyber-cyan hover:border-cyber-cyan/30 transition-all text-xs font-semibold bg-cyber-surface/35"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Force Sync
          </button>
        </div>
      </framerMotion.div>

      {/* Stats Cards (Sites, Risk, Alerts, Grade) */}
      {dashboardStats && <StatsCards stats={dashboardStats} />}

      {/* Main Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left column (2/3 width) */}
        <div className="xl:col-span-2 space-y-6">
          {/* Security Monitoring Pipeline Visualizer */}
          <PipelineVisualizer
            scan={currentScan}
            selectedWebsiteId={selectedWebsiteId}
            setSelectedWebsiteId={setSelectedWebsiteId}
            onScanComplete={() => {
              loadData();
              if (selectedWebsiteId) {
                fetchRecommendation(selectedWebsiteId);
              }
            }}
          />

          {/* AI Analysis Summary */}
          <AiAnalysisSummary
            recommendation={recommendation}
            loading={loadingRecommendation}
          />

          {/* Risk Trend Chart */}
          <RiskTrendChart data={trendData} />

          {/* Top Critical Findings & Recent Scans Side-by-Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Critical Findings */}
            <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 flex flex-col">
              <div className="flex items-center gap-2 mb-4 border-b border-cyber-border pb-3">
                <AlertOctagon className="w-4 h-4 text-cyber-red animate-pulse" />
                <h3 className="text-sm font-semibold text-cyber-text">Top Critical Findings</h3>
              </div>
              <div className="space-y-3 flex-1">
                {criticalFindings.length === 0 ? (
                  <p className="text-xs text-cyber-text-muted py-4 text-center">
                    {dataLoaded ? 'No critical security exposures active.' : 'Loading findings...'}
                  </p>
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

            {/* Recent Scans */}
            <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4 border-b border-cyber-border pb-3">
                <Terminal className="w-4 h-4 text-cyber-cyan" />
                <h3 className="text-sm font-semibold text-cyber-text">Recent Scans</h3>
              </div>
              <div className="space-y-3">
                {recentScans.length === 0 ? (
                  <p className="text-xs text-cyber-text-muted py-4 text-center">
                    {dataLoaded ? 'No recent scan history.' : 'Loading scans...'}
                  </p>
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
          {/* Connected Data Sources */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-cyber-text mb-4 pb-2 border-b border-cyber-border flex items-center gap-2">
              <Database className="w-4 h-4 text-cyber-cyan" /> Connected Data Sources
            </h3>
            <div className="space-y-3">
              {[
                { name: 'Sola Web Checker', active: dashboardStats?.connected_sources?.sola_web_checker ?? true },
                { name: 'WordPress Scanner', active: dashboardStats?.connected_sources?.wordpress_scanner ?? true },
                { name: 'Cloudflare', active: dashboardStats?.connected_sources?.cloudflare ?? true },
                { name: 'GitHub', active: dashboardStats?.connected_sources?.github ?? true },
              ].map((src) => (
                <div key={src.name} className="flex items-center justify-between p-2.5 rounded-lg bg-cyber-surface-2/45 border border-cyber-border/40">
                  <span className="text-xs text-cyber-text font-medium">{src.name}</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-cyber-green bg-cyber-green/10 border border-cyber-green/20 px-2 py-0.5 rounded-full">
                    ✓ ACTIVE
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Threat Surface Overview */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-cyber-text mb-4 pb-2 border-b border-cyber-border flex items-center gap-2">
              <Shield className="w-4 h-4 text-cyber-purple" /> Threat Surface Overview
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'External Assets', value: dashboardStats?.external_assets_count ?? 0, sub: 'Websites & IPs', color: 'text-cyber-cyan', bg: 'bg-cyber-cyan/5 border-cyber-cyan/20' },
                { label: 'Repositories', value: dashboardStats?.repositories_count ?? 0, sub: 'Connected repos', color: 'text-cyber-purple', bg: 'bg-cyber-purple/5 border-cyber-purple/20' },
                { label: 'Cloudflare Zones', value: dashboardStats?.cloudflare_zones_count ?? 0, sub: 'DNS Infrastructure', color: 'text-cyber-orange', bg: 'bg-cyber-orange/5 border-cyber-orange/20' },
                { label: 'WordPress Sites', value: dashboardStats?.wordpress_sites_count ?? 0, sub: 'CMS Deployments', color: 'text-cyber-yellow', bg: 'bg-cyber-yellow/5 border-cyber-yellow/20' },
              ].map((item) => (
                <div key={item.label} className={`p-3 rounded-lg border ${item.bg}`}>
                  <p className="text-[9px] font-semibold text-cyber-text-muted uppercase tracking-wider">{item.label}</p>
                  <p className={`text-2xl font-bold font-mono my-0.5 ${item.color}`}>{item.value}</p>
                  <p className="text-[9px] text-cyber-text-muted">{item.sub}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Risks */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-cyber-text mb-4 pb-2 border-b border-cyber-border flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-cyber-red animate-pulse" /> Top Risks
            </h3>
            <div className="space-y-2.5">
              {(dashboardStats?.top_risks || []).map((risk, idx) => {
                const getRiskColor = (index: number) => {
                  if (index === 0) return 'text-cyber-red bg-cyber-red/10 border-cyber-red/35';
                  if (index === 1) return 'text-cyber-orange bg-cyber-orange/10 border-cyber-orange/35';
                  if (index === 2) return 'text-cyber-yellow bg-cyber-yellow/10 border-cyber-yellow/35';
                  return 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/35';
                };
                return (
                  <div key={risk} className="flex items-center gap-3 p-2.5 rounded-lg bg-cyber-surface-2/45 border border-cyber-border/40">
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center font-mono text-xs font-bold shrink-0 ${getRiskColor(idx)}`}>
                      {idx + 1}
                    </span>
                    <span className="text-xs text-cyber-text font-medium truncate">{risk}</span>
                  </div>
                );
              })}
              {(!dashboardStats?.top_risks || dashboardStats.top_risks.length === 0) && (
                <p className="text-xs text-cyber-text-muted py-2 text-center">No active risks detected.</p>
              )}
            </div>
          </div>

          <RecentAlerts alerts={alerts} />
        </div>
      </div>

      {/* Website Rankings (Highest Risk Websites) */}
      {rankings.length > 0 && <WebsiteRankings rankings={rankings} />}

      {/* Empty state when no websites yet */}
      {dataLoaded && websites.length === 0 && (
        <framerMotion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-cyber-surface border border-cyber-border rounded-xl p-12 text-center"
        >
          <Shield className="w-12 h-12 text-cyber-cyan/30 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-cyber-text mb-2">No Websites Monitored Yet</h2>
          <p className="text-sm text-cyber-text-muted mb-4">
            Go to <strong className="text-cyber-cyan">Websites</strong> and add your first target URL to begin scanning.
          </p>
        </framerMotion.div>
      )}
    </div>
  );
}
