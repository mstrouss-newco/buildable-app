// src/AdminDashboard.jsx
// Admin control center for managing content and system performance.
// Overview + Games tabs are wired to REAL data via /api/admin-stats and
// /api/admin-list-games (no more hardcoded mock numbers).
import { useState, useEffect } from 'react';
import "./admin-dashboard.css";

const ADMIN_PASSWORD = (import.meta.env && import.meta.env.VITE_ADMIN_PASSWORD) || 'buildable123';

// If the deployment sets ADMIN_API_TOKEN on the server, the admin endpoints
// require a matching x-admin-token header. The token can be stashed in
// localStorage('adminApiToken') by the operator; if absent we just omit it
// (endpoints stay readable in dev when no server token is configured).
function adminHeaders() {
  const t = (typeof localStorage !== 'undefined' && localStorage.getItem('adminApiToken')) || '';
  return t ? { 'x-admin-token': t } : {};
}
async function fetchAdmin(path) {
  const r = await fetch(path, { headers: adminHeaders() });
  if (!r.ok) throw new Error('request failed: ' + r.status);
  return r.json();
}
function money(n) {
  const v = Number(n || 0);
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return Math.floor(s) + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default function AdminDashboard({ onExit }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const adminSession = localStorage.getItem('adminSession');
    const sessionTime = localStorage.getItem('adminSessionTime');
    if (adminSession && sessionTime) {
      const elapsed = Date.now() - parseInt(sessionTime);
      if (elapsed < 30 * 60 * 1000) setIsAuthenticated(true);
      else { localStorage.removeItem('adminSession'); localStorage.removeItem('adminSessionTime'); }
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem('adminSession', 'true');
      localStorage.setItem('adminSessionTime', Date.now().toString());
      setPassword(''); setError('');
    } else { setError('Incorrect password'); setPassword(''); }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('adminSession');
    localStorage.removeItem('adminSessionTime');
  };

  if (!isAuthenticated) {
    return <AdminLoginPage onLogin={handleLogin} password={password} setPassword={setPassword} error={error} />;
  }

  return (
    <div className="admin-dashboard">
      <AdminHeader onLogout={handleLogout} onExit={onExit} />
      <AdminTabs activeTab={activeTab} setActiveTab={setActiveTab} />
      <AdminContent activeTab={activeTab} />
    </div>
  );
}

function AdminLoginPage({ onLogin, password, setPassword, error }) {
  return (
    <div className="admin-login">
      <div className="admin-login__container">
        <h1 className="admin-login__title">🔐 Admin Dashboard</h1>
        <p className="admin-login__subtitle">Buildable Kids Control Center</p>
        <form onSubmit={onLogin} className="admin-login__form">
          <div className="admin-login__field">
            <label>Admin Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password" className="admin-login__input" autoFocus />
          </div>
          {error && <div className="admin-login__error">{error}</div>}
          <button type="submit" className="btn-primary" style={{width: '100%'}}>Sign In</button>
        </form>
        <p className="admin-login__hint">🔒 Secure access only</p>
      </div>
    </div>
  );
}

function AdminHeader({ onLogout, onExit }) {
  return (
    <div className="admin-header">
      <div className="admin-header__left"><div className="admin-logo">⚙️ Admin Dashboard</div></div>
      <div className="admin-header__right">
        <span className="admin-status">✅ System Online</span>
        <button onClick={onLogout} className="btn-ghost" style={{padding: '10px 16px', fontSize: '13px'}}>Logout</button>
        <button onClick={onExit} className="btn-ghost" style={{padding: '10px 16px', fontSize: '13px'}}>← Back</button>
      </div>
    </div>
  );
}

function AdminTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'games', label: '🎮 Games' },
    { id: 'characters', label: '👥 Characters' },
    { id: 'levels', label: '🗺️ Levels' },
    { id: 'performance', label: '⚡ Performance' },
    { id: 'settings', label: '⚙️ Settings' },
  ];
  return (
    <div className="admin-tabs">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
          className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}>{tab.label}</button>
      ))}
    </div>
  );
}

function AdminContent({ activeTab }) {
  switch (activeTab) {
    case 'overview': return <AdminOverview />;
    case 'games': return <GamesLibrary />;
    case 'characters': return <CharacterLibrary />;
    case 'levels': return <LevelLibrary />;
    case 'performance': return <PerformanceMetrics />;
    case 'settings': return <AdminSettings />;
    default: return <AdminOverview />;
  }
}

