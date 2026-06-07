// src/AdminDashboard.jsx
// Admin control center for managing content and system performance
import { useState, useEffect } from 'react';
import "./admin-dashboard.css";

const ADMIN_PASSWORD = (import.meta.env && import.meta.env.VITE_ADMIN_PASSWORD) || 'buildable123';

export default function AdminDashboard({ onExit }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Check if already logged in
  useEffect(() => {
    const adminSession = localStorage.getItem('adminSession');
    const sessionTime = localStorage.getItem('adminSessionTime');
    
    if (adminSession && sessionTime) {
      const elapsed = Date.now() - parseInt(sessionTime);
      if (elapsed < 30 * 60 * 1000) { // 30 minute timeout
        setIsAuthenticated(true);
      } else {
        localStorage.removeItem('adminSession');
        localStorage.removeItem('adminSessionTime');
      }
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      localStorage.setItem('adminSession', 'true');
      localStorage.setItem('adminSessionTime', Date.now().toString());
      setPassword('');
      setError('');
    } else {
      setError('Incorrect password');
      setPassword('');
    }
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

// ============================================================================
// LOGIN PAGE
// ============================================================================
function AdminLoginPage({ onLogin, password, setPassword, error }) {
  return (
    <div className="admin-login">
      <div className="admin-login__container">
        <h1 className="admin-login__title">🔐 Admin Dashboard</h1>
        <p className="admin-login__subtitle">Buildable Kids Control Center</p>

        <form onSubmit={onLogin} className="admin-login__form">
          <div className="admin-login__field">
            <label>Admin Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="admin-login__input"
              autoFocus
            />
          </div>

          {error && <div className="admin-login__error">{error}</div>}

          <button type="submit" className="btn-primary" style={{width: '100%'}}>
            Sign In
          </button>
        </form>

        <p className="admin-login__hint">🔒 Secure access only</p>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN HEADER
// ============================================================================
function AdminHeader({ onLogout, onExit }) {
  return (
    <div className="admin-header">
      <div className="admin-header__left">
        <div className="admin-logo">⚙️ Admin Dashboard</div>
      </div>
      <div className="admin-header__right">
        <span className="admin-status">✅ System Online</span>
        <button onClick={onLogout} className="btn-ghost" style={{padding: '10px 16px', fontSize: '13px'}}>
          Logout
        </button>
        <button onClick={onExit} className="btn-ghost" style={{padding: '10px 16px', fontSize: '13px'}}>
          ← Back
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN TABS
// ============================================================================
function AdminTabs({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'characters', label: '👥 Characters' },
    { id: 'levels', label: '🗺️ Levels' },
    { id: 'performance', label: '⚡ Performance' },
    { id: 'settings', label: '⚙️ Settings' },
  ];

  return (
    <div className="admin-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`admin-tab ${activeTab === tab.id ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// ADMIN CONTENT ROUTER
// ============================================================================
function AdminContent({ activeTab }) {
  switch (activeTab) {
    case 'overview':
      return <AdminOverview />;
    case 'characters':
      return <CharacterLibrary />;
    case 'levels':
      return <LevelLibrary />;
    case 'performance':
      return <PerformanceMetrics />;
    case 'settings':
      return <AdminSettings />;
    default:
      return <AdminOverview />;
  }
}

// ============================================================================
// ADMIN OVERVIEW
// ============================================================================
function AdminOverview() {
  const [stats, setStats] = useState({
    totalCharacters: 0,
    totalLevels: 0,
    totalGames: 0,
    avgRenderTime: 0,
    totalCost: 0,
    systemHealth: 'healthy',
  });

  useEffect(() => {
    // TODO: Fetch from Supabase
    setStats({
      totalCharacters: 127,
      totalLevels: 45,
      totalGames: 3,
      avgRenderTime: 8.2,
      totalCost: 175.60,
      systemHealth: 'healthy',
    });
  }, []);

  return (
    <div className="admin-content">
      <h2>System Overview</h2>

      <div className="admin-stat-grid">
        <StatCard
          icon="👥"
          label="Characters Created"
          value={stats.totalCharacters}
          trend="+12 this week"
        />
        <StatCard
          icon="🗺️"
          label="Levels Created"
          value={stats.totalLevels}
          trend="+5 this week"
        />
        <StatCard
          icon="🎮"
          label="Games Available"
          value={stats.totalGames}
          trend="All operational"
        />
        <StatCard
          icon="⚡"
          label="Avg Render Time"
          value={`${stats.avgRenderTime}s`}
          trend="Healthy"
        />
      </div>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>💰 Cost Summary</h3>
          <div className="admin-cost-summary">
            <div className="cost-item">
              <span>Today:</span>
              <strong>$12.50</strong>
            </div>
            <div className="cost-item">
              <span>This Month:</span>
              <strong>${stats.totalCost}</strong>
            </div>
            <div className="cost-item">
              <span>Monthly Estimate:</span>
              <strong>$375</strong>
            </div>
            <div className="cost-item" style={{color: 'var(--mint)'}}>
              <span>Daily Budget:</span>
              <strong>45% used</strong>
            </div>
          </div>
        </div>

        <div className="admin-card">
          <h3>📈 System Health</h3>
          <div className="admin-health">
            <HealthItem label="API Status" status="operational" />
            <HealthItem label="Database" status="operational" />
            <HealthItem label="Cache" status="operational" />
            <HealthItem label="Storage" status="operational" />
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>📋 Recent Activity</h3>
        <ActivityLog />
      </div>
    </div>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================
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

// ============================================================================
// HEALTH ITEM
// ============================================================================
function HealthItem({ label, status }) {
  const statusColor = status === 'operational' ? 'var(--mint)' : 'var(--coral)';
  const statusEmoji = status === 'operational' ? '✅' : '⚠️';

  return (
    <div className="health-item">
      <span>{label}</span>
      <span style={{color: statusColor}}>
        {statusEmoji} {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    </div>
  );
}

// ============================================================================
// ACTIVITY LOG
// ============================================================================
function ActivityLog() {
  const activities = [
    { id: 1, action: 'Character "Zappy" generated', time: '2h ago', icon: '👤', cost: '$0.04' },
    { id: 2, action: 'Level "Forest" generated', time: '3h ago', icon: '🗺️', cost: '$0.20' },
    { id: 3, action: 'Game "Runner" played', time: '4h ago', icon: '🎮', cost: '-' },
    { id: 4, action: 'Level "Castle" generated', time: '5h ago', icon: '🗺️', cost: '$0.20' },
    { id: 5, action: 'Character "Sir" generated', time: '6h ago', icon: '👤', cost: '$0.04' },
  ];

  return (
    <div className="activity-log">
      {activities.map((activity) => (
        <div key={activity.id} className="activity-item">
          <span className="activity-icon">{activity.icon}</span>
          <span className="activity-action">{activity.action}</span>
          <span className="activity-time">{activity.time}</span>
          <span className="activity-cost">{activity.cost}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// CHARACTER LIBRARY
// ============================================================================
function CharacterLibrary() {
  const [characters, setCharacters] = useState([
    { id: 1, name: 'Zappy', description: 'Purple dragon...', device: 'device_001', created: '2h ago', image: '🟣' },
    { id: 2, name: 'Sir Sparkle', description: 'Knight with...', device: 'device_002', created: '3h ago', image: '⚔️' },
    { id: 3, name: 'Blue Owl', description: 'Magical bird...', device: 'device_001', created: '5h ago', image: '🦉' },
  ]);

  const handleDelete = (id) => {
    if (confirm('Delete character?')) {
      setCharacters(characters.filter(c => c.id !== id));
    }
  };

  return (
    <div className="admin-content">
      <div className="admin-header-bar">
        <h2>Character Library</h2>
        <button className="btn-primary" style={{padding: '10px 20px'}}>
          + Add Character
        </button>
      </div>

      <div className="admin-table">
        <div className="table-header">
          <div className="col-name">Name</div>
          <div className="col-desc">Description</div>
          <div className="col-device">Creator Device</div>
          <div className="col-created">Created</div>
          <div className="col-actions">Actions</div>
        </div>
        {characters.map((char) => (
          <div key={char.id} className="table-row">
            <div className="col-name"><strong>{char.name}</strong></div>
            <div className="col-desc">{char.description}</div>
            <div className="col-device">{char.device}</div>
            <div className="col-created">{char.created}</div>
            <div className="col-actions">
              <button className="btn-pill-purple" style={{marginRight: '8px'}}>Preview</button>
              <button onClick={() => handleDelete(char.id)} className="btn-pill-coral">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// LEVEL LIBRARY
// ============================================================================
function LevelLibrary() {
  const [levels, setLevels] = useState([
    { id: 1, name: 'Enchanted Forest', theme: 'Forest', difficulty: 'Easy', layers: 4, created: '2h ago' },
    { id: 2, name: 'Dark Castle', theme: 'Castle', difficulty: 'Hard', layers: 4, created: '3h ago' },
    { id: 3, name: 'Candy Kingdom', theme: 'Candy', difficulty: 'Easy', layers: 4, created: '5h ago' },
  ]);

  const handleDelete = (id) => {
    if (confirm('Delete level?')) {
      setLevels(levels.filter(l => l.id !== id));
    }
  };

  return (
    <div className="admin-content">
      <div className="admin-header-bar">
        <h2>Level Library</h2>
        <button className="btn-primary" style={{padding: '10px 20px'}}>
          + Add Level
        </button>
      </div>

      <div className="admin-table">
        <div className="table-header">
          <div className="col-name">Name</div>
          <div className="col-theme">Theme</div>
          <div className="col-difficulty">Difficulty</div>
          <div className="col-layers">Layers</div>
          <div className="col-created">Created</div>
          <div className="col-actions">Actions</div>
        </div>
        {levels.map((level) => (
          <div key={level.id} className="table-row">
            <div className="col-name"><strong>{level.name}</strong></div>
            <div className="col-theme">{level.theme}</div>
            <div className="col-difficulty">{level.difficulty}</div>
            <div className="col-layers">{level.layers}</div>
            <div className="col-created">{level.created}</div>
            <div className="col-actions">
              <button className="btn-pill-purple" style={{marginRight: '8px'}}>Preview</button>
              <button onClick={() => handleDelete(level.id)} className="btn-pill-coral">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================
function PerformanceMetrics() {
  return (
    <div className="admin-content">
      <h2>Performance Metrics</h2>

      <div className="admin-grid">
        <div className="admin-card">
          <h3>⚡ Render Times</h3>
          <div className="metric-item">
            <span>Character Average:</span>
            <strong>8.2 seconds</strong>
          </div>
          <div className="metric-item">
            <span>Level Average:</span>
            <strong>10.1 seconds</strong>
          </div>
          <div className="metric-item">
            <span>API Response:</span>
            <strong>245ms</strong>
          </div>
        </div>

        <div className="admin-card">
          <h3>📊 Success Metrics</h3>
          <div className="metric-item">
            <span>Success Rate:</span>
            <strong style={{color: 'var(--mint)'}}>98.5%</strong>
          </div>
          <div className="metric-item">
            <span>Failed Operations:</span>
            <strong style={{color: 'var(--coral)'}}>2</strong>
          </div>
          <div className="metric-item">
            <span>System Errors:</span>
            <strong style={{color: 'var(--mint)'}}>0</strong>
          </div>
        </div>

        <div className="admin-card">
          <h3>💰 Cost Breakdown</h3>
          <div className="metric-item">
            <span>Characters:</span>
            <strong>$85.40 (1000x)</strong>
          </div>
          <div className="metric-item">
            <span>Levels:</span>
            <strong>$90.20 (450x)</strong>
          </div>
          <div className="metric-item">
            <span>Total This Month:</span>
            <strong>$175.60</strong>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <h3>📈 Detailed Metrics (Last 7 Days)</h3>
        <p style={{color: 'var(--muted)', marginTop: '0'}}>Chart visualization coming soon</p>
      </div>
    </div>
  );
}

// ============================================================================
// ADMIN SETTINGS
// ============================================================================
function AdminSettings() {
  return (
    <div className="admin-content">
      <h2>Settings</h2>

      <div className="admin-card">
        <h3>🔧 System Configuration</h3>
        <div className="setting-item">
          <label>Character Generation Cost</label>
          <input type="number" defaultValue="0.04" step="0.01" className="setting-input" />
        </div>
        <div className="setting-item">
          <label>Level Generation Cost</label>
          <input type="number" defaultValue="0.20" step="0.01" className="setting-input" />
        </div>
        <div className="setting-item">
          <label>Daily Budget Limit</label>
          <input type="number" defaultValue="50" step="5" className="setting-input" />
        </div>
        <button className="btn-primary" style={{marginTop: '16px'}}>Save Settings</button>
      </div>
    </div>
  );
}
