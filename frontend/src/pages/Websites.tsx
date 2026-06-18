import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, Globe, Filter, X, Loader2, Play,
  AlertTriangle, CheckCircle, Clock, Wifi,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatDistanceToNow, parseISO } from 'date-fns';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';
import { websiteApi, scanApi } from '@/services/api';
import type { Website } from '@/types';

function getGradeStyle(grade: string) {
  const map: Record<string, string> = {
    A: 'text-cyber-green bg-cyber-green/10 border-cyber-green/30',
    B: 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30',
    C: 'text-cyber-yellow bg-cyber-yellow/10 border-cyber-yellow/30',
    D: 'text-cyber-orange bg-cyber-orange/10 border-cyber-orange/30',
    F: 'text-cyber-red bg-cyber-red/10 border-cyber-red/30',
  };
  return map[grade] ?? map['C'];
}

function getScoreColor(score: number) {
  if (score <= 30) return '#00ff88';
  if (score <= 50) return '#00d4ff';
  if (score <= 70) return '#ffd700';
  if (score <= 85) return '#ff8c42';
  return '#ff3366';
}

function ScoreGauge({ score }: { score: number }) {
  const color = getScoreColor(score);
  const angle = (score / 100) * 180 - 90;
  return (
    <div className="relative w-20 h-12 mx-auto">
      <svg viewBox="0 0 80 48" className="w-full h-full">
        <path d="M8 44 A32 32 0 0 1 72 44" fill="none" stroke="#1e2d4e" strokeWidth="6" strokeLinecap="round" />
        <path
          d="M8 44 A32 32 0 0 1 72 44"
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 100.5} 100.5`}
          opacity={0.8}
        />
        <text x="40" y="46" textAnchor="middle" fill={color} fontSize="12" fontWeight="bold" fontFamily="JetBrains Mono">
          {score}
        </text>
      </svg>
    </div>
  );
}

function WebsiteCard({ website }: { website: Website }) {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);

  const handleScan = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setScanning(true);
    try {
      await scanApi.triggerScan(website.id);
      toast.success(`Scan started for ${website.name}`);
    } catch {
      toast.error('Failed to start scan');
    } finally {
      setTimeout(() => setScanning(false), 2000);
    }
  };

  const fc = website.finding_counts;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden hover:border-cyber-cyan/30 hover:shadow-lg hover:shadow-cyber-cyan/5 transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/websites/${website.id}`)}
    >
      {/* Card header */}
      <div className="px-5 pt-5 pb-3 border-b border-cyber-border/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-cyber-surface-2 border border-cyber-border flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-cyber-text-dim">{website.name.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-cyber-text truncate">{website.name}</p>
              <p className="text-xs text-cyber-text-muted font-mono truncate">{website.url.replace('https://', '')}</p>
            </div>
          </div>
          {website.last_grade && (
            <span className={clsx('shrink-0 px-2.5 py-1 rounded-lg border text-lg font-bold font-mono', getGradeStyle(website.last_grade))}>
              {website.last_grade}
            </span>
          )}
        </div>
      </div>

      {/* Score gauge */}
      <div className="px-5 py-3">
        {website.last_risk_score !== undefined && (
          <ScoreGauge score={website.last_risk_score} />
        )}
        <p className="text-center text-xs text-cyber-text-muted mt-1">Risk Score</p>
      </div>

      {/* Finding counts */}
      {fc && (
        <div className="px-5 py-3 grid grid-cols-5 gap-1 border-t border-cyber-border/50">
          {[
            { label: 'C', count: fc.critical, color: 'text-cyber-red bg-cyber-red/10' },
            { label: 'H', count: fc.high, color: 'text-cyber-orange bg-cyber-orange/10' },
            { label: 'M', count: fc.medium, color: 'text-cyber-yellow bg-cyber-yellow/10' },
            { label: 'L', count: fc.low, color: 'text-cyber-cyan bg-cyber-cyan/10' },
            { label: 'I', count: fc.informational, color: 'text-cyber-text-muted bg-cyber-surface-2' },
          ].map(({ label, count, color }) => (
            <div key={label} className={clsx('rounded-lg p-1.5 text-center', color)}>
              <p className="text-xs font-bold font-mono">{count}</p>
              <p className="text-xs opacity-70">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between border-t border-cyber-border/50 bg-cyber-surface-2/30">
        <div className="flex items-center gap-1.5 text-xs text-cyber-text-muted">
          <Clock className="w-3.5 h-3.5" />
          {website.last_scan_at
            ? formatDistanceToNow(parseISO(website.last_scan_at), { addSuffix: true })
            : 'Never scanned'}
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan hover:bg-cyber-cyan/20 transition-all"
        >
          {scanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>
    </motion.div>
  );
}

interface AddWebsiteModalProps {
  onClose: () => void;
  onAdded: (website: Website) => void;
}

function AddWebsiteModal({ onClose, onAdded }: AddWebsiteModalProps) {
  const [form, setForm] = useState({ url: '', name: '', description: '', scan_frequency: 'daily' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url.startsWith('http')) {
      setError('URL must start with http:// or https://');
      return;
    }
    setLoading(true);
    try {
      const website = await websiteApi.create(form);
      onAdded(website);
      toast.success('Website added successfully!');
      onClose();
    } catch {
      setError('Failed to add website');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md bg-cyber-surface border border-cyber-border rounded-2xl shadow-2xl shadow-cyber-cyan/10 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-cyber-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyber-cyan/10 border border-cyber-cyan/30 flex items-center justify-center">
              <Plus className="w-4 h-4 text-cyber-cyan" />
            </div>
            <h2 className="text-sm font-semibold text-cyber-text">Add Website</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-cyber-text-muted hover:text-cyber-text hover:bg-cyber-surface-2 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-cyber-red/10 border border-cyber-red/30 rounded-lg px-3 py-2 text-sm text-cyber-red">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-1.5">
              URL <span className="text-cyber-red">*</span>
            </label>
            <input
              type="url"
              required
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com"
              className="cyber-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My Website"
              className="cyber-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional description..."
              rows={2}
              className="cyber-input resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-cyber-text-dim uppercase tracking-wider mb-1.5">Scan Frequency</label>
            <select
              value={form.scan_frequency}
              onChange={(e) => setForm({ ...form, scan_frequency: e.target.value })}
              className="cyber-input"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual Only</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="cyber-btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="cyber-btn-primary flex-1 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Add Website
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function Websites() {
  const { websites, addWebsite } = useStore();
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const filtered = websites.filter((w) => {
    const matchSearch = w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.url.toLowerCase().includes(search.toLowerCase());
    const matchGrade = !gradeFilter || w.last_grade === gradeFilter;
    return matchSearch && matchGrade;
  });

  const criticalCount = websites.filter((w) => (w.finding_counts?.critical ?? 0) > 0).length;
  const activeCount = websites.filter((w) => w.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-cyber-text">Websites</h1>
          <p className="text-xs text-cyber-text-muted">Monitor and manage your website security posture</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="cyber-btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Website
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Monitored', value: websites.length, icon: <Wifi className="w-4 h-4 text-cyber-cyan" />, color: 'text-cyber-cyan' },
          { label: 'Active', value: activeCount, icon: <CheckCircle className="w-4 h-4 text-cyber-green" />, color: 'text-cyber-green' },
          { label: 'With Criticals', value: criticalCount, icon: <AlertTriangle className="w-4 h-4 text-cyber-red" />, color: 'text-cyber-red' },
        ].map((stat) => (
          <div key={stat.label} className="bg-cyber-surface border border-cyber-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyber-surface-2 border border-cyber-border flex items-center justify-center">
              {stat.icon}
            </div>
            <div>
              <p className={clsx('text-xl font-bold font-mono', stat.color)}>{stat.value}</p>
              <p className="text-xs text-cyber-text-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
          <input
            type="text"
            placeholder="Search websites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="cyber-input pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-cyber-text-muted" />
          {['', 'A', 'B', 'C', 'D', 'F'].map((grade) => (
            <button
              key={grade}
              onClick={() => setGradeFilter(grade)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                gradeFilter === grade
                  ? 'bg-cyber-cyan/20 border-cyber-cyan/50 text-cyber-cyan'
                  : 'bg-cyber-surface-2 border-cyber-border text-cyber-text-dim hover:border-cyber-border/80'
              )}
            >
              {grade || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Website Grid */}
      <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        <AnimatePresence>
          {filtered.map((website) => (
            <WebsiteCard key={website.id} website={website} />
          ))}
        </AnimatePresence>
        {filtered.length === 0 && (
          <div className="col-span-3 text-center py-16 text-cyber-text-muted">
            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No websites found</p>
          </div>
        )}
      </motion.div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <AddWebsiteModal
            onClose={() => setShowModal(false)}
            onAdded={(website) => addWebsite(website)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
