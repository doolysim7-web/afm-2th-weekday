// =============================================================================
// 나만의 AI 대시보드 — Backend
// Express 5 + PostgreSQL(Supabase) + JWT + Gemini + Notion + Open-Meteo + HackerNews
// =============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// -----------------------------------------------------------------------------
// 환경 설정
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

const FALLBACK_DB_URL =
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const DATABASE_URL = (process.env.DATABASE_URL || FALLBACK_DB_URL).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || '').trim();
const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me').trim();
const NOTION_TOKEN = (process.env.NOTION_TOKEN || '').trim();
const NOTION_PAGE_ID = (process.env.NOTION_PAGE_ID || '34793fd9-5b00-80d4-a667-e0e6bf26256d').trim();
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemma-3-12b-it';

const JWT_EXPIRES_IN = '7d';
const BCRYPT_SALT_ROUNDS = 10;
const NOTION_SNAPSHOT_PATH = path.join(__dirname, 'notion-snapshot.json');

if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET 미설정 — 개발용 기본값 사용');
}
if (!GEMINI_API_KEY) {
  console.warn('[WARN] GEMINI_API_KEY 미설정 — /api/brief는 실패합니다');
}

// -----------------------------------------------------------------------------
// DB 풀
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// Lazy DB 초기화
// -----------------------------------------------------------------------------
let dbInitialized = false;
let dbInitPromise = null;

const DEFAULT_HABITS = [
  { name: '물 2L 마시기',   icon: '💧' },
  { name: '독서 30분',      icon: '📚' },
  { name: '스트레칭 10분',  icon: '🧘' },
];

async function initDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dash_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dash_memos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dash_habits (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
        name VARCHAR(60) NOT NULL,
        icon VARCHAR(8) DEFAULT '⭐',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dash_habit_checks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES dash_users(id) ON DELETE CASCADE,
        habit_id INTEGER NOT NULL REFERENCES dash_habits(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (habit_id, date)
      );
    `);

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
// 앱
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
// Auth
// -----------------------------------------------------------------------------
function signToken(u) {
  return jwt.sign({ id: u.id, email: u.email, name: u.name }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name };
}
function isValidEmail(e) {
  return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 100;
}
function authRequired(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }
  try {
    const payload = jwt.verify(token.trim(), JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ success: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
}

async function seedDefaultHabits(userId) {
  for (const h of DEFAULT_HABITS) {
    await pool.query(
      `INSERT INTO dash_habits (user_id, name, icon) VALUES ($1, $2, $3)`,
      [userId, h.name, h.icon]
    );
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'email, password, name 필수' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: '이메일 형식 오류' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: '비밀번호는 6자 이상' });
    }
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 30) {
      return res.status(400).json({ success: false, message: '이름은 1~30자' });
    }

    const em = email.trim().toLowerCase();
    const nm = name.trim();

    const dup = await pool.query('SELECT id FROM dash_users WHERE email = $1', [em]);
    if (dup.rowCount > 0) {
      return res.status(409).json({ success: false, message: '이미 등록된 이메일' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const ins = await pool.query(
      `INSERT INTO dash_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [em, hash, nm]
    );
    const user = ins.rows[0];

    // 신규 사용자에게 기본 습관 3개 시드
    await seedDefaultHabits(user.id);

    res.status(201).json({
      success: true,
      data: { user: publicUser(user), token: signToken(user) },
    });
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ success: false, message: '회원가입 실패' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email, password 필수' });
    }
    const em = String(email).trim().toLowerCase();
    const r = await pool.query(
      'SELECT id, email, password_hash, name FROM dash_users WHERE email = $1',
      [em]
    );
    const FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
    if (r.rowCount === 0) return res.status(401).json({ success: false, message: FAIL });
    const ok = await bcrypt.compare(String(password), r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ success: false, message: FAIL });
    res.json({
      success: true,
      data: { user: publicUser(r.rows[0]), token: signToken(r.rows[0]) },
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ success: false, message: '로그인 실패' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const r = await pool.query('SELECT id, email, name FROM dash_users WHERE id = $1', [req.user.id]);
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: '사용자 없음' });
    res.json({ success: true, data: { user: publicUser(r.rows[0]) } });
  } catch (err) {
    console.error('[me]', err);
    res.status(500).json({ success: false, message: '조회 실패' });
  }
});

