// src/utils/analyticsLogger.js
// Log system events and analytics

export class AnalyticsLogger {
  constructor() {
    this.events = [];
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Log an event
  logEvent(eventType, data = {}, severity = 'info') {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.sessionId,
      eventType,
      severity,
      data,
      timestamp: new Date().toISOString(),
      createdAt: Date.now(),
    };

    this.events.push(event);

    // Log to console in development
    if (import.meta.env && import.meta.env.DEV) {
      const emoji = this.getEmojiForSeverity(severity);
      console.log(`${emoji} [${eventType}]`, data);
    }

    return event;
  }

  getEmojiForSeverity(severity) {
    switch (severity) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return 'ℹ️';
    }
  }

  // Specific event types
  logCharacterGenerated(characterName, duration, cost, deviceId) {
    return this.logEvent('character_generated', {
      characterName,
      duration,
      cost,
      deviceId,
    }, 'success');
  }

  logLevelGenerated(levelName, duration, cost, deviceId, layerCount) {
    return this.logEvent('level_generated', {
      levelName,
      duration,
      cost,
      deviceId,
      layerCount,
    }, 'success');
  }

  logGameStarted(gameType, deviceId) {
    return this.logEvent('game_started', {
      gameType,
      deviceId,
    });
  }

  logGameEnded(gameType, duration, score, deviceId) {
    return this.logEvent('game_ended', {
      gameType,
      duration,
      score,
      deviceId,
    }, 'success');
  }

  logSessionStarted(deviceId, playerName) {
    return this.logEvent('session_started', {
      deviceId,
      playerName,
    });
  }

  logSessionEnded(deviceId, duration) {
    return this.logEvent('session_ended', {
      deviceId,
      duration,
    }, 'success');
  }

  logAPIError(endpoint, error, deviceId) {
    return this.logEvent('api_error', {
      endpoint,
      error: error.message || String(error),
      deviceId,
    }, 'error');
  }

  logAPITimeout(endpoint, timeout, deviceId) {
    return this.logEvent('api_timeout', {
      endpoint,
      timeout,
      deviceId,
    }, 'warning');
  }

  logBudgetWarning(currentUsage, limit) {
    return this.logEvent('budget_warning', {
      currentUsage,
      limit,
      percentage: Math.round((currentUsage / limit) * 100),
    }, 'warning');
  }

  logBudgetExceeded(currentUsage, limit) {
    return this.logEvent('budget_exceeded', {
      currentUsage,
      limit,
    }, 'error');
  }

  logSystemError(error) {
    return this.logEvent('system_error', {
      error: error.message || String(error),
      stack: error.stack,
    }, 'error');
  }

  // Get all events
  getEvents() {
    return this.events;
  }

  // Get events by type
  getEventsByType(eventType) {
    return this.events.filter((e) => e.eventType === eventType);
  }

  // Get events by severity
  getEventsBySeverity(severity) {
    return this.events.filter((e) => e.severity === severity);
  }

  // Get recent events
  getRecent(count = 20) {
    return this.events.slice(-count).reverse();
  }

  // Get error events
  getErrors() {
    return this.getEventsBySeverity('error');
  }

  // Get warnings
  getWarnings() {
    return this.getEventsBySeverity('warning');
  }

  // Statistics
  getStats() {
    const now = Date.now();
    const uptimeMins = Math.round((now - this.startTime) / 1000 / 60);

    return {
      totalEvents: this.events.length,
      uptimeMinutes: uptimeMins,
      errorCount: this.getErrors().length,
      warningCount: this.getWarnings().length,
      eventTypes: [...new Set(this.events.map((e) => e.eventType))].length,
      successRate: this.calculateSuccessRate(),
    };
  }

  calculateSuccessRate() {
    if (this.events.length === 0) return 100;

    const errors = this.getErrors().length;
    return Math.round(((this.events.length - errors) / this.events.length) * 100);
  }

  // Export events
  export() {
    return JSON.stringify({
      sessionId: this.sessionId,
      exportedAt: new Date().toISOString(),
      stats: this.getStats(),
      events: this.events,
    }, null, 2);
  }

  // Clear all events
  clear() {
    this.events = [];
  }

  // Summary
  getSummary() {
    const stats = this.getStats();
    console.log('=== Analytics Summary ===');
    console.log(`Session: ${this.sessionId}`);
    console.log(`Total Events: ${stats.totalEvents}`);
    console.log(`Uptime: ${stats.uptimeMinutes} minutes`);
    console.log(`Errors: ${stats.errorCount}`);
    console.log(`Warnings: ${stats.warningCount}`);
    console.log(`Success Rate: ${stats.successRate}%`);
    console.log('========================');
  }
}

// Global instance
export const analyticsLogger = new AnalyticsLogger();

// Automatic error tracking
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    analyticsLogger.logSystemError(event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    analyticsLogger.logSystemError(event.reason);
  });
}
