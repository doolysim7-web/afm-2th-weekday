const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Database (lazy init) ───────────────────────────────
const DB_PATH = path.join(__dirname, 'todos.db');
let db;
let dbInitialized = false;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDB() {
  if (dbInitialized) return;
  const conn = getDB();

  // Check if todos table has the correct schema (needs user_id and text columns)
  const cols = conn.prepare("PRAGMA table_info(todos)").all().map(c => c.name);
  if (cols.length > 0 && (!cols.includes('user_id') || !cols.includes('text'))) {
    conn.exec('DROP TABLE IF EXISTS todos');
  }

  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Seed default users
  const insert = conn.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
  insert.run('Alice');
  insert.run('Bob');

  dbInitialized = true;
}

// Lazy-init middleware for /api routes
app.use('/api', (_req, _res, next) => {
  try {
    initDB();
    next();
  } catch (err) {
    next(err);
  }
});

// ── Helper: format todo row (done 0/1 → boolean) ──────
function formatTodo(row) {
  return { ...row, done: Boolean(row.done) };
}

// ── Users API ──────────────────────────────────────────

// GET /api/users — list all users
app.get('/api/users', (_req, res) => {
  try {
    const users = getDB().prepare('SELECT * FROM users ORDER BY id').all();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users — create user { name }
app.post('/api/users', (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const trimmed = name.trim();
    const existing = getDB().prepare('SELECT id FROM users WHERE name = ?').get(trimmed);
    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const result = getDB().prepare('INSERT INTO users (name) VALUES (?)').run(trimmed);
    const user = getDB().prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Todos API ──────────────────────────────────────────

// GET /api/users/:userId/todos — get all todos for a user
app.get('/api/users/:userId/todos', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const user = getDB().prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const todos = getDB()
      .prepare('SELECT * FROM todos WHERE user_id = ? ORDER BY id')
      .all(userId)
      .map(formatTodo);

    res.json({ success: true, data: todos });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/users/:userId/todos — create todo { text }
app.post('/api/users/:userId/todos', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const user = getDB().prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const result = getDB()
      .prepare('INSERT INTO todos (user_id, text) VALUES (?, ?)')
      .run(userId, text.trim());

    const todo = getDB().prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: formatTodo(todo) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/todos/:id — update todo { done?, text? }
app.patch('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const todo = getDB().prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const { done, text } = req.body || {};
    const updates = [];
    const values = [];

    if (typeof done === 'boolean') {
      updates.push('done = ?');
      values.push(done ? 1 : 0);
    }
    if (typeof text === 'string' && text.trim()) {
      updates.push('text = ?');
      values.push(text.trim());
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid fields to update' });
    }

    values.push(id);
    getDB().prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = getDB().prepare('SELECT * FROM todos WHERE id = ?').get(id);
    res.json({ success: true, data: formatTodo(updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/todos/:id — delete todo
app.delete('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const todo = getDB().prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    getDB().prepare('DELETE FROM todos WHERE id = ?').run(id);
    res.json({ success: true, message: 'Todo deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── SPA Fallback ───────────────────────────────────────
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Error Handling ─────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ── Start / Export ─────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
