// =============================================================================
// 나를 아는 AI 트레이너
// Express 5 + PostgreSQL(Supabase) + Gemini
// Context(context.md) + DB(workout_logs) 를 결합해 맞춤형 루틴을 생성합니다.
// =============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { Pool } = require('pg');

// -----------------------------------------------------------------------------
// 환경 설정
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

const FALLBACK_DB_URL =
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const DATABASE_URL = (process.env.DATABASE_URL || FALLBACK_DB_URL).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();

const CONTEXT_PATH = path.join(__dirname, 'context.md');

// Gemini/Gemma 모델 — Gemma 3 12B (Gemini Flash 무료 쿼터와 별도, 한국어 품질 충분)
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemma-3-12b-it';

// -----------------------------------------------------------------------------
// DB 연결 풀
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// 시드 운동 기록 (문화센터/집/헬스장 혼합, 최근 3주)
// -----------------------------------------------------------------------------
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const SEED_WORKOUTS = [
  // ---- 이번 주 ----
  { date: daysAgo(1), body_part: '하체',    exercise: '바벨 스쿼트',        sets: 4, reps: 8,  weight_kg: 35, duration_min: null, notes: '무릎 통증 없음' },
  { date: daysAgo(1), body_part: '하체',    exercise: '루마니안 데드리프트',  sets: 4, reps: 10, weight_kg: 30, duration_min: null, notes: '햄스트링 자극 좋음' },
  { date: daysAgo(1), body_part: '코어',    exercise: '플랭크',              sets: 3, reps: 1,  weight_kg: null, duration_min: 1, notes: '손목 조금 저림' },
  { date: daysAgo(3), body_part: '상체',    exercise: '랫풀다운',            sets: 4, reps: 10, weight_kg: 25, duration_min: null, notes: '등 자극 굿' },
  { date: daysAgo(3), body_part: '상체',    exercise: '덤벨 숄더프레스',      sets: 3, reps: 10, weight_kg: 6,  duration_min: null, notes: '목 덜 뭉침' },
  { date: daysAgo(3), body_part: '코어',    exercise: '데드버그',            sets: 3, reps: 12, weight_kg: null, duration_min: null, notes: '' },
  { date: daysAgo(5), body_part: '전신',    exercise: '케틀벨 스윙',         sets: 5, reps: 15, weight_kg: 8,  duration_min: null, notes: '허리 자극 안정적' },
  { date: daysAgo(5), body_part: '유산소',  exercise: '러닝머신',            sets: 1, reps: 1,  weight_kg: null, duration_min: 20, notes: '속도 7.5km/h' },
  // ---- 지난 주 ----
  { date: daysAgo(8), body_part: '하체',    exercise: '바벨 스쿼트',        sets: 4, reps: 8,  weight_kg: 32.5, duration_min: null, notes: '' },
  { date: daysAgo(8), body_part: '하체',    exercise: '힙 쓰러스트',        sets: 4, reps: 12, weight_kg: 40, duration_min: null, notes: '엉덩이 자극 매우 좋음' },
  { date: daysAgo(10), body_part: '상체',   exercise: '시티드 로우',        sets: 4, reps: 10, weight_kg: 22.5, duration_min: null, notes: '' },
  { date: daysAgo(10), body_part: '상체',   exercise: '푸시업 (무릎)',       sets: 3, reps: 10, weight_kg: null, duration_min: null, notes: '손목 괜찮음' },
  { date: daysAgo(12), body_part: '유산소', exercise: '러닝 (야외)',         sets: 1, reps: 1,  weight_kg: null, duration_min: 30, notes: '5km' },
  // ---- 2주 전 ----
  { date: daysAgo(15), body_part: '하체',   exercise: '런지',              sets: 3, reps: 12, weight_kg: null, duration_min: null, notes: '왼 무릎 살짝 뻐근' },
  { date: daysAgo(15), body_part: '코어',   exercise: '사이드 플랭크',      sets: 3, reps: 1,  weight_kg: null, duration_min: 0.5, notes: '30초씩' },
  { date: daysAgo(17), body_part: '상체',   exercise: '밴드 Y-레이즈',      sets: 3, reps: 15, weight_kg: null, duration_min: null, notes: '자세 교정용' },
  { date: daysAgo(17), body_part: '상체',   exercise: '페이스 풀 (밴드)',   sets: 3, reps: 15, weight_kg: null, duration_min: null, notes: '라운드숄더 완화' },
  { date: daysAgo(19), body_part: '유산소', exercise: '인클라인 워킹',      sets: 1, reps: 1,  weight_kg: null, duration_min: 25, notes: '속도 5.5, 경사 8' },
  { date: daysAgo(20), body_part: '하체',   exercise: '고블릿 스쿼트',      sets: 4, reps: 12, weight_kg: 10, duration_min: null, notes: '' },
];

// -----------------------------------------------------------------------------
// Lazy DB 초기화
// -----------------------------------------------------------------------------
let dbInitialized = false;
let dbInitPromise = null;

