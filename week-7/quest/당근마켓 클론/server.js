require('dotenv').config();

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ImageKit = require('imagekit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const TABLE_PREFIX = 'carrot_mkt_';
const T = {
  users: `${TABLE_PREFIX}users`,
  products: `${TABLE_PREFIX}products`,
  images: `${TABLE_PREFIX}product_images`,
  favorites: `${TABLE_PREFIX}favorites`,
  rooms: `${TABLE_PREFIX}rooms`,
  messages: `${TABLE_PREFIX}messages`,
};

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

// ---------------------------------------------------------------------------
// DB schema (prefix: carrot_mkt_)
// ---------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.users} (
      id              BIGSERIAL PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      nickname        TEXT NOT NULL,
      neighborhood    TEXT NOT NULL,
      avatar_emoji    TEXT NOT NULL DEFAULT '🥕',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.products} (
      id              BIGSERIAL PRIMARY KEY,
      user_id         BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      title           TEXT NOT NULL,
      price           INTEGER NOT NULL,
      description     TEXT NOT NULL DEFAULT '',
      category        TEXT NOT NULL,
      neighborhood    TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.products}_created_idx ON ${T.products}(created_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.products}_category_idx ON ${T.products}(category);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.images} (
      id              BIGSERIAL PRIMARY KEY,
      product_id      BIGINT NOT NULL REFERENCES ${T.products}(id) ON DELETE CASCADE,
      url             TEXT NOT NULL,
      position        INTEGER NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.images}_product_idx ON ${T.images}(product_id, position);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.favorites} (
      user_id         BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      product_id      BIGINT NOT NULL REFERENCES ${T.products}(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, product_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.rooms} (
      id              BIGSERIAL PRIMARY KEY,
      product_id      BIGINT NOT NULL REFERENCES ${T.products}(id) ON DELETE CASCADE,
      buyer_id        BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      seller_id       BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, buyer_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.messages} (
      id              BIGSERIAL PRIMARY KEY,
      room_id         BIGINT NOT NULL REFERENCES ${T.rooms}(id) ON DELETE CASCADE,
      sender_id       BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      text            TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.messages}_room_idx ON ${T.messages}(room_id, id);`);
  dbInitialized = true;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// DB-free routes mounted BEFORE the init gate so the UI keeps working
// 카테고리 목록은 정적이므로 DB 없이도 응답 (DB 풀 휴면 시 fallback 가치)
app.get('/api/categories', (_req, res) => {
  res.json({ success: true, data: CATEGORIES });
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

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, nickname: user.nickname },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: 'Auth required' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
}

function authOptional(req, _res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.userId = payload.sub;
    } catch { /* ignore */ }
  }
  next();
}

const CATEGORIES = ['디지털기기', '생활가전', '가구/인테리어', '의류', '도서', '뷰티/미용', '취미/게임', '식물', '기타'];

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { db: 'ok' } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'db down' });
  }
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, nickname, neighborhood, avatar_emoji } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || typeof nickname !== 'string' || typeof neighborhood !== 'string') {
      return res.status(400).json({ success: false, message: 'email/password/nickname/neighborhood 필수' });
    }
    const e = email.trim().toLowerCase();
    const n = nickname.trim();
    const nb = neighborhood.trim();
    const av = (avatar_emoji || '🥕').toString().slice(0, 8);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ success: false, message: '이메일 형식 오류' });
    if (password.length < 6) return res.status(400).json({ success: false, message: '비밀번호 6자 이상' });
    if (!n || n.length > 20) return res.status(400).json({ success: false, message: '닉네임 1~20자' });
    if (!nb || nb.length > 40) return res.status(400).json({ success: false, message: '동네 1~40자' });

    const hash = await bcrypt.hash(password, 10);
    let row;
    try {
      const r = await pool.query(
        `INSERT INTO ${T.users} (email, password_hash, nickname, neighborhood, avatar_emoji)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, nickname, neighborhood, avatar_emoji, created_at`,
        [e, hash, n, nb, av]
      );
      row = r.rows[0];
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, message: '이미 가입된 이메일' });
      throw err;
    }
    const token = signToken(row);
    res.status(201).json({ success: true, data: { user: row, token } });
  } catch (err) {
    console.error('signup failed:', err);
    res.status(500).json({ success: false, message: '회원가입 실패' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'email/password 필수' });
    }
    const e = email.trim().toLowerCase();
    const r = await pool.query(
      `SELECT id, email, password_hash, nickname, neighborhood, avatar_emoji, created_at
         FROM ${T.users} WHERE email = $1`,
      [e]
    );
    if (!r.rows[0]) return res.status(401).json({ success: false, message: '이메일/비밀번호 확인' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ success: false, message: '이메일/비밀번호 확인' });
    const { password_hash, ...user } = r.rows[0];
    const token = signToken(user);
    res.json({ success: true, data: { user, token } });
  } catch (err) {
    console.error('login failed:', err);
    res.status(500).json({ success: false, message: '로그인 실패' });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, email, nickname, neighborhood, avatar_emoji, created_at
         FROM ${T.users} WHERE id = $1`,
      [req.userId]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'user not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('me failed:', err);
    res.status(500).json({ success: false, message: 'failed' });
  }
});

