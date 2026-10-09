import express from 'express';
import { evidenceCollector } from '../services/evidenceCollector.js';
import { geminiAnalyzer } from '../services/geminiAnalyzer.js';
import { slackNotifier } from '../services/slackNotifier.js';
import { firestoreStore } from '../services/firestoreStore.js';
import { sampleOrderService } from '../../sample-app/orderCheckoutService.js';
import { broadcastEvent } from './events.js';

export const alertsRouter = express.Router();

/**
 * Core incident processing pipeline:
 * Alert -> Evidence Gathering -> Gemini Analysis -> Slack Dispatch -> Firestore Save
 */
async function processIncidentAlert(alertPayload) {
  const serviceName = alertPayload.resource?.labels?.service_name || alertPayload.serviceName || 'order-checkout-service';
  const conditionName = alertPayload.condition_name || alertPayload.conditionName || 'Elevated 5xx Error Rate > 5%';
  const incidentId = alertPayload.incident_id ? `INC-${alertPayload.incident_id}` : `INC-${Math.floor(100000 + Math.random() * 900000)}`;

  console.log(`\n======================================================`);
  console.log(`🚨 [IncidentLens] ALERT RECEIVED: ${incidentId} for ${serviceName}`);
  console.log(`   Condition: ${conditionName}`);
  console.log(`======================================================`);

  // 1. Initialize Incident in Firestore
  const initialIncident = {
    id: incidentId,
    service: serviceName,
    title: `Elevated 5xx Errors on ${serviceName}`,
    severity: 'SEV-1',
    status: 'ANALYZING',
    alertPayload,
    createdAt: new Date().toISOString(),
    timeline: [
      {
        timestamp: new Date().toISOString(),
        type: 'ALERT_INGESTED',
        description: `Alert ingested from Cloud Monitoring Pub/Sub: ${conditionName}`,
      },
    ],
  };
  await firestoreStore.saveIncident(initialIncident);
  broadcastEvent('incident_created', initialIncident);

  // 2. Automated Evidence Gathering (Cloud Logging + Cloud Build/Deploy + Metrics)
  console.log(`[IncidentLens] 🔍 Auto-gathering evidence from Cloud Logging, Cloud Build, and Cloud Monitoring...`);
  const evidence = await evidenceCollector.gatherEvidence(serviceName, 15);
  await firestoreStore.addTimelineEvent(
    incidentId,
    'EVIDENCE_GATHERED',
    `Harvested ${evidence.cloudLogging.errorCount} error logs, recent deploy ${evidence.cloudDeploy.activeRevisionId}, and telemetry metrics.`
  );
  broadcastEvent('evidence_gathered', { incidentId, evidence });

  // 3. Gemini 3.8 Flash on Vertex AI Root Cause Synthesis
  console.log(`[IncidentLens] 🧠 Synthesizing root-cause hypothesis and runbook via Gemini on Vertex AI...`);
  const diagnosis = await geminiAnalyzer.analyzeIncident(alertPayload, evidence);
  await firestoreStore.addTimelineEvent(
    incidentId,
    'DIAGNOSIS_COMPLETE',
    `Gemini diagnosis generated with ${diagnosis.confidence || diagnosis.confidenceScore + '%' || 'HIGH'} confidence. Likely cause: ${diagnosis.likelyCause?.slice(0, 80) || 'Analyzed'}.`
  );
  broadcastEvent('diagnosis_complete', { incidentId, diagnosis });

  // 4. Dispatch Rich Slack Block Kit notification with Rollback button
  console.log(`[IncidentLens] 💬 Posting interactive diagnosis card to Slack #incidents-oncall...`);
  const slackMessage = slackNotifier.buildSlackBlockKit(initialIncident, diagnosis, evidence);
  const postedSlack = await slackNotifier.postToSlack(slackMessage);

  // 5. Update Firestore incident with full dossier
  const completedIncident = {
    ...initialIncident,
    status: 'DIAGNOSED',
    severity: diagnosis.severity || 'CRITICAL',
    evidence,
    diagnosis,
    slackMessageId: postedSlack.id,
    updatedAt: new Date().toISOString(),
  };
  await firestoreStore.saveIncident(completedIncident);
  broadcastEvent('incident_updated', completedIncident);

  console.log(`[IncidentLens] ✨ 30-Second Diagnosis Pipeline Completed for ${incidentId}! Waiting for human approval.`);
  return completedIncident;
}

