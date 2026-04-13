const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB 설정 ---
const DATABASE_URL = (
  process.env.DATABASE_URL ||
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
).trim();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// --- Lazy Init ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      quantity VARCHAR(50),
      category VARCHAR(20),
      exp_date DATE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      ingredients TEXT,
      instructions TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  dbInitialized = true;
}

// --- 미들웨어 ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB 초기화 미들웨어 (API 라우트 전용)
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err.message);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// =====================
// 재료 관리 API
// =====================

// 재료 목록 조회
app.get('/api/ingredients', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ingredients ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch ingredients' });
  }
});

// 재료 등록
app.post('/api/ingredients', async (req, res) => {
  try {
    const { name, quantity, category, exp_date } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const result = await pool.query(
      `INSERT INTO ingredients (name, quantity, category, exp_date)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, quantity || null, category || null, exp_date || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to add ingredient' });
  }
});

// 재료 삭제
app.delete('/api/ingredients/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM ingredients WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/ingredients error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete ingredient' });
  }
});

// =====================
// 레시피 관리 API
// =====================

// 레시피 목록 조회
app.get('/api/recipes', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM recipes ORDER BY created_at DESC'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch recipes' });
  }
});

// 레시피 등록
app.post('/api/recipes', async (req, res) => {
  try {
    const { title, ingredients, instructions } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, message: 'title is required' });
    }

    const result = await pool.query(
      `INSERT INTO recipes (title, ingredients, instructions)
       VALUES ($1, $2, $3) RETURNING *`,
      [title, ingredients || null, instructions || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to add recipe' });
  }
});

// 레시피 삭제
app.delete('/api/recipes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM recipes WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Recipe not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/recipes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete recipe' });
  }
});

// --- SPA fallback ---
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 서버 시작 (로컬) / 모듈 export (Vercel) ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