async function initDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS workout_logs (
        id SERIAL PRIMARY KEY,
        date DATE NOT NULL,
        body_part VARCHAR(30) NOT NULL,
        exercise VARCHAR(100) NOT NULL,
        sets INTEGER NOT NULL CHECK (sets > 0),
        reps INTEGER NOT NULL CHECK (reps > 0),
        weight_kg NUMERIC(5,1),
        duration_min NUMERIC(5,1),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM workout_logs');
    if (countRes.rows[0].c === 0) {
      for (const w of SEED_WORKOUTS) {
        await pool.query(
          `INSERT INTO workout_logs (date, body_part, exercise, sets, reps, weight_kg, duration_min, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [w.date, w.body_part, w.exercise, w.sets, w.reps, w.weight_kg, w.duration_min, w.notes]
        );
      }
      console.log(`[seed] ${SEED_WORKOUTS.length}건 운동 기록 시드 완료`);
    }

    dbInitialized = true;
  })();

  try {
    await dbInitPromise;
  } catch (err) {
    dbInitPromise = null;
    throw err;
  }
}

// -----------------------------------------------------------------------------
// 앱 초기화
// -----------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('[initDB] error:', err);
    res.status(500).json({ success: false, message: 'DB 초기화 실패' });
  }
});

// -----------------------------------------------------------------------------
// Context 파일 I/O
// -----------------------------------------------------------------------------
async function readContext() {
  try {
    return await fsp.readFile(CONTEXT_PATH, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

async function writeContext(content) {
  // Vercel 서버리스는 파일시스템이 읽기전용이므로 로컬에서만 쓰기 허용
  await fsp.writeFile(CONTEXT_PATH, content, 'utf-8');
}

// =============================================================================
// /api/context
// =============================================================================
app.get('/api/context', async (_req, res) => {
  try {
    const content = await readContext();
    res.json({ success: true, data: { content } });
  } catch (err) {
    console.error('[GET /api/context]', err);
    res.status(500).json({ success: false, message: 'Context 읽기 실패' });
  }
});

app.put('/api/context', async (req, res) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return res.status(400).json({ success: false, message: 'content(문자열) 필수' });
    }
    if (content.length > 20000) {
      return res.status(400).json({ success: false, message: 'Context는 최대 20,000자까지만 저장됩니다.' });
    }
    await writeContext(content);
    res.json({ success: true, data: { saved: true, length: content.length } });
  } catch (err) {
    console.error('[PUT /api/context]', err);
    if (err.code === 'EROFS' || err.code === 'EACCES') {
      return res.status(403).json({
        success: false,
        message: 'Vercel 서버리스에서는 Context 파일 수정이 불가합니다. 로컬 or Git push로 업데이트하세요.',
      });
    }
    res.status(500).json({ success: false, message: 'Context 저장 실패' });
  }
});

// =============================================================================
// /api/workouts — 운동 기록 CRUD
// =============================================================================
app.get('/api/workouts', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, date, body_part, exercise, sets, reps, weight_kg, duration_min, notes, created_at
         FROM workout_logs ORDER BY date DESC, id DESC LIMIT 100`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/workouts]', err);
    res.status(500).json({ success: false, message: '운동 기록 조회 실패' });
  }
});

app.post('/api/workouts', async (req, res) => {
  try {
    const { date, body_part, exercise, sets, reps, weight_kg, duration_min, notes } = req.body || {};

    if (!date || !body_part || !exercise || !sets || !reps) {
      return res.status(400).json({
        success: false,
        message: 'date, body_part, exercise, sets, reps는 필수입니다.',
      });
    }
    const setsN = Number(sets);
    const repsN = Number(reps);
    if (!Number.isInteger(setsN) || setsN <= 0 || !Number.isInteger(repsN) || repsN <= 0) {
      return res.status(400).json({ success: false, message: 'sets, reps는 양의 정수여야 합니다.' });
    }

    const result = await pool.query(
      `INSERT INTO workout_logs (date, body_part, exercise, sets, reps, weight_kg, duration_min, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, date, body_part, exercise, sets, reps, weight_kg, duration_min, notes, created_at`,
      [
        date,
        body_part,
        exercise,
        setsN,
        repsN,
        weight_kg === '' || weight_kg == null ? null : Number(weight_kg),
        duration_min === '' || duration_min == null ? null : Number(duration_min),
        notes || null,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POST /api/workouts]', err);
    res.status(500).json({ success: false, message: '운동 기록 추가 실패' });
  }
});

app.delete('/api/workouts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 ID' });
    }
    const result = await pool.query('DELETE FROM workout_logs WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '기록을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[DELETE /api/workouts/:id]', err);
    res.status(500).json({ success: false, message: '운동 기록 삭제 실패' });
  }
});

