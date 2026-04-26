const express = require('express');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------------------------
// Config (env vars; defaults are dev fallbacks)
// ------------------------------------
const DATABASE_URL = (
  process.env.DATABASE_URL ||
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres'
).trim();

const GEMINI_API_KEY = (
  process.env.GEMINI_API_KEY || 'AIzaSyDbPeADda99Km-KYrI3xzmD5PgIpUsInD0'
).trim();
const GEMINI_MODEL = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();

const JWT_SECRET = (
  process.env.JWT_SECRET ||
  'kr2en_dev_jwt_secret_replace_in_production_with_long_random_value'
).trim();

const TOSS_CLIENT_KEY = (
  process.env.TOSS_CLIENT_KEY || 'test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm'
).trim();
const TOSS_SECRET_KEY = (
  process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6'
).trim();

const IMAGEKIT_PUBLIC_KEY = (
  process.env.IMAGEKIT_PUBLIC_KEY || 'public_7Wf9/9pM/Gp/HXOQfUeWh1jmm+Q='
).trim();
const IMAGEKIT_PRIVATE_KEY = (
  process.env.IMAGEKIT_PRIVATE_KEY || 'private_HUgMWoK582B2ZL8jpGQtksNy//M='
).trim();
const IMAGEKIT_URL_ENDPOINT = (
  process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/3um8y0hge'
).trim();

const PRICE_PER_PAGE = parseInt(process.env.PRICE_PER_PAGE || '2000', 10);

// ------------------------------------
// DB
// ------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let dbInitialized = false;
let dbInitPromise = null;

async function initDB() {
  if (dbInitialized) return;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trans_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(200) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name VARCHAR(200),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trans_conversions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES trans_users(id) ON DELETE CASCADE,
        title VARCHAR(300) NOT NULL DEFAULT '',
        period_start VARCHAR(50),
        period_end VARCHAR(50),
        source_type VARCHAR(20) NOT NULL DEFAULT 'excel',
        source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        translated_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        page_count INTEGER NOT NULL DEFAULT 1,
        amount INTEGER NOT NULL DEFAULT 0,
        source_image_url TEXT,
        paid BOOLEAN NOT NULL DEFAULT FALSE,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trans_payments (
        id SERIAL PRIMARY KEY,
        conversion_id INTEGER NOT NULL REFERENCES trans_conversions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES trans_users(id) ON DELETE CASCADE,
        order_id VARCHAR(120) UNIQUE NOT NULL,
        payment_key VARCHAR(200),
        amount INTEGER NOT NULL,
        status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
        raw JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    dbInitialized = true;
  })();

  return dbInitPromise;
}

// ------------------------------------
// Middleware
// ------------------------------------
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname)));

app.use(async (_req, _res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    next(err);
  }
});

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ success: false, message: '로그인이 필요합니다.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: '세션이 만료되었습니다. 다시 로그인해 주세요.' });
  }
}

// ------------------------------------
// Health + Public Config
// ------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.get('/api/config', (_req, res) => {
  res.json({
    success: true,
    data: {
      tossClientKey: TOSS_CLIENT_KEY,
      pricePerPage: PRICE_PER_PAGE,
      imagekitUrlEndpoint: IMAGEKIT_URL_ENDPOINT,
    },
  });
});

// ------------------------------------
// Auth
// ------------------------------------
app.post('/api/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const displayName = String(req.body?.displayName || '').trim().slice(0, 200) || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: '올바른 이메일을 입력해 주세요.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: '비밀번호는 6자 이상이어야 합니다.' });
    }

    const existing = await pool.query('SELECT id FROM trans_users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO trans_users (email, password_hash, display_name)
       VALUES ($1, $2, $3) RETURNING id, email, display_name`,
      [email, hash, displayName]
    );
    const user = result.rows[0];
    const token = signToken(user);
    res.status(201).json({ success: true, data: { token, user } });
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, message: '이메일과 비밀번호를 입력해 주세요.' });
    }
    const result = await pool.query(
      'SELECT id, email, password_hash, display_name FROM trans_users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const row = result.rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return res.status(401).json({ success: false, message: '이메일 또는 비밀번호가 올바르지 않습니다.' });
    }
    const user = { id: row.id, email: row.email, display_name: row.display_name };
    const token = signToken(user);
    res.json({ success: true, data: { token, user } });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, display_name FROM trans_users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '사용자를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: { user: result.rows[0] } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------
// ImageKit signature (for direct client upload)
// ------------------------------------
app.get('/api/imagekit-auth', authRequired, (_req, res) => {
  try {
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 2400;
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
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
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------
// Gemini helpers
// ------------------------------------
async function callGemini(parts, { responseJson = true } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: responseJson
      ? { responseMimeType: 'application/json', temperature: 0.2 }
      : { temperature: 0.2 },
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API ${resp.status}: ${errText.slice(0, 500)}`);
  }
  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini returned empty response.');
  if (!responseJson) return text;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Gemini JSON parse failed: ${text.slice(0, 300)}`);
  }
}

const TRANSLATE_ROWS_PROMPT = `You convert Korean bank/securities transaction statements into English for foreign customers. The output is NOT an official document — it just has to be readable and consistent.

