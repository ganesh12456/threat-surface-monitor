import axios from 'axios';
import type {
  Website,
  Scan,
  Finding,
  RiskScore,
  Alert,
  DashboardStats,
  TrendData,
  WebsiteRanking,
  Recommendation,
} from '@/types';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Mock Data ────────────────────────────────────────────────────────────────

export const MOCK_WEBSITES: Website[] = [
  {
    id: 'w1',
    url: 'https://acmecorp.com',
    name: 'ACME Corp',
    description: 'Main corporate website',
    is_active: true,
    scan_frequency: 'daily',
    last_scan_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    last_risk_score: 78,
    last_grade: 'D',
    finding_counts: { critical: 3, high: 7, medium: 12, low: 5, informational: 8 },
  },
  {
    id: 'w2',
    url: 'https://shop.techventures.io',
    name: 'TechVentures Shop',
    description: 'E-commerce storefront',
    is_active: true,
    scan_frequency: 'daily',
    last_scan_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    last_risk_score: 45,
    last_grade: 'B',
    finding_counts: { critical: 0, high: 3, medium: 8, low: 11, informational: 14 },
  },
  {
    id: 'w3',
    url: 'https://globalfinance.net',
    name: 'Global Finance',
    description: 'Financial services portal',
    is_active: true,
    scan_frequency: 'weekly',
    last_scan_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    last_risk_score: 91,
    last_grade: 'F',
    finding_counts: { critical: 7, high: 12, medium: 6, low: 2, informational: 3 },
  },
  {
    id: 'w4',
    url: 'https://healthplus.org',
    name: 'Health Plus',
    description: 'Healthcare patient portal',
    is_active: true,
    scan_frequency: 'daily',
    last_scan_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    last_risk_score: 32,
    last_grade: 'B',
    finding_counts: { critical: 0, high: 1, medium: 5, low: 9, informational: 20 },
  },
  {
    id: 'w5',
    url: 'https://startuplab.dev',
    name: 'StartupLab',
    description: 'Developer platform',
    is_active: true,
    scan_frequency: 'manual',
    last_scan_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    last_risk_score: 18,
    last_grade: 'A',
    finding_counts: { critical: 0, high: 0, medium: 2, low: 4, informational: 11 },
  },
];

