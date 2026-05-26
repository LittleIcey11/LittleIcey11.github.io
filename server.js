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
      console.log('🔄 Initializing Chromium...');
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
        ],
      });
      console.log('✅ Chromium initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Chromium:', error.message);
      browser = null;
      return null;
    }
  }
  return browser;
}

// Start a new session
app.post('/api/sessions/start', async (req, res) => {
  try {
    const browser = await initBrowser();
    if (!browser) {
      return res.status(500).json({ error: 'Failed to initialize Chromium browser' });
    }

    const page = await browser.newPage();
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessions.set(sessionId, { page, createdAt: Date.now() });

    console.log(`✅ Session created: ${sessionId}`);
    res.json({ sessionId, message: 'Session started' });
  } catch (error) {
    console.error('Error starting session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Navigate to URL
app.post('/api/sessions/:sessionId/navigate', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { url } = req.body;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await session.page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    res.json({ message: 'Navigated successfully' });
  } catch (error) {
    console.error('Error navigating:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Take screenshot
app.get('/api/sessions/:sessionId/screenshot', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const screenshot = await session.page.screenshot({ encoding: 'base64' });
    res.json({ screenshot });
  } catch (error) {
    console.error('Error taking screenshot:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Execute JavaScript
app.post('/api/sessions/:sessionId/execute', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { script } = req.body;

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const result = await session.page.evaluate(script);
    res.json({ result });
  } catch (error) {
    console.error('Error executing script:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Close session
app.post('/api/sessions/:sessionId/close', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    await session.page.close();
    sessions.delete(sessionId);
    console.log(`✅ Session closed: ${sessionId}`);
    res.json({ message: 'Session closed' });
  } catch (error) {
    console.error('Error closing session:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get server status
app.get('/api/status', async (req, res) => {
  try {
    const b = await initBrowser();
    if (!b) {
      return res.json({ status: 'error', error: 'Chromium not initialized' });
    }

    const version = await b.version();
    res.json({
      status: 'online',
      chromiumVersion: version,
      activeSessions: sessions.size,
    });
  } catch (error) {
    console.error('Error getting status:', error.message);
    res.json({ status: 'error', error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Start server and initialize browser
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}\n`);
  await initBrowser();
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  if (browser) {
    await browser.close();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('\n⏹️  Shutting down gracefully...');
  if (browser) {
    await browser.close();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
