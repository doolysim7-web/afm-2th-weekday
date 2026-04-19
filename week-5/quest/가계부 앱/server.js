// Household Budget App - Backend
// Express.js + PostgreSQL (Supabase)
// Dual-mode: local (`node server.js`) and Vercel serverless

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------------------
// Database configuration
// ----------------------------------------------------------------------------
const FALLBACK_DB_URL =
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const connectionString = (process.env.DATABASE_URL || FALLBACK_DB_URL).trim();

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// ----------------------------------------------------------------------------
// Lazy DB init (safe for serverless cold starts)
// ----------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      type VARCHAR(10) NOT NULL,
      date DATE NOT NULL,
      amount BIGINT NOT NULL,
      category VARCHAR(30) NOT NULL,
      memo TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// ----------------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Ensure DB is ready before any /api route runs
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ----------------------------------------------------------------------------
// API: Transactions
// ----------------------------------------------------------------------------

// POST /api/transactions — create a new income/expense entry
app.post('/api/transactions', async (req, res) => {
  try {
    const { type, date, amount, category, memo } = req.body || {};

    // Required field validation
    if (!type || !date || amount === undefined || amount === null || !category) {
      return res.status(400).json({
        success: false,
        message: 'type, date, amount, category는 필수입니다.',
      });
    }

    // type whitelist
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({
        success: false,
        message: "type은 'income' 또는 'expense'만 허용됩니다.",
      });
    }

    // amount must be a finite number
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) {
      return res.status(400).json({
        success: false,
        message: 'amount는 숫자여야 합니다.',
      });
    }

    const result = await pool.query(
      `INSERT INTO transactions (type, date, amount, category, memo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, type, date, amount, category, memo, created_at`,
      [type, date, numericAmount, category, memo || null]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/transactions error:', err);
    res.status(500).json({ success: false, message: '거래 등록에 실패했습니다.' });
  }
});

// GET /api/transactions — list all (date desc, then id desc)
app.get('/api/transactions', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, type, date, amount, category, memo, created_at
       FROM transactions
       ORDER BY date DESC, id DESC`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/transactions error:', err);
    res.status(500).json({ success: false, message: '거래 목록 조회에 실패했습니다.' });
  }
});

// GET /api/transactions/summary — totals + by category/type breakdown
app.get('/api/transactions/summary', async (_req, res) => {
  try {
    const totalsResult = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM transactions
       GROUP BY type`
    );

    let totalIncome = 0;
    let totalExpense = 0;
    for (const row of totalsResult.rows) {
      const total = Number(row.total);
      if (row.type === 'income') totalIncome = total;
      else if (row.type === 'expense') totalExpense = total;
    }

    const byCategoryResult = await pool.query(
      `SELECT category, type, COALESCE(SUM(amount), 0)::bigint AS total
       FROM transactions
       GROUP BY category, type
       ORDER BY total DESC`
    );

    const byCategory = byCategoryResult.rows.map((r) => ({
      category: r.category,
      type: r.type,
      total: Number(r.total),
    }));

    res.json({
      success: true,
      data: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        byCategory,
      },
    });
  } catch (err) {
    console.error('GET /api/transactions/summary error:', err);
    res.status(500).json({ success: false, message: '요약 정보 조회에 실패했습니다.' });
  }
});

// PATCH /api/transactions/:id — update an existing entry
app.patch('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '유효하지 않은 id입니다.' });
    }

    const { type, date, amount, category, memo } = req.body || {};
    const fields = [];
    const values = [];
    let i = 1;

    if (type !== undefined) {
      if (type !== 'income' && type !== 'expense') {
        return res.status(400).json({ success: false, message: "type은 'income' 또는 'expense'만 허용됩니다." });
      }
      fields.push(`type = $${i++}`); values.push(type);
    }
    if (date !== undefined) { fields.push(`date = $${i++}`); values.push(date); }
    if (amount !== undefined) {
      const num = Number(amount);
      if (!Number.isFinite(num)) return res.status(400).json({ success: false, message: 'amount는 숫자여야 합니다.' });
      fields.push(`amount = $${i++}`); values.push(num);
    }
    if (category !== undefined) { fields.push(`category = $${i++}`); values.push(category); }
    if (memo !== undefined) { fields.push(`memo = $${i++}`); values.push(memo || null); }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, message: '수정할 필드가 없습니다.' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 거래를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/transactions/:id error:', err);
    res.status(500).json({ success: false, message: '거래 수정에 실패했습니다.' });
  }
});

// DELETE /api/transactions/:id — remove a transaction
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '유효하지 않은 id입니다.' });
    }

    const result = await pool.query(
      `DELETE FROM transactions WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 거래를 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: { id: result.rows[0].id } });
  } catch (err) {
    console.error('DELETE /api/transactions/:id error:', err);
    res.status(500).json({ success: false, message: '거래 삭제에 실패했습니다.' });
  }
});

// ----------------------------------------------------------------------------
// SPA fallback (Express 5 wildcard syntax)
// ----------------------------------------------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------------------------------------------
// Global error handler (safety net)
// ----------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
});

// ----------------------------------------------------------------------------
// Startup (local) / Export (serverless)
// ----------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
