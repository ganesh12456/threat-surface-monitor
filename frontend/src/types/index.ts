export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'analyst' | 'viewer';
  is_active: boolean;
  created_at: string;
}

export interface Website {
  id: string;
  url: string;
  name: string;
  description?: string;
  is_active: boolean;
  scan_frequency: string;
  last_scan_at?: string;
  created_at: string;
  last_risk_score?: number;
  last_grade?: string;
  finding_counts?: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    informational: number;
  };
}

export interface Scan {
  id: string;
  website_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  pipeline_stage?: string;
  started_at?: string;
  completed_at?: string;
  duration_seconds?: number;
  error_message?: string;
  created_at: string;
}

export interface Finding {
  id: string;
  scan_id: string;
  website_id: string;
  category: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  cvss_score?: number;
  affected_url?: string;
  evidence?: string;
  remediation?: string;
  is_new: boolean;
  is_fixed: boolean;
  first_seen_at: string;
  last_seen_at: string;
}

export interface RiskScore {
  id: string;
  scan_id: string;
  website_id: string;
  score: number;
  grade: string;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  previous_score?: number;
  score_delta?: number;
  created_at: string;
}

export interface Recommendation {
  executive_summary: string;
  technical_summary: string;
  top_risks: Array<{ title: string; severity: string; impact: string }>;
  business_impact: string;
  remediation_steps: Array<{ priority: number; action: string; effort: string; impact: string }>;
}

export interface Alert {
  id: string;
  website_id: string;
  website_url?: string;
  scan_id?: string;
  finding_id?: string;
  alert_type: string;
  title: string;
  message: string;
  severity: string;
  is_acknowledged: boolean;
  created_at: string;
}

export interface DashboardStats {
  total_websites: number;
  critical_findings: number;
  avg_risk_score: number;
  security_grade: string;
  active_alerts: number;
  recent_scans_count: number;
}

export interface TrendData {
  date: string;
  avg_score: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface WebsiteRanking {
  website_id: string;
  url: string;
  name: string;
  risk_score: number;
  grade: string;
  critical_count: number;
  high_count: number;
}

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type PipelineStage =
  | 'pending'
  | 'initializing'
  | 'scanning_headers'
  | 'scanning_ssl'
  | 'scanning_admin'
  | 'scanning_wordpress'
  | 'scanning_cloudflare'
  | 'scanning_dns'
  | 'scanning_exposure'
  | 'analyzing'
  | 'storing'
  | 'completed'
  | 'failed';

export interface Report {
  id: string;
  website_id?: string;
  scan_id?: string;
  report_type: string;
  format: string;
  file_path: string;
  generated_by: string;
  created_at: string;
  download_url: string;
}