// -----------------------------------------------------------------------------
// 메모 (로그인 필요)
// -----------------------------------------------------------------------------
app.get('/api/memos', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, content, created_at FROM dash_memos WHERE user_id = $1 ORDER BY id DESC LIMIT 30`,
      [req.user.id]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('[memos get]', err);
    res.status(500).json({ success: false, message: '메모 조회 실패' });
  }
});
app.post('/api/memos', authRequired, async (req, res) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: '내용이 비었습니다' });
    }
    if (content.length > 500) {
      return res.status(400).json({ success: false, message: '500자 이하' });
    }
    const r = await pool.query(
      `INSERT INTO dash_memos (user_id, content) VALUES ($1, $2) RETURNING id, content, created_at`,
      [req.user.id, content.trim()]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[memos post]', err);
    res.status(500).json({ success: false, message: '메모 추가 실패' });
  }
});
app.delete('/api/memos/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const r = await pool.query(
      `DELETE FROM dash_memos WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: '메모 없음' });
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[memos delete]', err);
    res.status(500).json({ success: false, message: '메모 삭제 실패' });
  }
});

// -----------------------------------------------------------------------------
// 습관 (로그인 필요) — 최근 7일 체크율 포함
// -----------------------------------------------------------------------------
async function getHabitsWithStats(userId) {
  const habits = await pool.query(
    `SELECT id, name, icon, created_at FROM dash_habits WHERE user_id = $1 ORDER BY id ASC`,
    [userId]
  );
  if (habits.rowCount === 0) return [];

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 6); // 7일 윈도우 (오늘 포함)
  const startStr = start.toISOString().slice(0, 10);

  const checks = await pool.query(
    `SELECT habit_id, date::text FROM dash_habit_checks
       WHERE user_id = $1 AND date >= $2`,
    [userId, startStr]
  );

  const byHabit = new Map();
  for (const c of checks.rows) {
    if (!byHabit.has(c.habit_id)) byHabit.set(c.habit_id, new Set());
    byHabit.get(c.habit_id).add(c.date);
  }

  const todayStr = today.toISOString().slice(0, 10);
  return habits.rows.map((h) => {
    const datesSet = byHabit.get(h.id) || new Set();
    return {
      ...h,
      checked_today: datesSet.has(todayStr),
      last_7_days: datesSet.size,
    };
  });
}

app.get('/api/habits', authRequired, async (req, res) => {
  try {
    res.json({ success: true, data: await getHabitsWithStats(req.user.id) });
  } catch (err) {
    console.error('[habits get]', err);
    res.status(500).json({ success: false, message: '습관 조회 실패' });
  }
});

app.post('/api/habits', authRequired, async (req, res) => {
  try {
    const { name, icon } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: '습관 이름이 비었습니다' });
    }
    if (name.trim().length > 60) {
      return res.status(400).json({ success: false, message: '60자 이하' });
    }
    const r = await pool.query(
      `INSERT INTO dash_habits (user_id, name, icon) VALUES ($1, $2, $3)
       RETURNING id, name, icon, created_at`,
      [req.user.id, name.trim(), (icon || '⭐').slice(0, 4)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[habits post]', err);
    res.status(500).json({ success: false, message: '습관 추가 실패' });
  }
});

