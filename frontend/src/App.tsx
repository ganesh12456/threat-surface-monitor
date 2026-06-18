import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import Websites from '@/pages/Websites';
import WebsiteDetail from '@/pages/WebsiteDetail';
import Findings from '@/pages/Findings';
import Reports from '@/pages/Reports';
import AlertsPage from '@/pages/Alerts';
import Settings from '@/pages/Settings';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('auth_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="websites" element={<Websites />} />
        <Route path="websites/:id" element={<WebsiteDetail />} />
        <Route path="findings" element={<Findings />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
