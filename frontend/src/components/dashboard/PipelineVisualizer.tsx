import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Shield, Cpu, Brain, FileSpreadsheet, LayoutDashboard,
  FileText, CheckCircle, XCircle, Loader2, Clock, Play, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { Scan } from '@/types';
import { useState } from 'react';
import { scanApi } from '@/services/api';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';

type NodeStatus = 'completed' | 'running' | 'pending' | 'failed';

interface PipelineNode {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  status: NodeStatus;
  special?: boolean;
}

const PIPELINE_STAGES: Record<string, string> = {
  pending: 'pending',
  initializing: 'pending',
  scanning_headers: 'scanning_headers',
  scanning_ssl: 'scanning_ssl',
  scanning_admin: 'scanning_admin',
  scanning_wordpress: 'scanning_wordpress',
  scanning_cloudflare: 'scanning_cloudflare',
  scanning_dns: 'scanning_dns',
  scanning_exposure: 'scanning_exposure',
  analyzing: 'analyzing',
  storing: 'storing',
  completed: 'completed',
  failed: 'failed',
};

function getNodeStatus(nodeStage: string, currentStage: string | undefined, scanStatus: string): NodeStatus {
  if (!currentStage || scanStatus === 'pending') return 'pending';
  if (scanStatus === 'failed') return nodeStage === currentStage ? 'failed' : 'pending';

  const stageOrder = Object.keys(PIPELINE_STAGES);
  const nodeIdx = stageOrder.indexOf(nodeStage);
  const currentIdx = stageOrder.indexOf(currentStage);

  if (scanStatus === 'completed') return 'completed';
  if (nodeIdx < currentIdx) return 'completed';
  if (nodeIdx === currentIdx) return 'running';
  return 'pending';
}

function NodeStatusIcon({ status }: { status: NodeStatus }) {
  if (status === 'completed') return <CheckCircle className="w-4 h-4 text-cyber-green" />;
  if (status === 'running') return <Loader2 className="w-4 h-4 text-cyber-cyan animate-spin" />;
  if (status === 'failed') return <XCircle className="w-4 h-4 text-cyber-red" />;
  return <Clock className="w-4 h-4 text-cyber-text-muted" />;
}

interface PipelineNodeCardProps {
  node: PipelineNode;
  isActive: boolean;
}

function PipelineNodeCard({ node, isActive }: PipelineNodeCardProps) {
  return (
    <motion.div
      animate={isActive ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
      className={clsx(
        'relative flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-500 w-36 md:w-auto md:min-w-[110px]',
        node.status === 'completed' && 'border-cyber-green/40 bg-cyber-green/5',
        node.status === 'running' && 'border-cyber-cyan/60 bg-cyber-cyan/10',
        node.status === 'failed' && 'border-cyber-red/40 bg-cyber-red/5',
        node.status === 'pending' && 'border-cyber-border bg-cyber-surface-2/50',
        node.special && node.status === 'completed' && 'border-cyber-purple/60 bg-cyber-purple/10',
        node.special && node.status === 'running' && 'border-cyber-purple/80 bg-cyber-purple/20',
      )}
    >
      {/* Special MCP glow */}
      {node.special && node.status !== 'pending' && (
        <div className="absolute inset-0 rounded-xl bg-cyber-purple/5 pointer-events-none" />
      )}
      {node.special && node.status === 'running' && (
        <div className="absolute -inset-0.5 rounded-xl bg-cyber-purple/20 blur-sm pointer-events-none animate-pulse" />
      )}

      <div className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center',
        node.special ? 'bg-cyber-purple/20' : 'bg-cyber-surface',
        node.status === 'running' && !node.special && 'bg-cyber-cyan/10',
      )}>
        {node.icon}
      </div>
      <div className="text-center">
        <p className={clsx(
          'text-xs font-semibold',
          node.status === 'completed' && !node.special && 'text-cyber-green',
          node.status === 'running' && !node.special && 'text-cyber-cyan',
          node.status === 'failed' && 'text-cyber-red',
          node.status === 'pending' && 'text-cyber-text-muted',
          node.special && node.status !== 'pending' && 'text-cyber-purple',
        )}>
          {node.label}
        </p>
        {node.sublabel && (
          <p className="text-xs text-cyber-text-muted mt-0.5">{node.sublabel}</p>
        )}
      </div>
      {node.special && (
        <span className="text-[9px] font-bold tracking-widest text-cyber-purple bg-cyber-purple/20 px-2 py-0.5 rounded-full border border-cyber-purple/30">
          MCP AI
        </span>
      )}
      <NodeStatusIcon status={node.status} />
    </motion.div>
  );
}

function FlowArrow({ active }: { active: boolean }) {
  return (
    <div className="relative flex items-center justify-center md:w-8 md:h-8 w-8 h-8 flex-col md:flex-row my-2 md:my-0">
      {/* Horizontal line for md+ screens */}
      <div className={clsx(
        'hidden md:block h-0.5 w-full rounded-full',
        active ? 'bg-cyber-cyan/60' : 'bg-cyber-border'
      )} />
      {/* Vertical line for screens below md */}
      <div className={clsx(
        'md:hidden w-0.5 h-full rounded-full',
        active ? 'bg-cyber-cyan/60' : 'bg-cyber-border'
      )} />

      {active && (
        <>
          {/* Animated dot horizontal */}
          <div className="hidden md:block absolute bg-white/80 rounded-full h-0.5 animate-flow-right w-1/2" />
          {/* Animated dot vertical */}
          <div className="md:hidden absolute bg-white/80 rounded-full w-0.5 animate-flow-down h-1/2" />
        </>
      )}

      {/* Arrowhead */}
      <div className={clsx(
        'absolute text-xs font-semibold',
        active ? 'text-cyber-cyan/60' : 'text-cyber-border',
        'md:right-0 md:bottom-auto bottom-0 right-auto'
      )}>
        <span className="hidden md:inline">▶</span>
        <span className="md:hidden">▼</span>
      </div>
    </div>
  );
}