app.delete('/api/habits/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const r = await pool.query(
      `DELETE FROM dash_habits WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ success: false, message: '습관 없음' });
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[habits delete]', err);
    res.status(500).json({ success: false, message: '습관 삭제 실패' });
  }
});

// 오늘 체크 토글 (이미 있으면 해제)
app.post('/api/habits/:id/toggle', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '잘못된 ID' });
    }
    const own = await pool.query(
      `SELECT id FROM dash_habits WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (own.rowCount === 0) {
      return res.status(404).json({ success: false, message: '습관 없음' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const existing = await pool.query(
      `SELECT id FROM dash_habit_checks WHERE habit_id = $1 AND date = $2`,
      [id, today]
    );

    if (existing.rowCount > 0) {
      await pool.query(`DELETE FROM dash_habit_checks WHERE id = $1`, [existing.rows[0].id]);
      return res.json({ success: true, data: { checked: false, date: today } });
    } else {
      await pool.query(
        `INSERT INTO dash_habit_checks (user_id, habit_id, date) VALUES ($1, $2, $3)`,
        [req.user.id, id, today]
      );
      return res.json({ success: true, data: { checked: true, date: today } });
    }
  } catch (err) {
    console.error('[habits toggle]', err);
    res.status(500).json({ success: false, message: '체크 실패' });
  }
});

// -----------------------------------------------------------------------------
// 외부 데이터 소스: Notion / 날씨 / 뉴스
// -----------------------------------------------------------------------------

// --- Notion: 라이브(토큰 있으면) or 스냅샷 ---
async function getNotionLive() {
  if (!NOTION_TOKEN) return null;
  try {
    const resp = await fetch(
      `https://api.notion.com/v1/blocks/${NOTION_PAGE_ID}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
        },
      }
    );
    if (!resp.ok) {
      console.warn('[notion live]', resp.status, (await resp.text()).slice(0, 120));
      return null;
    }
    const data = await resp.json();
    const bullets = (data.results || [])
      .filter((b) => b.type === 'bulleted_list_item' || b.type === 'to_do')
      .map((b) => {
        const rt = (b.bulleted_list_item || b.to_do || {}).rich_text || [];
        return rt.map((t) => t.plain_text).join('');
      })
      .filter(Boolean);
    return { source: 'live', bullets };
  } catch (err) {
    console.warn('[notion live exc]', err.message);
    return null;
  }
}

let notionSnapshotCache = null;
async function getNotionSnapshot() {
  if (notionSnapshotCache) return notionSnapshotCache;
  try {
    const raw = await fsp.readFile(NOTION_SNAPSHOT_PATH, 'utf-8');
    notionSnapshotCache = JSON.parse(raw);
  } catch (err) {
    console.warn('[notion snapshot]', err.message);
    notionSnapshotCache = { todos: [], books: [] };
  }
  return notionSnapshotCache;
}

app.get('/api/notion/todos', async (_req, res) => {
  try {
    const live = await getNotionLive();
    if (live) return res.json({ success: true, data: live });
    const snap = await getNotionSnapshot();
    res.json({
      success: true,
      data: {
        source: 'snapshot',
        synced_at: snap.synced_at,
        todos: snap.todos || [],
        books: snap.books || [],
      },
    });
  } catch (err) {
    console.error('[notion]', err);
    res.status(500).json({ success: false, message: '노션 조회 실패' });
  }
});

// --- 날씨: Open-Meteo (무료, 무인증) ---
const WMO_CODE = {
  0: '맑음', 1: '대체로 맑음', 2: '부분적으로 흐림', 3: '흐림',
  45: '안개', 48: '짙은 안개',
  51: '이슬비', 53: '이슬비', 55: '이슬비',
  61: '비', 63: '비', 65: '강한 비',
  71: '눈', 73: '눈', 75: '강한 눈',
  80: '소나기', 81: '소나기', 82: '강한 소나기',
  95: '뇌우', 96: '뇌우 (우박)', 99: '강한 뇌우',
};
function weatherDesc(code) { return WMO_CODE[code] || `상태코드 ${code}`; }

app.get('/api/weather', async (req, res) => {
  try {
    const lat = Number(req.query.lat) || 37.5665;   // 서울시청
    const lon = Number(req.query.lon) || 126.9780;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=1`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Open-Meteo ${resp.status}`);
    const d = await resp.json();
    const cur = d.current || {};
    const daily = d.daily || {};
    res.json({
      success: true,
      data: {
        location: { lat, lon, label: lat === 37.5665 ? '서울' : `${lat},${lon}` },
        current: {
          temp: cur.temperature_2m,
          wind: cur.wind_speed_10m,
          humidity: cur.relative_humidity_2m,
          code: cur.weather_code,
          desc: weatherDesc(cur.weather_code),
        },
        today: {
          max: daily.temperature_2m_max?.[0],
          min: daily.temperature_2m_min?.[0],
          precip: daily.precipitation_probability_max?.[0],
        },
      },
    });
  } catch (err) {
    console.error('[weather]', err);
    res.status(500).json({ success: false, message: '날씨 조회 실패' });
  }
});

// --- 뉴스: Hacker News 상위 5개 (무료, 무인증) ---
app.get('/api/news', async (_req, res) => {
  try {
    const top = await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')).json();
    const ids = (top || []).slice(0, 5);
    const items = await Promise.all(
      ids.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json())
      )
    );
    res.json({
      success: true,
      data: items.filter(Boolean).map((n) => ({
        id: n.id,
        title: n.title,
        url: n.url || `https://news.ycombinator.com/item?id=${n.id}`,
        score: n.score,
        by: n.by,
      })),
    });
  } catch (err) {
    console.error('[news]', err);
    res.status(500).json({ success: false, message: '뉴스 조회 실패' });
  }
});