Rules:
- Translate the headers to clear English banking terms. Prefer this canonical set when applicable: Date, Time, Description, Counterparty, Withdrawal (KRW), Deposit (KRW), Balance (KRW), Branch, Memo, Symbol, Quantity, Price (KRW), Amount (KRW), Fee (KRW), Tax (KRW), Type. If the source has columns that do not match, translate naturally.
- Translate every Korean string in row cells to English. For Korean person names, use Revised Romanization (e.g., 김철수 -> Kim Cheolsu). For Korean company names, use the official English name if widely known (삼성전자 -> Samsung Electronics, LG화학 -> LG Chem, 카카오 -> Kakao, NAVER -> NAVER). For securities tickers in 한글, keep the canonical English company name.
- Keep numbers, dates, account numbers, codes as-is.
- Be CONSISTENT: the same Korean entity must always translate the same way across rows.
- Return strict JSON: {"translatedHeaders": [string], "translatedRows": [[string]]}. Same row count and column count as input.

Input headers (Korean):
{HEADERS}

Input rows (Korean, JSON):
{ROWS}
`;

const TRANSLATE_IMAGE_PROMPT = `You see a screenshot of a Korean bank or securities transaction statement. Extract the transaction table from it for a foreign customer (not for legal/official use, just human-readable).

Return STRICT JSON with this shape:
{
  "title": string,                    // best inferred document title in English (e.g., "Transaction History — Hana Bank")
  "period_start": string,             // YYYY-MM-DD if visible, else ""
  "period_end": string,               // YYYY-MM-DD if visible, else ""
  "headers": [string],                // English column headers (Date, Description, Withdrawal (KRW), Deposit (KRW), Balance (KRW), etc.)
  "rows": [[string]]                  // each row matches headers; numbers as plain digits
}

