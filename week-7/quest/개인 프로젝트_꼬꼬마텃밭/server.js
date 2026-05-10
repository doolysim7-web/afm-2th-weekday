require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const PFX = 'small_forest_';
const T = {
  users: `${PFX}users`,
  crops: `${PFX}crops`,
  cropTasks: `${PFX}crop_tasks`,
  userCrops: `${PFX}user_crops`,
  logs: `${PFX}logs`,
  logCrops: `${PFX}log_crops`,
  budgets: `${PFX}budgets`,
  posts: `${PFX}posts`,
  comments: `${PFX}comments`,
  postLikes: `${PFX}post_likes`,
};

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CROP_CATEGORIES = ['엽채', '과채', '근채', '곡류', '허브'];
const TASK_TYPES = ['모종', '시비', '관수', '수확', '풀뽑기', '병해충관리'];
const BOARD_LIST = ['질문', '자랑', '정보', '자유'];
const BUDGET_CATEGORIES = ['모종/씨앗', '비료/퇴비', '농약', '도구', '임차료', '운반비', '기타'];
const VISIBILITY = ['private', 'friends', 'public'];

// 입력에서 crop_ids 배열 정규화 (구버전 crop_id 단일 필드도 호환)
function normalizeCropIds(body) {
  const arr = Array.isArray(body?.crop_ids) ? body.crop_ids
            : (body?.crop_id != null ? [body.crop_id] : []);
  const ids = arr
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(ids)].slice(0, 10);
}

