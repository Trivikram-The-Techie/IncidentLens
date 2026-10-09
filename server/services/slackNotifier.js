import { config } from '../config.js';

export class SlackNotifier {
  constructor() {
    this.messages = [];
  }

  getRecentMessages() {
    return this.messages;
  }

  /**
   * Builds an official Slack Block Kit payload with root-cause hypothesis,
   * suspect commit diff, runbook, and human-in-the-loop Rollback button.
   */
  buildSlackBlockKit(incident, diagnosis, evidence) {
    const currentRev = evidence.cloudDeploy;
    const prevStable = evidence.cloudDeploy.previousStableRevision;
    const metrics = evidence.cloudMonitoring;

    return {
      channel: '#incidents-oncall',
      text: `🚨 [${diagnosis.severity}] IncidentLens: Outage on ${incident.service} - Suspected bad deploy ${currentRev.commit?.hash}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🚨 [${diagnosis.severity}] IncidentLens Copilot: High 5xx Error Surge`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Incident ID:* \`${incident.id}\` | *Service:* \`${incident.service}\` | *Status:* *${incident.status}*`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*💥 Error Rate:*\n\`${metrics.errorRatePercent}%\` (Baseline < 0.1%)`,
            },
            {
              type: 'mrkdwn',
              text: `*⏱️ p99 Latency:*\n\`${metrics.p99LatencyMs}ms\``,
            },
            {
              type: 'mrkdwn',
              text: `*🚀 Recent Deploy:*\n\`${currentRev.activeRevisionId}\` (${currentRev.minutesSinceDeploy}m ago)`,
            },
            {
              type: 'mrkdwn',
              text: `*👤 Author:*\n\`${currentRev.author}\``,
            },
          ],
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🧠 Gemini on Vertex AI Root-Cause Hypothesis:*\n> *Confidence: ${diagnosis.confidenceScore}%* 🎯\n\n${diagnosis.rootCauseHypothesis}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*🔍 Suspected Breaking Code (Commit \`${currentRev.commit?.hash}\`):*\n\`\`\`${currentRev.commit?.diff}\`\`\``,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*📋 Recommended Runbook Action:* \n${diagnosis.runbookSteps.map((step, i) => `*${i + 1}.* ${step}`).join('\n')}`,
          },
        },
        {
          type: 'divider',
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*⚠️ Automated Rollback Available*\nIncidentLens can instantly divert 100% traffic back to stable revision \`${prevStable.id}\` (v${prevStable.version}). *Human approval is required before execution.*`,
          },
        },
        {
          type: 'actions',
          block_id: 'incident_actions_block',
          elements: [
            {
              type: 'button',
              action_id: 'approve_rollback',
              text: {
                type: 'plain_text',
                text: `⚡ Approve Rollback to v${prevStable.version}`,
                emoji: true,
              },
              style: 'danger',
              value: JSON.stringify({
                incidentId: incident.id,
                targetRevision: prevStable.id,
                version: prevStable.version,
              }),
            },
            {
              type: 'button',
              action_id: 'view_evidence',
              text: {
                type: 'plain_text',
                text: '🔍 Inspect Logs & Traces',
                emoji: true,
              },
              value: incident.id,
            },
            {
              type: 'button',
              action_id: 'acknowledge_alert',
              text: {
                type: 'plain_text',
                text: '👀 Acknowledge',
                emoji: true,
              },
              value: incident.id,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Powered by *Gemini 3.8 Flash* on Google Cloud | Timestamp: \`${new Date().toISOString()}\``,
            },
          ],
        },
      ],
    };
  }

  buildResolutionBlockKit(incident, rollbackResult, approvedBy) {
    return {
      channel: '#incidents-oncall',
      text: `✅ [RESOLVED] IncidentLens: Service ${incident.service} restored to v${rollbackResult.restoredVersion}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `✅ [RESOLVED] Incident ${incident.id} Mitigated`,
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Human Approval Confirmed:* Rollback approved and authorized by *${approvedBy}*.\n*Action Taken:* 100% traffic redirected to known good revision \`${rollbackResult.targetRevision}\` (v${rollbackResult.restoredVersion}).`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*🎯 Post-Rollback Error Rate:*\n\`${rollbackResult.postRollbackMetrics.errorRate}%\` (Restored)`,
            },
            {
              type: 'mrkdwn',
              text: `*⚡ Verification Latency:*\n\`${rollbackResult.postRollbackMetrics.p50LatencyMs}ms\``,
            },
            {
              type: 'mrkdwn',
              text: `*⏱️ Total Time to Mitigate:*\n\`${incident.timeToMitigateSeconds || 28} seconds\``,
            },
            {
              type: 'mrkdwn',
              text: `*🛡️ Revision Status:*\n\`v1.1.0 (Quarantined)\``,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Incident marked *RESOLVED* in Cloud Firestore at \`${new Date().toISOString()}\``,
            },
          ],
        },
      ],
    };
  }

  async postToSlack(messagePayload) {
    messagePayload.id = `SLACK_MSG_${Date.now()}`;
    messagePayload.sentAt = new Date().toISOString();
    this.messages.unshift(messagePayload);

    if (config.slackWebhookUrl) {
      try {
        console.log(`[SlackNotifier] Sending message to real Slack webhook: ${config.slackWebhookUrl}`);
        const res = await fetch(config.slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messagePayload),
        });
        if (!res.ok) {
          console.warn(`[SlackNotifier] Webhook responded with status: ${res.status}`);
        } else {
          console.log('[SlackNotifier] Successfully posted alert card to Slack channel!');
        }
      } catch (err) {
        console.warn('[SlackNotifier] Error calling Slack webhook:', err.message);
      }
    } else {
      console.log('[SlackNotifier] Real SLACK_WEBHOOK_URL not configured. Message stored in live simulator buffer.');
    }

    return messagePayload;
  }
}

export const slackNotifier = new SlackNotifier();