// -----------------------------------------------------------------------------
// 가계부 전달 — transactions 테이블 (공유, 간단 요약만)
// -----------------------------------------------------------------------------
async function getTransactionsSummary() {
  const nowStr = new Date().toISOString().slice(0, 10);
  const monthStart = nowStr.slice(0, 8) + '01';

  const totals = await pool.query(
    `SELECT type, COALESCE(SUM(amount),0)::bigint AS total
       FROM transactions WHERE date >= $1
       GROUP BY type`,
    [monthStart]
  );
  let income = 0, expense = 0;
  for (const r of totals.rows) {
    if (r.type === 'income') income = Number(r.total);
    else expense = Number(r.total);
  }

  const byCat = await pool.query(
    `SELECT category, COALESCE(SUM(amount),0)::bigint AS total
       FROM transactions
       WHERE type = 'expense' AND date >= $1
       GROUP BY category ORDER BY total DESC LIMIT 5`,
    [monthStart]
  );

  const recent = await pool.query(
    `SELECT type, date::text, amount, category, memo
       FROM transactions ORDER BY date DESC, id DESC LIMIT 5`
  );

  return {
    month: monthStart.slice(0, 7),
    income,
    expense,
    balance: income - expense,
    top_categories: byCat.rows.map((r) => ({ category: r.category, total: Number(r.total) })),
    recent: recent.rows.map((r) => ({ ...r, amount: Number(r.amount) })),
  };
}

// -----------------------------------------------------------------------------
// /api/dashboard — 전체 데이터 한번에
// -----------------------------------------------------------------------------
app.get('/api/dashboard', authRequired, async (req, res) => {
  try {
    const [userRow, habits, memos, txSummary, notion, weather, news] = await Promise.all([
      pool.query(`SELECT id, email, name FROM dash_users WHERE id = $1`, [req.user.id]).then((r) => r.rows[0]),
      getHabitsWithStats(req.user.id),
      pool.query(
        `SELECT id, content, created_at FROM dash_memos WHERE user_id = $1 ORDER BY id DESC LIMIT 10`,
        [req.user.id]
      ).then((r) => r.rows),
      getTransactionsSummary(),
      fetchNotionTodos(),
      fetchWeather(),
      fetchNews(),
    ]);

    res.json({
      success: true,
      data: {
        user: userRow ? publicUser(userRow) : req.user,
        habits,
        memos,
        transactions: txSummary,
        notion,
        weather,
        news,
        fetched_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[dashboard]', err);
    res.status(500).json({ success: false, message: '대시보드 로드 실패' });
  }
});

// Internal helpers (wrap endpoints as plain functions for /api/dashboard)
async function fetchNotionTodos() {
  const live = await getNotionLive();
  if (live) return live;
  const snap = await getNotionSnapshot();
  return {
    source: 'snapshot',
    synced_at: snap.synced_at,
    todos: snap.todos || [],
    books: snap.books || [],
  };
}
async function fetchWeather() {
  try {
    const lat = 37.5665, lon = 126.9780;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Seoul&forecast_days=1`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    return {
      location: { lat, lon, label: '서울' },
      current: {
        temp: d.current?.temperature_2m,
        wind: d.current?.wind_speed_10m,
        humidity: d.current?.relative_humidity_2m,
        code: d.current?.weather_code,
        desc: weatherDesc(d.current?.weather_code),
      },
      today: {
        max: d.daily?.temperature_2m_max?.[0],
        min: d.daily?.temperature_2m_min?.[0],
        precip: d.daily?.precipitation_probability_max?.[0],
      },
    };
  } catch (err) {
    console.warn('[dashboard weather]', err.message);
    return null;
  }
}
async function fetchNews() {
  try {
    const top = await (await fetch('https://hacker-news.firebaseio.com/v0/topstories.json')).json();
    const ids = (top || []).slice(0, 5);
    const items = await Promise.all(
      ids.map((id) =>
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then((r) => r.json())
      )
    );
    return items.filter(Boolean).map((n) => ({
      id: n.id,
      title: n.title,
      url: n.url || `https://news.ycombinator.com/item?id=${n.id}`,
      score: n.score,
    }));
  } catch (err) {
    console.warn('[dashboard news]', err.message);
    return [];
  }
}

