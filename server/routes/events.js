import express from 'express';

export const eventsRouter = express.Router();

const clients = new Set();

export function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: new Date().toISOString() })}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch (e) {
      clients.delete(res);
    }
  }
}

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  clients.add(res);
  console.log(`[SSE] Cockpit client connected. Total clients: ${clients.size}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', clients: clients.size })}\n\n`);

  req.on('close', () => {
    clients.delete(res);
    console.log(`[SSE] Cockpit client disconnected. Remaining clients: ${clients.size}`);
  });
});
