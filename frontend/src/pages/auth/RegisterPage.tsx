import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Loader2, Lock, Mail, User, AlertCircle, CheckCircle } from 'lucide-react';
import { authApi } from '@/services/api';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    agreed: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const passwordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    return score;
  };

  const strength = passwordStrength(form.password);
  const strengthColors = ['', 'bg-cyber-red', 'bg-cyber-orange', 'bg-cyber-yellow', 'bg-cyber-green'];
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm_password) {
      setError("Passwords don't match");
      return;
    }
    if (!form.agreed) {
      setError('You must agree to the terms');
      return;
    }
    setLoading(true);
    try {
      await authApi.register({ email: form.email, password: form.password, full_name: form.full_name });
      toast.success('Account created! Please sign in.');
      navigate('/login');
    } catch {
      setError('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center relative overflow-hidden py-8">
      {/* Background */}
      <div className="absolute inset-0 grid-bg opacity-40" />
      <div className="absolute inset-0 animate-scan-line pointer-events-none">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-cyber-cyan/10 to-transparent" />
      </div>
      <div className="absolute top-1/3 left-1/3 w-64 h-64 bg-cyber-purple/5 rounded-full blur-3xl" />
      <div className="absolute bottom-1/3 right-1/3 w-64 h-64 bg-cyber-cyan/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md mx-4"
      >
        <div className="bg-cyber-surface/90 backdrop-blur-xl border border-cyber-border rounded-2xl shadow-2xl overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-transparent via-cyber-purple to-transparent" />

          <div className="p-8">
            {/* Logo */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-cyber-purple/10 border border-cyber-purple/30 mb-3">
                <Shield className="w-7 h-7 text-cyber-purple" />
              </div>
              <h1 className="text-xl font-bold text-cyber-text">Create Account</h1>
              <p className="text-xs text-cyber-text-muted mt-1">Join Threat Surface Monitor</p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 bg-cyber-red/10 border border-cyber-red/30 rounded-lg px-3 py-2.5 mb-4"
              >
                <AlertCircle className="w-4 h-4 text-cyber-red shrink-0" />
                <p className="text-sm text-cyber-red">{error}</p>
              </motion.div>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Full Name</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input type="text" required value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Alex Morgan" className="cyber-input pl-10" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input type="email" required value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="you@company.com" className="cyber-input pl-10" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input type={showPassword ? 'text' : 'password'} required value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••" className="cyber-input pl-10 pr-10" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-cyber-text-muted hover:text-cyber-text">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColors[strength] : 'bg-cyber-surface-2'}`} />
                      ))}
                    </div>
                    <p className={`text-xs mt-1 ${strengthColors[strength].replace('bg-', 'text-')}`}>
                      {strengthLabels[strength]} password
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input type="password" required value={form.confirm_password}
                    onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                    placeholder="••••••••" className="cyber-input pl-10 pr-10" />
                  {form.confirm_password && (
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                      {form.password === form.confirm_password
                        ? <CheckCircle className="w-4 h-4 text-cyber-green" />
                        : <AlertCircle className="w-4 h-4 text-cyber-red" />
                      }
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.agreed}
                  onChange={(e) => setForm({ ...form, agreed: e.target.checked })}
                  className="mt-0.5 w-4 h-4 accent-cyber-cyan" />
                <span className="text-xs text-cyber-text-muted">
                  I agree to the{' '}
                  <span className="text-cyber-cyan">Terms of Service</span>{' '}
                  and{' '}
                  <span className="text-cyber-cyan">Privacy Policy</span>
                </span>
              </label>

              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyber-purple to-cyber-purple/80 text-white font-bold text-sm transition-all hover:shadow-lg hover:shadow-cyber-purple/30 disabled:opacity-70 flex items-center justify-center gap-2 mt-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>

            <p className="text-center text-xs text-cyber-text-muted mt-5">
              Already have an account?{' '}
              <Link to="/login" className="text-cyber-cyan hover:text-cyber-cyan/80 font-medium">
                Sign in
              </Link>
            </p>
          </div>

          <div className="px-6 py-3 border-t border-cyber-border bg-cyber-surface-2/50 flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
            <p className="text-xs text-cyber-text-muted font-mono">SOC2 COMPLIANT • GDPR READY</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
