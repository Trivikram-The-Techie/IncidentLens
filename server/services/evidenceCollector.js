import { sampleOrderService } from '../../sample-app/orderCheckoutService.js';

export class EvidenceCollector {
  /**
   * Automatically gathers telemetry evidence for the target service:
   * - Cloud Logging (stack traces, error rates, status codes)
   * - Cloud Build / Deploy history (revisions, commits, authors, git diffs)
   * - Cloud Monitoring metrics (error spike, latency percentiles)
   */
  async gatherEvidence(serviceName = 'order-checkout-service', timeWindowMinutes = 15) {
    const startTime = Date.now();
    console.log(`[EvidenceCollector] Gathering evidence for ${serviceName} (window: ${timeWindowMinutes}m)...`);

    // 1. Pull from Cloud Logging
    const rawLogs = sampleOrderService.getRecentLogs(50);
    const errorLogs = rawLogs.filter((l) => l.severity === 'ERROR' || l.severity === 'CRITICAL');
    
    // Extract unique error signatures & stack traces
    const errorSignatures = new Map();
    errorLogs.forEach((log) => {
      const key = log.message.split('\n')[0];
      if (!errorSignatures.has(key)) {
        errorSignatures.set(key, {
          signature: key,
          count: 0,
          sampleTimestamp: log.timestamp,
          stackTrace: log.metadata?.stackTrace || null,
          httpStatus: log.metadata?.httpStatus || 500,
        });
      }
      errorSignatures.get(key).count++;
    });

    // 2. Pull from Cloud Build / Cloud Deploy history
    const deployHistory = sampleOrderService.getDeployHistory();
    const currentRevision = sampleOrderService.getCurrentRevision();
    const previousStable = sampleOrderService.getPreviousStableRevision();

    // 3. Pull from Cloud Monitoring metrics
    const metrics = sampleOrderService.getMetrics();

    // 4. Time correlation: Compare deploy timestamp with error surge
    const deployTime = new Date(currentRevision.deployedAt).getTime();
    const now = Date.now();
    const minutesSinceDeploy = Math.max(1, Math.round((now - deployTime) / (1000 * 60)));

    const evidencePacket = {
      serviceName,
      gatheredAt: new Date().toISOString(),
      collectionDurationMs: Date.now() - startTime,
      cloudLogging: {
        totalLogsEvaluated: rawLogs.length,
        errorCount: errorLogs.length,
        uniqueErrorSignatures: Array.from(errorSignatures.values()),
        recentErrorSamples: errorLogs.slice(0, 5),
      },
      cloudDeploy: {
        activeRevisionId: currentRevision.id,
        activeVersion: currentRevision.version,
        activeImage: currentRevision.image,
        deployedAt: currentRevision.deployedAt,
        minutesSinceDeploy,
        author: currentRevision.author,
        commit: currentRevision.commit,
        previousStableRevision: {
          id: previousStable.id,
          version: previousStable.version,
          image: previousStable.image,
          deployedAt: previousStable.deployedAt,
          author: previousStable.author,
        },
      },
      cloudMonitoring: {
        errorRatePercent: metrics.errorRate,
        p50LatencyMs: metrics.p50LatencyMs,
        p95LatencyMs: metrics.p95LatencyMs,
        p99LatencyMs: metrics.p99LatencyMs,
        totalRequestsInWindow: metrics.totalRequests,
        metricThresholdCondition: 'run.googleapis.com/request_count with response_code_class >= 500 > 5%',
      },
      correlation: {
        temporalMatch: minutesSinceDeploy <= timeWindowMinutes,
        summary: `Error spike (${metrics.errorRate}%) appeared immediately following deployment of revision ${currentRevision.id} (commit ${currentRevision.commit.hash}) by ${currentRevision.author}.`,
      },
    };

    console.log(`[EvidenceCollector] Evidence packet assembled in ${evidencePacket.collectionDurationMs}ms`);
    return evidencePacket;
  }
}

export const evidenceCollector = new EvidenceCollector();
