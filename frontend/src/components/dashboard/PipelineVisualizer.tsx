import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, Cpu, Brain, FileSpreadsheet, LayoutDashboard,
  FileText, CheckCircle, XCircle, Loader2, Clock, Play, Zap,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { Scan } from '@/types';
import { useEffect, useRef, useState, useCallback } from 'react';
import { scanApi, websiteApi } from '@/services/api';
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

const PIPELINE_STAGE_ORDER = [
  'pending',
  'initializing',
  'scanning_headers',
  'scanning_ssl',
  'scanning_admin',
  'scanning_wordpress',
  'scanning_cloudflare',
  'scanning_dns',
  'scanning_exposure',
  'analyzing',
  'storing',
  'completed',
  'failed',
];

function getNodeStatus(nodeStage: string, currentStage: string | undefined, scanStatus: string): NodeStatus {
  if (!currentStage || scanStatus === 'pending') return 'pending';
  if (scanStatus === 'failed') return nodeStage === currentStage ? 'failed' : 'pending';

  const nodeIdx = PIPELINE_STAGE_ORDER.indexOf(nodeStage);
  const currentIdx = PIPELINE_STAGE_ORDER.indexOf(currentStage);

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

function PipelineNodeCard({ node, isActive }: { node: PipelineNode; isActive: boolean }) {
  return (
    <motion.div
      animate={isActive ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 1.5, repeat: Infinity }}
      className={clsx(
        'relative flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-500 w-36 md:w-auto md:min-w-[110px]',
        node.status === 'completed' && !node.special && 'border-cyber-green/40 bg-cyber-green/5',
        node.status === 'running' && !node.special && 'border-cyber-cyan/60 bg-cyber-cyan/10',
        node.status === 'failed' && 'border-cyber-red/40 bg-cyber-red/5',
        node.status === 'pending' && 'border-cyber-border bg-cyber-surface-2/50',
        node.special && node.status === 'completed' && 'border-cyber-purple/60 bg-cyber-purple/10',
        node.special && node.status === 'running' && 'border-cyber-purple/80 bg-cyber-purple/20',
      )}
    >
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
      <div className={clsx('hidden md:block h-0.5 w-full rounded-full', active ? 'bg-cyber-cyan/60' : 'bg-cyber-border')} />
      <div className={clsx('md:hidden w-0.5 h-full rounded-full', active ? 'bg-cyber-cyan/60' : 'bg-cyber-border')} />
      {active && (
        <>
          <div className="hidden md:block absolute bg-white/80 rounded-full h-0.5 animate-flow-right w-1/2" />
          <div className="md:hidden absolute bg-white/80 rounded-full w-0.5 animate-flow-down h-1/2" />
        </>
      )}
      <div className={clsx('absolute text-xs font-semibold', active ? 'text-cyber-cyan/60' : 'text-cyber-border', 'md:right-0 md:bottom-auto bottom-0 right-auto')}>
        <span className="hidden md:inline">▶</span>
        <span className="md:hidden">▼</span>
      </div>
    </div>
  );
}

interface Props {
  scan?: Scan | null;
  selectedWebsiteId?: string;
  setSelectedWebsiteId?: (id: string | undefined) => void;
  onScanComplete?: () => void;
}