// ============================================================================
// OVERVIEW (live data)
// ============================================================================
function AdminOverview() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchAdmin('/api/admin-stats')
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="admin-content"><h2>System Overview</h2><p>Loading live data…</p></div>;
  if (err) return <div className="admin-content"><h2>System Overview</h2><p style={{color:'var(--coral)'}}>Couldn't load stats: {err}</p></div>;

  const c = data.counts || {};
  const cost = data.cost || {};
  const estimate = cost.source !== 'usage_log';

  return (
    <div className="admin-content">
      <h2>System Overview</h2>
      <div className="admin-stat-grid">
        <StatCard icon="👥" label="Characters Created" value={c.characters ?? 0} trend="in library" />
        <StatCard icon="🗺️" label="Levels Created" value={c.levels ?? 0} trend="in library" />
        <StatCard icon="🎮" label="Games" value={(c.games ?? 0) + (c.publishedGames ?? 0)} trend={`${c.publishedGames ?? 0} published`} />
        <StatCard icon="🧩" label="Mechanics" value={c.mechanics ?? 0} trend="enabled rules" />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>💰 Cost Summary {estimate && <span style={{fontSize:'12px',color:'var(--muted)'}}>(estimate)</span>}</h3>
          <div className="admin-cost-summary">
            <div className="cost-item"><span>Today:</span><strong>{estimate ? '—' : money(cost.today)}</strong></div>
            <div className="cost-item"><span>This Month:</span><strong>{money(cost.month)}</strong></div>
            <div className="cost-item"><span>Monthly Estimate:</span><strong>{money(cost.monthlyEstimate)}</strong></div>
            <div className="cost-item"><span>Daily Budget:</span><strong>{money(cost.dailyBudget)}</strong></div>
            <div className="cost-item" style={{color: (cost.budgetUsedPct||0) < 80 ? 'var(--mint)' : 'var(--coral)'}}>
              <span>Budget Used Today:</span><strong>{cost.budgetUsedPct ?? 0}%</strong>
            </div>
          </div>
          {estimate && <p style={{fontSize:'12px',color:'var(--muted)',marginTop:'10px'}}>
            Showing an estimate from library counts × unit cost. Run <code>db/create-usage-log.sql</code> and log per-call costs for exact spend.
          </p>}
        </div>

        <div className="admin-card">
          <h3>📈 System Health</h3>
          <div className="admin-health">
            <HealthItem label="API Status" status={data.health?.api === 'operational' ? 'operational' : 'down'} />
            <HealthItem label="Database" status={data.health?.db === 'operational' ? 'operational' : 'down'} />
            <HealthItem label="Cost Source" status={cost.source === 'usage_log' ? 'operational' : 'down'} labelOverride={cost.source} />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, trend }) {
  return (
    <div className="stat-card">
      <div className="stat-card__icon">{icon}</div>
      <div className="stat-card__content">
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__value">{value}</p>
        <p className="stat-card__trend">{trend}</p>
      </div>
    </div>
  );
}

function HealthItem({ label, status, labelOverride }) {
  const ok = status === 'operational';
  const statusColor = ok ? 'var(--mint)' : 'var(--coral)';
  const statusEmoji = ok ? '✅' : '⚠️';
  const text = labelOverride || (ok ? 'Operational' : 'Attention');
  return (
    <div className="health-item">
      <span>{label}</span>
      <span style={{color: statusColor}}>{statusEmoji} {text}</span>
    </div>
  );
}