async function setLogCrops(client, logId, cropIds) {
  await client.query(`DELETE FROM ${T.logCrops} WHERE log_id = $1`, [logId]);
  for (const cid of cropIds) {
    await client.query(
      `INSERT INTO ${T.logCrops} (log_id, crop_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [logId, cid]
    );
  }
}

// ---------------------------------------------------------------------------
// DB Schema (lazy init)
// ---------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.users} (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      avatar_emoji TEXT NOT NULL DEFAULT '🌱',
      region_sido TEXT NOT NULL DEFAULT '',
      region_sigungu TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.crops} (
      id BIGSERIAL PRIMARY KEY,
      name_ko TEXT UNIQUE NOT NULL,
      name_en TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      season_start_month INT NOT NULL,
      season_end_month INT NOT NULL,
      sunlight TEXT NOT NULL DEFAULT '',
      water_freq_days INT NOT NULL DEFAULT 2,
      soil_pref TEXT NOT NULL DEFAULT '',
      summary_md TEXT NOT NULL DEFAULT '',
      hero_image_url TEXT NOT NULL DEFAULT '',
      beginner_friendly BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.cropTasks} (
      id BIGSERIAL PRIMARY KEY,
      crop_id BIGINT NOT NULL REFERENCES ${T.crops}(id) ON DELETE CASCADE,
      task_type TEXT NOT NULL,
      month INT NOT NULL,
      week_in_month INT NOT NULL DEFAULT 0,
      instructions_md TEXT NOT NULL DEFAULT '',
      fertilizer_recipe_md TEXT NOT NULL DEFAULT '',
      per_5pyeong_amount TEXT NOT NULL DEFAULT '',
      per_10pyeong_amount TEXT NOT NULL DEFAULT '',
      per_20pyeong_amount TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.cropTasks}_month_idx ON ${T.cropTasks}(month);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.cropTasks}_crop_idx ON ${T.cropTasks}(crop_id);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.userCrops} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      crop_id BIGINT NOT NULL REFERENCES ${T.crops}(id) ON DELETE CASCADE,
      planted_at DATE NOT NULL DEFAULT CURRENT_DATE,
      area_pyeong NUMERIC(5,1) NOT NULL DEFAULT 5,
      status TEXT NOT NULL DEFAULT 'active',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.userCrops}_user_idx ON ${T.userCrops}(user_id);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.logs} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      crop_id BIGINT REFERENCES ${T.crops}(id) ON DELETE SET NULL,
      log_date DATE NOT NULL DEFAULT CURRENT_DATE,
      title TEXT NOT NULL DEFAULT '',
      body_md TEXT NOT NULL DEFAULT '',
      image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      weather TEXT NOT NULL DEFAULT '',
      mood TEXT NOT NULL DEFAULT '보통',
      visibility TEXT NOT NULL DEFAULT 'private',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.logs}_user_date_idx ON ${T.logs}(user_id, log_date DESC);`);
  // 일지 ↔ 작목 다대다 (다중 작목 선택)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.logCrops} (
      log_id BIGINT NOT NULL REFERENCES ${T.logs}(id) ON DELETE CASCADE,
      crop_id BIGINT NOT NULL REFERENCES ${T.crops}(id) ON DELETE CASCADE,
      PRIMARY KEY (log_id, crop_id)
    );
  `);
  // 기존 logs.crop_id (단일) 데이터를 정션으로 일회 이관
  await pool.query(`
    INSERT INTO ${T.logCrops} (log_id, crop_id)
    SELECT id, crop_id FROM ${T.logs} WHERE crop_id IS NOT NULL
    ON CONFLICT DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.budgets} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount INT NOT NULL,
      category TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
      log_id BIGINT REFERENCES ${T.logs}(id) ON DELETE SET NULL,
      receipt_image_url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.budgets}_user_date_idx ON ${T.budgets}(user_id, occurred_at DESC);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.posts} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      board TEXT NOT NULL,
      title TEXT NOT NULL,
      body_md TEXT NOT NULL DEFAULT '',
      image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.posts}_board_idx ON ${T.posts}(board, created_at DESC);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.comments} (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES ${T.posts}(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      hidden BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.comments}_post_idx ON ${T.comments}(post_id, id);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.postLikes} (
      post_id BIGINT NOT NULL REFERENCES ${T.posts}(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (post_id, user_id)
    );
  `);
  dbInitialized = true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

app.get('/api/categories', (_req, res) => {
  res.json({
    success: true,
    data: { crop: CROP_CATEGORIES, task: TASK_TYPES, board: BOARD_LIST, budget: BUDGET_CATEGORIES, visibility: VISIBILITY },
  });
});

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('initDB failed:', err);
    res.status(500).json({ success: false, message: 'DB init failed' });
  }
});

function signToken(u) {
  return jwt.sign({ sub: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!tok) return res.status(401).json({ success: false, message: '로그인이 필요해요' });
  try {
    const p = jwt.verify(tok, JWT_SECRET);
    req.userId = p.sub;
    req.userRole = p.role;
    next();
  } catch {
    return res.status(401).json({ success: false, message: '토큰이 유효하지 않아요' });
  }
}

function authOptional(req, _res, next) {
  const auth = req.headers.authorization || '';
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (tok) {
    try {
      const p = jwt.verify(tok, JWT_SECRET);
      req.userId = p.sub;
      req.userRole = p.role;
    } catch { /* ignore */ }
  }
  next();
}

async function adminRequired(req, res, next) {
  try {
    const r = await pool.query(`SELECT role FROM ${T.users} WHERE id = $1`, [req.userId]);
    if (r.rows[0]?.role !== 'admin') return res.status(403).json({ success: false, message: '관리자 전용이에요' });
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: '권한 확인 실패' });
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { db: 'ok' } });
  } catch {
    res.status(500).json({ success: false, message: 'db down' });
  }
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, display_name, region_sido, region_sigungu, avatar_emoji } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || typeof display_name !== 'string') {
      return res.status(400).json({ success: false, message: '필수 항목이 비어있어요' });
    }
    const e = email.trim().toLowerCase();
    const dn = display_name.trim();
    const sido = (region_sido || '').toString().trim();
    const sigu = (region_sigungu || '').toString().trim();
    const av = (avatar_emoji || '🌱').toString().slice(0, 8);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ success: false, message: '이메일 형식이 맞나요?' });
    if (password.length < 6) return res.status(400).json({ success: false, message: '비밀번호 6자 이상으로 부탁드려요' });
    if (!dn || dn.length > 20) return res.status(400).json({ success: false, message: '닉네임 1~20자' });

    const hash = await bcrypt.hash(password, 10);
    let row;
    try {
      const r = await pool.query(
        `INSERT INTO ${T.users} (email, password_hash, display_name, region_sido, region_sigungu, avatar_emoji)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, display_name, region_sido, region_sigungu, avatar_emoji, role, created_at`,
        [e, hash, dn, sido, sigu, av]
      );
      row = r.rows[0];
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, message: '이미 가입된 이메일이에요' });
      throw err;
    }
    res.status(201).json({ success: true, data: { user: row, token: signToken(row) } });
  } catch (err) {
    console.error('signup failed:', err);
    res.status(500).json({ success: false, message: '회원가입 실패' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: '이메일/비밀번호를 확인해 주세요' });
    }
    const e = email.trim().toLowerCase();
    const r = await pool.query(
      `SELECT id, email, password_hash, display_name, region_sido, region_sigungu, avatar_emoji, role, created_at
         FROM ${T.users} WHERE email = $1`,
      [e]
    );
    if (!r.rows[0]) return res.status(401).json({ success: false, message: '이메일/비밀번호 확인해 주세요' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ success: false, message: '이메일/비밀번호 확인해 주세요' });
    const { password_hash, ...user } = r.rows[0];
    res.json({ success: true, data: { user, token: signToken(user) } });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ success: false, message: '로그인 실패' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, email, display_name, region_sido, region_sigungu, avatar_emoji, role, created_at
         FROM ${T.users} WHERE id = $1`,
      [req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '사용자 없음' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '실패' });
  }
});

app.patch('/api/auth/me', authRequired, async (req, res) => {
  try {
    const { display_name, region_sido, region_sigungu, avatar_emoji } = req.body || {};
    const fs = []; const vs = []; let i = 1;
    if (typeof display_name === 'string' && display_name.trim()) { fs.push(`display_name = $${i++}`); vs.push(display_name.trim()); }
    if (typeof region_sido === 'string') { fs.push(`region_sido = $${i++}`); vs.push(region_sido.trim()); }
    if (typeof region_sigungu === 'string') { fs.push(`region_sigungu = $${i++}`); vs.push(region_sigungu.trim()); }
    if (typeof avatar_emoji === 'string' && avatar_emoji.trim()) { fs.push(`avatar_emoji = $${i++}`); vs.push(avatar_emoji.slice(0, 8)); }
    if (!fs.length) return res.status(400).json({ success: false, message: '바꿀 게 없어요' });
    vs.push(req.userId);
    const r = await pool.query(
      `UPDATE ${T.users} SET ${fs.join(', ')} WHERE id = $${i}
       RETURNING id, email, display_name, region_sido, region_sigungu, avatar_emoji, role, created_at`,
      vs
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '프로필 수정 실패' });
  }
});