// =============================================================================
// Gemini 호출 유틸
// =============================================================================
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1500, temperature: 0.7 },
  });

  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (response.status !== 503) break;
    await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
  }

  if (!response.ok) {
    const errTxt = await response.text().catch(() => '');
    throw new Error(`Gemini API ${response.status}: ${errTxt.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾지 못했습니다.');
  return text;
}

// =============================================================================
// 프롬프트 조립
// =============================================================================
function summarizeWorkouts(rows) {
  if (!rows || rows.length === 0) return '(최근 운동 기록 없음)';
  return rows
    .slice(0, 25)
    .map((r) => {
      const parts = [
        r.date,
        `[${r.body_part}] ${r.exercise}`,
        `${r.sets}세트×${r.reps}회`,
        r.weight_kg != null ? `${r.weight_kg}kg` : null,
        r.duration_min != null ? `${r.duration_min}분` : null,
        r.notes ? `(${r.notes})` : null,
      ].filter(Boolean);
      return '- ' + parts.join(' · ');
    })
    .join('\n');
}

function buildPrompt({ question, context, workouts }) {
  const baseInstruction =
    '당신은 전문 퍼스널 트레이너입니다. 한국어로 자연스럽게, 번호 매긴 루틴 형식(운동명 · 세트×회 · 무게/시간 · 주의점)으로 답변하세요.';

  if (context || workouts) {
    return `${baseInstruction}

=== 유저 Context (개인 프로파일, 부상 이력 포함) ===
${context || '(Context 없음)'}

=== 최근 운동 기록 (DB에서 가져옴) ===
${workouts || '(기록 없음)'}

=== 질문 ===
${question}

위 Context의 부상/목표/선호와 DB의 최근 볼륨·빈도를 반드시 반영해 답하세요. 반복된 자극을 피하고 오늘의 컨디션을 고려하세요.`.trim();
  }

  return `${baseInstruction}

=== 질문 ===
${question}

유저에 대한 추가 정보는 없습니다. 일반적인 관점에서 답변하세요.`.trim();
}

// =============================================================================
// /api/chat — withContext 토글
// =============================================================================
app.post('/api/chat', async (req, res) => {
  try {
    const { question, withContext } = req.body || {};
    if (typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ success: false, message: '질문을 입력해주세요.' });
    }

    let context = null;
    let workoutsText = null;
    if (withContext) {
      context = await readContext();
      const rows = (await pool.query(
        `SELECT date, body_part, exercise, sets, reps, weight_kg, duration_min, notes
           FROM workout_logs ORDER BY date DESC, id DESC LIMIT 25`
      )).rows;
      workoutsText = summarizeWorkouts(rows);
    }

    const prompt = buildPrompt({ question: question.trim(), context, workouts: workoutsText });
    const answer = await callGemini(prompt);

    res.json({
      success: true,
      data: {
        answer,
        prompt,
        withContext: !!withContext,
        meta: {
          contextChars: context ? context.length : 0,
          workoutsIncluded: workoutsText ? workoutsText.split('\n').length : 0,
        },
      },
    });
  } catch (err) {
    console.error('[POST /api/chat]', err);
    res.status(500).json({ success: false, message: err.message || 'AI 호출 실패' });
  }
});

// =============================================================================
// /api/compare — Context 있이 vs 없이 동시 호출
// =============================================================================
app.post('/api/compare', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({ success: false, message: '질문을 입력해주세요.' });
    }
    const q = question.trim();

    const context = await readContext();
    const rows = (await pool.query(
      `SELECT date, body_part, exercise, sets, reps, weight_kg, duration_min, notes
         FROM workout_logs ORDER BY date DESC, id DESC LIMIT 25`
    )).rows;
    const workoutsText = summarizeWorkouts(rows);

    const promptWithout = buildPrompt({ question: q });
    const promptWith = buildPrompt({ question: q, context, workouts: workoutsText });

    // 두 호출을 병렬로
    const [withoutAns, withAns] = await Promise.all([
      callGemini(promptWithout),
      callGemini(promptWith),
    ]);

    res.json({
      success: true,
      data: {
        question: q,
        without_context: { answer: withoutAns, prompt: promptWithout },
        with_context: {
          answer: withAns,
          prompt: promptWith,
          meta: {
            contextChars: context.length,
            workoutsIncluded: workoutsText.split('\n').length,
          },
        },
      },
    });
  } catch (err) {
    console.error('[POST /api/compare]', err);
    res.status(500).json({ success: false, message: err.message || 'AI 호출 실패' });
  }
});

// =============================================================================
// API 404 → SPA fallback
// =============================================================================
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API 경로를 찾을 수 없습니다.' });
});

app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[global error]', err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: '서버 오류' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!GEMINI_API_KEY) console.warn('[WARN] GEMINI_API_KEY 미설정 — /api/chat, /api/compare 는 실패합니다.');
    if (!fs.existsSync(CONTEXT_PATH)) console.warn('[WARN] context.md 파일이 없습니다.');
  });
}

module.exports = app;
