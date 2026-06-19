import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Bell, Shield, Key, Users, Zap, Brain,
  Globe, Save, Eye, EyeOff, CheckCircle, Loader2,
  AlertTriangle, Wifi, WifiOff, RefreshCw, Server,
} from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import useStore from '@/store/useStore';
import { statusApi } from '@/services/api';

type Section = 'profile' | 'notifications' | 'scan' | 'integrations' | 'api' | 'team';

const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { key: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" /> },
  { key: 'scan', label: 'Scan Settings', icon: <Zap className="w-4 h-4" /> },
  { key: 'integrations', label: 'Integrations', icon: <Brain className="w-4 h-4" /> },
  { key: 'api', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
  { key: 'team', label: 'Team', icon: <Users className="w-4 h-4" /> },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative w-10 h-5 rounded-full transition-all duration-300',
        checked ? 'bg-cyber-cyan' : 'bg-cyber-surface-2 border border-cyber-border'
      )}
    >
      <span className={clsx(
        'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300',
        checked ? 'left-5' : 'left-0.5'
      )} />
    </button>
  );
}

export default function Settings() {
  const { user } = useStore();
  const [activeSection, setActiveSection] = useState<Section>('profile');
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [solaMcpStatus, setSolaMcpStatus] = useState<any>(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const s = await statusApi.get();
      setSolaMcpStatus(s.sola_mcp);
    } catch (e) {
      console.warn('Failed to fetch system status:', e);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const [profile, setProfile] = useState({
    full_name: user?.full_name ?? 'Alex Morgan',
    email: user?.email ?? 'alex@threatmonitor.io',
    current_password: '',
    new_password: '',
  });

  const [notifications, setNotifications] = useState({
    email_critical: true,
    email_high: true,
    email_medium: false,
    slack_enabled: false,
    slack_webhook: '',
    discord_enabled: false,
    discord_webhook: '',
  });

  const [scanSettings, setScanSettings] = useState({
    default_frequency: 'daily',
    timeout_seconds: 120,
    concurrent_scans: 3,
    enable_wp_scan: true,
    enable_cloudflare_scan: true,
    enable_dns_scan: true,
  });

  const [integrations, setIntegrations] = useState({
    google_sheets_id: '',
    sola_mcp_endpoint: 'https://mcp.sola.io/v1',
  });

  const [apiKeys, setApiKeys] = useState({
    cloudflare_token: '',
    shodan_api_key: '',
  });

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 1200));
    setSaving(false);
    toast.success('Settings saved successfully!');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-cyber-text">Settings</h1>
        <p className="text-xs text-cyber-text-muted">Manage your account and platform configuration</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <div className="w-48 shrink-0 space-y-1">
          {sections.map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left',
                activeSection === section.key
                  ? 'bg-cyber-cyan/10 text-cyber-cyan border-l-2 border-cyber-cyan pl-[10px]'
                  : 'text-cyber-text-dim hover:text-cyber-text hover:bg-cyber-surface-2'
              )}
            >
              {section.icon} {section.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-cyber-surface border border-cyber-border rounded-xl overflow-hidden"
            >
              {/* Profile */}
              {activeSection === 'profile' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <User className="w-4 h-4 text-cyber-cyan" /> Profile Settings
                  </h2>
                  <div className="flex items-center gap-4 pb-5 border-b border-cyber-border">
                    <div className="w-16 h-16 rounded-2xl bg-cyber-purple/20 border border-cyber-purple/40 flex items-center justify-center">
                      <span className="text-2xl font-bold text-cyber-purple">{profile.full_name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-semibold text-cyber-text">{profile.full_name}</p>
                      <p className="text-xs text-cyber-text-muted">{user?.role ?? 'admin'} • Active</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Full Name</label>
                      <input type="text" value={profile.full_name}
                        onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                        className="cyber-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Email</label>
                      <input type="email" value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="cyber-input" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Current Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                        value={profile.current_password}
                        onChange={(e) => setProfile({ ...profile, current_password: e.target.value })}
                        className="cyber-input pr-10" />
                      <button onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-cyber-text-muted hover:text-cyber-text">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">New Password</label>
                    <input type="password" placeholder="Leave blank to keep current"
                      value={profile.new_password}
                      onChange={(e) => setProfile({ ...profile, new_password: e.target.value })}
                      className="cyber-input" />
                  </div>
                </div>
              )}

              {/* Notifications */}
              {activeSection === 'notifications' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <Bell className="w-4 h-4 text-cyber-cyan" /> Notification Settings
                  </h2>
                  <div className="space-y-4">
                    {[
                      { key: 'email_critical', label: 'Email: Critical Findings', sub: 'Immediate email for critical vulnerabilities' },
                      { key: 'email_high', label: 'Email: High Findings', sub: 'Email digest for high severity issues' },
                      { key: 'email_medium', label: 'Email: Medium Findings', sub: 'Weekly email for medium severity issues' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between py-3 border-b border-cyber-border/50">
                        <div>
                          <p className="text-sm font-medium text-cyber-text">{item.label}</p>
                          <p className="text-xs text-cyber-text-muted">{item.sub}</p>
                        </div>
                        <Toggle
                          checked={notifications[item.key as keyof typeof notifications] as boolean}
                          onChange={(v) => setNotifications({ ...notifications, [item.key]: v })}
                        />
                      </div>
                    ))}

                    <div className="py-3 space-y-3 border-b border-cyber-border/50">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-cyber-text">Slack Notifications</p>
                          <p className="text-xs text-cyber-text-muted">Send alerts to Slack channel</p>
                        </div>
                        <Toggle checked={notifications.slack_enabled} onChange={(v) => setNotifications({ ...notifications, slack_enabled: v })} />
                      </div>
                      {notifications.slack_enabled && (
                        <input type="url" placeholder="https://hooks.slack.com/services/..."
                          value={notifications.slack_webhook}
                          onChange={(e) => setNotifications({ ...notifications, slack_webhook: e.target.value })}
                          className="cyber-input" />
                      )}
                    </div>

                    <div className="py-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-cyber-text">Discord Notifications</p>
                          <p className="text-xs text-cyber-text-muted">Send alerts to Discord webhook</p>
                        </div>
                        <Toggle checked={notifications.discord_enabled} onChange={(v) => setNotifications({ ...notifications, discord_enabled: v })} />
                      </div>
                      {notifications.discord_enabled && (
                        <input type="url" placeholder="https://discord.com/api/webhooks/..."
                          value={notifications.discord_webhook}
                          onChange={(e) => setNotifications({ ...notifications, discord_webhook: e.target.value })}
                          className="cyber-input" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Scan Settings */}
              {activeSection === 'scan' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <Zap className="w-4 h-4 text-cyber-cyan" /> Scan Configuration
                  </h2>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Default Frequency</label>
                      <select value={scanSettings.default_frequency}
                        onChange={(e) => setScanSettings({ ...scanSettings, default_frequency: e.target.value })}
                        className="cyber-input">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="manual">Manual Only</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Timeout (seconds)</label>
                      <input type="number" min={30} max={600} value={scanSettings.timeout_seconds}
                        onChange={(e) => setScanSettings({ ...scanSettings, timeout_seconds: +e.target.value })}
                        className="cyber-input" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">Concurrent Scans</label>
                      <input type="number" min={1} max={10} value={scanSettings.concurrent_scans}
                        onChange={(e) => setScanSettings({ ...scanSettings, concurrent_scans: +e.target.value })}
                        className="cyber-input" />
                    </div>
                  </div>
                  <div className="space-y-3 pt-2">
                    {[
                      { key: 'enable_wp_scan', label: 'WordPress Scanning', sub: 'Detect WordPress CMS, plugins, and themes' },
                      { key: 'enable_cloudflare_scan', label: 'Cloudflare Detection', sub: 'Check Cloudflare WAF and proxy status' },
                      { key: 'enable_dns_scan', label: 'DNS Record Analysis', sub: 'Check SPF, DMARC, DKIM, DNSSEC' },
                    ].map((item) => (
                      <div key={item.key} className="flex items-center justify-between py-3 border-b border-cyber-border/50">
                        <div>
                          <p className="text-sm font-medium text-cyber-text">{item.label}</p>
                          <p className="text-xs text-cyber-text-muted">{item.sub}</p>
                        </div>
                        <Toggle
                          checked={scanSettings[item.key as keyof typeof scanSettings] as boolean}
                          onChange={(v) => setScanSettings({ ...scanSettings, [item.key]: v })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Integrations */}
              {activeSection === 'integrations' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <Brain className="w-4 h-4 text-cyber-purple" /> Integrations
                  </h2>

                  {/* Sola MCP Status Card */}
                  <div className={clsx(
                    'border rounded-xl p-5 space-y-4',
                    solaMcpStatus?.configured
                      ? 'bg-cyber-purple/10 border-cyber-purple/30'
                      : 'bg-cyber-surface-2/50 border-cyber-border'
                  )}>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={clsx(
                          'w-10 h-10 rounded-xl border flex items-center justify-center',
                          solaMcpStatus?.configured
                            ? 'bg-cyber-purple/20 border-cyber-purple/40'
                            : 'bg-cyber-surface border-cyber-border'
                        )}>
                          <Brain className={clsx('w-5 h-5', solaMcpStatus?.configured ? 'text-cyber-purple' : 'text-cyber-text-muted')} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-cyber-text">Sola MCP Intelligence</p>
                          <p className="text-xs text-cyber-text-muted">Model Context Protocol — AI security enrichment layer</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {statusLoading ? (
                          <Loader2 className="w-4 h-4 text-cyber-text-muted animate-spin" />
                        ) : solaMcpStatus?.configured ? (
                          <span className="flex items-center gap-1.5 text-xs bg-cyber-green/15 text-cyber-green border border-cyber-green/30 px-2.5 py-1 rounded-full font-semibold">
                            <Wifi className="w-3 h-3" /> Configured
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs bg-cyber-yellow/10 text-cyber-yellow border border-cyber-yellow/30 px-2.5 py-1 rounded-full font-semibold">
                            <WifiOff className="w-3 h-3" /> Standalone
                          </span>
                        )}
                        <button
                          onClick={fetchStatus}
                          disabled={statusLoading}
                          className="p-1.5 rounded-lg text-cyber-text-muted hover:text-cyber-cyan hover:bg-cyber-surface-2 transition-all"
                          title="Refresh status"
                        >
                          <RefreshCw className={clsx('w-3.5 h-3.5', statusLoading && 'animate-spin')} />
                        </button>
                      </div>
                    </div>

                    {/* Endpoint */}
                    <div>
                      <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-2">
                        <Server className="w-3 h-3" /> MCP Endpoint
                      </label>
                      <div className="cyber-input font-mono text-xs text-cyber-text-dim bg-cyber-surface-2/50 cursor-default select-all">
                        {solaMcpStatus?.endpoint ?? '...'}
                      </div>
                      <p className="text-[10px] text-cyber-text-muted mt-1">
                        Set <code className="text-cyber-cyan">SOLA_MCP_ENDPOINT</code>,{' '}
                        <code className="text-cyber-cyan">SOLA_MCP_CLIENT_ID</code> and{' '}
                        <code className="text-cyber-cyan">SOLA_MCP_CLIENT_SECRET</code> in your backend <code className="text-cyber-orange">.env</code> file.
                      </p>
                    </div>

                    {/* Connected Sources */}
                    {solaMcpStatus?.connected_sources?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-2">Connected Sources</p>
                        <div className="flex flex-wrap gap-2">
                          {solaMcpStatus.connected_sources.map((src: string) => (
                            <span key={src} className="text-[10px] font-mono bg-cyber-surface border border-cyber-border text-cyber-text-dim px-2.5 py-1 rounded-lg">
                              {src}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Capabilities */}
                    {solaMcpStatus?.capabilities?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-2">Capabilities</p>
                        <div className="flex flex-wrap gap-2">
                          {solaMcpStatus.capabilities.map((cap: string) => (
                            <span key={cap} className="text-[10px] font-mono bg-cyber-purple/10 border border-cyber-purple/20 text-cyber-purple px-2.5 py-1 rounded-lg">
                              {cap.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Note */}
                    {solaMcpStatus?.note && (
                      <div className={clsx(
                        'flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs',
                        solaMcpStatus.configured
                          ? 'bg-cyber-green/5 border border-cyber-green/20 text-cyber-green'
                          : 'bg-cyber-yellow/5 border border-cyber-yellow/20 text-cyber-yellow'
                      )}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{solaMcpStatus.note}</span>
                      </div>
                    )}
                  </div>

                  {/* Google Sheets */}
                  <div>
                    <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5 flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5" /> Google Sheets ID
                    </label>
                    <input type="text" placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                      value={integrations.google_sheets_id}
                      onChange={(e) => setIntegrations({ ...integrations, google_sheets_id: e.target.value })}
                      className="cyber-input font-mono text-xs" />
                    <p className="text-xs text-cyber-text-muted mt-1">The spreadsheet ID from your Google Sheets URL</p>
                  </div>
                </div>
              )}

              {/* API Keys */}
              {activeSection === 'api' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <Key className="w-4 h-4 text-cyber-cyan" /> API Keys
                  </h2>
                  <div className="space-y-4">
                    {[
                      { key: 'cloudflare_token', label: 'Cloudflare API Token', placeholder: 'CF_xxxxxxxxxxxxx', sub: 'Used for WAF and zone configuration' },
                      { key: 'shodan_api_key', label: 'Shodan API Key', placeholder: 'SHD_xxxxxxxxxxxxx', sub: 'Used for exposure analysis' },
                    ].map((item) => (
                      <div key={item.key}>
                        <label className="block text-xs font-semibold text-cyber-text-muted uppercase tracking-wider mb-1.5">{item.label}</label>
                        <input type="password" placeholder={item.placeholder}
                          value={apiKeys[item.key as keyof typeof apiKeys]}
                          onChange={(e) => setApiKeys({ ...apiKeys, [item.key]: e.target.value })}
                          className="cyber-input font-mono" />
                        <p className="text-xs text-cyber-text-muted mt-1">{item.sub}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-cyber-surface-2 border border-cyber-border rounded-xl p-4">
                    <p className="text-xs text-cyber-text-muted">
                      <Shield className="w-3.5 h-3.5 inline mr-1 text-cyber-green" />
                      API keys are encrypted at rest using AES-256. They are never logged or exposed in responses.
                    </p>
                  </div>
                </div>
              )}

              {/* Team */}
              {activeSection === 'team' && (
                <div className="p-6 space-y-5">
                  <h2 className="text-sm font-semibold text-cyber-text flex items-center gap-2">
                    <Users className="w-4 h-4 text-cyber-cyan" /> Team Management
                  </h2>
                  <div className="space-y-3">
                    {[
                      { name: 'Alex Morgan', email: 'alex@threatmonitor.io', role: 'admin' },
                      { name: 'Jordan Lee', email: 'jordan@threatmonitor.io', role: 'analyst' },
                      { name: 'Sam Rivera', email: 'sam@threatmonitor.io', role: 'viewer' },
                    ].map((member) => (
                      <div key={member.email} className="flex items-center gap-4 p-4 bg-cyber-surface-2/50 border border-cyber-border rounded-xl">
                        <div className="w-9 h-9 rounded-full bg-cyber-purple/20 border border-cyber-purple/40 flex items-center justify-center shrink-0">
                          <span className="text-sm font-bold text-cyber-purple">{member.name.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cyber-text">{member.name}</p>
                          <p className="text-xs text-cyber-text-muted font-mono">{member.email}</p>
                        </div>
                        <span className={clsx(
                          'text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize',
                          member.role === 'admin' ? 'text-cyber-red bg-cyber-red/10 border-cyber-red/30' :
                          member.role === 'analyst' ? 'text-cyber-cyan bg-cyber-cyan/10 border-cyber-cyan/30' :
                          'text-cyber-text-muted bg-cyber-surface border-cyber-border'
                        )}>
                          {member.role}
                        </span>
                        <CheckCircle className="w-4 h-4 text-cyber-green" />
                      </div>
                    ))}
                  </div>
                  <button className="cyber-btn-secondary w-full flex items-center justify-center gap-2">
                    <Users className="w-4 h-4" /> Invite Team Member
                  </button>
                </div>
              )}

              {/* Save button */}
              <div className="px-6 py-4 border-t border-cyber-border bg-cyber-surface-2/30 flex justify-end">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="cyber-btn-primary flex items-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