export const MOCK_FINDINGS: Finding[] = [
  {
    id: 'f1', scan_id: 's1', website_id: 'w3',
    category: 'Authentication',
    title: 'Admin Panel Exposed Without MFA',
    description: 'The administrative panel at /wp-admin is publicly accessible and does not enforce multi-factor authentication, allowing brute-force attacks.',
    severity: 'critical', cvss_score: 9.1,
    affected_url: 'https://globalfinance.net/wp-admin',
    evidence: 'HTTP 200 response received at /wp-admin. Login form present without CAPTCHA or MFA enforcement.',
    remediation: 'Implement MFA for all admin accounts. Restrict /wp-admin to trusted IP ranges using .htaccess or firewall rules.',
    is_new: true, is_fixed: false,
    first_seen_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    last_seen_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'f2', scan_id: 's1', website_id: 'w3',
    category: 'SSL/TLS',
    title: 'TLS 1.0 Protocol Supported',
    description: 'The server accepts TLS 1.0 connections, which are vulnerable to POODLE and BEAST attacks.',
    severity: 'critical', cvss_score: 8.6,
    affected_url: 'https://globalfinance.net',
    evidence: 'TLS 1.0 handshake successful. Server Hello with TLS_RSA_WITH_RC4_128_SHA cipher suite.',
    remediation: 'Disable TLS 1.0 and TLS 1.1. Only allow TLS 1.2 and TLS 1.3.',
    is_new: false, is_fixed: false,
    first_seen_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    last_seen_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'f3', scan_id: 's2', website_id: 'w1',
    category: 'Security Headers',
    title: 'Missing Content-Security-Policy Header',
    description: 'No Content-Security-Policy header is set, leaving the site vulnerable to XSS and data injection attacks.',
    severity: 'high', cvss_score: 7.2,
    affected_url: 'https://acmecorp.com',
    evidence: 'HTTP response headers do not include Content-Security-Policy.',
    remediation: "Add a strict Content-Security-Policy header. Example: Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'",
    is_new: true, is_fixed: false,
    first_seen_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    last_seen_at: new Date().toISOString(),
  },
  {
    id: 'f4', scan_id: 's2', website_id: 'w1',
    category: 'WordPress',
    title: 'Outdated WordPress Core (5.8.2)',
    description: 'Running WordPress 5.8.2 which has known CVEs. Current version is 6.5.4.',
    severity: 'high', cvss_score: 6.8,
    affected_url: 'https://acmecorp.com',
    evidence: 'WordPress version 5.8.2 detected via readme.html and generator meta tag.',
    remediation: 'Update WordPress core to the latest stable version immediately. Enable auto-updates for security releases.',
    is_new: false, is_fixed: false,
    first_seen_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    last_seen_at: new Date().toISOString(),
  },
  {
    id: 'f5', scan_id: 's3', website_id: 'w2',
    category: 'DNS',
    title: 'Missing DMARC Record',
    description: 'No DMARC policy is configured for this domain, allowing email spoofing attacks.',
    severity: 'medium', cvss_score: 5.3,
    affected_url: 'https://shop.techventures.io',
    evidence: 'DNS query for _dmarc.techventures.io returned NXDOMAIN.',
    remediation: 'Add a DMARC TXT record: v=DMARC1; p=reject; rua=mailto:dmarc@techventures.io',
    is_new: false, is_fixed: false,
    first_seen_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    last_seen_at: new Date().toISOString(),
  },
  {
    id: 'f6', scan_id: 's4', website_id: 'w1',
    category: 'Information Disclosure',
    title: 'Server Version Disclosed in Headers',
    description: 'The Server header reveals Apache version 2.4.41, enabling targeted exploit searches.',
    severity: 'medium', cvss_score: 4.3,
    affected_url: 'https://acmecorp.com',
    evidence: 'Server: Apache/2.4.41 (Ubuntu)',
    remediation: 'Configure ServerTokens Prod and ServerSignature Off in Apache configuration.',
    is_new: false, is_fixed: false,
    first_seen_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    last_seen_at: new Date().toISOString(),
  },
  {
    id: 'f7', scan_id: 's5', website_id: 'w4',
    category: 'Security Headers',
    title: 'X-Frame-Options Header Missing',
    description: 'Without X-Frame-Options, the site is vulnerable to clickjacking attacks.',
    severity: 'low', cvss_score: 3.1,
    affected_url: 'https://healthplus.org',
    evidence: 'X-Frame-Options header not present in HTTP response.',
    remediation: "Add X-Frame-Options: SAMEORIGIN or X-Frame-Options: DENY to all HTTP responses.",
    is_new: true, is_fixed: false,
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  },
];

export const MOCK_DASHBOARD_STATS: DashboardStats = {
  total_websites: 5,
  critical_findings: 10,
  avg_risk_score: 52.8,
  security_grade: 'C',
  active_alerts: 7,
  recent_scans_count: 12,
};

