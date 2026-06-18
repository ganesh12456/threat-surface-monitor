import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, Loader2, Lock, Mail, AlertCircle } from 'lucide-react';
import { authApi } from '@/services/api';
import { supabase, isSupabaseConfigured } from '@/services/supabase';
import toast from 'react-hot-toast';

// Animated background particles
function ParticleField() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Grid bg */}
      <div className="absolute inset-0 grid-bg opacity-50" />

      {/* Scan line */}
      <div className="absolute left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-cyan/20 to-transparent animate-scan-line" />

      {/* Hex nodes */}
      {[
        { x: '10%', y: '20%', size: 6, delay: 0 },
        { x: '85%', y: '15%', size: 4, delay: 0.5 },
        { x: '15%', y: '75%', size: 5, delay: 1 },
        { x: '90%', y: '65%', size: 3, delay: 1.5 },
        { x: '50%', y: '10%', size: 4, delay: 0.8 },
        { x: '70%', y: '85%', size: 6, delay: 0.3 },
        { x: '30%', y: '90%', size: 3, delay: 1.2 },
        { x: '95%', y: '40%', size: 5, delay: 0.6 },
        { x: '5%', y: '50%', size: 4, delay: 1.8 },
        { x: '60%', y: '30%', size: 3, delay: 0.9 },
      ].map((node, i) => (
        <motion.div
          key={i}
          style={{ left: node.x, top: node.y, width: node.size * 4, height: node.size * 4 }}
          animate={{
            opacity: [0.1, 0.6, 0.1],
            scale: [1, 1.3, 1],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: node.delay,
          }}
          className="absolute rounded-full border border-cyber-cyan/30"
        />
      ))}

      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full opacity-10">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="transparent" />
            <stop offset="50%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
        <line x1="10%" y1="20%" x2="50%" y2="10%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="50%" y1="10%" x2="85%" y2="15%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="85%" y1="15%" x2="90%" y2="65%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="10%" y1="20%" x2="15%" y2="75%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="15%" y1="75%" x2="30%" y2="90%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="30%" y1="90%" x2="70%" y2="85%" stroke="url(#lineGrad)" strokeWidth="0.5" />
        <line x1="70%" y1="85%" x2="90%" y2="65%" stroke="url(#lineGrad)" strokeWidth="0.5" />
      </svg>

      {/* Corner decorators */}
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-cyber-cyan/20 rounded-tl-lg" />
      <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-cyber-cyan/20 rounded-tr-lg" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-cyber-cyan/20 rounded-bl-lg" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-cyber-cyan/20 rounded-br-lg" />
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('demo@threatmonitor.io');
  const [password, setPassword] = useState('demo1234');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect if already logged in
  useEffect(() => {
    if (localStorage.getItem('auth_token')) {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  // Listen for Supabase OAuth redirect completion
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const handleSessionExchange = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setLoading(true);
        setError('');
        try {
          const res = await authApi.supabaseLogin(
            session.access_token,
            session.user.email || '',
            session.user.user_metadata?.full_name || session.user.user_metadata?.name || ''
          );
          localStorage.setItem('auth_token', res.access_token);
          toast.success('Signed in with Google!');
          navigate('/');
        } catch (err) {
          setError('Google authentication failed. Please try again.');
          console.error(err);
        } finally {
          setLoading(false);
        }
      }
    };

    handleSessionExchange();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          setLoading(true);
          setError('');
          try {
            const res = await authApi.supabaseLogin(
              session.access_token,
              session.user.email || '',
              session.user.user_metadata?.full_name || session.user.user_metadata?.name || ''
            );
            localStorage.setItem('auth_token', res.access_token);
            toast.success('Signed in with Google!');
            navigate('/');
          } catch (err) {
            setError('Google authentication failed. Please try again.');
            console.error(err);
          } finally {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(email, password);
      localStorage.setItem('auth_token', data.access_token);
      toast.success('Welcome back!');
      navigate('/');
    } catch {
      setError('Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: window.location.origin + '/login',
          },
        });
        if (error) throw error;
      } catch (err: any) {
        setError(err.message || 'Google OAuth redirect failed.');
        setLoading(false);
      }
    } else {
      // Mock/Simulated Google Login
      setTimeout(async () => {
        try {
          const res = await authApi.supabaseLogin(
            'mock-google-token-' + Date.now(),
            'google-demo@threatmonitor.io',
            'Demo Google User'
          );
          localStorage.setItem('auth_token', res.access_token);
          toast.success('Google login simulated successfully!');
          navigate('/');
        } catch {
          setError('Failed to simulate Google login.');
        } finally {
          setLoading(false);
        }
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-bg flex items-center justify-center relative overflow-hidden">
      <ParticleField />

      {/* Glowing orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyber-cyan/3 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyber-purple/5 rounded-full blur-3xl pointer-events-none" />

      {/* Login card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative w-full max-w-md mx-4"
      >
        {/* Card */}
        <div className="bg-cyber-surface/90 backdrop-blur-xl border border-cyber-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Top accent */}
          <div className="h-0.5 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent" />

          <div className="p-8">
            {/* Logo */}
            <div className="text-center mb-8">
              <motion.div
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-cyber-cyan/10 border border-cyber-cyan/30 mb-4 mx-auto"
              >
                <Shield className="w-8 h-8 text-cyber-cyan" />
              </motion.div>
              <h1 className="text-xl font-bold text-cyber-text">THREAT SURFACE MONITOR</h1>
              <p className="text-xs text-cyber-text-muted mt-1 font-mono tracking-widest">
                ENTERPRISE SECURITY PLATFORM
              </p>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 bg-cyber-red/10 border border-cyber-red/30 rounded-lg px-3 py-2.5 mb-5"
              >
                <AlertCircle className="w-4 h-4 text-cyber-red shrink-0" />
                <p className="text-sm text-cyber-red">{error}</p>
              </motion.div>
            )}

            {/* Demo notice */}
            <div className="bg-cyber-cyan/5 border border-cyber-cyan/20 rounded-lg px-3 py-2.5 mb-5 text-center">
              <p className="text-xs text-cyber-cyan">
                {isSupabaseConfigured
                  ? 'Supabase Integration Active. You can use standard credentials or Sign In with Google.'
                  : 'Demo: Use credentials or Sign In with Google (simulated fallback)'}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="cyber-input pl-10"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cyber-text-muted" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="cyber-input pl-10 pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-cyber-text-muted hover:text-cyber-text transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end mt-1.5">
                  <button type="button" className="text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors">
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyber-cyan to-cyber-cyan-dim text-cyber-bg font-bold text-sm transition-all hover:shadow-lg hover:shadow-cyber-cyan/30 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Authenticating...
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4" /> Sign In Securely
                  </>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-cyber-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-cyber-surface px-2 text-cyber-text-muted font-mono">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google Login Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3 rounded-xl border border-cyber-border bg-cyber-surface hover:bg-cyber-surface-2 text-cyber-text font-bold text-sm transition-all flex items-center justify-center gap-2 hover:shadow-md hover:shadow-black/20"
            >
              <svg className="w-4 h-4 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z" fill="#EA4335"/>
              </svg>
              Sign In with Google
            </button>

            {/* Footer */}
            <p className="text-center text-xs text-cyber-text-muted mt-6">
              Don't have an account?{' '}
              <Link to="/register" className="text-cyber-cyan hover:text-cyber-cyan/80 transition-colors font-medium">
                Create account
              </Link>
            </p>
          </div>

          {/* Bottom security badge */}
          <div className="px-6 py-3 border-t border-cyber-border bg-cyber-surface-2/50 flex items-center justify-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-cyber-green animate-pulse" />
            <p className="text-xs text-cyber-text-muted font-mono">256-BIT TLS ENCRYPTED CONNECTION</p>
          </div>
        </div>

        {/* Side decorators */}
        <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-24 bg-gradient-to-b from-transparent via-cyber-cyan/30 to-transparent rounded-full" />
        <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1 h-24 bg-gradient-to-b from-transparent via-cyber-purple/30 to-transparent rounded-full" />
      </motion.div>
    </div>
  );
}
