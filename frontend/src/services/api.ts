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
  Report,
} from '@/types';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';
const WS_BASE = BASE_URL.replace(/^http/, 'ws');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth token on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
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

// ─── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (data: { email: string; password: string; full_name: string }) => {
    const res = await api.post('/auth/register', data);
    return res.data;
  },
  supabaseLogin: async (accessToken: string, email: string, fullName?: string) => {
    const res = await api.post('/auth/supabase-login', {
      access_token: accessToken,
      email,
      full_name: fullName,
    });
    return res.data;
  },
  me: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
};

// ─── Dashboard ─────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: async (): Promise<DashboardStats> => {
    const r = await api.get('/dashboard/stats');
    return r.data as DashboardStats;
  },
  getTrends: async (days = 30): Promise<TrendData[]> => {
    const r = await api.get(`/dashboard/trends?days=${days}`);
    const data = r.data;
    // Backend returns { data_points: [...] }
    if (data && Array.isArray(data.data_points)) {
      return data.data_points.map((p: any) => ({
        date: p.date,
        avg_score: p.risk_score,
        critical: p.critical_count ?? 0,
        high: p.high_count ?? 0,
        medium: p.medium_count ?? 0,
        low: p.low_count ?? 0,
      })) as TrendData[];
    }
    if (Array.isArray(data)) return data as TrendData[];
    return [];
  },
  getWebsiteRankings: async (): Promise<WebsiteRanking[]> => {
    const r = await api.get('/dashboard/rankings');
    return r.data as WebsiteRanking[];
  },
};

// ─── Websites ──────────────────────────────────────────────────────────────

export const websiteApi = {
  list: async (): Promise<Website[]> => {
    const r = await api.get('/websites/');
    return r.data as Website[];
  },
  get: async (id: string): Promise<Website> => {
    const r = await api.get(`/websites/${id}`);
    return r.data as Website;
  },
  create: async (data: {
    url: string;
    name: string;
    description?: string;
    scan_frequency?: string;
  }): Promise<Website> => {
    const r = await api.post('/websites/', data);
    return r.data as Website;
  },
  update: async (id: string, data: Partial<Website>): Promise<Website> => {
    const r = await api.put(`/websites/${id}`, data);
    return r.data as Website;
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/websites/${id}`);
  },
};

// ─── Scans ─────────────────────────────────────────────────────────────────

export const scanApi = {
  triggerScan: async (websiteId: string): Promise<Scan> => {
    const r = await api.post(`/websites/${websiteId}/scan`);
    return {
      id: r.data.scan_id,
      website_id: r.data.website_id ?? websiteId,
      status: r.data.status ?? 'pending',
      pipeline_stage: 'queued',
      created_at: new Date().toISOString(),
    } as Scan;
  },
  getStatus: async (scanId: string): Promise<Scan> => {
    const r = await api.get(`/scans/${scanId}`);
    return r.data as Scan;
  },
  listByWebsite: async (websiteId: string): Promise<Scan[]> => {
    const r = await api.get(`/scans/?website_id=${websiteId}`);
    return r.data as Scan[];
  },
  listAll: async (): Promise<Scan[]> => {
    const r = await api.get('/scans/');
    return r.data as Scan[];
  },
  /**
   * Open a WebSocket for real-time pipeline streaming.
   * Returns the WebSocket instance; caller is responsible for closing it.
   */
  openPipelineWS: (scanId: string): WebSocket => {
    const token = localStorage.getItem('auth_token') ?? '';
    return new WebSocket(`${WS_BASE}/scans/${scanId}/ws?token=${encodeURIComponent(token)}`);
  },
};

// ─── Findings ──────────────────────────────────────────────────────────────

export const findingsApi = {
  listByWebsite: async (websiteId: string, severity?: string): Promise<Finding[]> => {
    const params = severity ? `&severity=${severity}` : '';
    const r = await api.get(`/findings/?website_id=${websiteId}${params}`);
    return r.data as Finding[];
  },
  listByScan: async (scanId: string): Promise<Finding[]> => {
    const r = await api.get(`/findings/?scan_id=${scanId}`);
    return r.data as Finding[];
  },
  listAll: async (severity?: string): Promise<Finding[]> => {
    const params = severity ? `?severity=${severity}` : '';
    const r = await api.get(`/findings/${params}`);
    return r.data as Finding[];
  },
};

// ─── Risk Scores ───────────────────────────────────────────────────────────

export const riskApi = {
  getLatest: async (websiteId: string): Promise<RiskScore | null> => {
    try {
      const r = await api.get(`/risk-scores/website/${websiteId}/latest`);
      return r.data as RiskScore;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },
};

// ─── Alerts ────────────────────────────────────────────────────────────────

export const alertsApi = {
  list: async (): Promise<Alert[]> => {
    const r = await api.get('/alerts/');
    return r.data as Alert[];
  },
  acknowledge: async (alertId: string): Promise<void> => {
    await api.post(`/alerts/${alertId}/acknowledge`);
  },
};

// ─── AI Recommendations ────────────────────────────────────────────────────

export const aiApi = {
  getRecommendations: async (websiteId: string): Promise<Recommendation | null> => {
    try {
      const r = await api.get(`/ai/recommendations/${websiteId}`);
      return r.data as Recommendation;
    } catch (e: any) {
      if (e?.response?.status === 404) return null;
      throw e;
    }
  },
};

// ─── System Status ─────────────────────────────────────────────────────────

export const statusApi = {
  get: async (): Promise<{
    database: { type: string; status: string };
    sola_mcp: {
      configured: boolean;
      status: string;
      endpoint: string;
      connected_sources: string[];
      capabilities: string[];
      note: string;
    };
    google_sheets: { configured: boolean; status: string };
    notifications: { slack: boolean; discord: boolean; smtp: boolean };
  }> => {
    const r = await api.get('/status');
    return r.data;
  },
};

// ─── Reports ───────────────────────────────────────────────────────────────

export const reportsApi = {
  list: async (websiteId?: string): Promise<Report[]> => {
    const params = websiteId && websiteId !== 'all' ? `?website_id=${websiteId}` : '';
    const r = await api.get(`/reports/${params}`);
    return r.data as Report[];
  },
  generate: async (data: {
    website_id: string;
    report_type: string;
    format: string;
    scan_id?: string;
  }): Promise<Report> => {
    const r = await api.post('/reports/generate', data);
    return r.data as Report;
  },
  download: async (reportId: string): Promise<Blob> => {
    const r = await api.get(`/reports/${reportId}/download`, {
      responseType: 'blob',
    });
    return r.data;
  },
};

export default api;