// -----------------------------------------------------------------------------
// /api/brief — AI 오늘의 브리핑 (Gemini)
// -----------------------------------------------------------------------------
async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY 미설정');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 1200, temperature: 0.7 },
  });

  let resp;
  for (let i = 0; i < 3; i++) {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (resp.status !== 503 && resp.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`Gemini ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini 응답에 텍스트 없음');
  return text;
}

function buildBriefPrompt(ctx) {
  const today = new Date().toLocaleDateString('ko-KR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const lines = [];
  lines.push(`당신은 친절하고 따뜻한 개인 비서입니다. 아래 데이터를 종합해 한국어로 짧은 "오늘의 브리핑"을 써주세요.`);
  lines.push(`다음 4개 섹션을 순서대로 자연스럽게 작성하세요: 🌤️ 오늘 날씨 / 📋 오늘의 할 일 / 💰 이달 지출 요약 / ✨ 추천 액션 (1~2개).`);
  lines.push(`너무 길지 않게, 전체 10줄 내외. 이모지는 섹션 헤더에만.\n`);
  lines.push(`===== 오늘 날짜 =====\n${today}\n`);

  lines.push(`===== 사용자 =====`);
  lines.push(`이름: ${ctx.user?.name || '(없음)'}\n`);

  if (ctx.weather) {
    const w = ctx.weather;
    lines.push(`===== 날씨 (${w.location?.label}) =====`);
    lines.push(`현재: ${w.current?.temp}°C, ${w.current?.desc}, 풍속 ${w.current?.wind}m/s, 습도 ${w.current?.humidity}%`);
    lines.push(`오늘: 최고 ${w.today?.max}°C / 최저 ${w.today?.min}°C, 강수확률 ${w.today?.precip}%\n`);
  }

  const todos = ctx.notion?.todos || [];
  lines.push(`===== 노션 할일 =====`);
  if (todos.length === 0) lines.push('(없음)');
  else for (const t of todos) lines.push(`- ${t.text}${t.registered ? ` (등록: ${t.registered})` : ''}`);
  lines.push('');

  if (ctx.transactions) {
    const tx = ctx.transactions;
    lines.push(`===== 가계부 (${tx.month}) =====`);
    lines.push(`수입: ${tx.income.toLocaleString()}원 / 지출: ${tx.expense.toLocaleString()}원 / 잔액: ${tx.balance.toLocaleString()}원`);
    if (tx.top_categories?.length) {
      lines.push(`지출 top: ${tx.top_categories.map((c) => `${c.category} ${c.total.toLocaleString()}원`).join(', ')}`);
    }
    lines.push('');
  }

  if (ctx.habits?.length) {
    lines.push(`===== 내 습관 (지난 7일 체크수) =====`);
    for (const h of ctx.habits) {
      lines.push(`- ${h.icon || '⭐'} ${h.name}: ${h.last_7_days}/7 (오늘 ${h.checked_today ? '✓' : '✗'})`);
    }
    lines.push('');
  }

  if (ctx.news?.length) {
    lines.push(`===== 오늘의 테크 뉴스 (Hacker News) =====`);
    for (const n of ctx.news.slice(0, 3)) lines.push(`- ${n.title}`);
    lines.push('');
  }

  lines.push(`위 데이터를 바탕으로 브리핑을 작성해주세요. 뉴스 제목이 영어면 핵심만 한국어로 간단히 의역해도 좋습니다.`);
  return lines.join('\n');
}

app.post('/api/brief', authRequired, async (req, res) => {
  try {
    // 대시보드 데이터를 내부적으로 한번 더 수집 (최신 상태 보장)
    const [userRow, habits, memos, txSummary, notion, weather, news] = await Promise.all([
      pool.query(`SELECT id, email, name FROM dash_users WHERE id = $1`, [req.user.id]).then((r) => r.rows[0]),
      getHabitsWithStats(req.user.id),
      pool.query(
        `SELECT content FROM dash_memos WHERE user_id = $1 ORDER BY id DESC LIMIT 5`,
        [req.user.id]
      ).then((r) => r.rows),
      getTransactionsSummary(),
      fetchNotionTodos(),
      fetchWeather(),
      fetchNews(),
    ]);

    const ctx = { user: userRow, habits, memos, transactions: txSummary, notion, weather, news };
    const prompt = buildBriefPrompt(ctx);
    const brief = await callGemini(prompt);

    res.json({
      success: true,
      data: {
        brief,
        prompt,
        context_summary: {
          notion_todos: (notion?.todos || []).length,
          weather_available: !!weather,
          news_count: (news || []).length,
          habits_count: habits.length,
          tx_month: txSummary?.month,
        },
      },
    });
  } catch (err) {
    console.error('[brief]', err);
    res.status(500).json({ success: false, message: err.message || 'AI 브리핑 실패' });
  }
});

// -----------------------------------------------------------------------------
// SPA fallback / 에러 핸들러
// -----------------------------------------------------------------------------
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API 경로를 찾을 수 없습니다.' });
});
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[global]', err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: '서버 오류' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!NOTION_TOKEN) console.log('[info] NOTION_TOKEN 없음 — notion-snapshot.json 사용');
    else console.log('[info] NOTION_TOKEN 있음 — 라이브 호출');
  });
}

module.exports = app;
