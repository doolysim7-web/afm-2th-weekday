// =============================================================================
// 문구네 쇼핑몰 (완성판) — 이미지 업로드 + 토스페이먼츠 결제
// Express 5 + PostgreSQL(Supabase) + JWT + ImageKit + TossPayments
// =============================================================================

const express = require('express');
const path = require('path');
const crypto = require('crypto');
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

// ImageKit (서버 서명 발급용 — 비공개키는 절대 클라이언트로 노출 금지)
const IMAGEKIT_PUBLIC_KEY = (
  process.env.IMAGEKIT_PUBLIC_KEY || 'public_7Wf9/9pM/Gp/HXOQfUeWh1jmm+Q='
).trim();
const IMAGEKIT_PRIVATE_KEY = (
  process.env.IMAGEKIT_PRIVATE_KEY || 'private_HUgMWoK582B2ZL8jpGQtksNy//M='
).trim();
const IMAGEKIT_URL_ENDPOINT = (
  process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/3um8y0hge'
).trim();

// TossPayments (시크릿 키는 서버에서만 사용)
const TOSS_SECRET_KEY = (
  process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6'
).trim();

// 슈퍼 어드민 (시드)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@stationery.shop').trim();
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || 'admin1234').trim();
const ADMIN_NAME = '관리자';

// -----------------------------------------------------------------------------
// DB 연결 풀
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// 시드 상품 데이터
// -----------------------------------------------------------------------------
const SEED_PRODUCTS = [
  { name: '모나미 153 볼펜 (흑)',     price: 1000,  image_url: '🖊️', description: '국민 볼펜. 부드러운 필기감과 오랜 수명, 학생/직장인 필수템.' },
  { name: '제트스트림 0.5mm 볼펜',     price: 3000,  image_url: '✒️', description: '끊김 없이 매끄럽게 쓰이는 유성펜. 필기 스트레스를 줄여줍니다.' },
  { name: '몰스킨 클래식 노트북',      price: 28000, image_url: '📓', description: '감성 가득한 하드커버 노트. 아이디어 기록에 최적.' },
  { name: '포스트잇 알록달록 세트',    price: 8500,  image_url: '🗒️', description: '6색 점착메모지 묶음. 중요한 아이디어를 색으로 정리하세요.' },
  { name: '스테들러 연필 HB (12자루)', price: 9000,  image_url: '✏️', description: '독일산 고품질 흑연 연필. 제도/드로잉에도 추천.' },
  { name: '하이라이터 6색 세트',       price: 7500,  image_url: '🖍️', description: '부드러운 발색의 형광펜 6색. 번짐이 적어 교재 정리에 최고.' },
  { name: '마스킹 테이프 (파스텔)',    price: 4500,  image_url: '🎀', description: '다이어리 꾸미기 필수 아이템. 파스텔톤 3롤 세트.' },
  { name: 'A4 무지 노트 (100매)',      price: 5000,  image_url: '📒', description: '스케치/필기 자유롭게. 무선제본 심플 디자인.' },
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
      CREATE TABLE IF NOT EXISTS shop2_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(30) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      ALTER TABLE shop2_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop2_products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        price INTEGER NOT NULL CHECK (price >= 0),
        image_url VARCHAR(1000) NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop2_cart_items (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES shop2_users(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES shop2_products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        added_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (user_id, product_id)
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop2_orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES shop2_users(id) ON DELETE SET NULL,
        items JSONB NOT NULL,
        subtotal INTEGER NOT NULL,
        total_amount INTEGER NOT NULL,
        customer_name VARCHAR(50) NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        shipping_address TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        toss_order_id VARCHAR(100),
        payment_key VARCHAR(200),
        confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS shop2_orders_toss_order_id_uidx
        ON shop2_orders (toss_order_id)
        WHERE toss_order_id IS NOT NULL
    `);

    // 슈퍼 어드민 시드
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);
    const adminExists = await pool.query(
      'SELECT id FROM shop2_users WHERE email = $1',
      [ADMIN_EMAIL]
    );
    if (adminExists.rowCount === 0) {
      await pool.query(
        `INSERT INTO shop2_users (email, password_hash, name, role)
         VALUES ($1, $2, $3, 'admin')`,
        [ADMIN_EMAIL, adminHash, ADMIN_NAME]
      );
      console.log(`[seed] admin 시드 완료 → ${ADMIN_EMAIL}`);
    } else {
      await pool.query(
        `UPDATE shop2_users SET role = 'admin', password_hash = $1 WHERE email = $2`,
        [adminHash, ADMIN_EMAIL]
      );
    }

    // 상품 시드 — 비어있을 때만
    const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM shop2_products');
    if (countRes.rows[0].c === 0) {
      for (const p of SEED_PRODUCTS) {
        await pool.query(
          `INSERT INTO shop2_products (name, price, image_url, description)
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

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('[initDB] error:', err);
    res.status(500).json({ success: false, message: '데이터베이스 초기화에 실패했습니다.' });
  }
});

