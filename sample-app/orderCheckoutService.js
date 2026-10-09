import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class OrderCheckoutService {
  constructor() {
    this.revisionsData = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'revisions.json'), 'utf8')
    );
    // Telemetry log buffer (simulating Google Cloud Logging)
    this.logs = [];
    // Metrics buffer (simulating Google Cloud Monitoring metrics)
    this.requestHistory = [];
    this.maxLogs = 200;

    // Default to v1.0.0 healthy
    this.currentRevisionId = 'order-checkout-service-00001-v100';
    this.revisions = this.revisionsData.revisions;
    this.updateActiveRevision(this.currentRevisionId);
  }

  getCurrentRevision() {
    return this.revisions.find((r) => r.id === this.currentRevisionId);
  }

  getPreviousStableRevision() {
    return this.revisions.find((r) => r.version === '1.0.0');
  }

  updateActiveRevision(revisionId) {
    this.currentRevisionId = revisionId;
    this.revisions.forEach((rev) => {
      rev.active = rev.id === revisionId;
      rev.trafficPercent = rev.id === revisionId ? 100 : 0;
    });
    this.addLog('INFO', `Cloud Run traffic updated: 100% routed to revision ${revisionId}`, {
      revisionId,
      action: 'TRAFFIC_MIGRATION',
    });
  }

  addLog(severity, message, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      severity,
      message,
      service: 'order-checkout-service',
      revision: this.currentRevisionId,
      metadata: {
        traceId: 'projects/incidentlens-prod-gcp/traces/' + Math.random().toString(36).substring(2, 12),
        ...metadata,
      },
    };
    this.logs.unshift(logEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return logEntry;
  }

  processCheckout(order = {}) {
    const startTime = Date.now();
    const currentRev = this.getCurrentRevision();
    const isGuest = order.isGuest !== undefined ? order.isGuest : true;
    const orderId = order.orderId || 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const amount = order.amount || 79.99;

    // Simulate behavior based on revision
    if (currentRev.version === '1.1.0') {
      // THE BUG: v1.1.0 crashes on guest checkouts (or 85% of transactions)
      const simulatedLatency = Math.floor(2500 + Math.random() * 1500); // Latency spikes due to retry loops & timeouts

      const stackTrace = `TypeError: Cannot read properties of undefined (reading 'calculateRegional')
    at calculateRegionalTax (/workspace/src/taxEngine.js:54:32)
    at OrderService.processPayment (/workspace/src/checkout.js:112:15)
    at async /workspace/node_modules/express/lib/router/layer.js:95:5
    at async next (/workspace/node_modules/express/lib/router/route.js:144:13)`;

      const errorMessage = `CRITICAL: Unhandled exception during checkout processing for order ${orderId}: TypeError: Cannot read properties of undefined (reading 'calculateRegional')`;

      const log = this.addLog('ERROR', errorMessage, {
        orderId,
        isGuest,
        amount,
        stackTrace,
        httpStatus: 500,
        commit: currentRev.commit.hash,
      });

      this.requestHistory.unshift({
        timestamp: new Date().toISOString(),
        status: 500,
        durationMs: simulatedLatency,
        revision: currentRev.id,
      });

      return {
        success: false,
        status: 500,
        error: 'InternalServerError: Cannot read properties of undefined (reading calculateRegional)',
        log,
        durationMs: simulatedLatency,
      };
    } else {
      // Healthy v1.0.0
      const latency = Math.floor(25 + Math.random() * 30);
      this.addLog('INFO', `Checkout completed successfully for order ${orderId}`, {
        orderId,
        amount,
        httpStatus: 200,
      });

      this.requestHistory.unshift({
        timestamp: new Date().toISOString(),
        status: 200,
        durationMs: latency,
        revision: currentRev.id,
      });

      return {
        success: true,
        status: 200,
        orderId,
        amount,
        durationMs: latency,
      };
    }
  }

  getMetrics() {
    const recent = this.requestHistory.slice(0, 50);
    const instant = this.requestHistory.slice(0, 10);

    if (recent.length === 0) {
      return {
        totalRequests: 0,
        errorCount: 0,
        errorRate: 0,
        instantErrorRate: 0,
        p50LatencyMs: 35,
        p95LatencyMs: 65,
        p99LatencyMs: 95,
        activeRevision: this.getCurrentRevision(),
      };
    }

    const errors = recent.filter((r) => r.status >= 500).length;
    const instantErrors = instant.filter((r) => r.status >= 500).length;

    const errorRate = (errors / recent.length) * 100;
    const instantErrorRate = instant.length > 0 ? (instantErrors / instant.length) * 100 : 0;

    const sortedDurations = [...recent.map((r) => r.durationMs)].sort((a, b) => a - b);
    const p50 = sortedDurations[Math.floor(sortedDurations.length * 0.5)] || 35;
    const p95 = sortedDurations[Math.floor(sortedDurations.length * 0.95)] || 65;
    const p99 = sortedDurations[Math.floor(sortedDurations.length * 0.99)] || 95;

    return {
      totalRequests: recent.length,
      errorCount: errors,
      errorRate: Math.round(instantErrorRate * 10) / 10, // Instantaneous error rate reflects live service state
      rollingErrorRate: Math.round(errorRate * 10) / 10,
      p50LatencyMs: p50,
      p95LatencyMs: p95,
      p99LatencyMs: p99,
      activeRevision: this.getCurrentRevision(),
    };
  }

  deployRevision(version) {
    const target = this.revisions.find((r) => r.version === version);
    if (!target) {
      throw new Error(`Revision with version ${version} not found`);
    }
    this.updateActiveRevision(target.id);
    return target;
  }

  getRecentLogs(limit = 30) {
    return this.logs.slice(0, limit);
  }

  getDeployHistory() {
    return this.revisions;
  }
}

export const sampleOrderService = new OrderCheckoutService();
