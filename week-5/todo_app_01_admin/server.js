const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = (process.env.JWT_SECRET || 'todo-app-01-secret-key-change-in-prod').trim();

// ------------------------------------
// Database Setup
// ------------------------------------
const DATABASE_URL =
  (process.env.DATABASE_URL || 'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres').trim();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ------------------------------------
// Lazy DB Init (Vercel cold-start safe)
// ------------------------------------
let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todo_app_01_users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      nickname VARCHAR(50) NOT NULL,
      role VARCHAR(20) DEFAULT 'user',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todo_app_01_todos (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES todo_app_01_users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_todo_app_01_todos_user_id
      ON todo_app_01_todos(user_id)
  `);

  dbInitialized = true;
}

// ------------------------------------
// Middleware
// ------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, data: null, message: 'Database initialization failed' });
  }
});

// Auth middleware
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, data: null, message: '로그인이 필요합니다' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, data: null, message: '인증이 만료되었습니다' });
  }
}

// Admin middleware
function adminAuth(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, data: null, message: '관리자 권한이 필요합니다' });
  }
  next();
}

// ------------------------------------
// Auth Routes
// ------------------------------------

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, data: null, message: '이메일과 비밀번호를 입력해주세요' });
    }

    const result = await pool.query('SELECT * FROM todo_app_01_users WHERE email = $1', [email.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, data: null, message: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, data: null, message: '이메일 또는 비밀번호가 올바르지 않습니다' });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({ success: false, data: null, message: '관리자 권한이 필요합니다' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, nickname: user.nickname, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const { password: _, ...safeUser } = user;

    res.json({ success: true, data: { user: safeUser, token }, message: '로그인 성공' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, data: null, message: '로그인에 실패했습니다' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ success: true, data: req.user, message: null });
});

// ------------------------------------
// Admin Routes
// ------------------------------------

// GET /api/admin/users
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, nickname, role, created_at,
              (SELECT COUNT(*) FROM todo_app_01_todos WHERE user_id = todo_app_01_users.id) AS todo_count
       FROM todo_app_01_users ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows, message: null });
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch users' });
  }
});

// GET /api/admin/todos
app.get('/api/admin/todos', auth, adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.email AS user_email, u.nickname AS user_nickname
       FROM todo_app_01_todos t
       JOIN todo_app_01_users u ON t.user_id = u.id
       ORDER BY t.created_at DESC`
    );
    res.json({ success: true, data: result.rows, message: null });
  } catch (err) {
    console.error('GET /api/admin/todos error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch todos' });
  }
});

// DELETE /api/admin/users/:id
app.delete('/api/admin/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, data: null, message: '자기 자신은 삭제할 수 없습니다' });
    }
    const result = await pool.query(
      'DELETE FROM todo_app_01_users WHERE id = $1 RETURNING id, email, nickname',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'User not found' });
    }
    res.json({ success: true, data: result.rows[0], message: '유저가 삭제되었습니다' });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to delete user' });
  }
});

// DELETE /api/admin/todos/:id
app.delete('/api/admin/todos/:id', auth, adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM todo_app_01_todos WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Todo not found' });
    }
    res.json({ success: true, data: result.rows[0], message: '할 일이 삭제되었습니다' });
  } catch (err) {
    console.error('DELETE /api/admin/todos/:id error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to delete todo' });
  }
});

// ------------------------------------
// Local dev / Vercel dual-mode
// ------------------------------------
if (require.main === module) {
  app.listen(PORT, () => console.log(`Admin server running on http://localhost:${PORT}`));
}

module.exports = app;
