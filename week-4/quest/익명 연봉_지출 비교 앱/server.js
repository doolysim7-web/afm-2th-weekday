const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// --- DB 설정 (Lazy Init) ---
const DATABASE_URL =
  'postgresql://postgres.rojqfmhyfaqfctgjwpqj:1GMNGBYRPOzI4V2W@aws-1-us-east-1.pooler.supabase.com:6543/postgres';

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || DATABASE_URL).trim(),
  ssl: { rejectUnauthorized: false },
});

let dbInitialized = false;

async function initDB() {
  if (dbInitialized) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      job_category VARCHAR(50) NOT NULL,
      years INTEGER NOT NULL,
      monthly_salary INTEGER NOT NULL,
      food INTEGER DEFAULT 0,
      housing INTEGER DEFAULT 0,
      transport INTEGER DEFAULT 0,
      subscription INTEGER DEFAULT 0,
      etc_expense INTEGER DEFAULT 0,
      total_expense INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  dbInitialized = true;
}

// --- 미들웨어 ---
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// DB lazy init 미들웨어 (API 라우트 전용)
app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ success: false, message: 'Database initialization failed' });
  }
});

// --- API 라우트 ---

// 1) POST /api/entries - 익명 데이터 제출
app.post('/api/entries', async (req, res) => {
  try {
    const { job_category, years, monthly_salary } = req.body;
    const food = Number(req.body.food) || 0;
    const housing = Number(req.body.housing) || 0;
    const transport = Number(req.body.transport) || 0;
    const subscription = Number(req.body.subscription) || 0;
    const etc_expense = Number(req.body.etc_expense) || 0;

    if (!job_category || years == null || monthly_salary == null) {
      return res.status(400).json({ success: false, message: 'job_category, years, monthly_salary는 필수입니다.' });
    }

    const total_expense = food + housing + transport + subscription + etc_expense;

    const result = await pool.query(
      `INSERT INTO entries (job_category, years, monthly_salary, food, housing, transport, subscription, etc_expense, total_expense)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [job_category, Number(years), Number(monthly_salary), food, housing, transport, subscription, etc_expense, total_expense]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('POST /api/entries error:', err);
    res.status(500).json({ success: false, message: '데이터 저장에 실패했습니다.' });
  }
});

// 2) GET /api/entries - 전체 데이터 목록 (최신순)
app.get('/api/entries', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM entries ORDER BY created_at DESC');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('GET /api/entries error:', err);
    res.status(500).json({ success: false, message: '데이터 조회에 실패했습니다.' });
  }
});

// 3) GET /api/stats - 전체 통계
app.get('/api/stats', async (_req, res) => {
  try {
    // 기본 평균 통계
    const avgResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total_count,
        COALESCE(ROUND(AVG(monthly_salary)), 0)::int AS avg_salary,
        COALESCE(ROUND(AVG(total_expense)), 0)::int AS avg_total_expense,
        COALESCE(ROUND(AVG(food)), 0)::int AS avg_food,
        COALESCE(ROUND(AVG(housing)), 0)::int AS avg_housing,
        COALESCE(ROUND(AVG(transport)), 0)::int AS avg_transport,
        COALESCE(ROUND(AVG(subscription)), 0)::int AS avg_subscription,
        COALESCE(ROUND(AVG(etc_expense)), 0)::int AS avg_etc
      FROM entries
    `);

    // 월급 구간별 분포 (만원 단위: ~200, 200~400, 400~600, 600~800, 800~)
    const distResult = await pool.query(`
      SELECT
        CASE
          WHEN monthly_salary < 200 THEN '~200'
          WHEN monthly_salary < 400 THEN '200~400'
          WHEN monthly_salary < 600 THEN '400~600'
          WHEN monthly_salary < 800 THEN '600~800'
          ELSE '800~'
        END AS range,
        COUNT(*)::int AS count
      FROM entries
      GROUP BY range
      ORDER BY range
    `);

    // 순서 보장을 위해 고정 배열로 변환
    const rangeOrder = ['~200', '200~400', '400~600', '600~800', '800~'];
    const distMap = {};
    distResult.rows.forEach((r) => (distMap[r.range] = r.count));
    const salary_distribution = rangeOrder.map((range) => ({
      range,
      count: distMap[range] || 0,
    }));

    // 직군별 통계
    const jobResult = await pool.query(`
      SELECT
        job_category,
        COUNT(*)::int AS count,
        ROUND(AVG(monthly_salary))::int AS avg_salary,
        ROUND(AVG(total_expense))::int AS avg_expense
      FROM entries
      GROUP BY job_category
      ORDER BY count DESC
    `);

    const stats = avgResult.rows[0];
    res.json({
      success: true,
      data: {
        total_count: stats.total_count,
        avg_salary: stats.avg_salary,
        avg_total_expense: stats.avg_total_expense,
        avg_food: stats.avg_food,
        avg_housing: stats.avg_housing,
        avg_transport: stats.avg_transport,
        avg_subscription: stats.avg_subscription,
        avg_etc: stats.avg_etc,
        salary_distribution,
        job_stats: jobResult.rows,
      },
    });
  } catch (err) {
    console.error('GET /api/stats error:', err);
    res.status(500).json({ success: false, message: '통계 조회에 실패했습니다.' });
  }
});

// 4) GET /api/stats/rank - 내 월급 순위 (상위 %)
app.get('/api/stats/rank', async (req, res) => {
  try {
    const salary = Number(req.query.salary);
    if (!salary && salary !== 0) {
      return res.status(400).json({ success: false, message: 'salary 쿼리 파라미터가 필요합니다.' });
    }

    const higherResult = await pool.query(
      'SELECT COUNT(*)::int AS higher_count FROM entries WHERE monthly_salary > $1',
      [salary]
    );
    const totalResult = await pool.query('SELECT COUNT(*)::int AS total_count FROM entries');

    const higher_count = higherResult.rows[0].higher_count;
    const total_count = totalResult.rows[0].total_count;
    const raw_percent = total_count === 0 ? 0 : Math.round((higher_count / total_count) * 100);
    const rank_percent = total_count > 0 ? Math.max(raw_percent, 1) : 0;

    res.json({ success: true, data: { rank_percent, higher_count, total_count } });
  } catch (err) {
    console.error('GET /api/stats/rank error:', err);
    res.status(500).json({ success: false, message: '순위 조회에 실패했습니다.' });
  }
});

// 5) DELETE /api/entries/:id - 데이터 삭제
app.delete('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM entries WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '해당 데이터를 찾을 수 없습니다.' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('DELETE /api/entries/:id error:', err);
    res.status(500).json({ success: false, message: '데이터 삭제에 실패했습니다.' });
  }
});

// --- SPA fallback (Express 5) ---
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- 서버 시작 / Vercel export ---
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
