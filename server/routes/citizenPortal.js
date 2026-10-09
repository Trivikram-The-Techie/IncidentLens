import express from 'express';

export const citizenPortalRouter = express.Router();

const PYTHON_PORTAL_URL = 'http://localhost:8081';

// 1. Get Citizen Portal Health
citizenPortalRouter.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_PORTAL_URL}/api/health`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({
      status: 'LOCAL_EMULATED',
      service: 'citizen-certificate-portal',
      version: '1.0.4',
      active_revision: 'citizen-portal-00001-prod',
      timestamp: new Date().toISOString()
    });
  }
});

// 2. Apply for Citizen Certificate / Ration / Fee
citizenPortalRouter.post('/apply', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_PORTAL_URL}/api/certificates/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Citizen Portal service not reachable' });
  }
});

// 3. Inject Peak-Time Fault
citizenPortalRouter.post('/fault', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_PORTAL_URL}/api/chaos/inject-fault`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({
      success: true,
      message: 'Emulated fault injected: Database connection pool exhaustion under peak deadline load.'
    });
  }
});

// 4. Heal Portal
citizenPortalRouter.post('/heal', async (req, res) => {
  try {
    const response = await fetch(`${PYTHON_PORTAL_URL}/api/chaos/heal`, { method: 'POST' });
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.json({
      success: true,
      message: 'Citizen portal restored to healthy state.'
    });
  }
});