app.patch('/api/auth/me', authRequired, async (req, res) => {
  try {
    const { nickname, neighborhood, avatar_emoji } = req.body || {};
    const fields = [];
    const vals = [];
    let i = 1;
    if (typeof nickname === 'string' && nickname.trim()) { fields.push(`nickname = $${i++}`); vals.push(nickname.trim()); }
    if (typeof neighborhood === 'string' && neighborhood.trim()) { fields.push(`neighborhood = $${i++}`); vals.push(neighborhood.trim()); }
    if (typeof avatar_emoji === 'string' && avatar_emoji.trim()) { fields.push(`avatar_emoji = $${i++}`); vals.push(avatar_emoji.slice(0, 8)); }
    if (!fields.length) return res.status(400).json({ success: false, message: '변경할 항목 없음' });
    vals.push(req.userId);
    const r = await pool.query(
      `UPDATE ${T.users} SET ${fields.join(', ')} WHERE id = $${i}
       RETURNING id, email, nickname, neighborhood, avatar_emoji, created_at`,
      vals
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('update me failed:', err);
    res.status(500).json({ success: false, message: '프로필 수정 실패' });
  }
});

// ---------------------------------------------------------------------------
// ImageKit auth — client-side direct upload
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
        token,
        expire,
        signature,
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    console.error('upload/auth failed:', err);
    res.status(500).json({ success: false, message: 'upload auth failed' });
  }
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
app.get('/api/products', authOptional, async (req, res) => {
  try {
    const { category, q } = req.query;
    const conds = [];
    const vals = [];
    let i = 1;
    if (typeof category === 'string' && category && CATEGORIES.includes(category)) {
      conds.push(`p.category = $${i++}`); vals.push(category);
    }
    if (typeof q === 'string' && q.trim()) {
      conds.push(`(p.title ILIKE $${i} OR p.description ILIKE $${i})`); vals.push('%' + q.trim() + '%'); i++;
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(
      `SELECT p.id, p.title, p.price, p.category, p.neighborhood, p.created_at,
              u.id AS seller_id, u.nickname AS seller_nickname, u.avatar_emoji AS seller_avatar,
              (SELECT url FROM ${T.images} WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS thumbnail,
              (SELECT COUNT(*) FROM ${T.favorites} WHERE product_id = p.id)::int AS favorite_count
         FROM ${T.products} p
         JOIN ${T.users} u ON u.id = p.user_id
         ${where}
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT 100`,
      vals
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('list products failed:', err);
    res.status(500).json({ success: false, message: '목록 조회 실패' });
  }
});

app.get('/api/products/:id', authOptional, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const p = await pool.query(
      `SELECT p.*, u.nickname AS seller_nickname, u.avatar_emoji AS seller_avatar, u.neighborhood AS seller_neighborhood
         FROM ${T.products} p JOIN ${T.users} u ON u.id = p.user_id
        WHERE p.id = $1`,
      [id]
    );
    if (!p.rows[0]) return res.status(404).json({ success: false, message: '상품 없음' });
    const imgs = await pool.query(
      `SELECT id, url, position FROM ${T.images} WHERE product_id = $1 ORDER BY position ASC, id ASC`,
      [id]
    );
    const favCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM ${T.favorites} WHERE product_id = $1`,
      [id]
    );
    let isFavorite = false;
    if (req.userId) {
      const f = await pool.query(
        `SELECT 1 FROM ${T.favorites} WHERE user_id = $1 AND product_id = $2`,
        [req.userId, id]
      );
      isFavorite = f.rowCount > 0;
    }
    res.json({
      success: true,
      data: {
        ...p.rows[0],
        images: imgs.rows,
        favorite_count: favCount.rows[0].c,
        is_favorite: isFavorite,
        is_owner: req.userId === p.rows[0].user_id,
      },
    });
  } catch (err) {
    console.error('get product failed:', err);
    res.status(500).json({ success: false, message: '상세 조회 실패' });
  }
});

app.post('/api/products', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, price, description, category, images } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: '제목 필수' });
    const priceNum = Number.parseInt(price, 10);
    if (!Number.isInteger(priceNum) || priceNum < 0) return res.status(400).json({ success: false, message: '가격 0 이상 정수' });
    if (typeof category !== 'string' || !CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: '카테고리 오류' });
    const desc = typeof description === 'string' ? description : '';
    const imgs = Array.isArray(images) ? images.filter((u) => typeof u === 'string').slice(0, 3) : [];

    const userR = await client.query(`SELECT neighborhood FROM ${T.users} WHERE id = $1`, [req.userId]);
    const neighborhood = userR.rows[0]?.neighborhood || '';

    await client.query('BEGIN');
    const ins = await client.query(
      `INSERT INTO ${T.products} (user_id, title, price, description, category, neighborhood)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.userId, title.trim().slice(0, 80), priceNum, desc.slice(0, 2000), category, neighborhood]
    );
    const product = ins.rows[0];
    for (let idx = 0; idx < imgs.length; idx++) {
      await client.query(
        `INSERT INTO ${T.images} (product_id, url, position) VALUES ($1, $2, $3)`,
        [product.id, imgs[idx], idx]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...product, images: imgs } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('create product failed:', err);
    res.status(500).json({ success: false, message: '상품 등록 실패' });
  } finally {
    client.release();
  }
});