export const MOCK_ALERTS: Alert[] = [
  {
    id: 'a1', website_id: 'w3', website_url: 'globalfinance.net',
    alert_type: 'new_critical_finding',
    title: 'Critical: Admin Panel Exposed',
    message: 'A critical vulnerability was found on globalfinance.net — admin panel is accessible without MFA.',
    severity: 'critical', is_acknowledged: false,
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
  },
  {
    id: 'a2', website_id: 'w3', website_url: 'globalfinance.net',
    alert_type: 'score_degraded',
    title: 'Risk Score Increased to 91 (F)',
    message: 'globalfinance.net risk score has degraded from 75 to 91 — immediate action required.',
    severity: 'critical', is_acknowledged: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
  },
  {
    id: 'a3', website_id: 'w1', website_url: 'acmecorp.com',
    alert_type: 'new_high_finding',
    title: 'High: CSP Header Missing',
    message: 'acmecorp.com is missing Content-Security-Policy header — XSS risk elevated.',
    severity: 'high', is_acknowledged: false,
    created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  {
    id: 'a4', website_id: 'w2', website_url: 'shop.techventures.io',
    alert_type: 'ssl_expiry_warning',
    title: 'SSL Certificate Expires in 14 Days',
    message: 'shop.techventures.io SSL certificate will expire on July 1, 2026.',
    severity: 'medium', is_acknowledged: false,
    created_at: new Date(Date.now() - 6 * 3600000).toISOString(),
  },
  {
    id: 'a5', website_id: 'w1', website_url: 'acmecorp.com',
    alert_type: 'scan_completed',
    title: 'Scan Completed — 22 Findings',
    message: 'Security scan of acmecorp.com completed. Found 22 issues (3 critical, 7 high).',
    severity: 'high', is_acknowledged: true,
    created_at: new Date(Date.now() - 8 * 3600000).toISOString(),
  },
];

// Generate 30 days of trend data
export const MOCK_TREND_DATA: TrendData[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const baseScore = 65;
  const noise = Math.sin(i * 0.4) * 15 + Math.random() * 10 - 5;
  const score = Math.max(10, Math.min(95, baseScore + noise));
  return {
    date: date.toISOString().split('T')[0],
    avg_score: Math.round(score * 10) / 10,
    critical: Math.floor(Math.random() * 5 + 2),
    high: Math.floor(Math.random() * 10 + 5),
    medium: Math.floor(Math.random() * 15 + 8),
    low: Math.floor(Math.random() * 10 + 5),
  };
});

export const MOCK_WEBSITE_RANKINGS: WebsiteRanking[] = MOCK_WEBSITES
  .filter((w) => w.last_risk_score !== undefined)
  .sort((a, b) => (b.last_risk_score ?? 0) - (a.last_risk_score ?? 0))
  .map((w) => ({
    website_id: w.id,
    url: w.url,
    name: w.name,
    risk_score: w.last_risk_score ?? 0,
    grade: w.last_grade ?? 'C',
    critical_count: w.finding_counts?.critical ?? 0,
    high_count: w.finding_counts?.high ?? 0,
  }));

export const MOCK_SCANS: Scan[] = [
  {
    id: 's1', website_id: 'w3', status: 'completed',
    pipeline_stage: 'completed',
    started_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    completed_at: new Date(Date.now() - 24 * 3600000).toISOString(),
    duration_seconds: 143, created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
  },
  {
    id: 's2', website_id: 'w1', status: 'completed',
    pipeline_stage: 'completed',
    started_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    duration_seconds: 118, created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
  },
  {
    id: 's3', website_id: 'w2', status: 'completed',
    pipeline_stage: 'completed',
    started_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    completed_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    duration_seconds: 97, created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
  },
];

export const MOCK_RECOMMENDATION: Recommendation = {
  executive_summary: 'The website presents a HIGH risk profile with multiple critical vulnerabilities that require immediate remediation. The most severe issues include an exposed admin panel without multi-factor authentication and deprecated TLS protocol support, both of which could lead to unauthorized access and data breaches.',
  technical_summary: 'Security analysis identified 7 critical, 12 high, 6 medium, and 2 low severity findings. The attack surface includes authentication weaknesses, deprecated cryptographic protocols, missing security headers, and outdated CMS components with known CVEs.',
  top_risks: [
    { title: 'Exposed Admin Panel Without MFA', severity: 'critical', impact: 'Unauthorized administrative access, complete site compromise' },
    { title: 'TLS 1.0/1.1 Protocol Support', severity: 'critical', impact: 'Man-in-the-middle attacks, session hijacking' },
    { title: 'Outdated WordPress Core with CVEs', severity: 'high', impact: 'Remote code execution, SQL injection via known exploits' },
    { title: 'Missing Content-Security-Policy', severity: 'high', impact: 'Cross-site scripting (XSS) attacks, data exfiltration' },
    { title: 'No DMARC Policy Configured', severity: 'medium', impact: 'Domain spoofing, phishing campaigns targeting customers' },
  ],
  business_impact: 'The identified vulnerabilities pose significant risk to customer data, brand reputation, and regulatory compliance. Financial sector regulations (PCI-DSS, SOC2) require immediate remediation of critical findings. Estimated breach cost if exploited: $2.4M-$8.7M based on industry averages.',
  remediation_steps: [
    { priority: 1, action: 'Immediately restrict /wp-admin to trusted IP addresses and enforce MFA', effort: 'Low (2 hours)', impact: 'Eliminates critical auth vulnerability' },
    { priority: 2, action: 'Disable TLS 1.0 and 1.1, enforce TLS 1.2+ with strong cipher suites', effort: 'Low (1 hour)', impact: 'Prevents MITM attacks on all connections' },
    { priority: 3, action: 'Update WordPress core from 5.8.2 to latest stable version', effort: 'Medium (4 hours with testing)', impact: 'Patches multiple known CVEs' },
    { priority: 4, action: 'Implement strict Content-Security-Policy header', effort: 'Medium (8 hours)', impact: 'Prevents XSS and data injection' },
    { priority: 5, action: 'Configure DMARC, DKIM, and SPF DNS records', effort: 'Low (2 hours)', impact: 'Prevents domain spoofing and phishing' },
  ],
};

