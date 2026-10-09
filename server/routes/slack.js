import express from 'express';
import { rollbackManager } from '../services/rollbackManager.js';
import { slackNotifier } from '../services/slackNotifier.js';
import { firestoreStore } from '../services/firestoreStore.js';
import { broadcastEvent } from './events.js';

export const slackRouter = express.Router();

// 1. Get recent Slack messages for the UI simulator
slackRouter.get('/messages', (req, res) => {
  res.json({
    messages: slackNotifier.getRecentMessages(),
  });
});

// 2. Handle interactive Slack actions (e.g. human approval rollback button)
slackRouter.post('/actions', async (req, res) => {
  try {
    let payload = req.body;
    // Slack sends interactive payloads as form-urlencoded payload string in real Slack apps
    if (typeof payload.payload === 'string') {
      payload = JSON.parse(payload.payload);
    }

    const action = payload.actions?.[0] || payload.action || {};
    const actionId = action.action_id || action.actionId;
    const user = payload.user?.name || payload.user?.username || payload.approvedBy || 'alex.chen (On-Call Lead)';

    console.log(`[SlackRouter] Interactive action received: ${actionId} by ${user}`);

    if (actionId === 'approve_rollback') {
      let actionValue = {};
      try {
        actionValue = JSON.parse(action.value || '{}');
      } catch (e) {
        actionValue = action.value || {};
      }

      const incidentId = actionValue.incidentId || payload.incidentId;
      const targetRevision = actionValue.targetRevision || payload.targetRevision || 'order-checkout-service-00001-v100';

      const rollbackResult = await rollbackManager.executeRollback({
        incidentId,
        targetRevisionId: targetRevision,
        approvedBy: user,
        reason: 'Approved via interactive Slack on-call card',
      });

      const updatedIncident = await firestoreStore.getIncident(incidentId);
      broadcastEvent('rollback_executed', { incidentId, rollbackResult, updatedIncident });

      return res.status(200).json({
        success: true,
        message: `Rollback to ${targetRevision} executed with human approval by ${user}.`,
        rollbackResult,
        updatedIncident,
      });
    }

    if (actionId === 'acknowledge_alert') {
      const incidentId = action.value || payload.incidentId;
      await firestoreStore.addTimelineEvent(incidentId, 'ACKNOWLEDGED', `Alert acknowledged by ${user}`);
      broadcastEvent('incident_acknowledged', { incidentId, user });
      return res.status(200).json({ success: true, message: `Alert acknowledged by ${user}` });
    }

    return res.status(200).json({ success: true, action: actionId });
  } catch (err) {
    console.error('[SlackRouter] Error handling interactive action:', err);
    res.status(500).json({ error: err.message });
  }
});