Rules:
- Translate every Korean string. Keep numbers, dates, account numbers as-is.
- For Korean person names use Revised Romanization. For Korean company names use the widely-known English form.
- Be CONSISTENT across rows.
- If you cannot read a cell, output an empty string.
- Do not include any markdown, comments, or explanation — JSON only.
`;

// ------------------------------------
// Translation helpers (called server-side AFTER payment confirm)
// ------------------------------------
async function translateRows(headers, rows) {
  const prompt = TRANSLATE_ROWS_PROMPT
    .replace('{HEADERS}', JSON.stringify(headers))
    .replace('{ROWS}', JSON.stringify(rows));
  const out = await callGemini([{ text: prompt }]);
  const tHeaders = Array.isArray(out?.translatedHeaders) ? out.translatedHeaders.map(String) : [];
  const tRows = Array.isArray(out?.translatedRows) ? out.translatedRows : [];
  if (tHeaders.length === 0 || tRows.length === 0) {
    throw new Error('번역 결과가 비어 있습니다.');
  }
  return { headers: tHeaders, rows: tRows };
}

async function translateImage(imageUrl) {
  let parsed;
  try { parsed = new URL(imageUrl); } catch { throw new Error('유효하지 않은 이미지 URL입니다.'); }
  if (!/(^|\.)imagekit\.io$/i.test(parsed.hostname)) {
    throw new Error('ImageKit URL만 허용됩니다.');
  }
  const upstream = await fetch(imageUrl);
  if (!upstream.ok) throw new Error(`이미지 다운로드 실패: ${upstream.status}`);
  const mime = upstream.headers.get('content-type') || 'image/png';
  const buf = Buffer.from(await upstream.arrayBuffer());
  const b64 = buf.toString('base64');
  const out = await callGemini([
    { text: TRANSLATE_IMAGE_PROMPT },
    { inline_data: { mime_type: mime, data: b64 } },
  ]);
  const headers = Array.isArray(out?.headers) ? out.headers.map(String) : [];
  const rows = Array.isArray(out?.rows) ? out.rows : [];
  if (headers.length === 0 || rows.length === 0) {
    throw new Error('이미지에서 거래 표를 추출하지 못했습니다.');
  }
  return {
    headers,
    rows,
    title: String(out?.title || ''),
    periodStart: String(out?.period_start || ''),
    periodEnd: String(out?.period_end || ''),
  };
}

async function runTranslationFor(conversionRow) {
  const src = conversionRow.source_data || {};
  if (conversionRow.source_type === 'image') {
    const r = await translateImage(conversionRow.source_image_url);
    return {
      headers: r.headers,
      rows: r.rows,
      title: conversionRow.title || r.title,
      periodStart: conversionRow.period_start || r.periodStart,
      periodEnd: conversionRow.period_end || r.periodEnd,
    };
  }
  const r = await translateRows(src.headers || [], src.rows || []);
  return {
    headers: r.headers,
    rows: r.rows,
    title: conversionRow.title,
    periodStart: conversionRow.period_start,
    periodEnd: conversionRow.period_end,
  };
}

// ------------------------------------
// Conversions (save → list → re-access)
// ------------------------------------
function calcPages(rowCount, sourceType) {
  if (sourceType === 'image') return 1;
  return Math.max(1, Math.ceil((rowCount || 0) / 30));
}

app.post('/api/conversions', authRequired, async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 300);
    const periodStart = String(body.periodStart || '').slice(0, 50);
    const periodEnd = String(body.periodEnd || '').slice(0, 50);
    const sourceType = ['excel', 'csv', 'image'].includes(body.sourceType) ? body.sourceType : 'excel';
    const sourceData = body.sourceData ?? {};
    const sourceImageUrl = body.sourceImageUrl ? String(body.sourceImageUrl).slice(0, 2000) : null;

    if (sourceType === 'image' && !sourceImageUrl) {
      return res.status(400).json({ success: false, message: '이미지 URL이 누락되었습니다.' });
    }
    if (sourceType !== 'image') {
      const sh = Array.isArray(sourceData?.headers) ? sourceData.headers : null;
      const sr = Array.isArray(sourceData?.rows) ? sourceData.rows : null;
      if (!sh || !sr || sh.length === 0 || sr.length === 0) {
        return res.status(400).json({ success: false, message: 'sourceData.headers / sourceData.rows가 비어있습니다.' });
      }
      if (sr.length > 1000) {
        return res.status(400).json({ success: false, message: '한 번에 최대 1000행까지 변환할 수 있습니다.' });
      }
    }

    const rowCount = sourceType === 'image' ? 0 : (sourceData?.rows?.length || 0);
    const pageCount = calcPages(rowCount, sourceType);
    const amount = pageCount * PRICE_PER_PAGE;

    const result = await pool.query(
      `INSERT INTO trans_conversions
        (user_id, title, period_start, period_end, source_type, source_data, translated_data, page_count, amount, source_image_url)
       VALUES ($1, $2, $3, $4, $5, $6, '{}'::jsonb, $7, $8, $9)
       RETURNING id, title, period_start, period_end, source_type, page_count, amount, paid, created_at`,
      [
        req.user.id,
        title,
        periodStart,
        periodEnd,
        sourceType,
        JSON.stringify(sourceData),
        pageCount,
        amount,
        sourceImageUrl,
      ]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[POST /api/conversions]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Retry translation (only allowed if paid and translated_data is empty)
app.post('/api/conversions/:id/translate', authRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: '잘못된 ID' });
    const result = await pool.query(
      `SELECT id, user_id, title, period_start, period_end, source_type,
              source_data, translated_data, source_image_url, paid
       FROM trans_conversions WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '변환 기록을 찾을 수 없습니다.' });
    const cv = result.rows[0];
    if (cv.user_id !== req.user.id) return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    if (!cv.paid) return res.status(402).json({ success: false, message: '결제 후에 변환할 수 있습니다.' });

    const translated = await runTranslationFor(cv);
    await pool.query(
      `UPDATE trans_conversions
       SET translated_data = $1::jsonb,
           title = COALESCE(NULLIF(title,''), $2),
           period_start = COALESCE(NULLIF(period_start,''), $3),
           period_end = COALESCE(NULLIF(period_end,''), $4),
           updated_at = NOW()
       WHERE id = $5`,
      [JSON.stringify(translated), translated.title || '', translated.periodStart || '', translated.periodEnd || '', id]
    );
    res.json({ success: true, data: { conversionId: id } });
  } catch (err) {
    console.error('[POST /api/conversions/:id/translate]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/conversions', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, period_start, period_end, source_type, page_count, amount,
              paid, paid_at, created_at
       FROM trans_conversions
       WHERE user_id = $1
       ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/conversions/:id', authRequired, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ success: false, message: '잘못된 ID' });
    const result = await pool.query(
      `SELECT id, user_id, title, period_start, period_end, source_type,
              source_data, translated_data, page_count, amount,
              source_image_url, paid, paid_at, created_at
       FROM trans_conversions WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '변환 기록을 찾을 수 없습니다.' });
    }
    const row = result.rows[0];
    if (row.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------
// Payments — Toss server-side confirm
// ------------------------------------
app.post('/api/payments/prepare', authRequired, async (req, res) => {
  try {
    const conversionId = parseInt(req.body?.conversionId, 10);
    if (!Number.isInteger(conversionId)) {
      return res.status(400).json({ success: false, message: 'conversionId가 필요합니다.' });
    }
    const cv = await pool.query(
      'SELECT id, user_id, amount, paid FROM trans_conversions WHERE id = $1',
      [conversionId]
    );
    if (cv.rows.length === 0) {
      return res.status(404).json({ success: false, message: '변환 기록을 찾을 수 없습니다.' });
    }
    const row = cv.rows[0];
    if (row.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }
    if (row.paid) {
      return res.status(400).json({ success: false, message: '이미 결제가 완료된 항목입니다.' });
    }
    const orderId = `kr2en_${conversionId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO trans_payments (conversion_id, user_id, order_id, amount, status)
       VALUES ($1, $2, $3, $4, 'PENDING')`,
      [conversionId, req.user.id, orderId, row.amount]
    );
    res.json({
      success: true,
      data: {
        orderId,
        amount: row.amount,
        orderName: `한글→영문 거래내역서 변환 #${conversionId}`,
        customerKey: `user_${req.user.id}`,
      },
    });
  } catch (err) {
    console.error('[POST /api/payments/prepare]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/payments/confirm', authRequired, async (req, res) => {
  try {
    const paymentKey = String(req.body?.paymentKey || '').trim();
    const orderId = String(req.body?.orderId || '').trim();
    const amount = parseInt(req.body?.amount, 10);
    if (!paymentKey || !orderId || !Number.isInteger(amount)) {
      return res.status(400).json({ success: false, message: 'paymentKey, orderId, amount가 필요합니다.' });
    }

    const pmt = await pool.query(
      'SELECT id, conversion_id, user_id, amount, status FROM trans_payments WHERE order_id = $1',
      [orderId]
    );
    if (pmt.rows.length === 0) {
      return res.status(404).json({ success: false, message: '결제 주문을 찾을 수 없습니다.' });
    }
    const p = pmt.rows[0];
    if (p.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }
    if (p.amount !== amount) {
      return res.status(400).json({ success: false, message: '결제 금액이 일치하지 않습니다.' });
    }
    if (p.status === 'DONE') {
      return res.json({ success: true, data: { conversionId: p.conversion_id, alreadyPaid: true } });
    }

    // Server-side Toss confirm with Secret Key (never expose secret to client)
    const auth = Buffer.from(`${TOSS_SECRET_KEY}:`).toString('base64');
    const resp = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const tossData = await resp.json();
    if (!resp.ok) {
      await pool.query(
        `UPDATE trans_payments SET status='FAILED', payment_key=$1, raw=$2 WHERE id=$3`,
        [paymentKey, JSON.stringify(tossData), p.id]
      );
      return res.status(400).json({ success: false, message: tossData?.message || '결제 승인 실패', code: tossData?.code });
    }

    await pool.query(
      `UPDATE trans_payments SET status='DONE', payment_key=$1, raw=$2 WHERE id=$3`,
      [paymentKey, JSON.stringify(tossData), p.id]
    );
    await pool.query(
      `UPDATE trans_conversions SET paid=TRUE, paid_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [p.conversion_id]
    );

    // Run Gemini translation NOW (post-payment). On failure, leave translated_data
    // empty and return translationFailed=true so the client can offer a retry.
    let translationFailed = false;
    let translationError = '';
    try {
      const cvRow = await pool.query(
        `SELECT id, title, period_start, period_end, source_type, source_data, source_image_url
         FROM trans_conversions WHERE id = $1`,
        [p.conversion_id]
      );
      if (cvRow.rows.length > 0) {
        const translated = await runTranslationFor(cvRow.rows[0]);
        await pool.query(
          `UPDATE trans_conversions
           SET translated_data = $1::jsonb,
               title = COALESCE(NULLIF(title,''), $2),
               period_start = COALESCE(NULLIF(period_start,''), $3),
               period_end = COALESCE(NULLIF(period_end,''), $4),
               updated_at = NOW()
           WHERE id = $5`,
          [
            JSON.stringify(translated),
            translated.title || '',
            translated.periodStart || '',
            translated.periodEnd || '',
            p.conversion_id,
          ]
        );
      }
    } catch (transErr) {
      console.error('[post-payment translation]', transErr);
      translationFailed = true;
      translationError = transErr.message || '번역 실패';
    }

    res.json({
      success: true,
      data: {
        conversionId: p.conversion_id,
        paymentKey,
        orderId,
        amount,
        translationFailed,
        translationError,
      },
    });
  } catch (err) {
    console.error('[POST /api/payments/confirm]', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------
// SPA Fallback
// ------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ------------------------------------
// Local / Vercel dual-mode
// ------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`kr2en-statement server: http://localhost:${PORT}`);
  });
}

module.exports = app;
