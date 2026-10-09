import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY || '',
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || '',
  gcpProjectId: process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'incidentlens-prod-gcp',
  gcpRegion: process.env.GCP_REGION || 'us-central1',
  sampleServiceName: process.env.SAMPLE_SERVICE_NAME || 'order-checkout-service',
  useVertexAi: process.env.USE_VERTEX_AI === 'true',
  environment: process.env.NODE_ENV || 'development',
};