// ─── API Wrapper with Mock Fallback ──────────────────────────────────────────

async function withFallback<T>(apiCall: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await apiCall();
  } catch {
    return fallback;
  }
}

// Auth
export const authApi = {
  login: async (email: string, password: string) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw error;
      }
      // Mock login for demo
      const mockToken = 'mock_token_' + Date.now();
      localStorage.setItem('auth_token', mockToken);
      return {
        access_token: mockToken,
        user: { id: 'u1', email, full_name: 'Alex Morgan', role: 'admin', is_active: true, created_at: new Date().toISOString() },
      };
    }
  },
  register: async (data: { email: string; password: string; full_name: string }) => {
    try {
      const res = await api.post('/auth/register', data);
      return res.data;
    } catch {
      return { message: 'Registration successful (demo mode)' };
    }
  },
  supabaseLogin: async (accessToken: string, email: string, fullName?: string) => {
    try {
      const res = await api.post('/auth/supabase-login', {
        access_token: accessToken,
        email,
        full_name: fullName,
      });
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw error;
      }
      // Mock login fallback
      const mockToken = 'mock_token_' + Date.now();
      localStorage.setItem('auth_token', mockToken);
      return {
        access_token: mockToken,
        user: { id: 'u1', email, full_name: fullName || 'Google User', role: 'admin', is_active: true, created_at: new Date().toISOString() },
      };
    }
  },
};

// Dashboard
export const dashboardApi = {
  getStats: () => withFallback(
    async () => { const r = await api.get('/dashboard/stats'); return r.data as DashboardStats; },
    MOCK_DASHBOARD_STATS
  ),
  getTrends: (days = 30) => withFallback(
    async () => {
      const r = await api.get(`/dashboard/trends?days=${days}`);
      if (r.data && Array.isArray(r.data.data_points)) {
        return r.data.data_points.map((p: any) => ({
          date: p.date,
          avg_score: p.risk_score,
          critical: p.critical_count ?? 0,
          high: p.high_count ?? 0,
          medium: p.medium_count ?? 0,
          low: p.low_count ?? 0,
        })) as TrendData[];
      }
      if (Array.isArray(r.data)) {
        return r.data as TrendData[];
      }
      return MOCK_TREND_DATA;
    },
    MOCK_TREND_DATA
  ),
  getWebsiteRankings: () => withFallback(
    async () => { const r = await api.get('/dashboard/rankings'); return r.data as WebsiteRanking[]; },
    MOCK_WEBSITE_RANKINGS
  ),
};

// Websites
export const websiteApi = {
  list: () => withFallback(
    async () => { const r = await api.get('/websites/'); return r.data as Website[]; },
    MOCK_WEBSITES
  ),
  get: (id: string) => withFallback(
    async () => { const r = await api.get(`/websites/${id}`); return r.data as Website; },
    MOCK_WEBSITES.find((w) => w.id === id) ?? MOCK_WEBSITES[0]
  ),
  create: async (data: { url: string; name: string; description?: string; scan_frequency?: string }) => {
    try {
      const r = await api.post('/websites/', data);
      return r.data as Website;
    } catch {
      const newSite: Website = {
        id: 'w' + Date.now(), url: data.url, name: data.name,
        description: data.description, is_active: true,
        scan_frequency: data.scan_frequency ?? 'daily',
        created_at: new Date().toISOString(),
        last_risk_score: 0, last_grade: 'A',
        finding_counts: { critical: 0, high: 0, medium: 0, low: 0, informational: 0 },
      };
      MOCK_WEBSITES.push(newSite);
      return newSite;
    }
  },
  delete: async (id: string) => {
    try {
      await api.delete(`/websites/${id}`);
    } catch {
      const idx = MOCK_WEBSITES.findIndex((w) => w.id === id);
      if (idx !== -1) MOCK_WEBSITES.splice(idx, 1);
    }
  },
};

