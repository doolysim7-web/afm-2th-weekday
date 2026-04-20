// =============================================================================
// 문구류 쇼핑몰 서버 (결제 기능 제외)
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
// 시드 상품 데이터 (문구류)
// image_url 필드에는 이모지를 저장하여 클라이언트에서 박스형 썸네일로 렌더링합니다.
// -----------------------------------------------------------------------------
const SEED_PRODUCTS = [
  { name: '모나미 153 볼펜 (흑)',       price: 1000,  image_url: '🖊️', description: '국민 볼펜. 부드러운 필기감과 오랜 수명, 학생/직장인 필수템.' },
  { name: '제트스트림 0.5mm 볼펜',       price: 3000,  image_url: '✒️', description: '끊김 없이 매끄럽게 쓰이는 유성펜. 필기 스트레스를 줄여줍니다.' },
  { name: '몰스킨 클래식 노트북',        price: 28000, image_url: '📓', description: '감성 가득한 하드커버 노트. 아이디어 기록에 최적.' },
  { name: '포스트잇 알록달록 세트',      price: 8500,  image_url: '🗒️', description: '6색 점착메모지 묶음. 중요한 아이디어를 색으로 정리하세요.' },
  { name: '스테들러 연필 HB (12자루)',   price: 9000,  image_url: '✏️', description: '독일산 고품질 흑연 연필. 제도/드로잉에도 추천.' },
  { name: '하이라이터 6색 세트',         price: 7500,  image_url: '🖍️', description: '부드러운 발색의 형광펜 6색. 번짐이 적어 교재 정리에 최고.' },
  { name: '마스킹 테이프 (파스텔)',      price: 4500,  image_url: '🎀', description: '다이어리 꾸미기 필수 아이템. 파스텔톤 3롤 세트.' },
  { name: 'A4 무지 노트 (100매)',        price: 5000,  image_url: '📒', description: '스케치/필기 자유롭게. 무선제본 심플 디자인.' },
  { name: '말랑말랑 지우개',             price: 1200,  image_url: '🩹', description: '연필 자국이 깔끔하게 지워지는 부드러운 지우개.' },
  { name: '스테이플러 (중형)',            price: 12000, image_url: '📎', description: '최대 20매 제본 가능. 안정적인 그립감의 메탈 바디.' },
  { name: '사무용 가위 (핑크)',          price: 6500,  image_url: '✂️', description: '가볍고 잘 드는 올스테인리스 가위. 포장/공예 겸용.' },
  { name: '투명 L홀더 10매',             price: 3500,  image_url: '🗂️', description: '서류 보관용 투명 파일. A4 규격 10장 묶음.' },
  { name: '네임펜 얇은심',               price: 2000,  image_url: '🖊️', description: '물에 번지지 않는 유성 네임펜. 플라스틱/금속에도 OK.' },
  { name: '3공 바인더 (A5)',             price: 11000, image_url: '📔', description: '리필이 가능한 A5 바인더. 다이어리/업무용 모두 활용.' },
  { name: '수정테이프 5mm',              price: 2500,  image_url: '🩷', description: '깔끔한 수정이 가능한 데코 컬러 수정테이프.' },
];

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
      CREATE TABLE IF NOT EXISTS shop_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        price INTEGER NOT NULL CHECK (price >= 0),
        image_url VARCHAR(500) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_cart_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES shop_users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, product_id)
      );
    `);

    // 상품 테이블이 비었을 때만 시드 데이터 삽입
    const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM shop_products');
    if (countRes.rows[0].c === 0) {
      for (const p of SEED_PRODUCTS) {
        await pool.query(
          `INSERT INTO shop_products (name, price, image_url, description)
           VALUES ($1, $2, $3, $4)`,
          [p.name, p.price, p.image_url, p.description]
        );
      }
      console.log(`[seed] ${SEED_PRODUCTS.length}개 상품 시드 완료`);
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

// /api 요청마다 DB 초기화 보장
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
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name };
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
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
      .json({ success: false, message: '로그인이 필요합니다.' });
  }

  const token = parts[1].trim();

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, name: payload.name };
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
    const { email, password, name } = req.body || {};

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'email, password, name을 모두 입력해주세요.',
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
      typeof name !== 'string' ||
      name.trim().length === 0 ||
      name.trim().length > 30
    ) {
      return res.status(400).json({
        success: false,
        message: '이름은 1~30자 사이여야 합니다.',
      });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    const dup = await pool.query('SELECT id FROM shop_users WHERE email = $1', [
      trimmedEmail,
    ]);
    if (dup.rowCount > 0) {
      return res
        .status(409)
        .json({ success: false, message: '이미 등록된 이메일입니다.' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const insert = await pool.query(
      `INSERT INTO shop_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
      [trimmedEmail, password_hash, trimmedName]
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
      'SELECT id, email, password_hash, name FROM shop_users WHERE email = $1',
      [trimmedEmail]
    );

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
    const result = await pool.query(
      'SELECT id, email, name FROM shop_users WHERE id = $1',
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
// 상품 API (공개)
// =============================================================================

// GET /api/products - 상품 목록 (로그인 불필요)
app.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, image_url, description, created_at
         FROM shop_products
        ORDER BY id ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return res
      .status(500)
      .json({ success: false, message: '상품 목록 조회 중 오류가 발생했습니다.' });
  }
});

