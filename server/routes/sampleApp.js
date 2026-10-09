import express from 'express';
import { sampleOrderService } from '../../sample-app/orderCheckoutService.js';
import { broadcastEvent } from './events.js';

export const sampleAppRouter = express.Router();

// 1. Process checkout request
sampleAppRouter.post('/checkout', (req, res) => {
  const result = sampleOrderService.processCheckout(req.body);
  if (!result.success) {
    return res.status(500).json(result);
  }
  res.json(result);
});

// 2. Telemetry metrics
sampleAppRouter.get('/metrics', (req, res) => {
  res.json(sampleOrderService.getMetrics());
});

// 3. Telemetry logs (Cloud Logging)
sampleAppRouter.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit || '30', 10);
  res.json({ logs: sampleOrderService.getRecentLogs(limit) });
});

// 4. Revisions & deploy history
sampleAppRouter.get('/revisions', (req, res) => {
  res.json({
    activeRevision: sampleOrderService.getCurrentRevision(),
    history: sampleOrderService.getDeployHistory(),
  });
});

// 5. Deploy revision manually
sampleAppRouter.post('/deploy', (req, res) => {
  const { version = '1.1.0' } = req.body;
  try {
    const revision = sampleOrderService.deployRevision(version);
    broadcastEvent('revision_changed', { revision });
    res.json({ success: true, activeRevision: revision });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Chaos: Deliberately break the app by deploying v1.1.0 and generating failing requests
sampleAppRouter.post('/chaos/break', (req, res) => {
  try {
    console.log('[SampleApp] 💥 Chaos triggered: Deploying broken revision v1.1.0...');
    sampleOrderService.deployRevision('1.1.0');

    // Generate failing checkout requests
    for (let i = 0; i < 8; i++) {
      sampleOrderService.processCheckout({
        isGuest: true,
        amount: Math.floor(40 + Math.random() * 150),
      });
    }

    const metrics = sampleOrderService.getMetrics();
    broadcastEvent('service_broken', { metrics, revision: sampleOrderService.getCurrentRevision() });
    res.json({ success: true, message: 'Bad deploy v1.1.0 activated and error spike triggered.', metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Chaos: Heal the app by rolling back to v1.0.0
sampleAppRouter.post('/chaos/heal', (req, res) => {
  try {
    console.log('[SampleApp] 🛡️ Healing service: Restoring healthy revision v1.0.0...');
    sampleOrderService.deployRevision('1.0.0');

    for (let i = 0; i < 5; i++) {
      sampleOrderService.processCheckout({ isGuest: true, amount: 50.0 });
    }

    const metrics = sampleOrderService.getMetrics();
    broadcastEvent('service_healed', { metrics, revision: sampleOrderService.getCurrentRevision() });
    res.json({ success: true, message: 'Healthy revision v1.0.0 restored.', metrics });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
