require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Database connection ---
const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- Lazy DB initialization ---
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  // Seed default users
  await pool.query(`INSERT INTO users (name) VALUES ('Alice') ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO users (name) VALUES ('Bob') ON CONFLICT DO NOTHING`);

  dbInitialized = true;
}

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init failed:', err.message);
    res.status(500).json({ success: false, message: 'DB init failed' });
  }
});

// --- User endpoints ---

// GET /api/users — list all users
app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY id');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/users error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// POST /api/users — create user
app.post('/api/users', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }
    const result = await pool.query(
      'INSERT INTO users (name) VALUES ($1) RETURNING *',
      [name.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }
    console.error('POST /api/users error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// --- Todo endpoints ---

// GET /api/users/:userId/todos — get todos for a user
app.get('/api/users/:userId/todos', async (req, res) => {
  try {
    const { userId } = req.params;
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const result = await pool.query(
      'SELECT * FROM todos WHERE user_id = $1 ORDER BY id',
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/users/:userId/todos error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch todos' });
  }
});

// POST /api/users/:userId/todos — create todo
app.post('/api/users/:userId/todos', async (req, res) => {
  try {
    const { userId } = req.params;
    const { text } = req.body;
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const result = await pool.query(
      'INSERT INTO todos (user_id, text) VALUES ($1, $2) RETURNING *',
      [userId, text.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/users/:userId/todos error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// PATCH /api/todos/:id — update todo
app.patch('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { done, text } = req.body;

    const existing = await pool.query('SELECT * FROM todos WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (typeof done === 'boolean') {
      updates.push(`done = $${paramIndex++}`);
      values.push(done);
    }
    if (typeof text === 'string' && text.trim()) {
      updates.push(`text = $${paramIndex++}`);
      values.push(text.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE todos SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/todos/:id error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id — delete todo
app.delete('/api/todos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM todos WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/todos/:id error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete todo' });
  }
});

// --- SPA fallback (Express 5 wildcard) ---
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Local / Vercel dual-mode ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
