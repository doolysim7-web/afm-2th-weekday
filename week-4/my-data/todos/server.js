const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, '..', 'todos.db');

// ── Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Database (Lazy Init) ───────────────────────────────
let db = null;
let dbInitialized = false;

function getDB() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  if (!dbInitialized) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    dbInitialized = true;
  }
  return db;
}

// Helper: convert done 0/1 to boolean
function formatTodo(row) {
  return { ...row, done: !!row.done };
}

// ── Todo File Sync ────────────────────────────────────
function buildFileContent(id, text, done) {
  const checkbox = done ? '- [x]' : '- [ ]';
  return `# Todo ${id}: ${text}\n\n${checkbox} ${text}\n`;
}

function writeTodoFile(id, text, done) {
  fs.writeFileSync(path.join(__dirname, `todo-${id}`), buildFileContent(id, text, done), 'utf-8');
}

function deleteTodoFile(id) {
  const filepath = path.join(__dirname, `todo-${id}`);
  if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
}

// ── API Routes: Users ──────────────────────────────────

// GET /api/users — list all users
app.get('/api/users', (_req, res) => {
  try {
    const users = getDB().prepare('SELECT id, name FROM users ORDER BY id').all();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

// POST /api/users — create a new user
app.post('/api/users', (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'name is required' });
    }

    const trimmed = name.trim();
    const existing = getDB().prepare('SELECT id FROM users WHERE name = ?').get(trimmed);
    if (existing) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    const result = getDB().prepare('INSERT INTO users (name) VALUES (?)').run(trimmed);
    res.status(201).json({ success: true, data: { id: result.lastInsertRowid, name: trimmed } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
});

// ── API Routes: Simple Todos (no user) ────────────────

// GET /api/todos — list all todos
app.get('/api/todos', (_req, res) => {
  try {
    const todos = getDB()
      .prepare('SELECT id, text, done FROM todos ORDER BY id')
      .all()
      .map(formatTodo);
    res.json({ success: true, data: todos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch todos' });
  }
});

// POST /api/todos — create a todo (assigns to user_id 1 by default)
app.post('/api/todos', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    // Ensure at least one user exists
    let user = getDB().prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
    if (!user) {
      getDB().prepare("INSERT INTO users (name) VALUES ('Default')").run();
      user = getDB().prepare('SELECT id FROM users ORDER BY id LIMIT 1').get();
    }

    const trimmed = text.trim();
    const result = getDB()
      .prepare('INSERT INTO todos (user_id, text) VALUES (?, ?)')
      .run(user.id, trimmed);

    const todo = getDB()
      .prepare('SELECT id, text, done FROM todos WHERE id = ?')
      .get(result.lastInsertRowid);

    writeTodoFile(todo.id, todo.text, todo.done);
    res.status(201).json({ success: true, data: formatTodo(todo) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// ── API Routes: User-scoped Todos ─────────────────────

// GET /api/users/:userId/todos — get todos for a user
app.get('/api/users/:userId/todos', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const user = getDB().prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const todos = getDB()
      .prepare('SELECT id, user_id, text, done, created_at FROM todos WHERE user_id = ? ORDER BY id')
      .all(userId)
      .map(formatTodo);

    res.json({ success: true, data: todos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch todos' });
  }
});

// POST /api/users/:userId/todos — create a todo for a user
app.post('/api/users/:userId/todos', (req, res) => {
  try {
    const userId = Number(req.params.userId);
    const user = getDB().prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const trimmed = text.trim();
    const result = getDB()
      .prepare('INSERT INTO todos (user_id, text) VALUES (?, ?)')
      .run(userId, trimmed);

    const todo = getDB()
      .prepare('SELECT id, user_id, text, done, created_at FROM todos WHERE id = ?')
      .get(result.lastInsertRowid);

    writeTodoFile(todo.id, todo.text, todo.done);
    res.status(201).json({ success: true, data: formatTodo(todo) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// PATCH /api/todos/:id — update a todo (done, text)
app.patch('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getDB()
      .prepare('SELECT id, user_id, text, done, created_at FROM todos WHERE id = ?')
      .get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const { done, text } = req.body;
    const updates = [];
    const values = [];

    if (text !== undefined) {
      const trimmed = (text || '').trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'text cannot be empty' });
      }
      updates.push('text = ?');
      values.push(trimmed);
    }

    if (done !== undefined) {
      updates.push('done = ?');
      values.push(done ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.json({ success: true, data: formatTodo(existing) });
    }

    values.push(id);
    getDB().prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = getDB()
      .prepare('SELECT id, user_id, text, done, created_at FROM todos WHERE id = ?')
      .get(id);

    writeTodoFile(updated.id, updated.text, updated.done);
    res.json({ success: true, data: formatTodo(updated) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id — delete a todo
app.delete('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = getDB()
      .prepare('SELECT id, user_id, text, done, created_at FROM todos WHERE id = ?')
      .get(id);

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    getDB().prepare('DELETE FROM todos WHERE id = ?').run(id);
    deleteTodoFile(id);
    res.json({ success: true, data: formatTodo(existing) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete todo' });
  }
});

// ── SPA Fallback ───────────────────────────────────────
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start / Export ─────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
