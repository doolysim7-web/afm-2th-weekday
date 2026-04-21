// LUMIÈRE — Lighting Boutique Backend
// Express 5 + PostgreSQL (Supabase)
// Dual-mode: local (`node server.js`) and Vercel serverless

const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ----------------------------------------------------------------------------
// Database configuration (Supabase Postgres with local fallback)
// ----------------------------------------------------------------------------
const FALLBACK_DB_URL =
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const connectionString = (process.env.DATABASE_URL || FALLBACK_DB_URL).trim();

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// ----------------------------------------------------------------------------
// TossPayments configuration
// NOTE: In production, TOSS_SECRET_KEY MUST come from an environment variable.
// The fallback here is the public TossPayments docs test key — convenient for
// local development, but never rely on a hardcoded fallback in production.
// ----------------------------------------------------------------------------
const TOSS_SECRET_KEY =
  process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6';

// ----------------------------------------------------------------------------
// Lazy DB init (safe for serverless cold starts)
// ----------------------------------------------------------------------------
let dbInitialized = false;
async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lighting_orders (
      id SERIAL PRIMARY KEY,
      customer_name VARCHAR(50) NOT NULL,
      customer_phone VARCHAR(20) NOT NULL,
      customer_email VARCHAR(100),
      shipping_address TEXT NOT NULL,
      items JSONB NOT NULL,
      subtotal BIGINT NOT NULL,
      shipping_fee BIGINT NOT NULL DEFAULT 0,
      total_amount BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      memo TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  // TossPayments integration columns (added lazily for legacy tables)
  await pool.query(
    `ALTER TABLE lighting_orders ADD COLUMN IF NOT EXISTS toss_order_id VARCHAR(100)`
  );
  await pool.query(
    `ALTER TABLE lighting_orders ADD COLUMN IF NOT EXISTS payment_key VARCHAR(200)`
  );
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS lighting_orders_toss_order_id_uidx
       ON lighting_orders (toss_order_id)
       WHERE toss_order_id IS NOT NULL`
  );
  dbInitialized = true;
}

// ----------------------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------------------
app.use(express.json());
app.use(express.static(path.join(__dirname))); // serves index.html + images/

// Ensure DB is ready before any /api route runs
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// ----------------------------------------------------------------------------
// Constants / helpers
// ----------------------------------------------------------------------------
const ALLOWED_STATUSES = ['pending', 'confirmed', 'shipping', 'delivered', 'cancelled'];
const FREE_SHIPPING_THRESHOLD = 50000;
const SHIPPING_FEE = 3000;

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'items는 최소 1개 이상의 상품이 포함된 배열이어야 합니다.';
  }
  for (const it of items) {
    if (!it || typeof it !== 'object') return '상품 항목 형식이 올바르지 않습니다.';
    if (!Number.isInteger(Number(it.product_id))) return 'product_id는 정수여야 합니다.';
    if (typeof it.name !== 'string' || !it.name.trim()) return '상품명(name)이 필요합니다.';
    const price = Number(it.price);
    if (!Number.isFinite(price) || price < 0) return 'price는 0 이상의 숫자여야 합니다.';
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1) return 'qty는 1 이상의 정수여야 합니다.';
  }
  return null;
}

function normalizeItems(items) {
  return items.map((it) => ({
    product_id: Number(it.product_id),
    name: String(it.name),
    price: Number(it.price),
    qty: Number(it.qty),
    image: typeof it.image === 'string' ? it.image : null,
  }));
}

function computeTotals(items) {
  const subtotal = items.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping_fee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { subtotal, shipping_fee, total_amount: subtotal + shipping_fee };
}

// ----------------------------------------------------------------------------
// API: Orders
// ----------------------------------------------------------------------------

// POST /api/orders — create a new order (server computes totals)
app.post('/api/orders', async (req, res) => {
  try {
    const {
      customer_name,
      customer_phone,
      customer_email,
      shipping_address,
      items,
      memo,
    } = req.body || {};

    if (typeof customer_name !== 'string' || !customer_name.trim()) {
      return res.status(400).json({ success: false, message: 'customer_name은 필수입니다.' });
    }
    if (typeof customer_phone !== 'string' || !customer_phone.trim()) {
      return res.status(400).json({ success: false, message: 'customer_phone은 필수입니다.' });
    }
    const digits = customer_phone.replace(/[^0-9]/g, '');
    if (digits.length < 9 || !/^[0-9-]+$/.test(customer_phone.trim())) {
      return res.status(400).json({
        success: false,
        message: 'customer_phone은 숫자/하이픈으로만 구성된 9자리 이상이어야 합니다.',
      });
    }
    if (typeof shipping_address !== 'string' || !shipping_address.trim()) {
      return res.status(400).json({ success: false, message: 'shipping_address는 필수입니다.' });
    }

    const itemsError = validateItems(items);
    if (itemsError) {
      return res.status(400).json({ success: false, message: itemsError });
    }

    const normalized = normalizeItems(items);
    const { subtotal, shipping_fee, total_amount } = computeTotals(normalized);

    const insertResult = await pool.query(
      `INSERT INTO lighting_orders
         (customer_name, customer_phone, customer_email, shipping_address,
          items, subtotal, shipping_fee, total_amount, memo)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING *`,
      [
        customer_name.trim(),
        customer_phone.trim(),
        customer_email ? String(customer_email).trim() : null,
        shipping_address.trim(),
        JSON.stringify(normalized),
        subtotal,
        shipping_fee,
        total_amount,
        memo ? String(memo).trim() : null,
      ]
    );

    // Assign a unique TossPayments orderId after insert.
    // Format: LUMIERE_<orderId>_<timestamp> — 6–64 chars, ASCII, unpredictable.
    const row = insertResult.rows[0];
    const tossOrderId = `LUMIERE_${row.id}_${Date.now()}`;
    const updateResult = await pool.query(
      `UPDATE lighting_orders SET toss_order_id = $1 WHERE id = $2 RETURNING *`,
      [tossOrderId, row.id]
    );

    res.status(201).json({ success: true, data: updateResult.rows[0] });
  } catch (err) {
    console.error('POST /api/orders error:', err);
    res.status(500).json({ success: false, message: '주문 생성에 실패했습니다.' });
  }
});

// GET /api/orders — list orders (optional ?status=pending)
app.get('/api/orders', async (req, res) => {
  try {
    const { status } = req.query;
    let result;
    if (status) {
      if (!ALLOWED_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: '허용되지 않은 status 값입니다.' });
      }
      result = await pool.query(
        `SELECT * FROM lighting_orders WHERE status = $1 ORDER BY id DESC`,
        [status]
      );
    } else {
      result = await pool.query(`SELECT * FROM lighting_orders ORDER BY id DESC`);
    }
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/orders error:', err);
    res.status(500).json({ success: false, message: '주문 목록 조회에 실패했습니다.' });
  }
});

// GET /api/orders/:id — single order detail
app.get('/api/orders/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '유효하지 않은 id입니다.' });
    }
    const result = await pool.query(`SELECT * FROM lighting_orders WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 주문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('GET /api/orders/:id error:', err);
    res.status(500).json({ success: false, message: '주문 조회에 실패했습니다.' });
  }
});

