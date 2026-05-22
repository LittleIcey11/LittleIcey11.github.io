const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

let browser = null;
const sessions = new Map();

async function initBrowser() {
  if (!browser) {
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process',
        ],
      });
      console.log('✅ Chromium initialized');
    } catch (error) {
      console.error('❌ Browser init failed:', error);
    }
  }
  return browser;
}

app.post('/api/sessions/start', async (req, res) => {
  try {
    const browser = await initBrowser();
    if (!browser) return res.status(500).json({ error: 'Browser failed' });
    
    const page = await browser.newPage();
    const sessionId = `session-${Date.now()}`;
    sessions.set(sessionId, { page, createdAt: Date.now() });
    
    res.json({ sessionId, message: 'Session started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/navigate', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { url } = req.body;
    const session = sessions.get(sessionId);
    
    if (!session) return res.status(404).json({ error: 'Session not found' });
    
    await session.page.goto(url, { waitUntil: 'networkidle0' });
    res.json({ message: 'Navigated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/screenshot', async (req, res) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    
    const screenshot = await session.page.screenshot({ encoding: 'base64' });
    res.json({ screenshot });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/execute', async (req, res) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    
    const result = await session.page.evaluate(req.body.script);
    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/close', async (req, res) => {
  try {
    const session = sessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Not found' });
    
    await session.page.close();
    sessions.delete(req.params.sessionId);
    res.json({ message: 'Closed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', async (req, res) => {
  try {
    const b = await initBrowser();
    if (!b) return res.json({ status: 'offline' });
    
    const version = await b.version();
    res.json({ status: 'online', chromiumVersion: version, activeSessions: sessions.size });
  } catch (error) {
    res.json({ status: 'error', error: error.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

(async () => {
  await initBrowser();
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
})();

process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
