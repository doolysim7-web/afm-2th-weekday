/**
 * 작목 hero 이미지 재생성 스크립트
 * - 작목별로 색·이모지·배치를 다르게 한 귀여운 SVG 카드 생성
 * - ImageKit에 업로드 → DB의 hero_image_url 갱신
 *
 * 실행: node regen_images.js
 */
require('dotenv').config();
const ImageKit = require('imagekit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const PFX = 'small_forest_';
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
// 작목별 디자인 (sky/ground 색 + 메인 이모지 + 데코레이션)
// ---------------------------------------------------------------------------
// 각 데코레이션: { e: '이모지', x, y, size, rotate?, opacity? }
const DESIGNS = {
  '상추': {
    skyTop: '#ecfdf5', skyBot: '#d1fae5',
    groundTop: '#86efac', groundBot: '#4ade80',
    main: { e: '🥬', x: 400, y: 510, size: 280 },
    deco: [
      { e: '🌱', x: 150, y: 560, size: 90 },
      { e: '🌱', x: 640, y: 550, size: 100 },
      { e: '🦋', x: 200, y: 240, size: 60, rotate: -15 },
      { e: '☁️', x: 600, y: 180, size: 70 },
    ],
  },
  '깻잎': {
    skyTop: '#f7fee7', skyBot: '#d9f99d',
    groundTop: '#84cc16', groundBot: '#4d7c0f',
    main: { e: '🌿', x: 400, y: 500, size: 300 },
    deco: [
      { e: '🌿', x: 170, y: 540, size: 110, rotate: -20 },
      { e: '🌿', x: 630, y: 530, size: 120, rotate: 20 },
      { e: '🦋', x: 180, y: 230, size: 70 },
    ],
  },
  '부추': {
    skyTop: '#f0fdf4', skyBot: '#bbf7d0',
    groundTop: '#a3e635', groundBot: '#65a30d',
    main: { e: '🌱', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🌱', x: 220, y: 540, size: 130, rotate: -8 },
      { e: '🌱', x: 580, y: 540, size: 130, rotate: 8 },
      { e: '💧', x: 170, y: 280, size: 50 },
      { e: '💧', x: 650, y: 320, size: 45, opacity: 0.85 },
    ],
  },
  '쪽파': {
    skyTop: '#fefce8', skyBot: '#fef3c7',
    groundTop: '#fde68a', groundBot: '#f59e0b',
    main: { e: '🧅', x: 400, y: 510, size: 280 },
    deco: [
      { e: '🌱', x: 200, y: 560, size: 110 },
      { e: '🌱', x: 600, y: 560, size: 110 },
      { e: '☀️', x: 670, y: 160, size: 90 },
    ],
  },
  '시금치': {
    skyTop: '#ecfdf5', skyBot: '#a7f3d0',
    groundTop: '#34d399', groundBot: '#047857',
    main: { e: '🥬', x: 400, y: 510, size: 280 },
    deco: [
      { e: '🌱', x: 210, y: 560, size: 100 },
      { e: '🌱', x: 590, y: 560, size: 100 },
      { e: '🦋', x: 180, y: 270, size: 55 },
    ],
  },
  '쑥갓': {
    skyTop: '#f7fee7', skyBot: '#ecfccb',
    groundTop: '#bef264', groundBot: '#65a30d',
    main: { e: '🌾', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🌾', x: 200, y: 530, size: 110, rotate: -10 },
      { e: '🌾', x: 600, y: 530, size: 110, rotate: 10 },
      { e: '🦋', x: 200, y: 250, size: 60, rotate: -10 },
    ],
  },
  '케일': {
    skyTop: '#f0fdf4', skyBot: '#bbf7d0',
    groundTop: '#4ade80', groundBot: '#16a34a',
    main: { e: '🥬', x: 400, y: 500, size: 300 },
    deco: [
      { e: '🌱', x: 200, y: 560, size: 100 },
      { e: '🌱', x: 600, y: 560, size: 100 },
      { e: '✨', x: 660, y: 270, size: 50 },
      { e: '✨', x: 180, y: 320, size: 40 },
      { e: '☀️', x: 690, y: 150, size: 80 },
    ],
  },
  '고추': {
    skyTop: '#fff5ec', skyBot: '#ffe4e6',
    groundTop: '#fb7185', groundBot: '#dc2626',
    main: { e: '🌶️', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🌶️', x: 200, y: 540, size: 130, rotate: -25 },
      { e: '🌶️', x: 600, y: 540, size: 130, rotate: 25 },
      { e: '🌼', x: 180, y: 280, size: 60 },
      { e: '☀️', x: 670, y: 160, size: 80 },
    ],
  },
  '토마토': {
    skyTop: '#fff7ed', skyBot: '#fee2e2',
    groundTop: '#fb923c', groundBot: '#dc2626',
    main: { e: '🍅', x: 400, y: 500, size: 280 },
    deco: [
      { e: '🍅', x: 200, y: 540, size: 130 },
      { e: '🍅', x: 600, y: 540, size: 130 },
      { e: '🌻', x: 175, y: 270, size: 75 },
      { e: '🌿', x: 670, y: 290, size: 70 },
    ],
  },
  '가지': {
    skyTop: '#faf5ff', skyBot: '#f3e8ff',
    groundTop: '#c084fc', groundBot: '#7e22ce',
    main: { e: '🍆', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🍆', x: 200, y: 540, size: 130, rotate: -15 },
      { e: '🍆', x: 600, y: 540, size: 130, rotate: 15 },
      { e: '🌼', x: 175, y: 270, size: 60 },
      { e: '☀️', x: 670, y: 160, size: 80 },
    ],
  },
  '오이': {
    skyTop: '#ecfeff', skyBot: '#cffafe',
    groundTop: '#5eead4', groundBot: '#0e7490',
    main: { e: '🥒', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🥒', x: 190, y: 540, size: 130, rotate: -25 },
      { e: '🥒', x: 610, y: 540, size: 130, rotate: 25 },
      { e: '💧', x: 175, y: 270, size: 60 },
      { e: '💧', x: 660, y: 320, size: 50, opacity: 0.85 },
      { e: '💧', x: 670, y: 220, size: 35, opacity: 0.8 },
    ],
  },
  '무': {
    skyTop: '#fefce8', skyBot: '#fef9c3',
    groundTop: '#fde68a', groundBot: '#d97706',
    main: { e: '🥕', x: 400, y: 510, size: 290 },
    deco: [
      { e: '🥕', x: 200, y: 540, size: 130, rotate: -10 },
      { e: '🥕', x: 600, y: 540, size: 130, rotate: 10 },
      { e: '🌱', x: 175, y: 280, size: 65 },
      { e: '🌱', x: 670, y: 320, size: 60 },
    ],
  },
};

function buildSvg(name, category, design) {
  const sky = design.skyTop, sky2 = design.skyBot;
  const grd = design.groundTop, grd2 = design.groundBot;
  const m = design.main;
  const safe = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const decoSvg = design.deco.map((d) => {
    const opacity = d.opacity ?? 1;
    const transform = d.rotate ? ` transform="rotate(${d.rotate} ${d.x} ${d.y})"` : '';
    return `<text x="${d.x}" y="${d.y}" font-size="${d.size}" text-anchor="middle" dominant-baseline="middle" opacity="${opacity}" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif"${transform}>${d.e}</text>`;
  }).join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sky}"/>
      <stop offset="100%" stop-color="${sky2}"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${grd}" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="${grd2}" stop-opacity="0.6"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dx="0" dy="8"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- 카드 배경 (둥근 모서리) -->
  <rect width="800" height="800" rx="40" fill="url(#sky)"/>

  <!-- 구름 (살짝) -->
  <ellipse cx="180" cy="180" rx="80" ry="22" fill="#ffffff" opacity="0.55"/>
  <ellipse cx="240" cy="200" rx="50" ry="16" fill="#ffffff" opacity="0.55"/>

  <!-- 땅 (둥근 곡선) -->
  <path d="M 0 600 Q 400 540 800 600 L 800 800 L 0 800 Z" fill="url(#ground)"/>

  <!-- 그림자 -->
  <ellipse cx="400" cy="660" rx="240" ry="22" fill="#000" opacity="0.08"/>

  <!-- 메인 이모지 후광 -->
  <circle cx="${m.x}" cy="${m.y - 70}" r="190" fill="url(#halo)"/>

  <!-- 데코레이션 -->
  ${decoSvg}

  <!-- 메인 이모지 (그림자 적용) -->
  <g filter="url(#soft)">
    <text x="${m.x}" y="${m.y}" font-size="${m.size}" text-anchor="middle" dominant-baseline="middle"
          font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${m.e}</text>
  </g>

  <!-- 이름 배지 -->
  <rect x="220" y="690" width="360" height="74" rx="37" fill="#ffffff" opacity="0.96" filter="url(#soft)"/>
  <text x="400" y="725" font-size="30" font-weight="800" text-anchor="middle"
        font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" fill="#2c3a25">${safe(name)}</text>
  <text x="400" y="752" font-size="14" text-anchor="middle"
        font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" fill="#67ac57">${safe(category)} · 꼬꼬마텃밭 🌱</text>
</svg>`;
}

async function uploadAndUpdate(crop) {
  const design = DESIGNS[crop.name_ko];
  if (!design) {
    console.log(`  · 스킵: ${crop.name_ko} (디자인 없음)`);
    return;
  }
  const svg = buildSvg(crop.name_ko, crop.category, design);
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  const r = await imagekit.upload({
    file: base64,
    fileName: `${(crop.name_en || crop.name_ko).toLowerCase().replace(/[^a-z0-9]/g, '_')}_v2.svg`,
    folder: '/little-farm/crops/v2',
    useUniqueFileName: true,
  });
  await pool.query(
    `UPDATE ${PFX}crops SET hero_image_url = $1 WHERE id = $2`,
    [r.url, crop.id]
  );
  console.log(`  ✓ ${design.main.e}  ${crop.name_ko}  →  ${r.url}`);
}

async function main() {
  const r = await pool.query(`SELECT id, name_ko, name_en, category FROM ${PFX}crops ORDER BY id`);
  console.log(`작목 ${r.rows.length}개 → 귀엽게 다시 그리는 중...\n`);
  for (const c of r.rows) {
    await uploadAndUpdate(c);
  }
  console.log('\n✔ 완료. 페이지 새로고침하시면 적용돼요 🌱');
  await pool.end();
}

main().catch((e) => {
  console.error('실패:', e);
  pool.end();
  process.exit(1);
});