// ---------------------------------------------------------------------------
// ImageKit auth (client direct upload)
// ---------------------------------------------------------------------------
app.get('/api/upload/auth', authRequired, (_req, res) => {
  try {
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 60 * 5;
    const signature = crypto
      .createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
      success: true,
      data: {
        token, expire, signature,
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: '업로드 인증 실패' });
  }
});

// ---------------------------------------------------------------------------
// Crops (public)
// ---------------------------------------------------------------------------
app.get('/api/crops', authOptional, async (req, res) => {
  try {
    const { category, beginner, month } = req.query;
    const cs = []; const vs = []; let i = 1;
    if (typeof category === 'string' && CROP_CATEGORIES.includes(category)) { cs.push(`category = $${i++}`); vs.push(category); }
    if (beginner === 'true') cs.push(`beginner_friendly = TRUE`);
    if (month) {
      const m = Number.parseInt(month, 10);
      if (Number.isInteger(m) && m >= 1 && m <= 12) {
        cs.push(`(season_start_month <= $${i} AND season_end_month >= $${i})`);
        vs.push(m); i++;
      }
    }
    const where = cs.length ? `WHERE ${cs.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT id, name_ko, name_en, category, season_start_month, season_end_month,
              sunlight, water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly
         FROM ${T.crops} ${where}
        ORDER BY beginner_friendly DESC, name_ko ASC`,
      vs
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('list crops failed:', err);
    res.status(500).json({ success: false, message: '작목 목록 실패' });
  }
});

app.get('/api/crops/:id', authOptional, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const c = await pool.query(`SELECT * FROM ${T.crops} WHERE id = $1`, [id]);
    if (!c.rows[0]) return res.status(404).json({ success: false, message: '작목을 찾지 못했어요' });
    const tasks = await pool.query(
      `SELECT id, task_type, month, week_in_month, instructions_md, fertilizer_recipe_md,
              per_5pyeong_amount, per_10pyeong_amount, per_20pyeong_amount, image_url
         FROM ${T.cropTasks} WHERE crop_id = $1
         ORDER BY month ASC, week_in_month ASC`,
      [id]
    );
    res.json({ success: true, data: { ...c.rows[0], tasks: tasks.rows } });
  } catch (err) {
    res.status(500).json({ success: false, message: '작목 상세 실패' });
  }
});

// ---------------------------------------------------------------------------
// 작목 정보 보강 (회원 누구나 — 위키처럼 공동 편집)
// ---------------------------------------------------------------------------
app.put('/api/crops/:id/info', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const exist = await pool.query(`SELECT id FROM ${T.crops} WHERE id = $1`, [id]);
    if (!exist.rows[0]) return res.status(404).json({ success: false, message: '작목 없음' });

    const b = req.body || {};
    const ss = Number.parseInt(b.season_start_month, 10);
    const se = Number.parseInt(b.season_end_month, 10);
    if (!Number.isInteger(ss) || ss < 1 || ss > 12) return res.status(400).json({ success: false, message: '시즌 시작월 1~12' });
    if (!Number.isInteger(se) || se < 1 || se > 12) return res.status(400).json({ success: false, message: '시즌 종료월 1~12' });
    const wf = Number.parseInt(b.water_freq_days, 10);
    if (!Number.isInteger(wf) || wf < 1 || wf > 30) return res.status(400).json({ success: false, message: '물주기 1~30일' });
    if (b.category && !CROP_CATEGORIES.includes(b.category)) return res.status(400).json({ success: false, message: '카테고리 오류' });

    const r = await pool.query(
      `UPDATE ${T.crops}
          SET category = COALESCE($1, category),
              season_start_month = $2,
              season_end_month = $3,
              sunlight = $4,
              water_freq_days = $5,
              soil_pref = $6,
              summary_md = $7,
              hero_image_url = $8,
              beginner_friendly = $9
        WHERE id = $10
        RETURNING *`,
      [
        b.category || null,
        ss, se,
        (b.sunlight || '').toString().slice(0, 30),
        wf,
        (b.soil_pref || '').toString().slice(0, 60),
        (b.summary_md || '').toString().slice(0, 500),
        (b.hero_image_url || '').toString().slice(0, 500),
        !!b.beginner_friendly,
        id,
      ]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('update crop info failed:', err);
    res.status(500).json({ success: false, message: '정보 수정 실패' });
  }
});

