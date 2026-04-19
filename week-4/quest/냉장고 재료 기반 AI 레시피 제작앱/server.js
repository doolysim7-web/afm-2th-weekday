const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- API Key (환경변수에서만 읽음) ---
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
if (!GEMINI_API_KEY) {
  console.warn(
    '[WARN] GEMINI_API_KEY 환경변수가 설정되지 않았습니다.\n' +
    '       AI 레시피 생성 API(/api/recipes/generate)가 동작하지 않습니다.\n' +
    '       사용법: GEMINI_API_KEY=your_key node server.js  또는  .env 파일 사용'
  );
}

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

// =====================
// AI 레시피 생성 API
// =====================

app.post('/api/recipes/generate', async (_req, res) => {
  try {
    // 0. API 키 존재 확인
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        success: false,
        message: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다. 서버 관리자에게 문의하세요.',
      });
    }

    // 1. DB에서 현재 등록된 재료 목록 조회
    const ingredientResult = await pool.query(
      'SELECT name, quantity, category FROM ingredients ORDER BY created_at DESC'
    );

    const ingredientList = ingredientResult.rows;

    if (ingredientList.length === 0) {
      return res.status(400).json({
        success: false,
        message: '등록된 재료가 없습니다. 먼저 재료를 추가해주세요.',
      });
    }

    // 2. 재료 목록 문자열 생성
    const ingredientText = ingredientList
      .map((i) => `${i.name}(${i.quantity || '수량 미정'}, ${i.category || '분류 없음'})`)
      .join(', ');

    // 3. Gemini API 호출용 프롬프트
    const prompt = `다음 냉장고 재료로 만들 수 있는 레시피 3개를 추천해줘.
재료: ${ingredientText}
반드시 아래 JSON 형식으로만 응답해줘. JSON 외의 텍스트는 절대 포함하지 마:
[{ "title": "요리명", "ingredients": "필요한 재료와 수량", "instructions": "단계별 조리법" }]`;

    // 4. Gemini API 호출 (내장 fetch 사용, 503시 최대 2회 재시도)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-4b-it:generateContent?key=${GEMINI_API_KEY}`;
    const geminiBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1024 },
    });

    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });
      if (response.status !== 503) break;
      console.log(`Gemini 503, retrying (${attempt + 1}/3)...`);
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Gemini API error:', response.status, errorBody);
      return res.status(502).json({
        success: false,
        message: 'AI 서비스 호출에 실패했습니다.',
      });
    }

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;

    // 5. JSON 파싱 (AI 응답에서 JSON 배열 추출)
    let recipes;
    try {
      // JSON 블록이 ```json ... ``` 으로 감싸져 있을 수 있으므로 정규식으로 추출
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found in AI response');
      }
      recipes = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('AI response parse error:', parseErr.message, 'Raw:', text);
      return res.status(502).json({
        success: false,
        message: 'AI 응답을 파싱할 수 없습니다.',
      });
    }

    res.json({ success: true, data: recipes });
  } catch (err) {
    console.error('POST /api/recipes/generate error:', err.message);
    res.status(500).json({ success: false, message: 'AI 레시피 생성에 실패했습니다.' });
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
