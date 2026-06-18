import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Download, Calendar, Globe, Loader2,
  FileSpreadsheet, BarChart3, ClipboardList,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';
import { reportsApi } from '@/services/api';
import type { Report } from '@/types';

export default function Reports() {
  const { websites } = useStore();
  const [reportType, setReportType] = useState('executive');
  const [reportFormat, setReportFormat] = useState('PDF');
  const [websiteId, setWebsiteId] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const list = await reportsApi.list();
      // Sort: newest first
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setReports(list);
    } catch (err) {
      console.error('Failed to load reports:', err);
      toast.error('Failed to load reports list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleGenerate = async () => {
    if (websiteId === 'all') {
      toast.error('Please select a specific website to generate a report');
      return;
    }
    setGenerating(true);
    try {
      const fmt = reportFormat.toLowerCase();
      const newReport = await reportsApi.generate({
        website_id: websiteId,
        report_type: reportType,
        format: fmt,
      });
      setReports((prev) => [newReport, ...prev]);
      toast.success('Report generated successfully!');
    } catch (err: any) {
      console.error('Failed to generate report:', err);
      toast.error(err?.response?.data?.detail || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (report: Report) => {
    const id = toast.loading(`Downloading report...`);
    try {
      const blob = await reportsApi.download(report.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const website = websites.find(w => w.id === report.website_id);
      const siteName = website ? website.name.replace(/[^a-zA-Z0-9]/g, '_') : 'target';
      const dateStr = format(new Date(report.created_at), 'yyyy-MM-dd');
      const ext = report.format.toLowerCase();
      
      link.setAttribute('download', `threat_report_${siteName}_${report.report_type}_${dateStr}.${ext}`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('Download completed!', { id });
    } catch (err) {
      console.error('Failed to download report:', err);
      toast.error('Failed to download report file', { id });
    }
  };

  const getReportName = (report: Report) => {
    const typeStr = report.report_type.charAt(0).toUpperCase() + report.report_type.slice(1);
    const fmtStr = report.format.toUpperCase();
    return `${typeStr} ${fmtStr} Report`;
  };

  const getWebsiteName = (websiteId?: string) => {
    if (!websiteId) return 'All Websites';
    const site = websites.find((w) => w.id === websiteId);
    return site ? site.name : 'Unknown Target';
  };

  const filteredReports = websiteId === 'all'
    ? reports
    : reports.filter((r) => r.website_id === websiteId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-cyber-text">Reports</h1>
        <p className="text-xs text-cyber-text-muted">Generate and download security reports</p>
      </div>

      {/* Report Generator */}
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-cyber-text mb-5 flex items-center gap-2">
          <FileText className="w-4 h-4 text-cyber-cyan" />
          Generate New Report
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {/* Report Type */}
          <div>
            <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-2">Report Type</label>
            <div className="space-y-2">
              {[
                { value: 'executive', label: 'Executive Summary', icon: <ClipboardList className="w-4 h-4" /> },
                { value: 'technical', label: 'Technical Detail', icon: <BarChart3 className="w-4 h-4" /> },
              ].map((type) => (
                <button
                  key={type.value}
                  onClick={() => setReportType(type.value)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all text-left',
                    reportType === type.value
                      ? 'bg-cyber-cyan/10 border-cyber-cyan/40 text-cyber-cyan'
                      : 'bg-cyber-surface-2 border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/20'
                  )}
                >
                  {type.icon} {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Format */}
          <div>
            <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-2">Format</label>
            <div className="space-y-2">
              {[
                { value: 'PDF', label: 'PDF Document', icon: <FileText className="w-4 h-4" /> },
                { value: 'CSV', label: 'CSV Export', icon: <FileSpreadsheet className="w-4 h-4" /> },
              ].map((fmt) => (
                <button
                  key={fmt.value}
                  onClick={() => setReportFormat(fmt.value)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all text-left',
                    reportFormat === fmt.value
                      ? 'bg-cyber-cyan/10 border-cyber-cyan/40 text-cyber-cyan'
                      : 'bg-cyber-surface-2 border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/20'
                  )}
                >
                  {fmt.icon} {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Website */}
          <div>
            <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-2">Website</label>
            <select
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
              className="cyber-input"
            >
              <option value="all">All Websites</option>
              {websites.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Generate button */}
          <div className="flex flex-col justify-end">
            <button
              onClick={handleGenerate}
              disabled={generating || websiteId === 'all'}
              className={clsx(
                "cyber-btn-primary flex items-center justify-center gap-2 h-12 w-full",
                (generating || websiteId === 'all') && "opacity-50 cursor-not-allowed"
              )}
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Report
                </>
              )}
            </button>
            {websiteId === 'all' && (
              <p className="text-[10px] text-cyber-red mt-1 text-center">
                Select a specific website to generate
              </p>
            )}
          </div>
        </div>

        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-lg px-4 py-3"
          >
            <Loader2 className="w-4 h-4 text-cyber-cyan animate-spin" />
            <div className="flex-1">
              <p className="text-sm font-medium text-cyber-cyan">Generating report...</p>
              <p className="text-xs text-cyber-text-muted">Collecting scan data and analyzing vulnerabilities</p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Past Reports */}
      <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-cyber-border flex justify-between items-center">
          <h2 className="text-sm font-semibold text-cyber-text">Generated Reports</h2>
          {loading && <Loader2 className="w-4 h-4 text-cyber-cyan animate-spin" />}
        </div>
        <div className="divide-y divide-cyber-border/50">
          {filteredReports.length === 0 ? (
            <div className="text-center py-8 text-cyber-text-muted text-xs">
              {loading ? 'Loading reports...' : 'No reports generated yet.'}
            </div>
          ) : (
            filteredReports.map((report, idx) => (
              <motion.div
                key={report.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="flex items-center gap-4 px-5 py-4 hover:bg-cyber-surface-2/50 transition-all"
              >
                <div className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center border',
                  report.format.toUpperCase() === 'PDF'
                    ? 'bg-cyber-red/10 border-cyber-red/20'
                    : 'bg-cyber-green/10 border-cyber-green/20'
                )}>
                  {report.format.toUpperCase() === 'PDF'
                    ? <FileText className="w-5 h-5 text-cyber-red" />
                    : <FileSpreadsheet className="w-5 h-5 text-cyber-green" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-cyber-text">{getReportName(report)}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1 text-xs text-cyber-text-muted">
                      <Globe className="w-3 h-3" /> {getWebsiteName(report.website_id)}
                    </span>
                    <span className="text-xs text-cyber-text-muted">
                      {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>
                </div>
                <span className={clsx(
                  'text-xs font-bold font-mono px-2 py-1 rounded border',
                  report.format.toUpperCase() === 'PDF'
                    ? 'text-cyber-red bg-cyber-red/10 border-cyber-red/30'
                    : 'text-cyber-green bg-cyber-green/10 border-cyber-green/30'
                )}>
                  {report.format.toUpperCase()}
                </span>
                <button
                  onClick={() => handleDownload(report)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/30 hover:text-cyber-cyan transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

