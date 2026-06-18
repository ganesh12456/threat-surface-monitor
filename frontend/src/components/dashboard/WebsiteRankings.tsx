import { useNavigate } from 'react-router-dom';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { clsx } from 'clsx';
import type { WebsiteRanking } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';

interface Props {
  rankings: WebsiteRanking[];
}

function getGradeStyle(grade: string) {
  if (grade === 'A') return { text: 'text-cyber-green', bg: 'bg-cyber-green/10 border-cyber-green/30' };
  if (grade === 'B') return { text: 'text-cyber-cyan', bg: 'bg-cyber-cyan/10 border-cyber-cyan/30' };
  if (grade === 'C') return { text: 'text-cyber-yellow', bg: 'bg-cyber-yellow/10 border-cyber-yellow/30' };
  if (grade === 'D') return { text: 'text-cyber-orange', bg: 'bg-cyber-orange/10 border-cyber-orange/30' };
  return { text: 'text-cyber-red', bg: 'bg-cyber-red/10 border-cyber-red/30' };
}

function getScoreBarColor(score: number) {
  if (score <= 30) return 'bg-cyber-green';
  if (score <= 50) return 'bg-cyber-cyan';
  if (score <= 70) return 'bg-cyber-yellow';
  if (score <= 85) return 'bg-cyber-orange';
  return 'bg-cyber-red';
}

function getRankBadge(rank: number) {
  if (rank === 1) return 'text-cyber-red bg-cyber-red/10 border-cyber-red/30';
  if (rank === 2) return 'text-cyber-orange bg-cyber-orange/10 border-cyber-orange/30';
  if (rank === 3) return 'text-cyber-yellow bg-cyber-yellow/10 border-cyber-yellow/30';
  return 'text-cyber-text-muted bg-cyber-surface-2 border-cyber-border';
}

export default function WebsiteRankings({ rankings }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-cyber-border">
        <div>
          <h3 className="text-sm font-semibold text-cyber-text">Website Risk Rankings</h3>
          <p className="text-xs text-cyber-text-muted">Sorted by highest risk score</p>
        </div>
        <button
          onClick={() => navigate('/websites')}
          className="flex items-center gap-1.5 text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors"
        >
          View All <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-cyber-border">
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Rank</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Website</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Risk Score</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Grade</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Critical</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">High</th>
              <th className="text-right px-5 py-3 text-xs font-semibold text-cyber-text-muted uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((site, idx) => {
              const grade = getGradeStyle(site.grade);
              return (
                <motion.tr
                  key={site.website_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.07 }}
                  className="border-b border-cyber-border/50 hover:bg-cyber-surface-2/50 transition-all group"
                >
                  {/* Rank */}
                  <td className="px-5 py-3.5">
                    <span className={clsx(
                      'w-7 h-7 rounded-lg border text-xs font-bold font-mono flex items-center justify-center',
                      getRankBadge(idx + 1)
                    )}>
                      {idx + 1}
                    </span>
                  </td>

                  {/* Website */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyber-surface-2 border border-cyber-border flex items-center justify-center text-xs font-bold text-cyber-text-muted">
                        {site.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-cyber-text">{site.name}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-xs text-cyber-text-muted font-mono">{site.url.replace('https://', '')}</p>
                          <ExternalLink className="w-3 h-3 text-cyber-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Risk Score */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className={clsx(
                        'text-sm font-bold font-mono w-8',
                        site.risk_score > 80 ? 'text-cyber-red' :
                        site.risk_score > 60 ? 'text-cyber-orange' :
                        site.risk_score > 40 ? 'text-cyber-yellow' : 'text-cyber-green'
                      )}>
                        {site.risk_score}
                      </span>
                      <div className="flex-1 h-2 bg-cyber-surface-2 rounded-full overflow-hidden min-w-[80px]">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${site.risk_score}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.1 }}
                          className={clsx('h-full rounded-full', getScoreBarColor(site.risk_score))}
                        />
                      </div>
                    </div>
                  </td>

                  {/* Grade */}
                  <td className="px-5 py-3.5">
                    <span className={clsx(
                      'px-2.5 py-1 rounded-lg border text-sm font-bold font-mono',
                      grade.bg, grade.text
                    )}>
                      {site.grade}
                    </span>
                  </td>

                  {/* Critical */}
                  <td className="px-5 py-3.5">
                    <span className={clsx(
                      'font-mono text-sm font-bold',
                      site.critical_count > 0 ? 'text-cyber-red' : 'text-cyber-text-muted'
                    )}>
                      {site.critical_count > 0 ? (
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyber-red animate-pulse" />
                          {site.critical_count}
                        </span>
                      ) : '—'}
                    </span>
                  </td>

                  {/* High */}
                  <td className="px-5 py-3.5">
                    <span className={clsx(
                      'font-mono text-sm font-bold',
                      site.high_count > 0 ? 'text-cyber-orange' : 'text-cyber-text-muted'
                    )}>
                      {site.high_count || '—'}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => navigate(`/websites/${site.website_id}`)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-cyber-border text-cyber-text-dim hover:border-cyber-cyan/40 hover:text-cyber-cyan hover:bg-cyber-cyan/5 transition-all flex items-center gap-1.5 ml-auto"
                    >
                      View Details <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