interface Props {
  scan?: Scan | null;
  selectedWebsiteId?: string;
}

export default function PipelineVisualizer({ scan, selectedWebsiteId }: Props) {
  const [triggering, setTriggering] = useState(false);
  const { setCurrentScan } = useStore();

  const currentStage = scan?.pipeline_stage;
  const scanStatus = scan?.status ?? 'pending';

  const pipelineNodes: PipelineNode[] = [
    {
      id: 'source', label: 'Website', sublabel: 'Target',
      icon: <Globe className="w-4 h-4 text-cyber-cyan" />,
      status: getNodeStatus('initializing', currentStage, scanStatus),
    },
    {
      id: 'scanner', label: 'Scanner', sublabel: 'Python',
      icon: <Cpu className="w-4 h-4 text-cyber-cyan" />,
      status: getNodeStatus('scanning_headers', currentStage, scanStatus),
    },
    {
      id: 'mcp', label: 'Sola MCP', sublabel: 'Intelligence',
      icon: <Brain className="w-4 h-4 text-cyber-purple" />,
      status: getNodeStatus('analyzing', currentStage, scanStatus),
      special: true,
    },
    {
      id: 'ai', label: 'AI Analysis', sublabel: 'GPT-4',
      icon: <Zap className="w-4 h-4 text-cyber-cyan" />,
      status: getNodeStatus('analyzing', currentStage, scanStatus),
    },
    {
      id: 'sheets', label: 'Google Sheets', sublabel: 'Storage',
      icon: <FileSpreadsheet className="w-4 h-4 text-cyber-green" />,
      status: getNodeStatus('storing', currentStage, scanStatus),
    },
    {
      id: 'dashboard', label: 'Dashboard', sublabel: 'Results',
      icon: <LayoutDashboard className="w-4 h-4 text-cyber-orange" />,
      status: getNodeStatus('completed', currentStage, scanStatus),
    },
    {
      id: 'reports', label: 'Reports', sublabel: '& Alerts',
      icon: <FileText className="w-4 h-4 text-cyber-yellow" />,
      status: scanStatus === 'completed' ? 'completed' : 'pending',
    },
  ];

  const isRunning = scanStatus === 'running';

  const handleTrigger = async () => {
    if (!selectedWebsiteId) {
      toast.error('Please select a website first');
      return;
    }
    setTriggering(true);
    try {
      const newScan = await scanApi.triggerScan(selectedWebsiteId);
      setCurrentScan(newScan);
      toast.success('Scan triggered successfully!');
    } catch {
      toast.error('Failed to trigger scan');
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-cyber-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyber-cyan" />
          <h3 className="text-sm font-semibold text-cyber-text tracking-wide">SCAN PIPELINE</h3>
          {isRunning && (
            <div className="flex items-center gap-1.5 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse" />
              <span className="text-xs text-cyber-cyan font-mono">LIVE</span>
            </div>
          )}
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering || isRunning}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200',
            triggering || isRunning
              ? 'bg-cyber-surface-2 text-cyber-text-muted cursor-not-allowed'
              : 'bg-cyber-cyan text-cyber-bg hover:bg-cyber-cyan/90'
          )}
        >
          {triggering ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5" />
          )}
          {isRunning ? 'SCANNING...' : 'TRIGGER SCAN'}
        </button>
      </div>

      {/* Pipeline diagram */}
      <div className="p-5 overflow-x-auto">
        <div className="flex flex-col md:flex-row items-center justify-start md:justify-between min-w-max md:min-w-0 md:flex-nowrap gap-2 md:gap-1">
          {pipelineNodes.map((node, i) => (
            <div key={node.id} className="flex flex-col md:flex-row items-center gap-2 md:gap-1 w-full md:w-auto">
              <PipelineNodeCard node={node} isActive={node.status === 'running'} />
              {i < pipelineNodes.length - 1 && (
                <FlowArrow active={node.status === 'completed' && pipelineNodes[i + 1].status !== 'pending'} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stage info bar */}
      <AnimatePresence>
        {scan && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-5 py-3 border-t border-cyber-border bg-cyber-surface-2/50"
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-cyber-text-dim">
                <span className="font-mono">Stage:</span>
                <span className="text-cyber-cyan font-mono font-semibold">
                  {currentStage?.replace(/_/g, ' ').toUpperCase() ?? 'IDLE'}
                </span>
              </div>
              {scan.duration_seconds && (
                <span className="text-cyber-text-muted font-mono">
                  Duration: {scan.duration_seconds}s
                </span>
              )}
              <div className={clsx(
                'flex items-center gap-1.5 font-mono font-semibold',
                scanStatus === 'completed' && 'text-cyber-green',
                scanStatus === 'running' && 'text-cyber-cyan',
                scanStatus === 'failed' && 'text-cyber-red',
                scanStatus === 'pending' && 'text-cyber-text-muted',
              )}>
                {scanStatus.toUpperCase()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