app.post('/api/crops/:id/tasks', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const exist = await pool.query(`SELECT id FROM ${T.crops} WHERE id = $1`, [id]);
    if (!exist.rows[0]) return res.status(404).json({ success: false, message: '작목 없음' });

    const b = req.body || {};
    if (!TASK_TYPES.includes(b.task_type)) return res.status(400).json({ success: false, message: '작업 유형 선택' });
    const m = Number.parseInt(b.month, 10);
    if (!Number.isInteger(m) || m < 1 || m > 12) return res.status(400).json({ success: false, message: '월 1~12' });
    let wim = Number.parseInt(b.week_in_month, 10);
    if (!Number.isInteger(wim) || wim < 0 || wim > 5) wim = 0;

    const r = await pool.query(
      `INSERT INTO ${T.cropTasks}
         (crop_id, task_type, month, week_in_month, instructions_md,
          per_5pyeong_amount, per_10pyeong_amount, per_20pyeong_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        id, b.task_type, m, wim,
        (b.instructions_md || '').toString().slice(0, 300),
        (b.per_5pyeong_amount || '').toString().slice(0, 30),
        (b.per_10pyeong_amount || '').toString().slice(0, 30),
        (b.per_20pyeong_amount || '').toString().slice(0, 30),
      ]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('add crop task failed:', err);
    res.status(500).json({ success: false, message: '작업 추가 실패' });
  }
});

app.delete('/api/crops/:cropId/tasks/:taskId', authRequired, async (req, res) => {
  try {
    const cropId = Number.parseInt(req.params.cropId, 10);
    const taskId = Number.parseInt(req.params.taskId, 10);
    // 관리자만 삭제 가능 (스팸/실수 방지)
    const me = await pool.query(`SELECT role FROM ${T.users} WHERE id = $1`, [req.userId]);
    if (me.rows[0]?.role !== 'admin') {
      return res.status(403).json({ success: false, message: '관리자만 작업 항목 삭제 가능' });
    }
    await pool.query(`DELETE FROM ${T.cropTasks} WHERE id = $1 AND crop_id = $2`, [taskId, cropId]);
    res.json({ success: true, data: { id: taskId } });
  } catch (err) {
    res.status(500).json({ success: false, message: '작업 삭제 실패' });
  }
});

// ---------------------------------------------------------------------------
// Quick add crop (회원 누구나, 일지 작성 중 즉석 추가용)
// ---------------------------------------------------------------------------
app.post('/api/crops/quick', authRequired, async (req, res) => {
  try {
    const name = (req.body?.name_ko || '').toString().trim();
    const category = (req.body?.category || '기타').toString();
    if (!name) return res.status(400).json({ success: false, message: '작목명을 적어주세요' });
    if (name.length > 20) return res.status(400).json({ success: false, message: '작목명은 20자 이하' });
    const cat = CROP_CATEGORIES.includes(category) ? category : '기타';

    // 이미 같은 이름이 있으면 그대로 반환 (중복 추가 방지)
    const exist = await pool.query(
      `SELECT id, name_ko, name_en, category, season_start_month, season_end_month,
              sunlight, water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly
         FROM ${T.crops} WHERE name_ko = $1`,
      [name]
    );
    if (exist.rows[0]) {
      return res.json({ success: true, data: { ...exist.rows[0], reused: true } });
    }
    const r = await pool.query(
      `INSERT INTO ${T.crops}
         (name_ko, name_en, category, season_start_month, season_end_month,
          sunlight, water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly)
       VALUES ($1, '', $2, 1, 12, '', 2, '', $3, '', FALSE)
       RETURNING id, name_ko, name_en, category, season_start_month, season_end_month,
                 sunlight, water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly`,
      [name, cat, `${req.userId}님이 직접 추가한 작목입니다. 가이드는 추후 추가될 예정이에요.`]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: '이미 같은 이름의 작목이 있어요' });
    console.error('quick add crop failed:', err);
    res.status(500).json({ success: false, message: '작목 추가 실패' });
  }
});

// CROP_CATEGORIES enum 노출 (프론트에서 사용)
// (이미 /api/categories에 포함되어 있음)

// ---------------------------------------------------------------------------
// Calendar (public)
// ---------------------------------------------------------------------------
app.get('/api/calendar', authOptional, async (req, res) => {
  try {
    let month;
    if (typeof req.query.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)) {
      month = parseInt(req.query.month.split('-')[1], 10);
    } else {
      month = new Date().getMonth() + 1;
    }
    // 이번 달이 시즌인 작목 + 그 작목의 이번 달 작업
    const r = await pool.query(
      `SELECT c.id, c.name_ko, c.category, c.hero_image_url, c.beginner_friendly,
              json_agg(json_build_object(
                'id', t.id, 'task_type', t.task_type, 'week_in_month', t.week_in_month,
                'instructions_md', t.instructions_md
              ) ORDER BY t.week_in_month, t.id) FILTER (WHERE t.id IS NOT NULL) AS tasks
         FROM ${T.crops} c
         LEFT JOIN ${T.cropTasks} t ON t.crop_id = c.id AND t.month = $1
        WHERE c.season_start_month <= $1 AND c.season_end_month >= $1
        GROUP BY c.id
        ORDER BY c.beginner_friendly DESC, c.name_ko`,
      [month]
    );
    res.json({ success: true, data: { month, crops: r.rows } });
  } catch (err) {
    console.error('calendar failed:', err);
    res.status(500).json({ success: false, message: '캘린더 실패' });
  }
});

// ---------------------------------------------------------------------------
// Dashboard (member) — 이번 주말 할 일
// ---------------------------------------------------------------------------
app.get('/api/me/dashboard', authRequired, async (req, res) => {
  try {
    const month = new Date().getMonth() + 1;
    // 1) 내가 키우는 작물의 이번 달 작업
    const myCropTasks = await pool.query(
      `SELECT uc.id AS user_crop_id, c.id AS crop_id, c.name_ko, c.hero_image_url,
              t.task_type, t.week_in_month, t.instructions_md
         FROM ${T.userCrops} uc
         JOIN ${T.crops} c ON c.id = uc.crop_id
         LEFT JOIN ${T.cropTasks} t ON t.crop_id = c.id AND t.month = $1
        WHERE uc.user_id = $2 AND uc.status = 'active'
        ORDER BY c.name_ko, t.week_in_month NULLS LAST, t.id`,
      [month, req.userId]
    );
    // 2) 이번 달 시즌 시작 작목 (모종/파종 추천)
    const seasonTip = await pool.query(
      `SELECT id, name_ko, hero_image_url, category, beginner_friendly
         FROM ${T.crops}
        WHERE season_start_month = $1
        ORDER BY beginner_friendly DESC, name_ko
        LIMIT 5`,
      [month]
    );
    // 3) 가장 최근 일지
    const lastLog = await pool.query(
      `SELECT id, log_date, title FROM ${T.logs} WHERE user_id = $1 ORDER BY log_date DESC, id DESC LIMIT 1`,
      [req.userId]
    );
    res.json({
      success: true,
      data: {
        month,
        my_crop_tasks: myCropTasks.rows,
        season_tip: seasonTip.rows,
        last_log: lastLog.rows[0] || null,
      },
    });
  } catch (err) {
    console.error('dashboard failed:', err);
    res.status(500).json({ success: false, message: '대시보드 실패' });
  }
});

// ---------------------------------------------------------------------------
// User crops (내가 키우는 작물)
// ---------------------------------------------------------------------------
app.get('/api/me/crops', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT uc.*, c.name_ko, c.hero_image_url, c.category
         FROM ${T.userCrops} uc
         JOIN ${T.crops} c ON c.id = uc.crop_id
        WHERE uc.user_id = $1
        ORDER BY uc.created_at DESC`,
      [req.userId]
    );
    res.json({ success: true, data: r.rows });
  } catch {
    res.status(500).json({ success: false, message: '내 작물 목록 실패' });
  }
});

