/**
 * Seed script — ImageKit으로 각 상품에 맞는 SVG 썸네일을 생성/업로드하고
 * 샘플 사용자 + 상품을 DB(carrot_mkt_*)에 시딩합니다.
 *
 * 사용:
 *   1) npm install
 *   2) node seed.js
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const ImageKit = require('imagekit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (val) => (val === null ? null : parseInt(val, 10)));

const TABLE_PREFIX = 'carrot_mkt_';
const T = {
  users: `${TABLE_PREFIX}users`,
  products: `${TABLE_PREFIX}products`,
  images: `${TABLE_PREFIX}product_images`,
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

const USERS = [
  { email: 'minji@carrot.test',  password: 'carrot123', nickname: '민지', neighborhood: '역삼동', avatar_emoji: '🦊' },
  { email: 'jihoon@carrot.test', password: 'carrot123', nickname: '지훈', neighborhood: '서교동', avatar_emoji: '🐻' },
  { email: 'soyeon@carrot.test', password: 'carrot123', nickname: '소연', neighborhood: '망원동', avatar_emoji: '🐰' },
];

const PRODUCTS = [
  { sellerEmail: 'minji@carrot.test',  title: '아이패드 프로 11인치 거의 새것',     price: 850000, category: '디지털기기',     emoji: '📱', bg: '#fff5ec', desc: '작년에 구매한 아이패드 프로입니다. 박스/충전기 모두 있고 액정 깨끗해요.\n직거래 환영, 시세대비 저렴하게 내놓아요.' },
  { sellerEmail: 'jihoon@carrot.test', title: 'LG 스타일러 SC5MBR60',                price: 450000, category: '생활가전',     emoji: '🧥', bg: '#e0f2fe', desc: '2년 사용한 LG 스타일러입니다. 사용감 있지만 동작 깨끗해요.' },
  { sellerEmail: 'soyeon@carrot.test', title: '이케아 빌리 책장 (화이트)',           price: 35000,  category: '가구/인테리어', emoji: '📚', bg: '#fef3c7', desc: '이사로 정리합니다. 흠집 거의 없고 직접 가져가시는 분 우대.' },
  { sellerEmail: 'minji@carrot.test',  title: '구찌 마몬트 숄더백 정품',              price: 980000, category: '의류',         emoji: '👜', bg: '#fae8ff', desc: '백화점 구매 정품. 더스트백/카드 전부 보유. 사진보다 실물이 더 예뻐요.' },
  { sellerEmail: 'jihoon@carrot.test', title: '닌텐도 스위치 OLED + 게임 3종',        price: 320000, category: '취미/게임',     emoji: '🎮', bg: '#dcfce7', desc: '제로다 와일드, 마리오 카트, 동물의 숲 포함! 직거래 가능' },
  { sellerEmail: 'soyeon@carrot.test', title: '몬스테라 알보 (희귀종, 잎 4장)',        price: 120000, category: '식물',         emoji: '🪴', bg: '#bbf7d0', desc: '직접 키운 몬스테라 알보. 무늬 예쁘고 건강합니다.' },
  { sellerEmail: 'minji@carrot.test',  title: '랑콤 제니피크 50ml 미개봉',             price: 90000,  category: '뷰티/미용',     emoji: '💄', bg: '#fce7f3', desc: '면세점에서 구매한 미개봉 제품. 유통기한 24년까지' },
  { sellerEmail: 'jihoon@carrot.test', title: '해리포터 양장본 전 7권 세트',           price: 60000,  category: '도서',         emoji: '📖', bg: '#fde68a', desc: '한 번 읽고 보관만 했어요. 책장에 그대로 꽂혀있던 상태.' },
  { sellerEmail: 'soyeon@carrot.test', title: '나눔합니다 - 다 쓴 향초 유리병',         price: 0,      category: '기타',         emoji: '🕯️', bg: '#f3f4f6', desc: '깨끗이 닦아 두었어요. 화분이나 수납으로 활용 가능합니다.' },
];

function buildSvg({ title, emoji, bg }) {
  // 800x800 SVG with subtle gradient + big emoji + title text
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <text x="400" y="380" font-size="280" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${emoji}</text>
  <text x="400" y="600" font-size="42" text-anchor="middle" font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" font-weight="700" fill="#222">${safeTitle.length > 18 ? safeTitle.slice(0, 17) + '…' : safeTitle}</text>
  <text x="400" y="660" font-size="22" text-anchor="middle" font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" fill="#888">🥕 당근마켓</text>
</svg>`;
}

async function uploadSvg({ title, emoji, bg }) {
  const svg = buildSvg({ title, emoji, bg });
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  const fileName = `seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.svg`;
  const uploaded = await imagekit.upload({
    file: base64,
    fileName,
    folder: '/carrot-market/seed',
    useUniqueFileName: true,
  });
  return uploaded.url;
}

async function ensureUser({ email, password, nickname, neighborhood, avatar_emoji }) {
  const existing = await pool.query(`SELECT id FROM ${T.users} WHERE email = $1`, [email]);
  if (existing.rows[0]) return existing.rows[0].id;
  const hash = await bcrypt.hash(password, 10);
  const r = await pool.query(
    `INSERT INTO ${T.users} (email, password_hash, nickname, neighborhood, avatar_emoji)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [email, hash, nickname, neighborhood, avatar_emoji]
  );
  return r.rows[0].id;
}

async function ensureSchema() {
  // server.js의 initDB와 동일한 스키마를 보장
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.users} (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      avatar_emoji TEXT NOT NULL DEFAULT '🥕',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.products} (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      price INTEGER NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.images} (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES ${T.products}(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
}

async function main() {
  console.log('▶ schema ensure...');
  await ensureSchema();

  console.log('▶ users seeding...');
  const userIdByEmail = {};
  for (const u of USERS) {
    userIdByEmail[u.email] = await ensureUser(u);
    console.log(`  · ${u.nickname} (${u.email}) → id=${userIdByEmail[u.email]}`);
  }

  // 이미 시드된 적이 있으면 (제목 일치) 건너뛰기
  const existingTitles = new Set(
    (await pool.query(`SELECT title FROM ${T.products} WHERE title = ANY($1)`, [PRODUCTS.map((p) => p.title)])).rows.map((r) => r.title)
  );

  console.log('▶ products + ImageKit upload...');
  for (const p of PRODUCTS) {
    if (existingTitles.has(p.title)) {
      console.log(`  · skip (already seeded): ${p.title}`);
      continue;
    }
    const userId = userIdByEmail[p.sellerEmail];
    const userR = await pool.query(`SELECT neighborhood FROM ${T.users} WHERE id = $1`, [userId]);
    const neighborhood = userR.rows[0].neighborhood;

    const url = await uploadSvg({ title: p.title, emoji: p.emoji, bg: p.bg });

    await pool.query('BEGIN');
    try {
      const ins = await pool.query(
        `INSERT INTO ${T.products} (user_id, title, price, description, category, neighborhood)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, p.title, p.price, p.desc, p.category, neighborhood]
      );
      const pid = ins.rows[0].id;
      await pool.query(
        `INSERT INTO ${T.images} (product_id, url, position) VALUES ($1, $2, 0)`,
        [pid, url]
      );
      await pool.query('COMMIT');
      console.log(`  ✓ ${p.title} → ${url}`);
    } catch (e) {
      await pool.query('ROLLBACK').catch(() => {});
      throw e;
    }
  }

  console.log('\n✔ seed 완료');
  console.log('\n로그인 계정 (모두 비밀번호: carrot123)');
  for (const u of USERS) console.log(`  · ${u.email} (${u.nickname} · ${u.neighborhood})`);

  await pool.end();
}

main().catch((err) => {
  console.error('seed 실패:', err);
  pool.end();
  process.exit(1);
});