// Scans
export const scanApi = {
  triggerScan: (websiteId: string) => withFallback(
    async () => {
      const r = await api.post(`/websites/${websiteId}/scan`);
      return {
        id: r.data.scan_id,
        website_id: r.data.website_id,
        status: r.data.status,
        pipeline_stage: 'queued',
        created_at: new Date().toISOString(),
      } as Scan;
    },
    {
      id: 'scan_' + Date.now(), website_id: websiteId,
      status: 'running' as const, pipeline_stage: 'initializing',
      started_at: new Date().toISOString(), created_at: new Date().toISOString(),
    }
  ),
  getStatus: (scanId: string) => withFallback(
    async () => { const r = await api.get(`/scans/${scanId}`); return r.data as Scan; },
    MOCK_SCANS[0]
  ),
  listByWebsite: (websiteId: string) => withFallback(
    async () => { const r = await api.get(`/scans/?website_id=${websiteId}`); return r.data as Scan[]; },
    MOCK_SCANS.filter((s) => s.website_id === websiteId)
  ),
  listAll: () => withFallback(
    async () => { const r = await api.get('/scans/'); return r.data as Scan[]; },
    MOCK_SCANS
  ),
};

// Findings
export const findingsApi = {
  listByWebsite: (websiteId: string, severity?: string) => withFallback(
    async () => {
      const params = severity ? `&severity=${severity}` : '';
      const r = await api.get(`/findings/?website_id=${websiteId}${params}`);
      return r.data as Finding[];
    },
    MOCK_FINDINGS.filter((f) => f.website_id === websiteId && (!severity || f.severity === severity))
  ),
  listByScan: (scanId: string) => withFallback(
    async () => { const r = await api.get(`/findings/?scan_id=${scanId}`); return r.data as Finding[]; },
    MOCK_FINDINGS.filter((f) => f.scan_id === scanId)
  ),
  listAll: (severity?: string) => withFallback(
    async () => {
      const params = severity ? `?severity=${severity}` : '';
      const r = await api.get(`/findings/${params}`);
      return r.data as Finding[];
    },
    MOCK_FINDINGS.filter((f) => !severity || f.severity === severity)
  ),
};

// Risk Scores
export const riskApi = {
  getLatest: (websiteId: string) => withFallback(
    async () => { const r = await api.get(`/risk-scores/website/${websiteId}/latest`); return r.data as RiskScore; },
    {
      id: 'rs1', scan_id: 's1', website_id: websiteId,
      score: MOCK_WEBSITES.find((w) => w.id === websiteId)?.last_risk_score ?? 50,
      grade: MOCK_WEBSITES.find((w) => w.id === websiteId)?.last_grade ?? 'C',
      critical_count: 3, high_count: 7, medium_count: 12, low_count: 5, info_count: 8,
      previous_score: 55, score_delta: -3,
      created_at: new Date().toISOString(),
    }
  ),
};

// Alerts
export const alertsApi = {
  list: () => withFallback(
    async () => { const r = await api.get('/alerts/'); return r.data as Alert[]; },
    MOCK_ALERTS
  ),
  acknowledge: async (alertId: string) => {
    try {
      await api.post(`/alerts/${alertId}/acknowledge`);
    } catch {
      const alert = MOCK_ALERTS.find((a) => a.id === alertId);
      if (alert) alert.is_acknowledged = true;
    }
  },
};

// AI Recommendations
export const aiApi = {
  getRecommendations: (websiteId: string) => withFallback(
    async () => { const r = await api.get(`/ai/recommendations/${websiteId}`); return r.data as Recommendation; },
    MOCK_RECOMMENDATION
  ),
};

export default api;
