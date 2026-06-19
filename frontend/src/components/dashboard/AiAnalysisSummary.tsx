import { motion } from 'framer-motion';
import { Brain, Shield, AlertTriangle, CheckCircle, Zap, Activity } from 'lucide-react';
import type { Recommendation } from '@/types';
import { clsx } from 'clsx';

interface Props {
  recommendation: Recommendation | null;
  loading: boolean;
}

function getSeverityBadgeClass(severity: string) {
  const map: Record<string, string> = {
    critical: 'text-cyber-red bg-cyber-red/10 border-cyber-red/30',
    high: 'text-cyber-orange bg-cyber-orange/10 border-cyber-orange/30',
    medium: 'text-cyber-yellow bg-cyber-yellow/10 border-cyber-yellow/30',
    low: 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30',
    informational: 'text-cyber-text-muted bg-cyber-surface-2 border-cyber-border',
  };
  return map[severity.toLowerCase()] ?? map['informational'];
}

export default function AiAnalysisSummary({ recommendation, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-8 flex flex-col items-center justify-center min-h-[200px]">
        <Brain className="w-8 h-8 text-cyber-cyan animate-pulse mb-3" />
        <p className="text-xs text-cyber-text-dim font-mono tracking-wider">RETRIEVING AI SECURITY INSIGHTS...</p>
      </div>
    );
  }

  if (!recommendation) {
    return (
      <div className="bg-cyber-surface border border-cyber-border rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[150px]">
        <Brain className="w-8 h-8 text-cyber-text-muted/30 mb-3" />
        <p className="text-sm text-cyber-text-muted">No AI Analysis available yet.</p>
        <p className="text-xs text-cyber-text-muted/60 mt-1">Run a scan to generate real-time AI security recommendations.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* AI Title Banner */}
      <div className="flex items-center gap-3 bg-cyber-purple/10 border border-cyber-purple/20 rounded-xl px-5 py-4 shadow-sm shadow-cyber-purple/5">
        <div className="w-10 h-10 rounded-lg bg-cyber-purple/20 flex items-center justify-center shrink-0 border border-cyber-purple/30 animate-pulse">
          <Brain className="w-5 h-5 text-cyber-purple" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-cyber-purple tracking-wide uppercase">AI Threat Surface Analysis</h3>
          <p className="text-xs text-cyber-text-muted">Interactive security overlay powered by Sola MCP Intelligence</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: Executive Summary & Business Impact */}
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 hover:border-cyber-cyan/35 transition-all">
            <h4 className="text-xs font-bold text-cyber-text tracking-wider uppercase mb-3 flex items-center gap-2 pb-2 border-b border-cyber-border/40">
              <Shield className="w-4 h-4 text-cyber-cyan" /> Executive Summary
            </h4>
            <p className="text-xs text-cyber-text-dim leading-relaxed font-sans">
              {recommendation.executive_summary}
            </p>
          </div>

          {/* Business Impact */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 hover:border-cyber-orange/35 transition-all">
            <h4 className="text-xs font-bold text-cyber-text tracking-wider uppercase mb-3 flex items-center gap-2 pb-2 border-b border-cyber-border/40">
              <Activity className="w-4 h-4 text-cyber-orange" /> Business Impact
            </h4>
            <p className="text-xs text-cyber-text-dim leading-relaxed font-sans">
              {recommendation.business_impact}
            </p>
          </div>
        </div>

        {/* Right column: Top Risks & Recommended Remediation */}
        <div className="space-y-6">
          {/* Top Risks */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 hover:border-cyber-red/35 transition-all">
            <h4 className="text-xs font-bold text-cyber-text tracking-wider uppercase mb-3 flex items-center gap-2 pb-2 border-b border-cyber-border/40">
              <AlertTriangle className="w-4 h-4 text-cyber-red" /> Top Identified Risks
            </h4>
            <div className="space-y-3">
              {recommendation.top_risks.slice(0, 3).map((risk, index) => (
                <div key={index} className="p-3 bg-cyber-surface-2/40 rounded-lg border border-cyber-border/40 flex items-start gap-2.5">
                  <span className={clsx('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0', getSeverityBadgeClass(risk.severity))}>
                    {risk.severity}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-cyber-text truncate">{risk.title}</p>
                    <p className="text-[10px] text-cyber-text-muted mt-0.5 leading-relaxed">{risk.impact}</p>
                  </div>
                </div>
              ))}
              {recommendation.top_risks.length === 0 && (
                <p className="text-xs text-cyber-text-muted py-2 text-center">No critical risks identified.</p>
              )}
            </div>
          </div>

          {/* Remediation Steps */}
          <div className="bg-cyber-surface border border-cyber-border rounded-xl p-5 hover:border-cyber-green/35 transition-all">
            <h4 className="text-xs font-bold text-cyber-text tracking-wider uppercase mb-3 flex items-center gap-2 pb-2 border-b border-cyber-border/40">
              <CheckCircle className="w-4 h-4 text-cyber-green" /> Recommended Remediation
            </h4>
            <div className="space-y-3 font-mono">
              {recommendation.remediation_steps.slice(0, 3).map((step, index) => (
                <div key={index} className="p-3 bg-cyber-green/5 border border-cyber-green/20 rounded-lg flex gap-3">
                  <span className="text-cyber-green font-bold text-xs shrink-0">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-cyber-text leading-tight">{step.action}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[9px] text-cyber-text-muted">
                      <span>Effort: <strong className="text-cyber-text-dim">{step.effort}</strong></span>
                      <span>•</span>
                      <span>Impact: <strong className="text-cyber-green">{step.impact}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
              {recommendation.remediation_steps.length === 0 && (
                <p className="text-xs text-cyber-text-muted py-2 text-center">No remediation actions recommended.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
