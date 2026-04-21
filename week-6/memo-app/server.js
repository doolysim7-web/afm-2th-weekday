const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------
// Database Setup
// ------------------------------------
const DATABASE_URL = (
  process.env.DATABASE_URL ||
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
).trim();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ------------------------------------
// ImageKit Config
// ------------------------------------
const IMAGEKIT_PUBLIC_KEY = (
  process.env.IMAGEKIT_PUBLIC_KEY || 'public_7Wf9/9pM/Gp/HXOQfUeWh1jmm+Q='
).trim();
const IMAGEKIT_PRIVATE_KEY = (
  process.env.IMAGEKIT_PRIVATE_KEY || 'private_HUgMWoK582B2ZL8jpGQtksNy//M='
).trim();
const IMAGEKIT_URL_ENDPOINT = (
  process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/3um8y0hge'
).trim();

// ------------------------------------
// Lazy DB Init (Vercel cold-start safe)
// ------------------------------------
let dbInitialized = false;
let dbInitPromise = null;

async function initDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS memo_app_memos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      ALTER TABLE memo_app_memos ADD COLUMN IF NOT EXISTS image_url TEXT
    `);
    dbInitialized = true;
  })();

  return dbInitPromise;
}

// ------------------------------------
// Middleware
// ------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.use(async (_req, _res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    next(err);
  }
});

// ------------------------------------
// API Routes
// ------------------------------------

// Health
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// ImageKit client-upload auth
app.get('/api/imagekit-auth', (_req, res) => {
  try {
    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_URL_ENDPOINT) {
      return res.status(500).json({ success: false, message: 'ImageKit env vars missing' });
    }
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 2400;
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
      success: true,
      data: {
        token,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// List memos (newest first)
app.get('/api/memos', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, content, image_url, created_at, updated_at
       FROM memo_app_memos
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/memos]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get single memo
app.get('/api/memos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const result = await pool.query(
      `SELECT id, title, content, image_url, created_at, updated_at
       FROM memo_app_memos WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[GET /api/memos/:id]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create memo
app.post('/api/memos', async (req, res) => {
  try {
    const body = req.body || {};
    const trimmedTitle = String(body.title ?? '').slice(0, 200);
    const trimmedContent = String(body.content ?? '');
    const rawImageUrl = body.imageUrl ?? body.image_url ?? null;
    const imageUrl = rawImageUrl ? String(rawImageUrl).slice(0, 2000) : null;

    if (!trimmedTitle.trim() && !trimmedContent.trim() && !imageUrl) {
      return res.status(400).json({
        success: false,
        message: '제목, 내용, 이미지 중 최소 하나는 입력해주세요.',
      });
    }

    const result = await pool.query(
      `INSERT INTO memo_app_memos (title, content, image_url)
       VALUES ($1, $2, $3)
       RETURNING id, title, content, image_url, created_at, updated_at`,
      [trimmedTitle, trimmedContent, imageUrl]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POST /api/memos]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update memo
app.put('/api/memos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const body = req.body || {};
    const trimmedTitle = String(body.title ?? '').slice(0, 200);
    const trimmedContent = String(body.content ?? '');
    const rawImageUrl = body.imageUrl ?? body.image_url ?? null;
    const imageUrl = rawImageUrl ? String(rawImageUrl).slice(0, 2000) : null;

    const result = await pool.query(
      `UPDATE memo_app_memos
       SET title = $1, content = $2, image_url = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, title, content, image_url, created_at, updated_at`,
      [trimmedTitle, trimmedContent, imageUrl, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[PUT /api/memos/:id]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete memo
app.delete('/api/memos/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const result = await pool.query(
      `DELETE FROM memo_app_memos WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '메모를 찾을 수 없습니다' });
    }
    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    console.error('[DELETE /api/memos/:id]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------
// SPA Fallback
// ------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------------------------
// Local / Vercel dual-mode
// ------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