// 1. Google Cloud Monitoring Webhook
alertsRouter.post('/webhook', async (req, res) => {
  try {
    const payload = req.body.incident || req.body;
    const incident = await processIncidentAlert(payload);
    res.status(200).json({ success: true, incidentId: incident.id, status: incident.status });
  } catch (err) {
    console.error('[AlertsRouter] Error processing webhook:', err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Google Cloud Pub/Sub Push Subscription Endpoint
alertsRouter.post('/pubsub', async (req, res) => {
  try {
    let alertData = {};
    if (req.body?.message?.data) {
      const decoded = Buffer.from(req.body.message.data, 'base64').toString('utf8');
      alertData = JSON.parse(decoded);
    } else {
      alertData = req.body;
    }
    const incident = await processIncidentAlert(alertData);
    res.status(200).json({ success: true, incidentId: incident.id });
  } catch (err) {
    console.error('[AlertsRouter] Error processing Pub/Sub message:', err);
    res.status(500).json({ error: err.message });
  }
});

// 3. Demo / Cockpit Trigger Endpoint
alertsRouter.post('/simulate', async (req, res) => {
  try {
    const { scenario = 'citizen_portal_deadline_crash' } = req.body;

    let targetService = 'citizen-certificate-portal';
    let conditionName = 'Cloud Run log-based alert: Database connection pool exhausted';
    let policyName = 'Citizen Portal Peak Application Deadline Outage Policy';
    let summary = 'Citizen Portal (certificates & ration cards) failing under peak deadline load: Database connection pool limit (20) reached.';

    if (scenario === 'citizen_portal_deadline_crash') {
      targetService = 'citizen-certificate-portal';
      try {
        await fetch('http://localhost:8081/api/chaos/inject-fault', { method: 'POST' });
      } catch (e) {}
    } else if (scenario === 'insufficient_evidence_test') {
      // Edge case testing: triggers alert with zero error logs to test "insufficient evidence" handling
      targetService = 'citizen-certificate-portal';
      conditionName = 'Cloud Monitoring anomaly spike with zero matching application logs';
      policyName = 'Zero-Log Transient Alert';
      summary = 'Transient metric alert fired but no application error traces found.';
    } else {
      targetService = 'order-checkout-service';
      conditionName = 'Cloud Run service error rate > 5% for 1m';
      policyName = 'Production 5xx Error Spike Alert Policy';
      summary = 'Cloud Run service order-checkout-service has an error rate of 88.5%, violating policy threshold (5.0%).';
      sampleOrderService.deployRevision('1.1.0');
      for (let i = 0; i < 6; i++) {
        sampleOrderService.processCheckout({ isGuest: true, amount: 89.0 });
      }
    }

    const simulatedAlert = {
      incident_id: `${Math.floor(100000 + Math.random() * 900000)}`,
      condition_name: conditionName,
      policy_name: policyName,
      resource: {
        type: 'cloud_run_revision',
        labels: {
          service_name: targetService,
          project_id: 'incidentlens-gov-gcp',
          location: 'us-central1',
        },
      },
      summary,
      started_at: Math.floor(Date.now() / 1000) - 45,
      state: 'open',
    };

    const incident = await processIncidentAlert(simulatedAlert);
    res.status(200).json({ success: true, incident });
  } catch (err) {
    console.error('[AlertsRouter] Error in /simulate:', err);
    res.status(500).json({ error: err.message });
  }
});