app.put('/api/products/:id', authRequired, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const own = await client.query(`SELECT user_id FROM ${T.products} WHERE id = $1`, [id]);
    if (!own.rows[0]) return res.status(404).json({ success: false, message: '상품 없음' });
    if (own.rows[0].user_id !== req.userId) return res.status(403).json({ success: false, message: '본인 상품만 수정 가능' });

    const { title, price, description, category, images } = req.body || {};
    if (typeof title !== 'string' || !title.trim()) return res.status(400).json({ success: false, message: '제목 필수' });
    const priceNum = Number.parseInt(price, 10);
    if (!Number.isInteger(priceNum) || priceNum < 0) return res.status(400).json({ success: false, message: '가격 0 이상 정수' });
    if (typeof category !== 'string' || !CATEGORIES.includes(category)) return res.status(400).json({ success: false, message: '카테고리 오류' });
    const desc = typeof description === 'string' ? description : '';
    const imgs = Array.isArray(images) ? images.filter((u) => typeof u === 'string').slice(0, 3) : [];

    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE ${T.products} SET title = $1, price = $2, description = $3, category = $4
        WHERE id = $5 RETURNING *`,
      [title.trim().slice(0, 80), priceNum, desc.slice(0, 2000), category, id]
    );
    await client.query(`DELETE FROM ${T.images} WHERE product_id = $1`, [id]);
    for (let idx = 0; idx < imgs.length; idx++) {
      await client.query(
        `INSERT INTO ${T.images} (product_id, url, position) VALUES ($1, $2, $3)`,
        [id, imgs[idx], idx]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: { ...upd.rows[0], images: imgs } });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('update product failed:', err);
    res.status(500).json({ success: false, message: '수정 실패' });
  } finally {
    client.release();
  }
});

app.delete('/api/products/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const own = await pool.query(`SELECT user_id FROM ${T.products} WHERE id = $1`, [id]);
    if (!own.rows[0]) return res.status(404).json({ success: false, message: '상품 없음' });
    if (own.rows[0].user_id !== req.userId) return res.status(403).json({ success: false, message: '본인 상품만 삭제 가능' });
    await pool.query(`DELETE FROM ${T.products} WHERE id = $1`, [id]);
    res.json({ success: true, data: { id } });
  } catch (err) {
    console.error('delete product failed:', err);
    res.status(500).json({ success: false, message: '삭제 실패' });
  }
});

// ---------------------------------------------------------------------------
// Favorites
// ---------------------------------------------------------------------------
app.post('/api/products/:id/favorite', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    await pool.query(
      `INSERT INTO ${T.favorites} (user_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [req.userId, id]
    );
    res.json({ success: true, data: { is_favorite: true } });
  } catch (err) {
    console.error('add favorite failed:', err);
    res.status(500).json({ success: false, message: '관심 등록 실패' });
  }
});

