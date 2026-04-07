const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname);

// --- In-memory nextId (scanned from existing files on startup) ---
let nextId = 1;

function scanNextId() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^todo-\d+\.json$/.test(f));
  if (files.length === 0) return;
  const ids = files.map(f => parseInt(f.match(/^todo-(\d+)\.json$/)[1], 10));
  nextId = Math.max(...ids) + 1;
}
scanNextId();

// --- Helper: read a single todo file ---
function readTodo(id) {
  const filePath = path.join(DATA_DIR, `todo-${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// --- Helper: read all todo files sorted by id ---
function readAllTodos() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^todo-\d+\.json$/.test(f));
  const ids = files.map(f => parseInt(f.match(/^todo-(\d+)\.json$/)[1], 10)).sort((a, b) => a - b);
  return ids.map(id => readTodo(id)).filter(Boolean);
}

// --- Middleware ---
app.use(express.json());
app.use(express.static(DATA_DIR));

// --- API Routes ---

// GET /api/todos — return all todos sorted by id
app.get('/api/todos', (_req, res) => {
  try {
    const todos = readAllTodos();
    res.json({ success: true, data: todos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to read todos' });
  }
});

// POST /api/todos — create a new todo
app.post('/api/todos', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const id = nextId++;
    const todo = {
      id,
      text,
      done: false,
      items: [{ text, done: false }]
    };

    fs.writeFileSync(path.join(DATA_DIR, `todo-${id}.json`), JSON.stringify(todo, null, 2));
    res.status(201).json({ success: true, data: todo });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// PATCH /api/todos/:id — update a todo
app.patch('/api/todos/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const todo = readTodo(id);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const { done, text } = req.body;

    if (typeof done === 'boolean') {
      todo.done = done;
      if (Array.isArray(todo.items)) {
        todo.items.forEach(item => { item.done = done; });
      }
    }

    if (typeof text === 'string') {
      todo.text = text;
    }

    fs.writeFileSync(path.join(DATA_DIR, `todo-${id}.json`), JSON.stringify(todo, null, 2));
    res.json({ success: true, data: todo });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id — delete a todo
app.delete('/api/todos/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const filePath = path.join(DATA_DIR, `todo-${id}.json`);
    const todo = readTodo(id);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    fs.unlinkSync(filePath);
    res.json({ success: true, data: todo });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete todo' });
  }
});

// SPA fallback (Express 5 wildcard syntax)
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(DATA_DIR, 'index.html'));
});

// --- Dual-mode: local server + Vercel serverless ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
