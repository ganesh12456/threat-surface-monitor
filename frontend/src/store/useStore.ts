import { create } from 'zustand';
import type { User, Website, Scan, Alert, DashboardStats } from '@/types';

interface StoreState {
  user: User | null;
  websites: Website[];
  currentScan: Scan | null;
  alerts: Alert[];
  dashboardStats: DashboardStats | null;
  isLoading: boolean;
  sidebarCollapsed: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setWebsites: (websites: Website[]) => void;
  updateWebsite: (id: string, data: Partial<Website>) => void;
  addWebsite: (website: Website) => void;
  removeWebsite: (id: string) => void;
  setCurrentScan: (scan: Scan | null) => void;
  setAlerts: (alerts: Alert[]) => void;
  setDashboardStats: (stats: DashboardStats | null) => void;
  setLoading: (loading: boolean) => void;
  toggleSidebar: () => void;
}

const useStore = create<StoreState>((set) => ({
  user: null,
  websites: [],
  currentScan: null,
  alerts: [],
  dashboardStats: null,
  isLoading: false,
  sidebarCollapsed: false,

  setUser: (user) => set({ user }),
  setWebsites: (websites) => set({ websites }),
  updateWebsite: (id, data) =>
    set((state) => ({
      websites: state.websites.map((w) => (w.id === id ? { ...w, ...data } : w)),
    })),
  addWebsite: (website) =>
    set((state) => ({ websites: [...state.websites, website] })),
  removeWebsite: (id) =>
    set((state) => ({ websites: state.websites.filter((w) => w.id !== id) })),
  setCurrentScan: (scan) => set({ currentScan: scan }),
  setAlerts: (alerts) => set({ alerts }),
  setDashboardStats: (dashboardStats) => set({ dashboardStats }),
  setLoading: (isLoading) => set({ isLoading }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

export default useStore;