app.delete('/api/products/:id/favorite', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    await pool.query(
      `DELETE FROM ${T.favorites} WHERE user_id = $1 AND product_id = $2`,
      [req.userId, id]
    );
    res.json({ success: true, data: { is_favorite: false } });
  } catch (err) {
    console.error('remove favorite failed:', err);
    res.status(500).json({ success: false, message: '관심 해제 실패' });
  }
});

// ---------------------------------------------------------------------------
// My page
// ---------------------------------------------------------------------------
app.get('/api/me/products', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.title, p.price, p.category, p.created_at,
              (SELECT url FROM ${T.images} WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS thumbnail
         FROM ${T.products} p
        WHERE p.user_id = $1
        ORDER BY p.created_at DESC, p.id DESC`,
      [req.userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('my products failed:', err);
    res.status(500).json({ success: false, message: '내 상품 조회 실패' });
  }
});

app.get('/api/me/favorites', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT p.id, p.title, p.price, p.category, p.created_at,
              u.nickname AS seller_nickname, u.avatar_emoji AS seller_avatar,
              (SELECT url FROM ${T.images} WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS thumbnail
         FROM ${T.favorites} f
         JOIN ${T.products} p ON p.id = f.product_id
         JOIN ${T.users} u ON u.id = p.user_id
        WHERE f.user_id = $1
        ORDER BY f.created_at DESC`,
      [req.userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('my favorites failed:', err);
    res.status(500).json({ success: false, message: '관심 목록 실패' });
  }
});