app.post('/api/me/crops', authRequired, async (req, res) => {
  try {
    const { crop_id, area_pyeong, planted_at, note } = req.body || {};
    const cid = Number.parseInt(crop_id, 10);
    const ap = Number.parseFloat(area_pyeong);
    if (!Number.isInteger(cid)) return res.status(400).json({ success: false, message: 'crop_id 필요' });
    if (!Number.isFinite(ap) || ap <= 0) return res.status(400).json({ success: false, message: '면적이 0보다 커야 해요' });
    const r = await pool.query(
      `INSERT INTO ${T.userCrops} (user_id, crop_id, area_pyeong, planted_at, note)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5) RETURNING *`,
      [req.userId, cid, ap, planted_at || null, (note || '').toString().slice(0, 200)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('add user crop failed:', err);
    res.status(500).json({ success: false, message: '내 작물 등록 실패' });
  }
});

app.delete('/api/me/crops/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const r = await pool.query(
      `DELETE FROM ${T.userCrops} WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '없어요' });
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ---------------------------------------------------------------------------
// Logs (농사일기)
// ---------------------------------------------------------------------------
app.get('/api/me/logs', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.*,
              COALESCE(
                (SELECT json_agg(json_build_object('id', c.id, 'name_ko', c.name_ko) ORDER BY c.name_ko)
                   FROM ${T.logCrops} lc
                   JOIN ${T.crops} c ON c.id = lc.crop_id
                  WHERE lc.log_id = l.id),
                '[]'::json
              ) AS crops
         FROM ${T.logs} l
        WHERE l.user_id = $1
        ORDER BY l.log_date DESC, l.id DESC LIMIT 200`,
      [req.userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('me logs failed:', err);
    res.status(500).json({ success: false, message: '일지 목록 실패' });
  }
});

app.get('/api/logs/:id', authOptional, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const r = await pool.query(
      `SELECT l.*,
              u.display_name, u.avatar_emoji,
              COALESCE(
                (SELECT json_agg(json_build_object('id', c.id, 'name_ko', c.name_ko) ORDER BY c.name_ko)
                   FROM ${T.logCrops} lc
                   JOIN ${T.crops} c ON c.id = lc.crop_id
                  WHERE lc.log_id = l.id),
                '[]'::json
              ) AS crops
         FROM ${T.logs} l
         JOIN ${T.users} u ON u.id = l.user_id
        WHERE l.id = $1`,
      [id]
    );
    const log = r.rows[0];
    if (!log) return res.status(404).json({ success: false, message: '일지 없음' });
    if (log.visibility === 'private' && log.user_id !== req.userId) {
      return res.status(403).json({ success: false, message: '비공개 일지예요' });
    }
    res.json({ success: true, data: log });
  } catch (err) {
    console.error('log detail failed:', err);
    res.status(500).json({ success: false, message: '일지 상세 실패' });
  }
});

app.post('/api/logs', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { log_date, title, body_md, image_urls, weather, mood, visibility } = req.body || {};
    const t = (title || '').toString().trim();
    if (!t) return res.status(400).json({ success: false, message: '제목을 적어주세요' });
    const vis = VISIBILITY.includes(visibility) ? visibility : 'private';
    const imgs = Array.isArray(image_urls) ? image_urls.filter((u) => typeof u === 'string').slice(0, 5) : [];
    const cropIds = normalizeCropIds(req.body);

    await client.query('BEGIN');
    const r = await client.query(
      `INSERT INTO ${T.logs} (user_id, crop_id, log_date, title, body_md, image_urls, weather, mood, visibility)
       VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6::jsonb, $7, $8, $9)
       RETURNING *`,
      [
        req.userId, cropIds[0] || null, log_date || null,
        t.slice(0, 80), (body_md || '').toString().slice(0, 4000),
        JSON.stringify(imgs),
        (weather || '').toString().slice(0, 20),
        ['좋음', '보통', '힘듦'].includes(mood) ? mood : '보통',
        vis,
      ]
    );
    const log = r.rows[0];
    await setLogCrops(client, log.id, cropIds);
    await client.query('COMMIT');

    // crops 배열까지 함께 반환
    const cropRows = await pool.query(
      `SELECT c.id, c.name_ko FROM ${T.logCrops} lc JOIN ${T.crops} c ON c.id = lc.crop_id
        WHERE lc.log_id = $1 ORDER BY c.name_ko`,
      [log.id]
    );
    res.status(201).json({ success: true, data: { ...log, crops: cropRows.rows } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('create log failed:', err);
    res.status(500).json({ success: false, message: '일지 작성 실패' });
  } finally {
    client.release();
  }
});