// ============================================================================
// GAMES LIBRARY (live — all saved + published games)
// ============================================================================
function GamesLibrary() {
  const [games, setGames] = useState([]);
  const [counts, setCounts] = useState({ published: 0, saved: 0 });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let alive = true;
    fetchAdmin('/api/admin-list-games?limit=200')
      .then((d) => { if (alive) { setGames(d.games || []); setCounts(d.counts || {published:0,saved:0}); setLoading(false); } })
      .catch((e) => { if (alive) { setErr(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, []);

  const shown = filter === 'all' ? games : games.filter((g) => g.source === filter);

  return (
    <div className="admin-content">
      <div className="admin-header-bar">
        <h2>All Games ({games.length})</h2>
        <div>
          {['all','published','saved'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={f === filter ? 'btn-primary' : 'btn-ghost'}
              style={{padding:'8px 14px', marginLeft:'8px', fontSize:'13px'}}>
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase()+f.slice(1)}
              {f === 'published' ? ` (${counts.published})` : f === 'saved' ? ` (${counts.saved})` : ''}
            </button>
          ))}
        </div>
      </div>

      {loading && <p>Loading games…</p>}
      {err && <p style={{color:'var(--coral)'}}>Couldn't load games: {err}</p>}
      {!loading && !err && shown.length === 0 && <p style={{color:'var(--muted)'}}>No games yet.</p>}

      {!loading && shown.length > 0 && (
        <div className="admin-table">
          <div className="table-header">
            <div className="col-name">Title</div>
            <div className="col-theme">Theme</div>
            <div className="col-difficulty">Mechanic</div>
            <div className="col-device">Source</div>
            <div className="col-created">Created</div>
            <div className="col-actions">Actions</div>
          </div>
          {shown.map((g) => (
            <div key={g.source + ':' + g.gameId} className="table-row">
              <div className="col-name"><strong>{g.title}</strong>{g.characterName ? <span style={{color:'var(--muted)'}}> · {g.characterName}</span> : null}</div>
              <div className="col-theme">{g.theme || '—'}</div>
              <div className="col-difficulty">{g.mechanicName || g.gameType || '—'}</div>
              <div className="col-device">{g.source === 'published' ? `🌍 published` : '💾 saved'}</div>
              <div className="col-created">{timeAgo(g.createdAt)}</div>
              <div className="col-actions">
                <a href={g.playUrl} target="_blank" rel="noreferrer" className="btn-pill-purple" style={{marginRight:'8px', textDecoration:'none'}}>Play / QA</a>
              </div>
            </div>
          ))}
        </div>
      )}
      <p style={{fontSize:'12px',color:'var(--muted)',marginTop:'14px'}}>
        Tip: use "Play / QA" to open any game in a new tab. To tune mechanics, edit the rules in
        the <code>game_mechanics</code> library — new games pick them up on next generation.
      </p>
    </div>
  );
}

// ============================================================================
// CHARACTER LIBRARY (live count via admin-stats; rows still summary)
// ============================================================================
function CharacterLibrary() {
  const [count, setCount] = useState(null);
  useEffect(() => { fetchAdmin('/api/admin-stats').then(d => setCount(d.counts?.characters ?? 0)).catch(()=>setCount(null)); }, []);
  return (
    <div className="admin-content">
      <div className="admin-header-bar"><h2>Character Library{count!=null?` (${count})`:''}</h2></div>
      <p style={{color:'var(--muted)'}}>
        {count == null ? 'Loading…' : `${count} characters in community_characters.`} Characters are stored per device and
        reused by the generator. Manage individual rows in Supabase (community_characters).
      </p>
    </div>
  );
}

function LevelLibrary() {
  const [count, setCount] = useState(null);
  useEffect(() => { fetchAdmin('/api/admin-stats').then(d => setCount(d.counts?.levels ?? 0)).catch(()=>setCount(null)); }, []);
  return (
    <div className="admin-content">
      <div className="admin-header-bar"><h2>Level Library{count!=null?` (${count})`:''}</h2></div>
      <p style={{color:'var(--muted)'}}>
        {count == null ? 'Loading…' : `${count} levels in community_levels.`} Levels are assembled from the
        community_layers art library. Manage rows in Supabase.
      </p>
    </div>
  );
}

function PerformanceMetrics() {
  return (
    <div className="admin-content">
      <h2>Performance Metrics</h2>
      <div className="admin-card">
        <h3>⚡ Notes</h3>
        <p style={{color:'var(--muted)'}}>
          Generation takes ~60–115s (Claude) and is library-driven (no per-build DALL·E).
          Real render/latency metrics will populate here once usage_log captures timing.
        </p>
      </div>
    </div>
  );
}

function AdminSettings() {
  return (
    <div className="admin-content">
      <h2>Settings</h2>
      <div className="admin-card">
        <h3>🔧 Configuration</h3>
        <p style={{color:'var(--muted)'}}>
          Budgets and API keys are configured as environment variables in Vercel
          (DAILY_BUDGET_USD, ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_*). They are not editable here for security.
        </p>
        <div className="setting-item">
          <label>Admin API token (stored locally, sent as x-admin-token)</label>
          <input type="password" placeholder="paste ADMIN_API_TOKEN value" className="setting-input"
            onChange={(e) => { try { localStorage.setItem('adminApiToken', e.target.value); } catch {} }} />
        </div>
      </div>
    </div>
  );
}
