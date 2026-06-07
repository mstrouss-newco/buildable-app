// src/utils/performanceTracker.js
// Track API performance, render times, and costs

export class PerformanceTracker {
  constructor() {
    this.metrics = [];
    this.startTimes = {};
  }

  // Start tracking an operation
  start(operationId) {
    this.startTimes[operationId] = {
      startTime: performance.now(),
      startMs: Date.now(),
    };
  }

  // End tracking and record metric
  end(operationId, operationType, status = 'success', cost = 0) {
    if (!this.startTimes[operationId]) {
      console.warn(`No start time found for ${operationId}`);
      return null;
    }

    const { startTime, startMs } = this.startTimes[operationId];
    const duration = performance.now() - startTime;
    const durationMs = Math.round(duration);

    const metric = {
      id: operationId,
      operationType,
      duration: durationMs,
      status,
      cost,
      timestamp: new Date(startMs).toISOString(),
      createdAt: startMs,
    };

    this.metrics.push(metric);
    delete this.startTimes[operationId];

    // Log to console in development
    if (import.meta.env && import.meta.env.DEV) {
      console.log(
        `✅ [${operationType}] ${durationMs}ms | Cost: $${cost.toFixed(4)} | Status: ${status}`
      );
    }

    return metric;
  }

  // Get all metrics
  getMetrics() {
    return this.metrics;
  }

  // Get metrics for a specific operation type
  getMetricsByType(operationType) {
    return this.metrics.filter((m) => m.operationType === operationType);
  }

  // Get average duration for operation type
  getAverageDuration(operationType) {
    const typeMetrics = this.getMetricsByType(operationType);
    if (typeMetrics.length === 0) return 0;

    const total = typeMetrics.reduce((sum, m) => sum + m.duration, 0);
    return Math.round(total / typeMetrics.length);
  }

  // Get total cost for operation type
  getTotalCost(operationType) {
    const typeMetrics = this.getMetricsByType(operationType);
    return typeMetrics.reduce((sum, m) => sum + m.cost, 0);
  }

  // Get success rate
  getSuccessRate(operationType = null) {
    const metrics = operationType
      ? this.getMetricsByType(operationType)
      : this.metrics;

    if (metrics.length === 0) return 0;

    const successful = metrics.filter((m) => m.status === 'success').length;
    return Math.round((successful / metrics.length) * 100);
  }

  // Get statistics
  getStats(operationType = null) {
    const metrics = operationType
      ? this.getMetricsByType(operationType)
      : this.metrics;

    if (metrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        totalCost: 0,
        successRate: 0,
        minDuration: 0,
        maxDuration: 0,
      };
    }

    const durations = metrics.map((m) => m.duration);
    const totalCost = metrics.reduce((sum, m) => sum + m.cost, 0);
    const successful = metrics.filter((m) => m.status === 'success').length;

    return {
      count: metrics.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b) / durations.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      totalCost: totalCost,
      successRate: Math.round((successful / metrics.length) * 100),
    };
  }

  // Clear metrics
  clear() {
    this.metrics = [];
    this.startTimes = {};
  }

  // Export metrics to JSON
  export() {
    return JSON.stringify(this.metrics, null, 2);
  }

  // Get recent metrics (last N)
  getRecent(count = 10) {
    return this.metrics.slice(-count).reverse();
  }
}

// Global instance
export const performanceTracker = new PerformanceTracker();

// Helper function to wrap API calls
export async function trackAPI(operationType, apiCall, cost = 0) {
  const id = `${operationType}_${Date.now()}`;
  performanceTracker.start(id);

  try {
    const result = await apiCall();
    performanceTracker.end(id, operationType, 'success', cost);
    return result;
  } catch (error) {
    performanceTracker.end(id, operationType, 'failed', 0);
    throw error;
  }
}
