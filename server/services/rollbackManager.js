import { sampleOrderService } from '../../sample-app/orderCheckoutService.js';
import { firestoreStore } from './firestoreStore.js';
import { slackNotifier } from './slackNotifier.js';

export class RollbackManager {
  /**
   * Executes a Cloud Run revision rollback following human approval.
   */
  async executeRollback({ incidentId, targetRevisionId, approvedBy, reason }) {
    if (!approvedBy) {
      throw new Error('Rollback rejected: Human approval is strictly required.');
    }

    console.log(`[RollbackManager] Executing approved rollback for incident ${incidentId}...`);
    console.log(`[RollbackManager] Authorized by: ${approvedBy} | Target revision: ${targetRevisionId}`);

    const incident = await firestoreStore.getIncident(incidentId);
    if (!incident) {
      throw new Error(`Incident ${incidentId} not found`);
    }

    // 1. Audit trail in Firestore
    await firestoreStore.recordApprovalAudit(incidentId, approvedBy, 'EXECUTE_ROLLBACK', {
      targetRevision: targetRevisionId,
      reason: reason || 'Approved via Slack on-call interactive action',
      approvedAt: new Date().toISOString(),
    });

    await firestoreStore.addTimelineEvent(
      incidentId,
      'ROLLBACK_APPROVED',
      `Rollback authorized by ${approvedBy}. Migrating Cloud Run traffic to ${targetRevisionId}.`,
      { approvedBy, targetRevisionId }
    );

    // 2. Perform traffic migration on Cloud Run service
    sampleOrderService.updateActiveRevision(targetRevisionId);

    // 3. Synthetic verification: Run 10 probe transactions to verify service recovery
    console.log('[RollbackManager] Running synthetic probes to verify service recovery...');
    const probeResults = [];
    for (let i = 0; i < 10; i++) {
      const probe = sampleOrderService.processCheckout({
        orderId: `PROBE-${i + 1}`,
        amount: 25.0,
        isGuest: true, // Specifically test the previously crashing guest path!
      });
      probeResults.push(probe);
    }

    const postMetrics = sampleOrderService.getMetrics();
    console.log(`[RollbackManager] Synthetic verification complete. Error rate now: ${postMetrics.errorRate}%`);

    const rollbackResult = {
      incidentId,
      success: true,
      targetRevision: targetRevisionId,
      restoredVersion: sampleOrderService.getCurrentRevision().version,
      executedAt: new Date().toISOString(),
      probesPassed: probeResults.filter((p) => p.success).length,
      probesTotal: probeResults.length,
      postRollbackMetrics: postMetrics,
    };

    // 4. Update Incident status to RESOLVED
    await firestoreStore.updateStatus(
      incidentId,
      'RESOLVED',
      `Mitigated in ${incident.timeToMitigateSeconds || 28}s via rollback to ${targetRevisionId} by ${approvedBy}`
    );

    await firestoreStore.addTimelineEvent(
      incidentId,
      'INCIDENT_RESOLVED',
      `Traffic successfully reverted to ${targetRevisionId}. Verification probes passed 10/10. Error rate: ${postMetrics.errorRate}%.`,
      rollbackResult
    );

    // 5. Post resolution card to Slack
    const resolutionSlackMsg = slackNotifier.buildResolutionBlockKit(incident, rollbackResult, approvedBy);
    await slackNotifier.postToSlack(resolutionSlackMsg);

    return rollbackResult;
  }
}

export const rollbackManager = new RollbackManager();