app.get('/api/me/rooms', authRequired, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.id, r.product_id, r.buyer_id, r.seller_id, r.created_at,
              p.title AS product_title, p.price AS product_price,
              (SELECT url FROM ${T.images} WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS product_thumbnail,
              ub.nickname AS buyer_nickname, ub.avatar_emoji AS buyer_avatar,
              us.nickname AS seller_nickname, us.avatar_emoji AS seller_avatar,
              (SELECT text FROM ${T.messages} WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_text,
              (SELECT created_at FROM ${T.messages} WHERE room_id = r.id ORDER BY id DESC LIMIT 1) AS last_at
         FROM ${T.rooms} r
         JOIN ${T.products} p ON p.id = r.product_id
         JOIN ${T.users} ub ON ub.id = r.buyer_id
         JOIN ${T.users} us ON us.id = r.seller_id
        WHERE r.buyer_id = $1 OR r.seller_id = $1
        ORDER BY COALESCE((SELECT created_at FROM ${T.messages} WHERE room_id = r.id ORDER BY id DESC LIMIT 1), r.created_at) DESC`,
      [req.userId]
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('my rooms failed:', err);
    res.status(500).json({ success: false, message: '채팅 목록 실패' });
  }
});

// ---------------------------------------------------------------------------
// Chat rooms & messages
// ---------------------------------------------------------------------------
app.post('/api/rooms', authRequired, async (req, res) => {
  try {
    const { product_id } = req.body || {};
    const pid = Number.parseInt(product_id, 10);
    if (!Number.isInteger(pid)) return res.status(400).json({ success: false, message: 'product_id 필수' });
    const p = await pool.query(`SELECT id, user_id FROM ${T.products} WHERE id = $1`, [pid]);
    if (!p.rows[0]) return res.status(404).json({ success: false, message: '상품 없음' });
    if (p.rows[0].user_id === req.userId) {
      return res.status(400).json({ success: false, message: '본인 상품에는 채팅 불가' });
    }
    const sellerId = p.rows[0].user_id;
    const r = await pool.query(
      `INSERT INTO ${T.rooms} (product_id, buyer_id, seller_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, buyer_id) DO UPDATE SET created_at = ${T.rooms}.created_at
       RETURNING *`,
      [pid, req.userId, sellerId]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('create room failed:', err);
    res.status(500).json({ success: false, message: '채팅방 생성 실패' });
  }
});

app.get('/api/rooms/:id', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const r = await pool.query(
      `SELECT r.*, p.title AS product_title, p.price AS product_price,
              (SELECT url FROM ${T.images} WHERE product_id = p.id ORDER BY position ASC LIMIT 1) AS product_thumbnail,
              ub.nickname AS buyer_nickname, ub.avatar_emoji AS buyer_avatar,
              us.nickname AS seller_nickname, us.avatar_emoji AS seller_avatar
         FROM ${T.rooms} r
         JOIN ${T.products} p ON p.id = r.product_id
         JOIN ${T.users} ub ON ub.id = r.buyer_id
         JOIN ${T.users} us ON us.id = r.seller_id
        WHERE r.id = $1`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: '방 없음' });
    if (r.rows[0].buyer_id !== req.userId && r.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ success: false, message: '권한 없음' });
    }
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('get room failed:', err);
    res.status(500).json({ success: false, message: '방 조회 실패' });
  }
});

app.get('/api/rooms/:id/messages', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const room = await pool.query(`SELECT buyer_id, seller_id FROM ${T.rooms} WHERE id = $1`, [id]);
    if (!room.rows[0]) return res.status(404).json({ success: false, message: '방 없음' });
    if (room.rows[0].buyer_id !== req.userId && room.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ success: false, message: '권한 없음' });
    }
    const since = req.query.since !== undefined ? Number.parseInt(req.query.since, 10) : null;
    let rows;
    if (Number.isInteger(since) && since >= 0) {
      const r = await pool.query(
        `SELECT id, room_id, sender_id, text, created_at
           FROM ${T.messages} WHERE room_id = $1 AND id > $2
           ORDER BY id ASC LIMIT 200`,
        [id, since]
      );
      rows = r.rows;
    } else {
      const r = await pool.query(
        `SELECT id, room_id, sender_id, text, created_at FROM (
           SELECT id, room_id, sender_id, text, created_at
             FROM ${T.messages} WHERE room_id = $1
             ORDER BY id DESC LIMIT 100
         ) recent ORDER BY id ASC`,
        [id]
      );
      rows = r.rows;
    }
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('list messages failed:', err);
    res.status(500).json({ success: false, message: '메시지 조회 실패' });
  }
});

app.post('/api/rooms/:id/messages', authRequired, async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: 'invalid id' });
    const room = await pool.query(`SELECT buyer_id, seller_id FROM ${T.rooms} WHERE id = $1`, [id]);
    if (!room.rows[0]) return res.status(404).json({ success: false, message: '방 없음' });
    if (room.rows[0].buyer_id !== req.userId && room.rows[0].seller_id !== req.userId) {
      return res.status(403).json({ success: false, message: '권한 없음' });
    }
    const text = (req.body?.text ?? '').toString().trim();
    if (!text) return res.status(400).json({ success: false, message: '메시지 비어있음' });
    if (text.length > 1000) return res.status(400).json({ success: false, message: '메시지 1000자 이하' });
    const r = await pool.query(
      `INSERT INTO ${T.messages} (room_id, sender_id, text) VALUES ($1, $2, $3)
       RETURNING id, room_id, sender_id, text, created_at`,
      [id, req.userId, text]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('send message failed:', err);
    res.status(500).json({ success: false, message: '전송 실패' });
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
  res.status(500).json({ success: false, message: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`당근마켓 서버 실행 중: http://localhost:${PORT}`);
  });
}

module.exports = app;
