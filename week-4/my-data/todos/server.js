const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname);

// ── Middleware ──────────────────────────────────────────
app.use(express.json());
app.use(express.static(DATA_DIR));

// ── Helpers ────────────────────────────────────────────
let nextId = 1;

function initNextId() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^todo-\d+$/.test(f));
  if (files.length === 0) { nextId = 1; return; }
  const maxId = Math.max(...files.map(f => Number(f.split('-')[1])));
  nextId = maxId + 1;
}

function parseTodoFile(filename) {
  const id = Number(filename.split('-')[1]);
  const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf-8');
  const lines = content.split('\n');

  // text: first line after "# Todo N: "
  const titleMatch = lines[0]?.match(/^# Todo \d+: (.+)$/);
  const text = titleMatch ? titleMatch[1] : '';

  // done: true only if ALL checkboxes are checked
  const checkboxLines = lines.filter(l => /^- \[[ x]\]/.test(l));
  const done = checkboxLines.length > 0 && checkboxLines.every(l => /^- \[x\]/.test(l));

  return { id, text, done };
}

function buildFileContent(id, text, done) {
  const checkbox = done ? '- [x]' : '- [ ]';
  return `# Todo ${id}: ${text}\n\n${checkbox} ${text}\n`;
}

// Initialize nextId on startup
initNextId();

// ── API Routes ─────────────────────────────────────────

// GET /api/todos — list all todos sorted by id
app.get('/api/todos', (_req, res) => {
  try {
    const files = fs.readdirSync(DATA_DIR).filter(f => /^todo-\d+$/.test(f));
    const todos = files.map(parseTodoFile).sort((a, b) => a.id - b.id);
    res.json({ success: true, data: todos });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to read todos' });
  }
});

// POST /api/todos — create a new todo
app.post('/api/todos', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const id = nextId++;
    const content = buildFileContent(id, text.trim(), false);
    fs.writeFileSync(path.join(DATA_DIR, `todo-${id}`), content, 'utf-8');

    res.status(201).json({ success: true, data: { id, text: text.trim(), done: false } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create todo' });
  }
});

// PATCH /api/todos/:id — update a todo (toggle done or change text)
app.patch('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const filepath = path.join(DATA_DIR, `todo-${id}`);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const current = parseTodoFile(`todo-${id}`);
    const { done, text } = req.body;

    // Update text if provided
    if (text !== undefined) {
      current.text = text.trim();
      current.done = false; // reset to unchecked with single new checkbox
    }

    // Update done if provided
    if (done !== undefined) {
      current.done = done;
    }

    // If only toggling done (no text change), update checkboxes in-place
    if (text !== undefined) {
      // Text changed: rewrite with single checkbox
      const content = buildFileContent(id, current.text, current.done);
      fs.writeFileSync(filepath, content, 'utf-8');
    } else {
      // Toggle done: flip all checkboxes in the existing file
      let fileContent = fs.readFileSync(filepath, 'utf-8');
      if (current.done) {
        fileContent = fileContent.replace(/- \[ \]/g, '- [x]');
      } else {
        fileContent = fileContent.replace(/- \[x\]/g, '- [ ]');
      }
      // Also update title if text was on the title line (shouldn't change, but keep consistent)
      fs.writeFileSync(filepath, fileContent, 'utf-8');
    }

    res.json({ success: true, data: { id, text: current.text, done: current.done } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id — delete a todo
app.delete('/api/todos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const filepath = path.join(DATA_DIR, `todo-${id}`);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    const todo = parseTodoFile(`todo-${id}`);
    fs.unlinkSync(filepath);

    res.json({ success: true, data: todo });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete todo' });
  }
});

// ── SPA Fallback ───────────────────────────────────────
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(DATA_DIR, 'index.html'));
});

// ── Start / Export ─────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
