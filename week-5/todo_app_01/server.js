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

  // Add role column if missing (existing table migration)
  const roleCol = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'todo_app_01_users' AND column_name = 'role'
  `);
  if (roleCol.rows.length === 0) {
    await pool.query(`ALTER TABLE todo_app_01_users ADD COLUMN role VARCHAR(20) DEFAULT 'user'`);
  }

  // Seed super admin
  const adminEmail = 'doolysim7@harbor.school';
  const adminHash = await bcrypt.hash('Mirae21!', 10);
  const adminExists = await pool.query('SELECT id FROM todo_app_01_users WHERE email = $1', [adminEmail]);
  if (adminExists.rows.length === 0) {
    await pool.query(
      `INSERT INTO todo_app_01_users (email, password, nickname, role) VALUES ($1, $2, $3, $4)`,
      [adminEmail, adminHash, '슈퍼관리자', 'admin']
    );
  } else {
    await pool.query('UPDATE todo_app_01_users SET role = $1, password = $2 WHERE email = $3', ['admin', adminHash, adminEmail]);
  }

  // Drop old todos table (no user data worth keeping) and recreate with user_id
  const col = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'todo_app_01_todos' AND column_name = 'user_id'
  `);
  if (col.rows.length === 0) {
    await pool.query('DROP TABLE IF EXISTS todo_app_01_todos');
  }

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

// DB init middleware for /api routes
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, data: null, message: 'Database initialization failed' });
  }
});

// Auth middleware — extracts user from JWT
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

// ------------------------------------
// Auth Routes
// ------------------------------------

// POST /api/auth/signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, nickname } = req.body;

    if (!email || !password || !nickname) {
      return res.status(400).json({ success: false, data: null, message: '모든 항목을 입력해주세요' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, data: null, message: '비밀번호는 6자 이상이어야 합니다' });
    }

    const existing = await pool.query('SELECT id FROM todo_app_01_users WHERE email = $1', [email.trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, data: null, message: '이미 가입된 이메일입니다' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO todo_app_01_users (email, password, nickname) VALUES ($1, $2, $3) RETURNING id, email, nickname, role, created_at',
      [email.trim(), hashed, nickname.trim()]
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ success: true, data: { user, token }, message: '회원가입 완료' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ success: false, data: null, message: '회원가입에 실패했습니다' });
  }
});

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

    const token = jwt.sign({ id: user.id, email: user.email, nickname: user.nickname, role: user.role || 'user' }, JWT_SECRET, { expiresIn: '7d' });
    const { password: _, ...safeUser } = user;

    res.json({ success: true, data: { user: safeUser, token }, message: '로그인 성공' });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, data: null, message: '로그인에 실패했습니다' });
  }
});

// GET /api/auth/me — verify token & return user info
app.get('/api/auth/me', auth, (req, res) => {
  res.json({ success: true, data: req.user, message: null });
});

// Admin middleware — requires admin role
function adminAuth(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, data: null, message: '관리자 권한이 필요합니다' });
  }
  next();
}

// ------------------------------------
// Admin Routes (require auth + admin)
// ------------------------------------

// GET /api/admin/users — list all users
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

// GET /api/admin/todos — list all todos (with user info)
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

// DELETE /api/admin/users/:id — delete a user and their todos
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

// DELETE /api/admin/todos/:id — delete any todo
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
// Todo Routes (all require auth)
// ------------------------------------

// GET /api/todos
app.get('/api/todos', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM todo_app_01_todos WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows, message: null });
  } catch (err) {
    console.error('GET /api/todos error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to fetch todos' });
  }
});

// POST /api/todos
app.post('/api/todos', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, data: null, message: 'Text is required' });
    }
    const result = await pool.query(
      'INSERT INTO todo_app_01_todos (user_id, text) VALUES ($1, $2) RETURNING *',
      [req.user.id, text.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0], message: 'Todo created' });
  } catch (err) {
    console.error('POST /api/todos error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to create todo' });
  }
});

// DELETE /api/todos/completed (before :id route)
app.delete('/api/todos/completed', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM todo_app_01_todos WHERE user_id = $1 AND done = true RETURNING *',
      [req.user.id]
    );
    res.json({ success: true, data: result.rows, message: `${result.rowCount} completed todo(s) deleted` });
  } catch (err) {
    console.error('DELETE /api/todos/completed error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to delete completed todos' });
  }
});

// PATCH /api/todos/:id
app.patch('/api/todos/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { text, done } = req.body;

    const existing = await pool.query(
      'SELECT * FROM todo_app_01_todos WHERE id = $1 AND user_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Todo not found' });
    }

    const current = existing.rows[0];
    const newText = text !== undefined ? text.trim() : current.text;
    const newDone = done !== undefined ? done : !current.done;

    const result = await pool.query(
      'UPDATE todo_app_01_todos SET text = $1, done = $2 WHERE id = $3 AND user_id = $4 RETURNING *',
      [newText, newDone, id, req.user.id]
    );
    res.json({ success: true, data: result.rows[0], message: 'Todo updated' });
  } catch (err) {
    console.error('PATCH /api/todos/:id error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id
app.delete('/api/todos/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM todo_app_01_todos WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, data: null, message: 'Todo not found' });
    }
    res.json({ success: true, data: result.rows[0], message: 'Todo deleted' });
  } catch (err) {
    console.error('DELETE /api/todos/:id error:', err);
    res.status(500).json({ success: false, data: null, message: 'Failed to delete todo' });
  }
});

// ------------------------------------
// Local dev / Vercel dual-mode
// ------------------------------------
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
