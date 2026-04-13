const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- PostgreSQL 연결 ---
const pool = new Pool({
  connectionString: (
    process.env.DATABASE_URL ||
    'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
  ).trim(),
  ssl: { rejectUnauthorized: false },
});

// --- Lazy DB Init (서버리스 cold start 대응) ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id SERIAL PRIMARY KEY,
      title VARCHAR(300) NOT NULL,
      option_a VARCHAR(200) NOT NULL,
      option_b VARCHAR(200) NOT NULL,
      option_a_count INTEGER DEFAULT 0,
      option_b_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// --- 미들웨어 ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// API 라우트 진입 전 DB 초기화 보장
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// --- API 라우트 ---

// 1. 밸런스 게임 목록 조회 (최신순, total_votes 포함)
app.get('/api/games', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT *, (option_a_count + option_b_count) AS total_votes FROM games ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/games error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch games' });
  }
});

// 2. 밸런스 게임 질문 등록
app.post('/api/games', async (req, res) => {
  try {
    const { title, option_a, option_b } = req.body;

    if (!title || !option_a || !option_b) {
      return res.status(400).json({ success: false, message: 'title, option_a, option_b are all required' });
    }

    const { rows } = await pool.query(
      'INSERT INTO games (title, option_a, option_b) VALUES ($1, $2, $3) RETURNING *',
      [title, option_a, option_b]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('POST /api/games error:', err);
    res.status(500).json({ success: false, message: 'Failed to create game' });
  }
});

// 3. 투표하기
app.post('/api/games/:id/vote', async (req, res) => {
  try {
    const { id } = req.params;
    const { option } = req.body;

    if (option !== 'a' && option !== 'b') {
      return res.status(400).json({ success: false, message: 'option must be "a" or "b"' });
    }

    const column = option === 'a' ? 'option_a_count' : 'option_b_count';
    const { rows } = await pool.query(
      `UPDATE games SET ${column} = ${column} + 1 WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('POST /api/games/:id/vote error:', err);
    res.status(500).json({ success: false, message: 'Failed to vote' });
  }
});

// 4. 게임 삭제
app.delete('/api/games/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      'DELETE FROM games WHERE id = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('DELETE /api/games/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete game' });
  }
});

// --- SPA fallback (Express 5 문법) ---
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 서버 시작 / Vercel export ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
