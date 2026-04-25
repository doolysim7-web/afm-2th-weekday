// =============================================================================
// 유료 뉴스레터 잠금 해제 미니앱
// Express 5 + PostgreSQL(Supabase) + JWT + TossPayments
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
    '[WARN] JWT_SECRET 환경변수가 설정되지 않았습니다. 기본 개발용 시크릿을 사용합니다.'
  );
}
const JWT_SECRET = (process.env.JWT_SECRET || 'dev-secret-change-me').trim();
const JWT_EXPIRES_IN = '7d';
const BCRYPT_SALT_ROUNDS = 10;

// TossPayments 시크릿 키 — 서버에서만 사용
const TOSS_SECRET_KEY = (
  process.env.TOSS_SECRET_KEY || 'test_gsk_docs_OaPz8L5KdmQXkzRz3y47BMw6'
).trim();

// -----------------------------------------------------------------------------
// DB 연결 풀
// -----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// -----------------------------------------------------------------------------
// 시드 콘텐츠 — 유료 뉴스레터 (이번 주 호 + 지난 호들)
// -----------------------------------------------------------------------------
const SEED_CONTENTS = [
  {
    title: '[이번 주 호] AI 시대의 기획자, 우리는 어디로 가는가',
    issue_label: '구독자 전용',
    price: 4900,
    preview:
      'AI 도구가 대중화된 2026년, 기획자의 역할은 어떻게 변하고 있을까요?\n실리콘밸리 PM 12명을 인터뷰했고, 공통적으로 등장한 키워드 3가지가 있었습니다.\n첫 번째는 "맥락 설계자(context designer)"라는 정체성의 변화입니다.',
    body:
      '# AI 시대의 기획자, 우리는 어디로 가는가\n\n2026년, 실리콘밸리에서 만난 PM들의 이야기를 정리했습니다.\n\n## 1. 맥락 설계자(Context Designer)로의 전환\n과거 PM은 기능 명세를 잘 쓰는 사람이었지만, 이제는 모델이 답을 잘 내도록\n맥락을 잘 설계하는 사람이 더 중요해졌습니다. Cursor의 PM 인터뷰에서는\n"우리는 코드를 짜지 않고, 모델에게 던질 질문의 구조를 짜고 있다"고 했죠.\n\n## 2. 데이터를 보고 즉시 실험하는 능력\nA/B 테스트를 디자인해놓고 결과를 기다리는 시대는 거의 끝났습니다.\nLLM 기반 제품에서는 프롬프트 한 줄이 KPI를 5%씩 흔드는 일이 흔하고,\n그 변경을 24시간 내 다시 검증할 수 있어야 합니다.\n\n## 3. 단순함을 지키는 용기\n역설적으로 AI 시대일수록 "이 기능을 빼자"고 말할 수 있는 PM이 귀해졌습니다.\n모델이 만들어낼 수 있는 것이 무한해진 만큼, 사용자에게 진짜 의미 있는\n기능 3가지만 남기는 결정이 가장 어렵고 가장 가치 있습니다.\n\n## 마치며\n저는 인터뷰 후 "기획서 한 장 분량의 명료함"을 다시 훈련하고 있습니다.\n다음 호에서는 그 훈련법을 공유하겠습니다.',
  },
  {
    title: '#38 — 이번 주 테크 뉴스 5선과 우리의 해석',
    issue_label: '주간 큐레이션',
    price: 2900,
    preview:
      '1. OpenAI, 새 추론 모델 공개 — 비용은 절반, 정확도는 12% ↑\n2. Apple Vision Pro 2 발표 — 무게 220g, 가격 $1,799\n3. 한국 스타트업 A의 시리즈C, 평가가치 1조 돌파',
    body:
      '# 이번 주 테크 뉴스 5선과 우리의 해석\n\n## 1. OpenAI, 새 추론 모델 공개 — 비용 절반·정확도 +12%\n핵심은 "thinking budget"을 사용자가 조절할 수 있게 한 것.\n간단한 분류 작업에서는 거의 무료에 가까워졌고, 코드 리팩토링은\n오히려 더 비싸졌습니다. **요약**: 가격대비 성능보다 "선택권"이 키워드.\n\n## 2. Apple Vision Pro 2 — 무게 220g, $1,799\n무게가 결정적입니다. 1세대 대비 50% 경량화하면서 1시간 이상 착용이\n실제로 가능해졌습니다. 다만 한국 출시는 2분기 이후로 추정됩니다.\n\n## 3. 한국 스타트업 A 시리즈C — 평가가치 1조 돌파\nB2B SaaS이면서 한국에서 1조에 도달한 첫 사례. 매출 성장률은\n140% YoY, GRR 95%. SaaS metrics 교과서급 수치.\n\n## 4. EU AI Act 1차 발효 — 한국 기업 영향\n범용 모델 제공자 의무가 발효됐습니다. 한국 LLM 스타트업은 EU 시장\n진출 시 모델 카드 + 학습 데이터 출처 공개가 필요합니다.\n\n## 5. 글로벌 IT 채용 동향 — 시니어 +18%, 주니어 -22%\n주니어 채용은 줄고 시니어는 늘었습니다. AI로 대체되기 어려운 판단력에\n프리미엄이 붙는 구조가 더 뚜렷해지는 중입니다.',
  },
  {
    title: '스타트업 조직 운영의 비밀 — 30명 이하 단계의 실수 7가지',
    issue_label: '심층 분석',
    price: 6500,
    preview:
      '한국 스타트업 23개, 미국 스타트업 11개의 초기 멤버 인터뷰를 통해 정리한\n"30명 이하 단계에서 가장 자주 발생하는 조직 운영 실수 7가지"입니다.\n절반 이상이 동일한 함정에 빠진다는 점이 놀라웠습니다.',
    body:
      '# 스타트업 조직 운영의 비밀\n\n## 30명 이하 단계의 실수 7가지\n\n### 실수 1 — "느낌으로 채용"\n초기에는 같이 일하면 즐거울 것 같다는 직감으로 뽑게 됩니다.\n하지만 30명 이상이 되었을 때 가장 후회하는 결정 1순위가 바로 이것.\n\n### 실수 2 — 1:1 미팅을 안 함\n대표가 "다 알고 있다"고 착각하기 시작하면 무너지는 시점이 옵니다.\n주 1회 30분만이라도 모든 멤버와 1:1을 합시다.\n\n### 실수 3 — 직무 정의를 미룸\n"우리는 다 같이 하는 거지" 분위기가 처음에는 좋지만,\n10명을 넘어가면 책임 회색지대가 갈등의 원인이 됩니다.\n\n### 실수 4 — 보상 체계를 임시로\n업계 평균을 모르고 "그냥 좋은 조건"이라 생각해서 주면\n나중에 인상 협상이 폭탄이 됩니다.\n\n### 실수 5 — 문서를 안 만듦\n"말로 다 통한다"는 시기가 정확히 12명까지입니다. 그 이후엔 깨집니다.\n\n### 실수 6 — 첫 매니저를 너무 늦게\n실무가 너무 잘하는 사람이라 매니저로 안 올린다는 결정이 가장 위험합니다.\n\n### 실수 7 — 대표의 정체성\n"엔지니어 대표"인지 "사업가 대표"인지를 멤버들이 헷갈리는 순간\n조직은 산만해집니다. 명시적으로 자신을 정의해야 합니다.\n\n## 마치며\n저는 5번과 7번에서 가장 크게 데였습니다. 다음 호에서 자세한 사례를 풀게요.',
  },
  {
    title: '글로벌 거시경제 위클리 — 2026년 4월 4주차',
    issue_label: '경제 브리핑',
    price: 3500,
    preview:
      '미국 4월 PCE 발표 — 전년 동기 대비 2.6%, 시장 예상치 부합.\n연준 6월 인하 가능성 47%로 다시 상승.\n원화는 달러 대비 1,357원, 4월 평균 대비 0.8% 약세.',
    body:
      '# 거시경제 위클리 — 2026.04 4주차\n\n## 미국\n- PCE 2.6% (예상 2.6%) → 연준 6월 인하 시나리오 살아남음\n- 10년물 금리 4.21% → 한 주 사이 -8bp\n- 실업률 3.9% (3월) 유지\n\n## 한국\n- 금융통화위원회 5월 회의 동결 우세 (시장 컨센서스 78%)\n- 원달러 1,357원 — 4월 평균 1,346원 대비 약세\n- 1분기 GDP 성장률 +0.7% qoq\n\n## 중국\n- 부동산 신규 분양 -4.2% MoM, 회복 신호 약함\n- 위안화 환율 7.21 — 인민은행 개입 흔적 관측\n\n## 시사점\n금리 동결+성장 둔화의 조합에서 가장 안정적인 자산은 미국 단기채와\n원유 비중이 낮은 글로벌 ETF입니다. 다음 호에서 5월 FOMC 미리보기를 다룰게요.',
  },
  {
    title: '디자인 시스템 구축 가이드 — 0에서 1까지의 6주',
    issue_label: '실무 시리즈',
    price: 5500,
    preview:
      '디자인 시스템을 시작할 때 가장 먼저 부딪히는 질문 3가지.\n"Figma냐 Storybook이냐?", "토큰은 얼마나 잘게 쪼갤 것인가?",\n"디자이너와 개발자 누가 owner인가?".',
    body:
      '# 디자인 시스템 0 → 1 구축 가이드\n\n## Week 1 — 토큰 정의\n색상은 10단계 미만으로, 간격은 4의 배수, 모션은 3종 이내.\n과도하게 잘게 쪼개지 마세요. "Tailwind 표준에 우리만의 4-5개 추가"가\n90% 케이스에서 정답입니다.\n\n## Week 2 — 컴포넌트 우선순위\n- 1순위: Button, Input, Modal, Card, Toast\n- 2순위: Tabs, Select, Tooltip, Dropdown\n- 3순위: 그 외 모든 것\n\n## Week 3 — Storybook 셋업\n팀이 6명 이상이면 무조건 Storybook. 그 미만이면 Figma + 코드 PR로 충분.\n\n## Week 4 — 사용 가이드라인\n언제 Primary 버튼을 쓰는가? 언제 Modal 대신 Drawer를 쓰는가?\n이런 의사결정 가이드가 컴포넌트보다 더 중요합니다.\n\n## Week 5 — 적용 + 마이그레이션\n새 화면부터 적용. 기존 화면은 절대 한꺼번에 바꾸지 마세요. 망합니다.\n\n## Week 6 — 운영 체계\n오너십 모델을 명문화. 보통은 "디자인이 시각적 결정, 개발이 API 결정"을\n공동 소유하는 형태가 가장 안정적이었습니다.\n\n## 마치며\n다음 호에서는 "100명 규모에서의 디자인 시스템 운영 실패담"을 가져옵니다.',
  },
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
      CREATE TABLE IF NOT EXISTS payment_users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(30) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_contents (
        id SERIAL PRIMARY KEY,
        title VARCHAR(200) NOT NULL,
        issue_label VARCHAR(50) NOT NULL DEFAULT '',
        price INTEGER NOT NULL CHECK (price >= 0),
        preview TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_purchases (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES payment_users(id) ON DELETE CASCADE,
        content_id INTEGER NOT NULL REFERENCES payment_contents(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        toss_order_id VARCHAR(100),
        payment_key VARCHAR(200),
        confirmed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_purchases_toss_order_id_uidx
        ON payment_purchases (toss_order_id)
        WHERE toss_order_id IS NOT NULL
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS payment_purchases_user_content_confirmed_uidx
        ON payment_purchases (user_id, content_id)
        WHERE status = 'confirmed'
    `);

    // 콘텐츠 시드
    const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM payment_contents');
    if (countRes.rows[0].c === 0) {
      for (const c of SEED_CONTENTS) {
        await pool.query(
          `INSERT INTO payment_contents (title, issue_label, price, preview, body)
           VALUES ($1, $2, $3, $4, $5)`,
          [c.title, c.issue_label, c.price, c.preview, c.body]
        );
      }
      console.log(`[seed] ${SEED_CONTENTS.length}개 콘텐츠 시드 완료`);
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
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function publicUser(row) { return { id: row.id, email: row.email, name: row.name }; }
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
    req.user = { id: payload.id, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ success: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
}

// optional auth — 토큰 있으면 req.user 설정, 없어도 통과
function authOptional(req, _res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
    try {
      const payload = jwt.verify(parts[1].trim(), JWT_SECRET);
      req.user = { id: payload.id, email: payload.email, name: payload.name };
    } catch { /* ignore */ }
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
    const dup = await pool.query('SELECT id FROM payment_users WHERE email = $1', [trimmedEmail]);
    if (dup.rowCount > 0) {
      return res.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
    }
    const password_hash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const insert = await pool.query(
      `INSERT INTO payment_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, created_at`,
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
      'SELECT id, email, password_hash, name FROM payment_users WHERE email = $1',
      [trimmedEmail]
    );
    const FAIL = '이메일 또는 비밀번호가 일치하지 않습니다.';
    if (result.rowCount === 0) return res.status(401).json({ success: false, message: FAIL });
    const row = result.rows[0];
    const ok = await bcrypt.compare(String(password), row.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: FAIL });
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
      'SELECT id, email, name FROM payment_users WHERE id = $1',
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
// 콘텐츠 API
// =============================================================================

// 목록 — 누구나. preview만 노출. 로그인된 경우 구매 여부도 표시
app.get('/api/contents', authOptional, async (req, res) => {
  try {
    const contents = await pool.query(
      `SELECT id, title, issue_label, price, preview, created_at
         FROM payment_contents
        ORDER BY id DESC`
    );
    let purchasedSet = new Set();
    if (req.user) {
      const purchased = await pool.query(
        `SELECT content_id FROM payment_purchases
          WHERE user_id = $1 AND status = 'confirmed'`,
        [req.user.id]
      );
      purchasedSet = new Set(purchased.rows.map(r => r.content_id));
    }
    const list = contents.rows.map(r => ({
      ...r,
      purchased: purchasedSet.has(r.id),
    }));
    return res.json({ success: true, data: list });
  } catch (err) {
    console.error('[GET /api/contents]', err);
    return res.status(500).json({ success: false, message: '콘텐츠 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 단건 — 본문은 로그인 + 구매 확인 시에만 반환
app.get('/api/contents/:id', authOptional, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 콘텐츠 ID입니다.' });
    }
    const result = await pool.query(
      `SELECT id, title, issue_label, price, preview, body, created_at
         FROM payment_contents WHERE id = $1`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
    }
    const row = result.rows[0];

    let purchased = false;
    if (req.user) {
      const p = await pool.query(
        `SELECT id FROM payment_purchases
          WHERE user_id = $1 AND content_id = $2 AND status = 'confirmed'
          LIMIT 1`,
        [req.user.id, id]
      );
      purchased = p.rowCount > 0;
    }

    const data = {
      id: row.id,
      title: row.title,
      issue_label: row.issue_label,
      price: row.price,
      preview: row.preview,
      created_at: row.created_at,
      purchased,
      body: purchased ? row.body : null,
    };
    return res.json({ success: true, data });
  } catch (err) {
    console.error('[GET /api/contents/:id]', err);
    return res.status(500).json({ success: false, message: '콘텐츠 조회 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 구매 API
// =============================================================================

// 구매 시작 — 콘텐츠에 대한 pending 구매 row 생성, toss_order_id 발급
app.post('/api/orders', authRequired, async (req, res) => {
  try {
    const { content_id } = req.body || {};
    const cid = Number(content_id);
    if (!Number.isInteger(cid) || cid <= 0) {
      return res.status(400).json({ success: false, message: '올바르지 않은 콘텐츠 ID입니다.' });
    }
    const c = await pool.query(
      `SELECT id, title, price FROM payment_contents WHERE id = $1`,
      [cid]
    );
    if (c.rowCount === 0) {
      return res.status(404).json({ success: false, message: '콘텐츠를 찾을 수 없습니다.' });
    }
    const content = c.rows[0];

    // 이미 구매한 콘텐츠인지 확인
    const already = await pool.query(
      `SELECT id FROM payment_purchases
        WHERE user_id = $1 AND content_id = $2 AND status = 'confirmed'
        LIMIT 1`,
      [req.user.id, cid]
    );
    if (already.rowCount > 0) {
      return res.status(409).json({ success: false, message: '이미 구매한 콘텐츠입니다.' });
    }

    const insert = await pool.query(
      `INSERT INTO payment_purchases (user_id, content_id, amount)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, cid, content.price]
    );
    const row = insert.rows[0];

    // Toss orderId 부여
    const tossOrderId = `NEWSLETTER_${row.id}_${Date.now()}`;
    const updated = await pool.query(
      `UPDATE payment_purchases SET toss_order_id = $1 WHERE id = $2 RETURNING *`,
      [tossOrderId, row.id]
    );

    return res.status(201).json({
      success: true,
      data: { ...updated.rows[0], content_title: content.title },
    });
  } catch (err) {
    console.error('[POST /api/orders]', err);
    return res.status(500).json({ success: false, message: '결제 준비 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 결제 승인 (서버에서 Toss API 호출 — Secret Key는 서버에만 존재)
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

    const purchaseResult = await pool.query(
      `SELECT * FROM payment_purchases WHERE toss_order_id = $1`,
      [orderId]
    );
    if (purchaseResult.rowCount === 0) {
      return res.status(404).json({ success: false, message: '해당 결제 건을 찾을 수 없습니다.' });
    }
    const purchase = purchaseResult.rows[0];

    if (purchase.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: '본인의 결제만 승인할 수 있습니다.' });
    }
    if (Number(purchase.amount) !== amountNum) {
      return res.status(400).json({
        success: false,
        message: '결제 금액이 주문 금액과 일치하지 않습니다.',
      });
    }
    if (purchase.status === 'confirmed' && purchase.payment_key === paymentKey) {
      return res.json({ success: true, data: { alreadyConfirmed: true, purchase } });
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
      `UPDATE payment_purchases
         SET status = 'confirmed', payment_key = $1, confirmed_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [paymentKey, purchase.id]
    );
    return res.json({
      success: true,
      data: { purchase: updated.rows[0], payment: tossData },
    });
  } catch (err) {
    console.error('[POST /api/payments/confirm]', err);
    return res.status(500).json({ success: false, message: '결제 승인 처리 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// 구매 이력 — 본인 것만, 콘텐츠 정보 join
// =============================================================================
app.get('/api/purchases', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.amount, p.status, p.toss_order_id, p.confirmed_at, p.created_at,
              c.id AS content_id, c.title AS content_title, c.issue_label, c.preview
         FROM payment_purchases p
         JOIN payment_contents c ON c.id = p.content_id
        WHERE p.user_id = $1
        ORDER BY p.id DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[GET /api/purchases]', err);
    return res.status(500).json({ success: false, message: '구매 이력 조회 중 오류가 발생했습니다.' });
  }
});

// =============================================================================
// API 404 + SPA fallback + 에러 핸들러
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
  });
}

module.exports = app;