// -----------------------------------------------------------------------------
// 유틸 / 미들웨어
// -----------------------------------------------------------------------------
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 100;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  }
  try {
    const payload = jwt.verify(parts[1].trim(), JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, name: payload.name, role: payload.role || 'user' };
    next();
  } catch {
    return res.status(401).json({ success: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: '관리자 권한이 필요합니다.' });
  }
  next();
}

// =============================================================================
// 인증 API
// =============================================================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'email, password, name을 모두 입력해주세요.' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, message: '이메일 형식이 올바르지 않습니다.' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ success: false, message: '비밀번호는 최소 6자 이상이어야 합니다.' });
    }
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 30) {
      return res.status(400).json({ success: false, message: '이름은 1~30자 사이여야 합니다.' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    const dup = await pool.query('SELECT id FROM shop2_users WHERE email = $1', [trimmedEmail]);
    if (dup.rowCount > 0) {
      return res.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
    }
    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const insert = await pool.query(
      `INSERT INTO shop2_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, role, created_at`,
      [trimmedEmail, password_hash, trimmedName]
    );
    const user = insert.rows[0];
    const token = signToken(user);
    return res.status(201).json({ success: true, data: { user: publicUser(user), token } });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    return res.status(500).json({ success: false, message: '회원가입 중 오류가 발생했습니다.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'email과 password를 모두 입력해주세요.' });
    }
    const trimmedEmail = String(email).trim().toLowerCase();
    const result = await pool.query(
      'SELECT id, email, password_hash, name, role FROM shop2_users WHERE email = $1',
      [trimmedEmail]
    );
    const FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, message: FAIL });
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: FAIL });
    }
    const token = signToken(row);
    return res.json({ success: true, data: { user: publicUser(row), token } });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    return res.status(500).json({ success: false, message: '로그인 중 오류가 발생했습니다.' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role FROM shop2_users WHERE id = $1',
      [req.user.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    return res.json({ success: true, data: { user: publicUser(result.rows[0]) } });
  } catch (err) {
    console.error('[GET /api/auth/me]', err);
    return res.status(500).json({ success: false, message: '사용자 정보 조회 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// ImageKit 클라이언트 직접 업로드용 서명 발급 (관리자만)
// =============================================================================
app.get('/api/imagekit-auth', authRequired, adminRequired, (_req, res) => {
  try {
    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_URL_ENDPOINT) {
      return res.status(500).json({ success: false, message: 'ImageKit 환경변수가 설정되지 않았습니다.' });
    }
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 2400;
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    return res.json({
      success: true,
      data: {
        token,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    console.error('[GET /api/imagekit-auth]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// =============================================================================
// 상품 API
// =============================================================================
app.get('/api/products', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, image_url, description, created_at
         FROM shop2_products
        ORDER BY id ASC`
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/products]', err);
    return res.status(500).json({ success: false, message: '상품 목록 조회 중 오류가 발생했습니다.' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }
    const result = await pool.query(
      `SELECT id, name, price, image_url, description, created_at
         FROM shop2_products WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[GET /api/products/:id]', err);
    return res.status(500).json({ success: false, message: '상품 조회 중 오류가 발생했습니다.' });
  }
});

// 관리자 전용 — 상품 등록
app.post('/api/products', authRequired, adminRequired, async (req, res) => {
  try {
    const { name, price, image_url, description } = req.body || {};
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 150) {
      return res.status(400).json({ success: false, message: '상품명은 1~150자 사이여야 합니다.' });
    }
    const priceNum = Number(price);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: '가격은 0 이상의 정수여야 합니다.' });
    }
    const img = typeof image_url === 'string' ? image_url.slice(0, 1000) : '';
    const desc = typeof description === 'string' ? description.slice(0, 2000) : '';

    const result = await pool.query(
      `INSERT INTO shop2_products (name, price, image_url, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, price, image_url, description, created_at`,
      [name.trim(), priceNum, img, desc]
    );
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POST /api/products]', err);
    return res.status(500).json({ success: false, message: '상품 등록 중 오류가 발생했습니다.' });
  }
});

app.put('/api/products/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }
    const { name, price, image_url, description } = req.body || {};
    if (typeof name !== 'string' || name.trim().length === 0 || name.trim().length > 150) {
      return res.status(400).json({ success: false, message: '상품명은 1~150자 사이여야 합니다.' });
    }
    const priceNum = Number(price);
    if (!Number.isInteger(priceNum) || priceNum < 0) {
      return res.status(400).json({ success: false, message: '가격은 0 이상의 정수여야 합니다.' });
    }
    const img = typeof image_url === 'string' ? image_url.slice(0, 1000) : '';
    const desc = typeof description === 'string' ? description.slice(0, 2000) : '';

    const result = await pool.query(
      `UPDATE shop2_products SET name = $1, price = $2, image_url = $3, description = $4
       WHERE id = $5
       RETURNING id, name, price, image_url, description, created_at`,
      [name.trim(), priceNum, img, desc, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[PUT /api/products/:id]', err);
    return res.status(500).json({ success: false, message: '상품 수정 중 오류가 발생했습니다.' });
  }
});

app.delete('/api/products/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }
    const result = await pool.query(
      `DELETE FROM shop2_products WHERE id = $1 RETURNING id`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
    }
    return res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[DELETE /api/products/:id]', err);
    return res.status(500).json({ success: false, message: '상품 삭제 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 장바구니 API (로그인 필요)
// =============================================================================
app.get('/api/cart', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.product_id, c.quantity, c.added_at,
              p.name, p.price, p.image_url, p.description
         FROM shop2_cart_items c
         JOIN shop2_products p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.added_at DESC`,
      [req.user.id]
    );
    const items = result.rows;
    const subtotal = items.reduce((s, it) => s + Number(it.price) * Number(it.quantity), 0);
    const totalCount = items.reduce((s, it) => s + Number(it.quantity), 0);
    return res.json({ success: true, data: { items, subtotal, totalCount } });
  } catch (err) {
    console.error('[GET /api/cart]', err);
    return res.status(500).json({ success: false, message: '장바구니 조회 중 오류가 발생했습니다.' });
  }
});

app.post('/api/cart', authRequired, async (req, res) => {
  try {
    const { product_id, quantity } = req.body || {};
    const pid = Number(product_id);
    if (!Number.isInteger(pid) || pid <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 상품 ID입니다.' });
    }
    const qty = quantity === undefined ? 1 : Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return res.status(400).json({ success: false, message: '수량은 1~99 사이의 정수여야 합니다.' });
    }
    const prod = await pool.query('SELECT id FROM shop2_products WHERE id = $1', [pid]);
    if (prod.rowCount === 0) {
      return res.status(404).json({ success: false, message: '존재하지 않는 상품입니다.' });
    }
    const upsert = await pool.query(
      `INSERT INTO shop2_cart_items (user_id, product_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, product_id)
       DO UPDATE SET quantity = LEAST(shop2_cart_items.quantity + EXCLUDED.quantity, 99),
                     added_at = NOW()
       RETURNING id, product_id, quantity, added_at`,
      [req.user.id, pid, qty]
    );
    return res.status(201).json({ success: true, data: upsert.rows[0] });
  } catch (err) {
    console.error('[POST /api/cart]', err);
    return res.status(500).json({ success: false, message: '장바구니 담기 중 오류가 발생했습니다.' });
  }
});

app.patch('/api/cart/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 항목 ID입니다.' });
    }
    const { quantity } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) {
      return res.status(400).json({ success: false, message: '수량은 1~99 사이의 정수여야 합니다.' });
    }
    const existing = await pool.query(
      'SELECT id, user_id FROM shop2_cart_items WHERE id = $1', [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '본인의 장바구니만 수정할 수 있습니다.' });
    }
    const updated = await pool.query(
      `UPDATE shop2_cart_items SET quantity = $1 WHERE id = $2
       RETURNING id, product_id, quantity, added_at`,
      [qty, id]
    );
    return res.json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[PATCH /api/cart/:id]', err);
    return res.status(500).json({ success: false, message: '장바구니 수정 중 오류가 발생했습니다.' });
  }
});

app.delete('/api/cart/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 항목 ID입니다.' });
    }
    const existing = await pool.query(
      'SELECT id, user_id FROM shop2_cart_items WHERE id = $1', [id]
    );
    if (existing.rowCount === 0) {
      return res.status(404).json({ success: false, message: '장바구니 항목을 찾을 수 없습니다.' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '본인의 장바구니만 삭제할 수 있습니다.' });
    }
    await pool.query('DELETE FROM shop2_cart_items WHERE id = $1', [id]);
    return res.json({ success: true, data: { id }, message: '장바구니에서 삭제되었습니다.' });
  } catch (err) {
    console.error('[DELETE /api/cart/:id]', err);
    return res.status(500).json({ success: false, message: '장바구니 삭제 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 주문 API
// =============================================================================
app.post('/api/orders', authRequired, async (req, res) => {
  try {
    const { customer_name, customer_phone, shipping_address } = req.body || {};
    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) {
      return res.status(400).json({ success: false, message: '주문자 성함을 입력해주세요.' });
    }
    if (!customer_phone || typeof customer_phone !== 'string' || !customer_phone.trim()) {
      return res.status(400).json({ success: false, message: '연락처를 입력해주세요.' });
    }
    if (!shipping_address || typeof shipping_address !== 'string' || !shipping_address.trim()) {
      return res.status(400).json({ success: false, message: '배송지 주소를 입력해주세요.' });
    }

    const cartResult = await pool.query(
      `SELECT c.id, c.product_id, c.quantity,
              p.name, p.price, p.image_url
         FROM shop2_cart_items c
         JOIN shop2_products p ON p.id = c.product_id
        WHERE c.user_id = $1
        ORDER BY c.added_at DESC`,
      [req.user.id]
    );
    if (cartResult.rowCount === 0) {
      return res.status(400).json({ success: false, message: '장바구니가 비어있습니다.' });
    }
    const items = cartResult.rows.map(r => ({
      product_id: r.product_id,
      name: r.name,
      price: Number(r.price),
      quantity: Number(r.quantity),
      image_url: r.image_url,
    }));
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    const total_amount = subtotal;

    const insertResult = await pool.query(
      `INSERT INTO shop2_orders
         (user_id, items, subtotal, total_amount, customer_name, customer_phone, shipping_address)
       VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.user.id,
        JSON.stringify(items),
        subtotal,
        total_amount,
        customer_name.trim(),
        customer_phone.trim(),
        shipping_address.trim(),
      ]
    );
    const row = insertResult.rows[0];
    const tossOrderId = `STATIONERY_${row.id}_${Date.now()}`;
    const updated = await pool.query(
      `UPDATE shop2_orders SET toss_order_id = $1 WHERE id = $2 RETURNING *`,
      [tossOrderId, row.id]
    );
    return res.status(201).json({ success: true, data: updated.rows[0] });
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return res.status(500).json({ success: false, message: '주문 생성 중 오류가 발생했습니다.' });
  }
});

app.get('/api/orders', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM shop2_orders WHERE user_id = $1 ORDER BY id DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return res.status(500).json({ success: false, message: '주문 목록 조회 중 오류가 발생했습니다.' });
  }
});

app.get('/api/orders/:id', authRequired, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 주문 ID입니다.' });
    }
    const result = await pool.query(`SELECT * FROM shop2_orders WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    const order = result.rows[0];
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '접근 권한이 없습니다.' });
    }
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('[GET /api/orders/:id]', err);
    return res.status(500).json({ success: false, message: '주문 조회 중 오류가 발생했습니다.' });
  }
});

// 주문을 toss_order_id로 조회 (성공 페이지에서 사용)
app.get('/api/orders/by-toss/:tossOrderId', authRequired, async (req, res) => {
  try {
    const tid = req.params.tossOrderId;
    if (!tid) {
      return res.status(400).json({ success: false, message: 'tossOrderId가 필요합니다.' });
    }
    const result = await pool.query(`SELECT * FROM shop2_orders WHERE toss_order_id = $1`, [tid]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '주문을 찾을 수 없습니다.' });
    }
    const order = result.rows[0];
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '접근 권한이 없습니다.' });
    }
    return res.json({ success: true, data: order });
  } catch (err) {
    console.error('[GET /api/orders/by-toss]', err);
    return res.status(500).json({ success: false, message: '주문 조회 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 결제 승인 (서버에서 Toss API 호출)
// =============================================================================
app.post('/api/payments/confirm', authRequired, async (req, res) => {
  try {
    const { paymentKey, orderId, amount } = req.body || {};
    if (typeof paymentKey !== 'string' || !paymentKey.trim()) {
      return res.status(400).json({ success: false, message: 'paymentKey는 필수입니다.' });
    }
    if (typeof orderId !== 'string' || !orderId.trim()) {
      return res.status(400).json({ success: false, message: 'orderId는 필수입니다.' });
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, message: 'amount가 올바르지 않습니다.' });
    }

    const orderResult = await pool.query(
      `SELECT * FROM shop2_orders WHERE toss_order_id = $1`,
      [orderId]
    );
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 주문을 찾을 수 없습니다.' });
    }
    const order = orderResult.rows[0];

    if (order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '본인의 주문만 결제할 수 있습니다.' });
    }
    if (Number(order.total_amount) !== amountNum) {
      return res.status(400).json({
        success: false,
        message: '결제 금액이 주문 금액과 일치하지 않습니다.',
      });
    }
    if (order.status === 'confirmed' && order.payment_key === paymentKey) {
      return res.json({ success: true, data: { alreadyConfirmed: true, order } });
    }

    const encodedKey = Buffer.from(TOSS_SECRET_KEY + ':').toString('base64');
    const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${encodedKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount: amountNum }),
    });
    const tossData = await tossResponse.json();
    if (!tossResponse.ok) {
      return res.status(tossResponse.status).json({
        success: false,
        code: tossData.code,
        message: tossData.message || '결제 승인에 실패했습니다.',
      });
    }

    const updated = await pool.query(
      `UPDATE shop2_orders
         SET status = 'confirmed', payment_key = $1, confirmed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [paymentKey, order.id]
    );
    await pool.query(`DELETE FROM shop2_cart_items WHERE user_id = $1`, [req.user.id]);

    return res.json({
      success: true,
      data: { order: updated.rows[0], payment: tossData },
    });
  } catch (err) {
    console.error('[POST /api/payments/confirm]', err);
    return res.status(500).json({ success: false, message: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// API 404 + SPA fallback
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
  res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
});

// =============================================================================
// 듀얼 모드
// =============================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[admin] 슈퍼 어드민 → ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  });
}

module.exports = app;