// PATCH /api/orders/:id/status — update order status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '유효하지 않은 id입니다.' });
    }
    const { status } = req.body || {};
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status는 [${ALLOWED_STATUSES.join(', ')}] 중 하나여야 합니다.`,
      });
    }
    const result = await pool.query(
      `UPDATE lighting_orders SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 주문을 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('PATCH /api/orders/:id/status error:', err);
    res.status(500).json({ success: false, message: '주문 상태 변경에 실패했습니다.' });
  }
});

// GET /api/stats — admin summary
app.get('/api/stats', async (_req, res) => {
  try {
    const totalsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total_orders,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_orders,
         COALESCE(SUM(total_amount) FILTER (WHERE status <> 'cancelled'), 0)::bigint AS total_revenue
       FROM lighting_orders`
    );
    const byStatusResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count
       FROM lighting_orders
       GROUP BY status`
    );
    const byStatus = {};
    for (const row of byStatusResult.rows) byStatus[row.status] = row.count;

    const t = totalsResult.rows[0];
    res.json({
      success: true,
      data: {
        totalOrders: t.total_orders,
        pendingOrders: t.pending_orders,
        totalRevenue: Number(t.total_revenue),
        byStatus,
      },
    });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ success: false, message: '통계 조회에 실패했습니다.' });
  }
});

// ----------------------------------------------------------------------------
// API: Payments (TossPayments)
// ----------------------------------------------------------------------------

// POST /api/payments/confirm — called by the client after the Toss redirect.
// Server-side validation is critical here: we MUST re-check the amount
// against what's stored in our DB before calling Toss's confirm API.
app.post('/api/payments/confirm', async (req, res) => {
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

    // 1) Look up the order by its Toss orderId.
    const orderResult = await pool.query(
      `SELECT * FROM lighting_orders WHERE toss_order_id = $1`,
      [orderId]
    );
    if (orderResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 주문을 찾을 수 없습니다.' });
    }
    const order = orderResult.rows[0];

    // 2) Critical: amount must match what we stored when the order was created.
    if (Number(order.total_amount) !== amountNum) {
      return res.status(400).json({
        success: false,
        message: '결제 금액이 주문 금액과 일치하지 않습니다.',
      });
    }

    // Idempotency: if already confirmed, surface the order without re-calling Toss.
    if (order.status === 'confirmed' && order.payment_key === paymentKey) {
      return res.json({ success: true, data: { alreadyConfirmed: true, order } });
    }

    // 3) Call TossPayments confirm API with Basic auth (secret key + ':').
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
      // Toss returned an error — surface code/message to the client.
      return res.status(tossResponse.status).json({
        success: false,
        code: tossData.code,
        message: tossData.message || '결제 승인에 실패했습니다.',
      });
    }

    // 4) Persist confirmation.
    const updated = await pool.query(
      `UPDATE lighting_orders
         SET status = 'confirmed', payment_key = $1
       WHERE id = $2
       RETURNING *`,
      [paymentKey, order.id]
    );

    res.json({
      success: true,
      data: {
        order: updated.rows[0],
        payment: tossData,
      },
    });
  } catch (err) {
    console.error('POST /api/payments/confirm error:', err);
    res.status(500).json({ success: false, message: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

// ----------------------------------------------------------------------------
// SPA fallback (Express 5 wildcard syntax) — after all /api routes
// ----------------------------------------------------------------------------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ----------------------------------------------------------------------------
// Global error handler (safety net)
// ----------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: '서버 내부 오류가 발생했습니다.' });
});

// ----------------------------------------------------------------------------
// Startup (local) / Export (serverless)
// ----------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`LUMIÈRE server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
