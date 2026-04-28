require('dotenv').config();

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Database pool (single instance, reused across requests)
// ---------------------------------------------------------------------------
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Lazy DB init — runs once per cold start
// ---------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id          BIGSERIAL PRIMARY KEY,
      sender      TEXT NOT NULL,
      text        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS messages_id_idx ON messages (id);
  `);
  dbInitialized = true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Guard /api/* with lazy init
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('initDB failed:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/health — quick DB ping
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { db: 'ok' } });
  } catch (err) {
    console.error('health check failed:', err);
    res.status(500).json({ success: true, data: { db: 'down' } });
  }
});

// GET /api/messages?since=<id>
app.get('/api/messages', async (req, res) => {
  try {
    const { since } = req.query;

    if (since !== undefined) {
      const sinceId = Number.parseInt(since, 10);
      if (!Number.isInteger(sinceId) || sinceId < 0) {
        return res.status(400).json({ success: false, message: '`since` must be a non-negative integer' });
      }
      const { rows } = await pool.query(
        `SELECT id, sender, text, created_at
           FROM messages
          WHERE id > $1
          ORDER BY id ASC
          LIMIT 200`,
        [sinceId]
      );
      return res.json({ success: true, data: rows });
    }

    // No `since` — return most recent 50, in chronological order for direct render
    const { rows } = await pool.query(
      `SELECT id, sender, text, created_at FROM (
         SELECT id, sender, text, created_at
           FROM messages
          ORDER BY id DESC
          LIMIT 50
       ) AS recent
       ORDER BY id ASC`
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/messages failed:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch messages' });
  }
});

// POST /api/messages
app.post('/api/messages', async (req, res) => {
  try {
    const body = req.body || {};
    const senderRaw = body.sender;
    const textRaw = body.text;

    if (typeof senderRaw !== 'string' || typeof textRaw !== 'string') {
      return res.status(400).json({ success: false, message: '`sender` and `text` must be strings' });
    }

    const sender = senderRaw.trim();
    const text = textRaw.trim();

    if (!sender || !text) {
      return res.status(400).json({ success: false, message: '`sender` and `text` must be non-empty' });
    }
    if (sender.length > 40) {
      return res.status(400).json({ success: false, message: '`sender` must be at most 40 characters' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ success: false, message: '`text` must be at most 1000 characters' });
    }

    const { rows } = await pool.query(
      `INSERT INTO messages (sender, text)
       VALUES ($1, $2)
       RETURNING id, sender, text, created_at`,
      [sender, text]
    );

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('POST /api/messages failed:', err);
    res.status(500).json({ success: false, message: 'Failed to create message' });
  }
});

// ---------------------------------------------------------------------------
// SPA fallback (Express 5 — wildcard syntax)
// ---------------------------------------------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------------------------------------------------------
// Error handler (final safety net)
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Dual-mode export: local listen vs Vercel serverless
// ---------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