export default function PipelineVisualizer({ scan: initialScan, selectedWebsiteId, setSelectedWebsiteId, onScanComplete }: Props) {
  const [triggering, setTriggering] = useState(false);
  const [liveScan, setLiveScan] = useState<Scan | null>(initialScan ?? null);
  const [wsProgress, setWsProgress] = useState<number>(0);
  const [directUrl, setDirectUrl] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  const { setCurrentScan, websites, addWebsite } = useStore();

  // Keep liveScan in sync with prop when not in an active WS session
  useEffect(() => {
    if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
      setLiveScan(initialScan ?? null);
    }
  }, [initialScan]);

  const openWebSocket = useCallback((scanId: string) => {
    // Close any existing WS
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = scanApi.openPipelineWS(scanId);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] Pipeline stream opened for scan', scanId);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.warn('[WS] Error from server:', data.error);
          return;
        }
        const updated: Scan = {
          id: data.scan_id,
          website_id: liveScan?.website_id ?? '',
          status: data.status,
          pipeline_stage: data.pipeline_stage,
          started_at: data.started_at || undefined,
          completed_at: data.completed_at || undefined,
          duration_seconds: data.duration_seconds,
          created_at: liveScan?.created_at ?? new Date().toISOString(),
        };
        setLiveScan(updated);
        setCurrentScan(updated);
        setWsProgress(data.progress_percent ?? 0);

        if (data.status === 'completed') {
          toast.success(
            `Scan complete — ${data.finding_count} findings | Score: ${data.risk_score?.toFixed(1) ?? 'N/A'} (${data.grade ?? '?'})`,
            { duration: 6000 }
          );
          onScanComplete?.();
        }
        if (data.status === 'failed') {
          toast.error(`Scan failed: ${data.error_message ?? 'Unknown error'}`);
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WS] WebSocket error:', err);
    };

    ws.onclose = (event) => {
      console.log('[WS] Pipeline stream closed. Code:', event.code);
      wsRef.current = null;
    };
  }, [liveScan, setCurrentScan, onScanComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Auto-connect WebSocket if the scan loaded is currently active
  useEffect(() => {
    if (initialScan && (initialScan.status === 'running' || initialScan.status === 'pending')) {
      if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
        console.log('[WS] Auto-opening pipeline stream for active scan:', initialScan.id);
        openWebSocket(initialScan.id);
      }
    }
  }, [initialScan, openWebSocket]);

  const handleTrigger = async () => {
    let targetWebsiteId = selectedWebsiteId;

    if (directUrl.trim()) {
      let normalizedUrl = directUrl.trim();
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        normalizedUrl = `https://${normalizedUrl}`;
      }

      // Check if this URL is already registered in the system
      const existing = websites.find(w => w.url.replace(/\/$/, '').toLowerCase() === normalizedUrl.replace(/\/$/, '').toLowerCase());
      if (existing) {
        targetWebsiteId = existing.id;
        setSelectedWebsiteId?.(existing.id);
      } else {
        // Register new website directly to Websites list
        setTriggering(true);
        const nameId = toast.loading(`Registering new website target: ${normalizedUrl}...`);
        try {
          let domainName = normalizedUrl;
          try {
            domainName = new URL(normalizedUrl).hostname || normalizedUrl;
          } catch (_) {}

          const newWeb = await websiteApi.create({
            url: normalizedUrl,
            name: domainName,
            description: 'Direct scan target',
            scan_frequency: 'daily'
          });

          addWebsite(newWeb);
          targetWebsiteId = newWeb.id;
          setSelectedWebsiteId?.(newWeb.id);
          toast.success(`Registered new website in Websites list!`, { id: nameId });
        } catch (err: any) {
          console.error('Failed to register website:', err);
          toast.error(err?.response?.data?.detail || 'Failed to register website', { id: nameId });
          setTriggering(false);
          return;
        }
      }
    }

    if (!targetWebsiteId) {
      toast.error('Please select a website or enter a target URL first');
      return;
    }

    setTriggering(true);
    try {
      const newScan = await scanApi.triggerScan(targetWebsiteId);
      setLiveScan(newScan);
      setCurrentScan(newScan);
      setDirectUrl(''); // Clear input after successful trigger
      toast.success('Scan started — streaming live updates...');
      openWebSocket(newScan.id);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error('A scan is already in progress for this website.');
      } else {
        toast.error('Failed to trigger scan');
      }
    } finally {
      setTriggering(false);
    }
  };

  const currentScan = liveScan;
  const currentStage = currentScan?.pipeline_stage;
  const scanStatus = currentScan?.status ?? 'pending';
  const isRunning = scanStatus === 'running' || scanStatus === 'pending';

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
      id: 'ai', label: 'AI Analysis', sublabel: 'Risk Engine',
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

  return (
    <div className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-cyber-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-cyber-cyan" />
          <h3 className="text-sm font-semibold text-cyber-text tracking-wide">SCAN PIPELINE</h3>
          {isRunning && currentScan && (
            <div className="flex items-center gap-1.5 bg-cyber-cyan/10 border border-cyber-cyan/30 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyber-cyan animate-pulse" />
              <span className="text-xs text-cyber-cyan font-mono">LIVE</span>
            </div>
          )}
          {scanStatus === 'completed' && (
            <div className="flex items-center gap-1.5 bg-cyber-green/10 border border-cyber-green/30 rounded-full px-2.5 py-0.5">
              <CheckCircle className="w-3 h-3 text-cyber-green" />
              <span className="text-xs text-cyber-green font-mono">DONE</span>
            </div>
          )}
        </div>
        <button
          id="trigger-scan-btn"
          onClick={handleTrigger}
          disabled={triggering || isRunning}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200',
            triggering || isRunning
              ? 'bg-cyber-surface-2 text-cyber-text-muted cursor-not-allowed'
              : 'bg-cyber-cyan text-cyber-bg hover:bg-cyber-cyan/90'
          )}
        >
          {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {isRunning && currentScan ? 'SCANNING...' : 'TRIGGER SCAN'}
        </button>
      </div>

      {/* Target Selectors Controls Bar */}
      {!isRunning && (
        <div className="px-5 py-3 border-b border-cyber-border/40 bg-cyber-surface-2/20 flex flex-col md:flex-row items-center gap-4">
          <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
            <span className="text-xs text-cyber-text-muted shrink-0 font-semibold uppercase">Target Site:</span>
            <select
              value={selectedWebsiteId || ''}
              onChange={(e) => {
                setSelectedWebsiteId?.(e.target.value);
                setDirectUrl('');
              }}
              className="bg-cyber-surface border border-cyber-border rounded-lg text-xs text-cyber-text px-3 py-1.5 focus:border-cyber-cyan focus:outline-none w-full md:w-48 cursor-pointer"
            >
              <option value="" disabled>Select website...</option>
              {websites.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          
          <div className="hidden md:block text-cyber-text-muted text-[10px] font-bold">OR</div>
          
          <div className="flex-1 flex items-center gap-2 w-full md:w-auto">
            <span className="text-xs text-cyber-text-muted shrink-0 font-semibold uppercase">Direct URL:</span>
            <input
              type="text"
              placeholder="Enter target URL (e.g. example.com)"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              className="bg-cyber-surface border border-cyber-border rounded-lg text-xs text-cyber-text px-3 py-1.5 focus:border-cyber-cyan focus:outline-none placeholder-cyber-text-muted/40 w-full"
            />
          </div>
        </div>
      )}

      {/* Scanning Target Banner */}
      {isRunning && (
        <div className="px-5 py-2.5 border-b border-cyber-border/40 bg-cyber-cyan/5 text-xs flex items-center gap-2 font-mono">
          <span className="text-cyber-cyan font-bold">ACTIVE TARGET:</span>
          <span className="text-cyber-text">
            {websites.find(w => w.id === selectedWebsiteId)?.url || 'New Registered Website'}
          </span>
        </div>
      )}


      {/* Progress bar */}
      {currentScan && (
        <div className="h-0.5 bg-cyber-border">
          <motion.div
            className={clsx(
              'h-full rounded-full transition-all duration-700',
              scanStatus === 'completed' ? 'bg-cyber-green' :
              scanStatus === 'failed' ? 'bg-cyber-red' : 'bg-cyber-cyan'
            )}
            initial={{ width: 0 }}
            animate={{ width: `${scanStatus === 'completed' ? 100 : wsProgress}%` }}
          />
        </div>
      )}

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
        {currentScan && (
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
              {wsProgress > 0 && scanStatus !== 'completed' && (
                <span className="text-cyber-text-muted font-mono text-[10px]">{wsProgress}% complete</span>
              )}
              {currentScan.duration_seconds && (
                <span className="text-cyber-text-muted font-mono">
                  Duration: {currentScan.duration_seconds.toFixed(1)}s
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