app.put('/api/logs/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number.parseInt(req.params.id, 10);
    const own = await client.query(`SELECT user_id FROM ${T.logs} WHERE id = $1`, [id]);
    if (!own.rows[0]) return res.status(404).json({ success: false, message: '일지 없음' });
    if (own.rows[0].user_id !== req.userId) return res.status(403).json({ success: false, message: '본인 일지만 수정 가능' });

    const { log_date, title, body_md, image_urls, weather, mood, visibility } = req.body || {};
    const t = (title || '').toString().trim();
    if (!t) return res.status(400).json({ success: false, message: '제목 필요' });
    const vis = VISIBILITY.includes(visibility) ? visibility : 'private';
    const imgs = Array.isArray(image_urls) ? image_urls.filter((u) => typeof u === 'string').slice(0, 5) : [];
    const cropIds = normalizeCropIds(req.body);

    await client.query('BEGIN');
    const r = await client.query(
      `UPDATE ${T.logs}
          SET crop_id = $1, log_date = COALESCE($2::date, log_date),
              title = $3, body_md = $4, image_urls = $5::jsonb,
              weather = $6, mood = $7, visibility = $8, updated_at = NOW()
        WHERE id = $9 RETURNING *`,
      [
        cropIds[0] || null, log_date || null, t.slice(0, 80),
        (body_md || '').toString().slice(0, 4000),
        JSON.stringify(imgs), (weather || '').toString().slice(0, 20),
        ['좋음', '보통', '힘듦'].includes(mood) ? mood : '보통', vis, id,
      ]
    );
    await setLogCrops(client, id, cropIds);
    await client.query('COMMIT');

    const cropRows = await pool.query(
      `SELECT c.id, c.name_ko FROM ${T.logCrops} lc JOIN ${T.crops} c ON c.id = lc.crop_id
        WHERE lc.log_id = $1 ORDER BY c.name_ko`,
      [id]
    );
    res.json({ success: true, data: { ...r.rows[0], crops: cropRows.rows } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('update log failed:', err);
    res.status(500).json({ success: false, message: '일지 수정 실패' });
  } finally {
    client.release();
  }
});

app.delete('/api/logs/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const own = await pool.query(`SELECT user_id FROM ${T.logs} WHERE id = $1`, [id]);
    if (!own.rows[0]) return res.status(404).json({ success: false, message: '일지 없음' });
    if (own.rows[0].user_id !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ success: false, message: '권한 없음' });
    }
    await pool.query(`DELETE FROM ${T.logs} WHERE id = $1`, [id]);
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '일지 삭제 실패' });
  }
});

// 공개 일지 피드 (커뮤니티)
app.get('/api/logs/public/feed', authOptional, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.id, l.title, l.log_date, l.image_urls, l.body_md, l.mood,
              u.display_name, u.avatar_emoji,
              COALESCE(
                (SELECT json_agg(json_build_object('id', c.id, 'name_ko', c.name_ko) ORDER BY c.name_ko)
                   FROM ${T.logCrops} lc
                   JOIN ${T.crops} c ON c.id = lc.crop_id
                  WHERE lc.log_id = l.id),
                '[]'::json
              ) AS crops
         FROM ${T.logs} l
         JOIN ${T.users} u ON u.id = l.user_id
        WHERE l.visibility = 'public'
        ORDER BY l.log_date DESC, l.id DESC
        LIMIT 50`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('public feed failed:', err);
    res.status(500).json({ success: false, message: '공개 일지 실패' });
  }
});

// ---------------------------------------------------------------------------
// Budgets (가계부)
// ---------------------------------------------------------------------------
app.get('/api/budgets', authRequired, async (req, res) => {
  try {
    const m = req.query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month) ? req.query.month : null;
    let rows;
    if (m) {
      const r = await pool.query(
        `SELECT * FROM ${T.budgets}
          WHERE user_id = $1 AND TO_CHAR(occurred_at, 'YYYY-MM') = $2
          ORDER BY occurred_at DESC, id DESC`,
        [req.userId, m]
      );
      rows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT * FROM ${T.budgets} WHERE user_id = $1 ORDER BY occurred_at DESC, id DESC LIMIT 200`,
        [req.userId]
      );
      rows = r.rows;
    }
    res.json({ success: true, data: rows });
  } catch {
    res.status(500).json({ success: false, message: '가계부 조회 실패' });
  }
});

