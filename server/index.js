import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { alertsRouter } from './routes/alerts.js';
import { incidentsRouter } from './routes/incidents.js';
import { slackRouter } from './routes/slack.js';
import { sampleAppRouter } from './routes/sampleApp.js';
import { eventsRouter } from './routes/events.js';
import { geminiAnalyzer } from './services/geminiAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static SRE cockpit dashboard
app.use(express.static(path.join(__dirname, 'static')));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'IncidentLens Copilot',
    timestamp: new Date().toISOString(),
  });
});

// Mount modular API routers
app.use('/api/alerts', alertsRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/slack', slackRouter);
app.use('/api/sample-app', sampleAppRouter);
app.use('/api/events', eventsRouter);

// Settings endpoint
app.get('/api/config', (req, res) => {
  res.json({
    hasGeminiKey: Boolean(config.geminiApiKey),
    geminiKeyMasked: config.geminiApiKey ? `${config.geminiApiKey.slice(0, 6)}...` : '',
    hasSlackWebhook: Boolean(config.slackWebhookUrl),
    slackWebhookMasked: config.slackWebhookUrl ? `${config.slackWebhookUrl.slice(0, 24)}...` : '',
    gcpProject: config.gcpProjectId,
    gcpRegion: config.gcpRegion,
    useVertexAi: config.useVertexAi,
  });
});

app.post('/api/config', (req, res) => {
  const { geminiApiKey, slackWebhookUrl, gcpProjectId } = req.body;
  if (geminiApiKey !== undefined) {
    geminiAnalyzer.setApiKey(geminiApiKey);
  }
  if (slackWebhookUrl !== undefined) {
    config.slackWebhookUrl = slackWebhookUrl;
  }
  if (gcpProjectId !== undefined) {
    config.gcpProjectId = gcpProjectId;
  }
  res.json({ success: true, message: 'Configuration updated successfully.' });
});

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'static', 'index.html'));
});

const server = app.listen(config.port, () => {
  console.log(`
========================================================================
🚀 IncidentLens Cloud Run Service listening on http://localhost:${config.port}
- On-Call Cockpit UI: http://localhost:${config.port}/
- Cloud Monitoring Pub/Sub Webhook: http://localhost:${config.port}/api/alerts/pubsub
- Interactive Slack Actions: http://localhost:${config.port}/api/slack/actions
- Sample Microservice: http://localhost:${config.port}/api/sample-app
========================================================================
`);
});

export default app;
