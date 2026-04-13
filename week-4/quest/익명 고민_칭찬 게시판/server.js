const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB 설정 (lazy init + .trim() + SSL) ---
const pool = new Pool({
  connectionString: (
    process.env.DATABASE_URL ||
    'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
  ).trim(),
  ssl: { rejectUnauthorized: false },
});

let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      nickname VARCHAR(50) DEFAULT '익명',
      category VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      likes INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// --- 미들웨어 ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB lazy init 미들웨어
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

// 1. 게시글 목록 조회
app.get('/api/posts', async (req, res) => {
  try {
    const sort = req.query.sort || 'latest';
    const orderBy = sort === 'popular' ? 'likes DESC, created_at DESC' : 'created_at DESC';
    const { rows } = await pool.query(`SELECT * FROM posts ORDER BY ${orderBy}`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('GET /api/posts error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch posts' });
  }
});

// 2. 게시글 작성
app.post('/api/posts', async (req, res) => {
  try {
    const { nickname, category, content } = req.body;

    if (!category || !content) {
      return res.status(400).json({ success: false, message: 'category and content are required' });
    }

    const validCategories = ['고민', '칭찬', '응원'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, message: 'category must be one of: 고민, 칭찬, 응원' });
    }

    const { rows } = await pool.query(
      `INSERT INTO posts (nickname, category, content) VALUES ($1, $2, $3) RETURNING *`,
      [nickname || '익명', category, content]
    );
    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('POST /api/posts error:', err);
    res.status(500).json({ success: false, message: 'Failed to create post' });
  }
});

// 3. 공감 +1
app.patch('/api/posts/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `UPDATE posts SET likes = likes + 1 WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('PATCH /api/posts/:id/like error:', err);
    res.status(500).json({ success: false, message: 'Failed to like post' });
  }
});

// 4. 게시글 삭제
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `DELETE FROM posts WHERE id = $1 RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('DELETE /api/posts/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete post' });
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