app.get('/api/budgets/summary', authRequired, async (req, res) => {
  try {
    const m = req.query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month) ? req.query.month : null;
    const filter = m ? `AND TO_CHAR(occurred_at, 'YYYY-MM') = $2` : '';
    const args = m ? [req.userId, m] : [req.userId];
    const byCat = await pool.query(
      `SELECT category, kind, SUM(amount)::int AS total, COUNT(*)::int AS cnt
         FROM ${T.budgets} WHERE user_id = $1 ${filter}
        GROUP BY category, kind ORDER BY total DESC`,
      args
    );
    const byMonth = await pool.query(
      `SELECT TO_CHAR(occurred_at, 'YYYY-MM') AS ym, kind, SUM(amount)::int AS total
         FROM ${T.budgets} WHERE user_id = $1
        GROUP BY ym, kind ORDER BY ym ASC`,
      [req.userId]
    );
    res.json({ success: true, data: { byCategory: byCat.rows, byMonth: byMonth.rows } });
  } catch (err) {
    console.error('budget summary failed:', err);
    res.status(500).json({ success: false, message: '집계 실패' });
  }
});

app.post('/api/budgets', authRequired, async (req, res) => {
  try {
    const { kind, amount, category, memo, occurred_at, receipt_image_url, log_id } = req.body || {};
    if (!['income', 'expense'].includes(kind)) return res.status(400).json({ success: false, message: 'kind 오류' });
    const amt = Number.parseInt(amount, 10);
    if (!Number.isInteger(amt) || amt <= 0) return res.status(400).json({ success: false, message: '금액은 1원 이상' });
    if (!BUDGET_CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: '카테고리 오류' });
    const r = await pool.query(
      `INSERT INTO ${T.budgets} (user_id, kind, amount, category, memo, occurred_at, log_id, receipt_image_url)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7, $8) RETURNING *`,
      [
        req.userId, kind, amt, category,
        (memo || '').toString().slice(0, 200), occurred_at || null,
        log_id ? Number.parseInt(log_id, 10) : null,
        (receipt_image_url || '').toString().slice(0, 500),
      ]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '가계부 추가 실패' });
  }
});

app.delete('/api/budgets/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const r = await pool.query(
      `DELETE FROM ${T.budgets} WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '없어요' });
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ---------------------------------------------------------------------------
// Posts (게시판)
// ---------------------------------------------------------------------------
app.get('/api/posts', authOptional, async (req, res) => {
  try {
    const { board, q } = req.query;
    const cs = ['p.hidden = FALSE']; const vs = []; let i = 1;
    if (typeof board === 'string' && BOARD_LIST.includes(board)) { cs.push(`p.board = $${i++}`); vs.push(board); }
    if (typeof q === 'string' && q.trim()) {
      cs.push(`(p.title ILIKE $${i} OR p.body_md ILIKE $${i})`); vs.push('%' + q.trim() + '%'); i++;
    }
    const r = await pool.query(
      `SELECT p.id, p.board, p.title, p.body_md, p.image_urls, p.created_at,
              u.display_name, u.avatar_emoji,
              (SELECT COUNT(*)::int FROM ${T.comments} c WHERE c.post_id = p.id AND c.hidden = FALSE) AS comment_count,
              (SELECT COUNT(*)::int FROM ${T.postLikes} l WHERE l.post_id = p.id) AS like_count
         FROM ${T.posts} p JOIN ${T.users} u ON u.id = p.user_id
        WHERE ${cs.join(' AND ')}
        ORDER BY p.created_at DESC LIMIT 100`,
      vs
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('list posts failed:', err);
    res.status(500).json({ success: false, message: '게시판 실패' });
  }
});

app.get('/api/posts/:id', authOptional, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const p = await pool.query(
      `SELECT p.*, u.display_name, u.avatar_emoji
         FROM ${T.posts} p JOIN ${T.users} u ON u.id = p.user_id
        WHERE p.id = $1 AND p.hidden = FALSE`,
      [id]
    );
    if (!p.rows[0]) return res.status(404).json({ success: false, message: '글이 없어요' });
    const cs = await pool.query(
      `SELECT c.*, u.display_name, u.avatar_emoji
         FROM ${T.comments} c JOIN ${T.users} u ON u.id = c.user_id
        WHERE c.post_id = $1 AND c.hidden = FALSE
        ORDER BY c.id ASC`,
      [id]
    );
    let myLiked = false;
    if (req.userId) {
      const f = await pool.query(`SELECT 1 FROM ${T.postLikes} WHERE post_id = $1 AND user_id = $2`, [id, req.userId]);
      myLiked = f.rowCount > 0;
    }
    const lc = await pool.query(`SELECT COUNT(*)::int AS c FROM ${T.postLikes} WHERE post_id = $1`, [id]);
    res.json({
      success: true,
      data: { ...p.rows[0], comments: cs.rows, like_count: lc.rows[0].c, my_liked: myLiked, is_owner: req.userId === p.rows[0].user_id },
    });
  } catch {
    res.status(500).json({ success: false, message: '글 상세 실패' });
  }
});

app.post('/api/posts', authRequired, async (req, res) => {
  try {
    const { board, title, body_md, image_urls } = req.body || {};
    if (!BOARD_LIST.includes(board)) return res.status(400).json({ success: false, message: '게시판 선택' });
    const t = (title || '').toString().trim();
    if (!t) return res.status(400).json({ success: false, message: '제목 필요' });
    const imgs = Array.isArray(image_urls) ? image_urls.filter((u) => typeof u === 'string').slice(0, 5) : [];
    const r = await pool.query(
      `INSERT INTO ${T.posts} (user_id, board, title, body_md, image_urls)
       VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
      [req.userId, board, t.slice(0, 80), (body_md || '').toString().slice(0, 4000), JSON.stringify(imgs)]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: '글 작성 실패' });
  }
});

