// =============================================================================
// 커뮤니티 앱 서버
// Express 5 + PostgreSQL(Supabase) + JWT
// =============================================================================

const express = require('express');
const path = require('path');
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

if (!process.env.JWT_SECRET) {
  console.warn(
    '[WARN] JWT_SECRET 환경변수가 설정되지 않았습니다. 기본 개발용 시크릿을 사용합니다. 프로덕션에서는 반드시 설정하세요.'
  );
}
const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me').trim();
const JWT_EXPIRES_IN = '7d';
const BCRYPT_SALT_ROUNDS = 10;

// -----------------------------------------------------------------------------
// DB 연결 풀
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// Lazy DB 초기화 (cold start 대응)
// -----------------------------------------------------------------------------
let dbInitialized = false;
let dbInitPromise = null;

async function initDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        nickname VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES community_users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    dbInitialized = true;
  })();

  try {
    await dbInitPromise;
  } catch (err) {
    // 다음 요청에서 재시도할 수 있도록 promise를 리셋
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

// -----------------------------------------------------------------------------
// /api 요청마다 DB 초기화 보장
// -----------------------------------------------------------------------------
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('[initDB] error:', err);
    res
      .status(500)
      .json({ success: false, message: '데이터베이스 초기화에 실패했습니다.' });
  }
});

// -----------------------------------------------------------------------------
// 유틸
// -----------------------------------------------------------------------------
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(row) {
  return { id: row.id, email: row.email, nickname: row.nickname };
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // 간단한 형식 검증
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100;
}

// -----------------------------------------------------------------------------
// 인증 미들웨어
// -----------------------------------------------------------------------------
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res
      .status(401)
      .json({ success: false, message: '인증이 필요합니다.' });
  }

  const token = parts[1].trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.id,
      email: payload.email,
      nickname: payload.nickname,
    };
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
}

// =============================================================================
// 인증 API
// =============================================================================

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, nickname } = req.body || {};

    if (!email || !password || !nickname) {
      return res.status(400).json({
        success: false,
        message: 'email, password, nickname을 모두 입력해주세요.',
      });
    }

    if (!isValidEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: '이메일 형식이 올바르지 않습니다.' });
    }

    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: '비밀번호는 최소 6자 이상이어야 합니다.',
      });
    }

    if (
      typeof nickname !== 'string' ||
      nickname.trim().length === 0 ||
      nickname.trim().length > 30
    ) {
      return res.status(400).json({
        success: false,
        message: '닉네임은 1~30자 사이여야 합니다.',
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedNickname = nickname.trim();

    // 중복 확인
    const dup = await pool.query('SELECT id FROM community_users WHERE email = $1', [
      trimmedEmail,
    ]);
    if (dup.rowCount > 0) {
      return res
        .status(409)
        .json({ success: false, message: '이미 등록된 이메일입니다.' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const insert = await pool.query(
      `INSERT INTO community_users (email, password_hash, nickname)
       VALUES ($1, $2, $3)
       RETURNING id, email, nickname, created_at`,
      [trimmedEmail, password_hash, trimmedNickname]
    );

    const user = insert.rows[0];
    const token = signToken(user);

    return res.status(201).json({
      success: true,
      data: { user: publicUser(user), token },
    });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    return res
      .status(500)
      .json({ success: false, message: '회원가입 중 오류가 발생했습니다.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'email과 password를 모두 입력해주세요.',
      });
    }

    const trimmedEmail = String(email).trim().toLowerCase();

    const result = await pool.query(
      'SELECT id, email, password_hash, nickname FROM community_users WHERE email = $1',
      [trimmedEmail]
    );

    // 계정 존재 여부 노출 방지를 위해 메시지 통일
    const UNIFIED_FAIL_MSG = '이메일 또는 비밀번호가 일치하지 않습니다.';

    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, message: UNIFIED_FAIL_MSG });
    }

    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: UNIFIED_FAIL_MSG });
    }

    const token = signToken(row);
    return res.json({
      success: true,
      data: { user: publicUser(row), token },
    });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return res
      .status(500)
      .json({ success: false, message: '로그인 중 오류가 발생했습니다.' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    // DB에서 최신 정보 조회 (nickname 변경 등 반영 여지)
    const result = await pool.query(
      'SELECT id, email, nickname FROM community_users WHERE id = $1',
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }

    return res.json({
      success: true,
      data: { user: publicUser(result.rows[0]) },
    });
  } catch (err) {
    console.error('[GET /api/auth/me]', err);
    return res.status(500).json({
      success: false,
      message: '사용자 정보 조회 중 오류가 발생했습니다.',
    });
  }
});

