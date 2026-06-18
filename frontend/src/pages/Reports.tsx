import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FileText, Download, Calendar, Globe, Loader2,
  FileSpreadsheet, BarChart3, ClipboardList, CheckCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';

interface ReportRecord {
  id: string;
  name: string;
  type: string;
  format: string;
  website: string;
  generatedAt: string;
  size: string;
}

const MOCK_REPORTS: ReportRecord[] = [
  { id: 'r1', name: 'Executive Security Summary', type: 'executive', format: 'PDF', website: 'All Websites', generatedAt: subDays(new Date(), 1).toISOString(), size: '2.4 MB' },
  { id: 'r2', name: 'Technical Vulnerability Report', type: 'technical', format: 'PDF', website: 'globalfinance.net', generatedAt: subDays(new Date(), 3).toISOString(), size: '5.1 MB' },
  { id: 'r3', name: 'Risk Trend Analysis', type: 'trend', format: 'CSV', website: 'All Websites', generatedAt: subDays(new Date(), 7).toISOString(), size: '340 KB' },
  { id: 'r4', name: 'ACME Corp Monthly Report', type: 'executive', format: 'PDF', website: 'acmecorp.com', generatedAt: subDays(new Date(), 14).toISOString(), size: '1.8 MB' },
];

export default function Reports() {
  const { websites } = useStore();
  const [reportType, setReportType] = useState('executive');
  const [reportFormat, setReportFormat] = useState('PDF');
  const [websiteId, setWebsiteId] = useState('all');
  const [generating, setGenerating] = useState(false);
  const [reports, setReports] = useState<ReportRecord[]>(MOCK_REPORTS);

  const handleGenerate = async () => {
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 2500));
    const newReport: ReportRecord = {
      id: 'r' + Date.now(),
      name: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} ${reportFormat} Report`,
      type: reportType,
      format: reportFormat,
      website: websiteId === 'all' ? 'All Websites' : websites.find((w) => w.id === websiteId)?.name ?? websiteId,
      generatedAt: new Date().toISOString(),
      size: `${(Math.random() * 4 + 0.5).toFixed(1)} MB`,
    };
    setReports([newReport, ...reports]);
    setGenerating(false);
    toast.success('Report generated successfully!');
  };

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
                { value: 'trend', label: 'Historical Trend', icon: <Calendar className="w-4 h-4" /> },
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
              disabled={generating}
              className="cyber-btn-primary flex items-center justify-center gap-2 h-12"
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
        <div className="px-5 py-4 border-b border-cyber-border">
          <h2 className="text-sm font-semibold text-cyber-text">Generated Reports</h2>
        </div>
        <div className="divide-y divide-cyber-border/50">
          {reports.map((report, idx) => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex items-center gap-4 px-5 py-4 hover:bg-cyber-surface-2/50 transition-all"
            >
              <div className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center border',
                report.format === 'PDF'
                  ? 'bg-cyber-red/10 border-cyber-red/20'
                  : 'bg-cyber-green/10 border-cyber-green/20'
              )}>
                {report.format === 'PDF'
                  ? <FileText className="w-5 h-5 text-cyber-red" />
                  : <FileSpreadsheet className="w-5 h-5 text-cyber-green" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-cyber-text">{report.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="flex items-center gap-1 text-xs text-cyber-text-muted">
                    <Globe className="w-3 h-3" /> {report.website}
                  </span>
                  <span className="text-xs text-cyber-text-muted">
                    {format(new Date(report.generatedAt), 'MMM d, yyyy')}
                  </span>
                  <span className="text-xs text-cyber-text-muted">{report.size}</span>
                </div>
              </div>
              <span className={clsx(
                'text-xs font-bold font-mono px-2 py-1 rounded border',
                report.format === 'PDF'
                  ? 'text-cyber-red bg-cyber-red/10 border-cyber-red/30'
                  : 'text-cyber-green bg-cyber-green/10 border-cyber-green/30'
              )}>
                {report.format}
              </span>
              <button
                onClick={() => toast.success(`Downloading ${report.name}...`)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/30 hover:text-cyber-cyan transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Download
              </button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