app.delete('/api/posts/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const own = await pool.query(`SELECT user_id FROM ${T.posts} WHERE id = $1`, [id]);
    if (!own.rows[0]) return res.status(404).json({ success: false, message: '글 없음' });
    if (own.rows[0].user_id !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({ success: false, message: '권한 없음' });
    }
    await pool.query(`DELETE FROM ${T.posts} WHERE id = $1`, [id]);
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

app.post('/api/posts/:id/comments', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const body = (req.body?.body || '').toString().trim();
    if (!body) return res.status(400).json({ success: false, message: '댓글이 비어 있어요' });
    if (body.length > 1000) return res.status(400).json({ success: false, message: '1000자 이하' });
    const exists = await pool.query(`SELECT 1 FROM ${T.posts} WHERE id = $1 AND hidden = FALSE`, [id]);
    if (!exists.rows[0]) return res.status(404).json({ success: false, message: '글 없음' });
    const r = await pool.query(
      `INSERT INTO ${T.comments} (post_id, user_id, body) VALUES ($1, $2, $3)
       RETURNING *`,
      [id, req.userId, body]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch {
    res.status(500).json({ success: false, message: '댓글 실패' });
  }
});

app.post('/api/posts/:id/like', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await pool.query(
      `INSERT INTO ${T.postLikes} (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, req.userId]
    );
    res.json({ success: true, data: { liked: true } });
  } catch {
    res.status(500).json({ success: false, message: '좋아요 실패' });
  }
});

app.delete('/api/posts/:id/like', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM ${T.postLikes} WHERE post_id = $1 AND user_id = $2`, [id, req.userId]);
    res.json({ success: true, data: { liked: false } });
  } catch {
    res.status(500).json({ success: false, message: '좋아요 해제 실패' });
  }
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
app.get('/api/admin/stats', authRequired, adminRequired, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ${T.users}) AS users,
        (SELECT COUNT(*)::int FROM ${T.crops}) AS crops,
        (SELECT COUNT(*)::int FROM ${T.cropTasks}) AS crop_tasks,
        (SELECT COUNT(*)::int FROM ${T.userCrops}) AS user_crops,
        (SELECT COUNT(*)::int FROM ${T.logs}) AS logs,
        (SELECT COUNT(*)::int FROM ${T.budgets}) AS budgets,
        (SELECT COUNT(*)::int FROM ${T.posts}) AS posts,
        (SELECT COUNT(*)::int FROM ${T.comments}) AS comments
    `);
    res.json({ success: true, data: r.rows[0] });
  } catch {
    res.status(500).json({ success: false, message: '통계 실패' });
  }
});

app.get('/api/admin/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, email, display_name, region_sido, region_sigungu, avatar_emoji, role, created_at
         FROM ${T.users} ORDER BY id ASC`
    );
    res.json({ success: true, data: r.rows });
  } catch {
    res.status(500).json({ success: false, message: '사용자 조회 실패' });
  }
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (id === req.userId) return res.status(400).json({ success: false, message: '본인은 삭제 불가' });
    const r = await pool.query(`DELETE FROM ${T.users} WHERE id = $1 RETURNING id`, [id]);
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '사용자 없음' });
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '사용자 삭제 실패' });
  }
});

app.post('/api/admin/crops', authRequired, adminRequired, async (req, res) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `INSERT INTO ${T.crops}
         (name_ko, name_en, category, season_start_month, season_end_month, sunlight,
          water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        b.name_ko, b.name_en || '', b.category, b.season_start_month, b.season_end_month,
        b.sunlight || '', b.water_freq_days || 2, b.soil_pref || '',
        b.summary_md || '', b.hero_image_url || '', !!b.beginner_friendly,
      ]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, message: '같은 작목 이름 존재' });
    res.status(500).json({ success: false, message: '작목 추가 실패' });
  }
});

app.put('/api/admin/crops/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const b = req.body || {};
    const r = await pool.query(
      `UPDATE ${T.crops}
          SET name_ko = $1, name_en = $2, category = $3,
              season_start_month = $4, season_end_month = $5, sunlight = $6,
              water_freq_days = $7, soil_pref = $8, summary_md = $9,
              hero_image_url = $10, beginner_friendly = $11
        WHERE id = $12 RETURNING *`,
      [
        b.name_ko, b.name_en || '', b.category, b.season_start_month, b.season_end_month,
        b.sunlight || '', b.water_freq_days || 2, b.soil_pref || '',
        b.summary_md || '', b.hero_image_url || '', !!b.beginner_friendly, id,
      ]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '작목 없음' });
    res.json({ success: true, data: r.rows[0] });
  } catch {
    res.status(500).json({ success: false, message: '작목 수정 실패' });
  }
});

app.delete('/api/admin/crops/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM ${T.crops} WHERE id = $1`, [id]);
    res.json({ success: true, data: { id } });
  } catch {
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

app.post('/api/admin/posts/:id/hide', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await pool.query(`UPDATE ${T.posts} SET hidden = TRUE WHERE id = $1`, [id]);
    res.json({ success: true, data: { id, hidden: true } });
  } catch {
    res.status(500).json({ success: false, message: '숨김 실패' });
  }
});

// ---------------------------------------------------------------------------
// SPA fallback
// ---------------------------------------------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: '서버 오류' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🌱 꼬꼬마텃밭 서버 실행 중: http://localhost:${PORT}`);
  });
}

module.exports = app;