// =============================================================================
// 게시글 API (모두 authRequired)
// =============================================================================

// GET /api/posts - 전체 목록 (최신순)
app.get('/api/posts', authRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.user_id,
              p.created_at, p.updated_at,
              u.nickname AS author
         FROM community_posts p
         JOIN community_users u ON u.id = p.user_id
        ORDER BY p.created_at DESC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/posts]', err);
    return res
      .status(500)
      .json({ success: false, message: '게시글 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/posts/:id - 단건 조회
app.get('/api/posts/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 게시글 ID입니다.' });
    }

    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.user_id,
              p.created_at, p.updated_at,
              u.nickname AS author
         FROM community_posts p
         JOIN community_users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[GET /api/posts/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '게시글 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/posts - 게시글 작성
app.post('/api/posts', authRequired, async (req, res) => {
  try {
    const { title, content } = req.body || {};

    if (typeof title !== 'string' || title.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: '제목을 입력해주세요.' });
    }
    if (title.trim().length > 200) {
      return res
        .status(400)
        .json({ success: false, message: '제목은 최대 200자까지 가능합니다.' });
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return res
        .status(400)
        .json({ success: false, message: '내용을 입력해주세요.' });
    }

    const insert = await pool.query(
      `INSERT INTO community_posts (user_id, title, content)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, title, content, created_at, updated_at`,
      [req.user.id, title.trim(), content]
    );

    const created = insert.rows[0];
    return res.status(201).json({
      success: true,
      data: { ...created, author: req.user.nickname },
    });
  } catch (err) {
    console.error('[POST /api/posts]', err);
    return res
      .status(500)
      .json({ success: false, message: '게시글 작성 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/posts/:id - 수정 (본인 글만)
app.patch('/api/posts/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 게시글 ID입니다.' });
    }

    const { title, content } = req.body || {};

    if (title === undefined && content === undefined) {
      return res.status(400).json({
        success: false,
        message: '수정할 필드(title 또는 content)를 제공해주세요.',
      });
    }

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        return res
          .status(400)
          .json({ success: false, message: '제목은 1자 이상이어야 합니다.' });
      }
      if (title.trim().length > 200) {
        return res
          .status(400)
          .json({ success: false, message: '제목은 최대 200자까지 가능합니다.' });
      }
    }
    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res
          .status(400)
          .json({ success: false, message: '내용은 1자 이상이어야 합니다.' });
      }
    }

    const existing = await pool.query(
      'SELECT id, user_id FROM community_posts WHERE id = $1',
      [id]
    );
    if (existing.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: '본인이 작성한 글만 수정할 수 있습니다.' });
    }

    // 동적 UPDATE 구성
    const sets = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) {
      sets.push(`title = $${idx++}`);
      values.push(title.trim());
    }
    if (content !== undefined) {
      sets.push(`content = $${idx++}`);
      values.push(content);
    }
    sets.push(`updated_at = NOW()`);

    values.push(id);

    const sql = `
      UPDATE community_posts
         SET ${sets.join(', ')}
       WHERE id = $${idx}
       RETURNING id, user_id, title, content, created_at, updated_at
    `;

    const updated = await pool.query(sql, values);

    // author 정보 포함해서 반환
    const withAuthor = await pool.query(
      `SELECT p.id, p.title, p.content, p.user_id,
              p.created_at, p.updated_at,
              u.nickname AS author
         FROM community_posts p
         JOIN community_users u ON u.id = p.user_id
        WHERE p.id = $1`,
      [updated.rows[0].id]
    );

    return res.json({ success: true, data: withAuthor.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/posts/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/posts/:id - 삭제 (본인 글만)
app.delete('/api/posts/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 게시글 ID입니다.' });
    }

    const existing = await pool.query(
      'SELECT id, user_id FROM community_posts WHERE id = $1',
      [id]
    );
    if (existing.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '게시글을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: '본인이 작성한 글만 삭제할 수 있습니다.' });
    }

    await pool.query('DELETE FROM community_posts WHERE id = $1', [id]);

    return res.json({
      success: true,
      data: { id },
      message: '게시글이 삭제되었습니다.',
    });
  } catch (err) {
    console.error('[DELETE /api/posts/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// API 404 핸들러 (SPA fallback 전에 위치)
// =============================================================================
app.use('/api', (_req, res) => {
  res.status(404).json({ success: false, message: 'API 경로를 찾을 수 없습니다.' });
});

// =============================================================================
// SPA fallback — Express 5 문법
// =============================================================================
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// =============================================================================
// 글로벌 에러 핸들러 (safety net)
// =============================================================================
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[global error]', err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});

// =============================================================================
// 로컬/서버리스 듀얼 모드
// =============================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