// GET /api/products/:id - 상품 단건 조회 (로그인 불필요)
app.get('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }

    const result = await pool.query(
      `SELECT id, name, price, image_url, description, created_at
         FROM shop_products WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }

    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[GET /api/products/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '상품 조회 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 장바구니 API (로그인 필요)
// =============================================================================

// GET /api/cart - 내 장바구니 조회
app.get('/api/cart', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.product_id, c.quantity, c.added_at,
              p.name, p.price, p.image_url, p.description
         FROM shop_cart_items c
         JOIN shop_products p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.added_at DESC`,
      [req.user.id]
    );

    const items = result.rows;
    const subtotal = items.reduce(
      (sum, it) => sum + Number(it.price) * Number(it.quantity),
      0
    );
    const totalCount = items.reduce((sum, it) => sum + Number(it.quantity), 0);

    return res.json({
      success: true,
      data: { items, subtotal, totalCount },
    });
  } catch (err) {
    console.error('[GET /api/cart]', err);
    return res
      .status(500)
      .json({ success: false, message: '장바구니 조회 중 오류가 발생했습니다.' });
  }
});

// POST /api/cart - 상품을 장바구니에 담기 (이미 있으면 수량 증가)
app.post('/api/cart', authRequired, async (req, res) => {
  try {
    const { product_id, quantity } = req.body || {};

    const pid = Number(product_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }

    const qty = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return res.status(400).json({
        success: false,
        message: '수량은 1 이상 99 이하의 정수여야 합니다.',
      });
    }

    // 상품 존재 확인
    const prod = await pool.query('SELECT id FROM shop_products WHERE id = $1', [pid]);
    if (prod.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '존재하지 않는 상품입니다.' });
    }

    // UPSERT — 이미 장바구니에 있으면 수량 누적
    const upsert = await pool.query(
      `INSERT INTO shop_cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = LEAST(shop_cart_items.quantity + EXCLUDED.quantity, 99),
                     added_at = NOW()
       RETURNING id, product_id, quantity, added_at`,
      [req.user.id, pid, qty]
    );

    return res.status(201).json({ success: true, data: upsert.rows[0] });
  } catch (err) {
    console.error('[POST /api/cart]', err);
    return res
      .status(500)
      .json({ success: false, message: '장바구니 담기 중 오류가 발생했습니다.' });
  }
});

// PATCH /api/cart/:id - 장바구니 항목 수량 변경
app.patch('/api/cart/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 장바구니 항목 ID입니다.' });
    }

    const { quantity } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return res.status(400).json({
        success: false,
        message: '수량은 1 이상 99 이하의 정수여야 합니다.',
      });
    }

    // 소유자 검증 후 수정
    const existing = await pool.query(
      'SELECT id, user_id FROM shop_cart_items WHERE id = $1',
      [id]
    );
    if (existing.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: '본인의 장바구니만 수정할 수 있습니다.' });
    }

    const updated = await pool.query(
      `UPDATE shop_cart_items
          SET quantity = $1
        WHERE id = $2
        RETURNING id, product_id, quantity, added_at`,
      [qty, id]
    );

    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/cart/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '장바구니 수정 중 오류가 발생했습니다.' });
  }
});

// DELETE /api/cart/:id - 장바구니 항목 삭제
app.delete('/api/cart/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '올바르지 않은 장바구니 항목 ID입니다.' });
    }

    const existing = await pool.query(
      'SELECT id, user_id FROM shop_cart_items WHERE id = $1',
      [id]
    );
    if (existing.rowCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: '본인의 장바구니만 삭제할 수 있습니다.' });
    }

    await pool.query('DELETE FROM shop_cart_items WHERE id = $1', [id]);

    return res.json({
      success: true,
      data: { id },
      message: '장바구니에서 삭제되었습니다.',
    });
  } catch (err) {
    console.error('[DELETE /api/cart/:id]', err);
    return res
      .status(500)
      .json({ success: false, message: '장바구니 삭제 중 오류가 발생했습니다.' });
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
