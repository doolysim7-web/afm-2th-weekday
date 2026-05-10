/**
 * 꼬꼬마텃밭 시드 스크립트
 * - 관리자 1명 + 일반 회원 3명
 * - 작목 12개 (5/10/20평 환산 포함)
 * - 작목별 월별 작업 시드 (총 ~70건)
 * - 작목 hero 이미지를 ImageKit에 SVG로 업로드 → URL 저장
 * - 샘플 일지 5건, 가계부 6건, 게시판 4건
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const ImageKit = require('imagekit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const PFX = 'small_forest_';
const T = {
  users: `${PFX}users`,
  crops: `${PFX}crops`,
  cropTasks: `${PFX}crop_tasks`,
  userCrops: `${PFX}user_crops`,
  logs: `${PFX}logs`,
  budgets: `${PFX}budgets`,
  posts: `${PFX}posts`,
  comments: `${PFX}comments`,
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
// 시드 데이터
// ---------------------------------------------------------------------------
const USERS = [
  { email: 'admin@littlefarm.test',  password: 'admin1234', display_name: '꼬꼬마지기', avatar_emoji: '👑', region_sido: '서울특별시', region_sigungu: '본사', role: 'admin' },
  { email: 'haneul@littlefarm.test', password: 'farmer123', display_name: '하늘아빠',   avatar_emoji: '🦊', region_sido: '경기도',     region_sigungu: '남양주시' },
  { email: 'minji@littlefarm.test',  password: 'farmer123', display_name: '민지네텃밭', avatar_emoji: '🐰', region_sido: '서울특별시', region_sigungu: '강서구' },
  { email: 'jisoo@littlefarm.test',  password: 'farmer123', display_name: '지수의주말', avatar_emoji: '🌻', region_sido: '경기도',     region_sigungu: '용인시' },
];

const CROPS = [
  { name_ko: '상추', name_en: 'Lettuce', category: '엽채', season_start_month: 3, season_end_month: 10, sunlight: '반양지', water_freq_days: 2, soil_pref: '배수 좋은 사양토', beginner_friendly: true,
    summary_md: '심자마자 4주 만에 첫 수확. 텃밭 입문 1순위. 잎을 따도 새 잎이 계속 나와요.', emoji: '🥬', bg: '#dcfce7' },
  { name_ko: '깻잎', name_en: 'Perilla', category: '엽채', season_start_month: 4, season_end_month: 10, sunlight: '양지', water_freq_days: 2, soil_pref: '비옥한 토양', beginner_friendly: true,
    summary_md: '잎 향이 진하고 한 번 심으면 가을까지 계속 따 먹어요.', emoji: '🌿', bg: '#bbf7d0' },
  { name_ko: '부추', name_en: 'Chives', category: '엽채', season_start_month: 3, season_end_month: 11, sunlight: '반양지', water_freq_days: 3, soil_pref: '약알칼리성', beginner_friendly: true,
    summary_md: '한 번 자리잡으면 매년 다시 올라와요. 다년생 효자.', emoji: '🌱', bg: '#d9f99d' },
  { name_ko: '쪽파', name_en: 'Green Onion', category: '엽채', season_start_month: 3, season_end_month: 11, sunlight: '양지', water_freq_days: 3, soil_pref: '배수 좋은 토양', beginner_friendly: true,
    summary_md: '심고 3주면 한 단. 김치·장아찌·국 어디든.', emoji: '🧅', bg: '#fef3c7' },
  { name_ko: '시금치', name_en: 'Spinach', category: '엽채', season_start_month: 3, season_end_month: 5, sunlight: '반양지', water_freq_days: 2, soil_pref: '중성 비옥', beginner_friendly: false,
    summary_md: '봄 또는 가을. 더위에 약하니 5월 안에 수확.', emoji: '🥬', bg: '#a7f3d0' },
  { name_ko: '쑥갓', name_en: 'Crown Daisy', category: '엽채', season_start_month: 3, season_end_month: 10, sunlight: '반양지', water_freq_days: 2, soil_pref: '배수 좋은 토양', beginner_friendly: true,
    summary_md: '쌈채소·전골 단골. 잎 향이 강해 친구에게 자랑하기 좋아요.', emoji: '🌾', bg: '#ecfccb' },
  { name_ko: '케일', name_en: 'Kale', category: '엽채', season_start_month: 3, season_end_month: 10, sunlight: '양지', water_freq_days: 2, soil_pref: '비옥', beginner_friendly: false,
    summary_md: '슈퍼푸드. 가운데 잎부터 따면 계속 새 잎이 나와요.', emoji: '🥬', bg: '#bef264' },
  { name_ko: '고추', name_en: 'Chili Pepper', category: '과채', season_start_month: 4, season_end_month: 10, sunlight: '양지', water_freq_days: 2, soil_pref: '비옥·배수 좋음', beginner_friendly: true,
    summary_md: '5평에 10그루면 한 가족이 다 못 먹을 만큼. 7월 본격 수확.', emoji: '🌶️', bg: '#fee2e2' },
  { name_ko: '토마토', name_en: 'Tomato', category: '과채', season_start_month: 4, season_end_month: 9, sunlight: '양지', water_freq_days: 3, soil_pref: '비옥', beginner_friendly: true,
    summary_md: '방울토마토 2~3그루로도 매주 한 그릇. 지지대 필수.', emoji: '🍅', bg: '#fecaca' },
  { name_ko: '가지', name_en: 'Eggplant', category: '과채', season_start_month: 5, season_end_month: 9, sunlight: '양지', water_freq_days: 3, soil_pref: '비옥', beginner_friendly: false,
    summary_md: '여름 햇볕이 강할수록 수확량 증가. 줄기 약하니 받침 필수.', emoji: '🍆', bg: '#e9d5ff' },
  { name_ko: '오이', name_en: 'Cucumber', category: '과채', season_start_month: 4, season_end_month: 9, sunlight: '양지', water_freq_days: 1, soil_pref: '비옥', beginner_friendly: true,
    summary_md: '하루 한 번 물! 6월부터 매일 한두 개씩 따요.', emoji: '🥒', bg: '#dcfce7' },
  { name_ko: '무', name_en: 'Radish', category: '근채', season_start_month: 8, season_end_month: 11, sunlight: '양지', water_freq_days: 3, soil_pref: '깊고 부드러운 흙', beginner_friendly: true,
    summary_md: '가을 김장 무. 8월 말 파종 → 11월 수확.', emoji: '🥕', bg: '#fef3c7' },
];

// 작목별 작업 시드 (월 → [{task_type, week_in_month, instructions, per_5/10/20}])
function tasksFor(name) {
  switch (name) {
    case '상추':
      return [
        [3, 3, '모종', '모판에서 본잎 4~5장이면 옮겨심기. 줄간격 25cm', '6포기', '12포기', '24포기'],
        [4, 1, '시비', '뿌리 활착 후 약한 액비 1주일 간격', '액비 1리터', '2리터', '4리터'],
        [4, 3, '수확', '바깥 잎부터 한 장씩 따기 (속잎 보존)', '하루 한 줌', '두 줌', '네 줌'],
        [5, 2, '풀뽑기', '비 온 뒤 흙이 부드러울 때 손으로 뽑기', '15분', '30분', '60분'],
        [6, 1, '병해충관리', '잎이 너무 붙으면 통풍 위해 솎기. 진딧물 시 분무기 물로 씻기', '', '', ''],
      ];
    case '깻잎':
      return [
        [4, 4, '모종', '낮 기온 18°C 이상에서 심기. 줄간격 30cm', '5포기', '10포기', '20포기'],
        [5, 3, '시비', '복합비료 한 줌씩 포기 옆에 흙으로 덮기', '소량', '한 컵', '두 컵'],
        [6, 1, '수확', '잎이 손바닥만 해지면 줄기에서 5~6번째 잎부터', '주 2회', '주 3회', '매일'],
        [7, 2, '병해충관리', '응애·진딧물 점검. 노란 잎은 빨리 제거', '', '', ''],
      ];
    case '부추':
      return [
        [3, 4, '모종', '한 자리에 심으면 2~3년 재수확. 줄간격 20cm', '한 단', '두 단', '네 단'],
        [5, 1, '수확', '15cm 이상 자라면 밑동 2cm 남기고 칼로 자르기', '한 줌', '두 줌', '네 줌'],
        [7, 1, '시비', '여름 후 추비. 깻묵·요소 적당량', '', '', ''],
        [9, 2, '수확', '가을 마지막 부추는 향이 진해요', '', '', ''],
      ];
    case '쪽파':
      return [
        [3, 2, '모종', '쪽파 종구 한 알씩 5cm 깊이. 줄간격 15cm', '50구', '100구', '200구'],
        [4, 3, '수확', '잎이 25cm 이상이면 뿌리째 뽑기', '한 단', '두 단', '네 단'],
        [9, 1, '모종', '가을 파종 — 김장철 양념용', '', '', ''],
      ];
    case '시금치':
      return [
        [3, 2, '모종', '씨앗 줄뿌림. 줄간격 20cm. 4~5일이면 발아', '한 줄', '두 줄', '네 줄'],
        [4, 2, '수확', '잎 7~8장이면 통째로 뽑거나 잎만 따기', '주 1회', '주 2회', '주 3회'],
        [5, 1, '병해충관리', '더워지면 빨리 꽃대 → 늦으면 안 됨', '', '', ''],
      ];
    case '쑥갓':
      return [
        [3, 3, '모종', '씨앗 흩뿌림 후 흙 살짝 덮기', '한 줄', '두 줄', '네 줄'],
        [5, 1, '수확', '잎이 손바닥만 하면 가위로 윗잎만 따기', '', '', ''],
        [6, 2, '풀뽑기', '잡초와 쑥갓 잎이 비슷해 헷갈림 주의', '', '', ''],
      ];
    case '케일':
      return [
        [3, 4, '모종', '본잎 5~6장 모종. 줄간격 40cm. 자리 넉넉히', '4포기', '8포기', '16포기'],
        [5, 1, '시비', '질소 비료 한 번', '', '', ''],
        [6, 1, '수확', '바깥 큰 잎부터 (속잎 절대 X)', '주 1회', '주 2회', '주 3회'],
        [8, 1, '병해충관리', '배추흰나비 알 점검 — 잎 뒷면', '', '', ''],
      ];
    case '고추':
      return [
        [4, 3, '모종', '서리 끝난 후. 줄간격 50cm. 지지대 같이 박기', '5그루', '10그루', '20그루'],
        [5, 2, '시비', '꽃 피면 추비. 복합비료 한 줌', '', '', ''],
        [6, 1, '관수', '가뭄에 약함. 1주 비 안 오면 듬뿍', '', '', ''],
        [7, 1, '수확', '풋고추는 7월부터, 빨간고추는 9월부터', '주 2~3회', '주 4~5회', '매일'],
        [8, 1, '병해충관리', '탄저병 — 빨간고추가 검게 뭉개지면 즉시 제거', '', '', ''],
      ];
    case '토마토':
      return [
        [4, 4, '모종', '서리 끝난 후. 키 50cm 지지대 동시 설치. 줄간격 60cm', '3그루', '6그루', '12그루'],
        [5, 3, '시비', '곁순 따주기 + 1주 후 추비', '', '', ''],
        [6, 1, '관수', '꽃 핀 뒤엔 물 줄여 단맛 끌어올리기', '', '', ''],
        [6, 4, '수확', '꼭지가 노랗게 변하기 시작하면 따기', '주 2회', '주 3회', '매일'],
        [7, 2, '병해충관리', '잎곰팡이병 — 아랫잎 정리해 통풍', '', '', ''],
      ];
    case '가지':
      return [
        [5, 1, '모종', '낮 기온 20°C 안정 후. 줄간격 60cm', '3그루', '6그루', '12그루'],
        [6, 2, '시비', '꽃 핀 뒤 추비', '', '', ''],
        [7, 1, '수확', '연하고 광택 있을 때 따기 (오래 두면 단단)', '주 2회', '주 3회', '주 4회'],
      ];
    case '오이':
      return [
        [4, 4, '모종', '지지대·오이망 함께 설치. 줄간격 60cm', '4그루', '8그루', '16그루'],
        [5, 3, '시비', '본잎 5장에 추비. 곁순 따기', '', '', ''],
        [6, 1, '관수', '하루 한 번 듬뿍 (특히 결실기)', '', '', ''],
        [6, 2, '수확', '15~20cm일 때 따기. 늦으면 씨가 굵어짐', '매일', '매일', '하루 2회'],
      ];
    case '무':
      return [
        [8, 4, '모종', '씨앗 한 구멍에 3알 → 본잎 2장이면 1포기 솎기. 줄간격 25cm', '한 줄', '두 줄', '네 줄'],
        [9, 3, '풀뽑기', '잡초 무성해지면 무 뿌리 굵어지지 못함', '', '', ''],
        [10, 1, '시비', '뿌리 굵어지는 시기 추비', '', '', ''],
        [11, 1, '수확', '잎 끝이 노래지면 뽑기. 11월 안에 마무리', '한 단', '두 단', '네 단'],
      ];
    default:
      return [];
  }
}

// 작목별 귀여운 hero 디자인 (regen_images.js와 동일 — 새 설치 시 적용)
const HERO_DESIGNS = {
  '상추':   { skyTop:'#ecfdf5', skyBot:'#d1fae5', groundTop:'#86efac', groundBot:'#4ade80', main:{e:'🥬',x:400,y:510,size:280}, deco:[{e:'🌱',x:150,y:560,size:90},{e:'🌱',x:640,y:550,size:100},{e:'🦋',x:200,y:240,size:60,rotate:-15},{e:'☁️',x:600,y:180,size:70}] },
  '깻잎':   { skyTop:'#f7fee7', skyBot:'#d9f99d', groundTop:'#84cc16', groundBot:'#4d7c0f', main:{e:'🌿',x:400,y:500,size:300}, deco:[{e:'🌿',x:170,y:540,size:110,rotate:-20},{e:'🌿',x:630,y:530,size:120,rotate:20},{e:'🦋',x:180,y:230,size:70}] },
  '부추':   { skyTop:'#f0fdf4', skyBot:'#bbf7d0', groundTop:'#a3e635', groundBot:'#65a30d', main:{e:'🌱',x:400,y:510,size:290}, deco:[{e:'🌱',x:220,y:540,size:130,rotate:-8},{e:'🌱',x:580,y:540,size:130,rotate:8},{e:'💧',x:170,y:280,size:50},{e:'💧',x:650,y:320,size:45,opacity:0.85}] },
  '쪽파':   { skyTop:'#fefce8', skyBot:'#fef3c7', groundTop:'#fde68a', groundBot:'#f59e0b', main:{e:'🧅',x:400,y:510,size:280}, deco:[{e:'🌱',x:200,y:560,size:110},{e:'🌱',x:600,y:560,size:110},{e:'☀️',x:670,y:160,size:90}] },
  '시금치': { skyTop:'#ecfdf5', skyBot:'#a7f3d0', groundTop:'#34d399', groundBot:'#047857', main:{e:'🥬',x:400,y:510,size:280}, deco:[{e:'🌱',x:210,y:560,size:100},{e:'🌱',x:590,y:560,size:100},{e:'🦋',x:180,y:270,size:55}] },
  '쑥갓':   { skyTop:'#f7fee7', skyBot:'#ecfccb', groundTop:'#bef264', groundBot:'#65a30d', main:{e:'🌾',x:400,y:510,size:290}, deco:[{e:'🌾',x:200,y:530,size:110,rotate:-10},{e:'🌾',x:600,y:530,size:110,rotate:10},{e:'🦋',x:200,y:250,size:60,rotate:-10}] },
  '케일':   { skyTop:'#f0fdf4', skyBot:'#bbf7d0', groundTop:'#4ade80', groundBot:'#16a34a', main:{e:'🥬',x:400,y:500,size:300}, deco:[{e:'🌱',x:200,y:560,size:100},{e:'🌱',x:600,y:560,size:100},{e:'✨',x:660,y:270,size:50},{e:'✨',x:180,y:320,size:40},{e:'☀️',x:690,y:150,size:80}] },
  '고추':   { skyTop:'#fff5ec', skyBot:'#ffe4e6', groundTop:'#fb7185', groundBot:'#dc2626', main:{e:'🌶️',x:400,y:510,size:290}, deco:[{e:'🌶️',x:200,y:540,size:130,rotate:-25},{e:'🌶️',x:600,y:540,size:130,rotate:25},{e:'🌼',x:180,y:280,size:60},{e:'☀️',x:670,y:160,size:80}] },
  '토마토': { skyTop:'#fff7ed', skyBot:'#fee2e2', groundTop:'#fb923c', groundBot:'#dc2626', main:{e:'🍅',x:400,y:500,size:280}, deco:[{e:'🍅',x:200,y:540,size:130},{e:'🍅',x:600,y:540,size:130},{e:'🌻',x:175,y:270,size:75},{e:'🌿',x:670,y:290,size:70}] },
  '가지':   { skyTop:'#faf5ff', skyBot:'#f3e8ff', groundTop:'#c084fc', groundBot:'#7e22ce', main:{e:'🍆',x:400,y:510,size:290}, deco:[{e:'🍆',x:200,y:540,size:130,rotate:-15},{e:'🍆',x:600,y:540,size:130,rotate:15},{e:'🌼',x:175,y:270,size:60},{e:'☀️',x:670,y:160,size:80}] },
  '오이':   { skyTop:'#ecfeff', skyBot:'#cffafe', groundTop:'#5eead4', groundBot:'#0e7490', main:{e:'🥒',x:400,y:510,size:290}, deco:[{e:'🥒',x:190,y:540,size:130,rotate:-25},{e:'🥒',x:610,y:540,size:130,rotate:25},{e:'💧',x:175,y:270,size:60},{e:'💧',x:660,y:320,size:50,opacity:0.85},{e:'💧',x:670,y:220,size:35,opacity:0.8}] },
  '무':     { skyTop:'#fefce8', skyBot:'#fef9c3', groundTop:'#fde68a', groundBot:'#d97706', main:{e:'🥕',x:400,y:510,size:290}, deco:[{e:'🥕',x:200,y:540,size:130,rotate:-10},{e:'🥕',x:600,y:540,size:130,rotate:10},{e:'🌱',x:175,y:280,size:65},{e:'🌱',x:670,y:320,size:60}] },
};

function buildHeroSvg({ name, category }) {
  const d = HERO_DESIGNS[name] || HERO_DESIGNS['상추'];
  const safe = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const decoSvg = d.deco.map((x) => {
    const op = x.opacity ?? 1;
    const tr = x.rotate ? ` transform="rotate(${x.rotate} ${x.x} ${x.y})"` : '';
    return `<text x="${x.x}" y="${x.y}" font-size="${x.size}" text-anchor="middle" dominant-baseline="middle" opacity="${op}" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif"${tr}>${x.e}</text>`;
  }).join('\n  ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${d.skyTop}"/><stop offset="100%" stop-color="${d.skyBot}"/></linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${d.groundTop}" stop-opacity="0.85"/><stop offset="100%" stop-color="${d.groundBot}" stop-opacity="0.6"/></linearGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.85"/><stop offset="60%" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="8"/><feOffset dx="0" dy="8"/><feComponentTransfer><feFuncA type="linear" slope="0.18"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="800" height="800" rx="40" fill="url(#sky)"/>
  <ellipse cx="180" cy="180" rx="80" ry="22" fill="#ffffff" opacity="0.55"/>
  <ellipse cx="240" cy="200" rx="50" ry="16" fill="#ffffff" opacity="0.55"/>
  <path d="M 0 600 Q 400 540 800 600 L 800 800 L 0 800 Z" fill="url(#ground)"/>
  <ellipse cx="400" cy="660" rx="240" ry="22" fill="#000" opacity="0.08"/>
  <circle cx="${d.main.x}" cy="${d.main.y - 70}" r="190" fill="url(#halo)"/>
  ${decoSvg}
  <g filter="url(#soft)"><text x="${d.main.x}" y="${d.main.y}" font-size="${d.main.size}" text-anchor="middle" dominant-baseline="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${d.main.e}</text></g>
  <rect x="220" y="690" width="360" height="74" rx="37" fill="#ffffff" opacity="0.96" filter="url(#soft)"/>
  <text x="400" y="725" font-size="30" font-weight="800" text-anchor="middle" font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" fill="#2c3a25">${safe(name)}</text>
  <text x="400" y="752" font-size="14" text-anchor="middle" font-family="-apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" fill="#67ac57">${safe(category)} · 꼬꼬마텃밭 🌱</text>
</svg>`;
}

async function uploadHero(crop) {
  const svg = buildHeroSvg({ name: crop.name_ko, category: crop.category });
  const base64 = Buffer.from(svg, 'utf8').toString('base64');
  const r = await imagekit.upload({
    file: base64,
    fileName: `${(crop.name_en || crop.name_ko).toLowerCase().replace(/[^a-z0-9]/g, '_')}.svg`,
    folder: '/little-farm/crops/v2',
    useUniqueFileName: true,
  });
  return r.url;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function ensureSchema() {
  // server.js의 initDB 동일 로직을 호출하기 위해 require
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'seed';
  // 직접 SQL 실행으로 충분 — 핵심 9개 테이블만 ensure
  const stmts = [
    `CREATE TABLE IF NOT EXISTS ${T.users} (
       id BIGSERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
       display_name TEXT NOT NULL, avatar_emoji TEXT NOT NULL DEFAULT '🌱',
       region_sido TEXT NOT NULL DEFAULT '', region_sigungu TEXT NOT NULL DEFAULT '',
       role TEXT NOT NULL DEFAULT 'member',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.crops} (
       id BIGSERIAL PRIMARY KEY, name_ko TEXT UNIQUE NOT NULL, name_en TEXT NOT NULL DEFAULT '',
       category TEXT NOT NULL, season_start_month INT NOT NULL, season_end_month INT NOT NULL,
       sunlight TEXT NOT NULL DEFAULT '', water_freq_days INT NOT NULL DEFAULT 2,
       soil_pref TEXT NOT NULL DEFAULT '', summary_md TEXT NOT NULL DEFAULT '',
       hero_image_url TEXT NOT NULL DEFAULT '', beginner_friendly BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.cropTasks} (
       id BIGSERIAL PRIMARY KEY,
       crop_id BIGINT NOT NULL REFERENCES ${T.crops}(id) ON DELETE CASCADE,
       task_type TEXT NOT NULL, month INT NOT NULL, week_in_month INT NOT NULL DEFAULT 0,
       instructions_md TEXT NOT NULL DEFAULT '', fertilizer_recipe_md TEXT NOT NULL DEFAULT '',
       per_5pyeong_amount TEXT NOT NULL DEFAULT '', per_10pyeong_amount TEXT NOT NULL DEFAULT '',
       per_20pyeong_amount TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.userCrops} (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       crop_id BIGINT NOT NULL REFERENCES ${T.crops}(id) ON DELETE CASCADE,
       planted_at DATE NOT NULL DEFAULT CURRENT_DATE,
       area_pyeong NUMERIC(5,1) NOT NULL DEFAULT 5,
       status TEXT NOT NULL DEFAULT 'active', note TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.logs} (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       crop_id BIGINT REFERENCES ${T.crops}(id) ON DELETE SET NULL,
       log_date DATE NOT NULL DEFAULT CURRENT_DATE,
       title TEXT NOT NULL DEFAULT '', body_md TEXT NOT NULL DEFAULT '',
       image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
       weather TEXT NOT NULL DEFAULT '', mood TEXT NOT NULL DEFAULT '보통',
       visibility TEXT NOT NULL DEFAULT 'private',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.budgets} (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       kind TEXT NOT NULL, amount INT NOT NULL, category TEXT NOT NULL,
       memo TEXT NOT NULL DEFAULT '', occurred_at DATE NOT NULL DEFAULT CURRENT_DATE,
       log_id BIGINT REFERENCES ${T.logs}(id) ON DELETE SET NULL,
       receipt_image_url TEXT NOT NULL DEFAULT '',
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.posts} (
       id BIGSERIAL PRIMARY KEY,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       board TEXT NOT NULL, title TEXT NOT NULL, body_md TEXT NOT NULL DEFAULT '',
       image_urls JSONB NOT NULL DEFAULT '[]'::jsonb, hidden BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${T.comments} (
       id BIGSERIAL PRIMARY KEY,
       post_id BIGINT NOT NULL REFERENCES ${T.posts}(id) ON DELETE CASCADE,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       body TEXT NOT NULL, hidden BOOLEAN NOT NULL DEFAULT FALSE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS ${PFX}post_likes (
       post_id BIGINT NOT NULL REFERENCES ${T.posts}(id) ON DELETE CASCADE,
       user_id BIGINT NOT NULL REFERENCES ${T.users}(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (post_id, user_id))`,
  ];
  for (const s of stmts) await pool.query(s);
}

async function ensureUser(u) {
  const r0 = await pool.query(`SELECT id FROM ${T.users} WHERE email = $1`, [u.email]);
  if (r0.rows[0]) {
    if (u.role) await pool.query(`UPDATE ${T.users} SET role = $1 WHERE id = $2`, [u.role, r0.rows[0].id]);
    return r0.rows[0].id;
  }
  const hash = await bcrypt.hash(u.password, 10);
  const r = await pool.query(
    `INSERT INTO ${T.users} (email, password_hash, display_name, avatar_emoji, region_sido, region_sigungu, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [u.email, hash, u.display_name, u.avatar_emoji, u.region_sido, u.region_sigungu, u.role || 'member']
  );
  return r.rows[0].id;
}

async function ensureCrop(c) {
  const r0 = await pool.query(`SELECT id, hero_image_url FROM ${T.crops} WHERE name_ko = $1`, [c.name_ko]);
  if (r0.rows[0]) {
    if (!r0.rows[0].hero_image_url) {
      const url = await uploadHero(c);
      await pool.query(`UPDATE ${T.crops} SET hero_image_url = $1 WHERE id = $2`, [url, r0.rows[0].id]);
    }
    return r0.rows[0].id;
  }
  const url = await uploadHero(c);
  const r = await pool.query(
    `INSERT INTO ${T.crops}
       (name_ko, name_en, category, season_start_month, season_end_month, sunlight,
        water_freq_days, soil_pref, summary_md, hero_image_url, beginner_friendly)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [c.name_ko, c.name_en, c.category, c.season_start_month, c.season_end_month, c.sunlight,
     c.water_freq_days, c.soil_pref, c.summary_md, url, c.beginner_friendly]
  );
  return r.rows[0].id;
}

async function ensureCropTasks(cropId, name) {
  const existing = await pool.query(`SELECT COUNT(*)::int AS c FROM ${T.cropTasks} WHERE crop_id = $1`, [cropId]);
  if (existing.rows[0].c > 0) return existing.rows[0].c;
  const ts = tasksFor(name);
  for (const [month, week, type, ins, p5, p10, p20] of ts) {
    await pool.query(
      `INSERT INTO ${T.cropTasks} (crop_id, task_type, month, week_in_month,
        instructions_md, per_5pyeong_amount, per_10pyeong_amount, per_20pyeong_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [cropId, type, month, week, ins, p5, p10, p20]
    );
  }
  return ts.length;
}

async function maybeSeedSamples(uIds, cIds) {
  // 일지 5개
  const hasLog = await pool.query(`SELECT 1 FROM ${T.logs} LIMIT 1`);
  if (hasLog.rowCount === 0) {
    const sample = [
      { uid: uIds.haneul, cid: cIds.상추, date: '2026-05-04', title: '상추 첫 모종 심기', body: '오늘 6포기 심었어요. 흙이 푹신푹신해서 좋네요. 다음 주에 첫 잎 따 먹을 듯!', mood: '좋음', vis: 'public' },
      { uid: uIds.haneul, cid: cIds.고추, date: '2026-05-05', title: '고추 5그루 + 지지대 박음', body: '근처 종묘상에서 청양고추 5그루. 키 1.2m 지지대 같이 박았어요.', mood: '좋음', vis: 'public' },
      { uid: uIds.minji, cid: cIds.토마토, date: '2026-05-09', title: '방울토마토 첫 꽃!', body: '드디어 노란 꽃이 폈어요 🌼 곁순 따고 추비 한 줌.', mood: '좋음', vis: 'public' },
      { uid: uIds.jisoo, cid: cIds.오이, date: '2026-05-10', title: '오이망 설치 + 모종', body: '하루 한 번 물 잊지 말기! 망에 줄기를 살짝 묶어줬습니다.', mood: '보통', vis: 'friends' },
      { uid: uIds.haneul, cid: null, date: '2026-05-10', title: '주말 텃밭 정리', body: '잡초 한 시간, 흙 뒤집기, 다음 주 모종 자리 만들기.', mood: '보통', vis: 'private' },
    ];
    for (const s of sample) {
      await pool.query(
        `INSERT INTO ${T.logs} (user_id, crop_id, log_date, title, body_md, mood, visibility, image_urls)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, '[]'::jsonb)`,
        [s.uid, s.cid, s.date, s.title, s.body, s.mood, s.vis]
      );
    }
  }
  // 가계부 6개
  const hasBudget = await pool.query(`SELECT 1 FROM ${T.budgets} LIMIT 1`);
  if (hasBudget.rowCount === 0) {
    const sample = [
      { uid: uIds.haneul, kind: 'expense', amount: 30000, category: '임차료', memo: '4월 주말농장 6평 임차', date: '2026-04-30' },
      { uid: uIds.haneul, kind: 'expense', amount: 12000, category: '모종/씨앗', memo: '상추 6, 고추 5, 깻잎 5 모종', date: '2026-05-04' },
      { uid: uIds.haneul, kind: 'expense', amount: 8000,  category: '비료/퇴비', memo: '복합비료 3kg', date: '2026-05-04' },
      { uid: uIds.haneul, kind: 'expense', amount: 15000, category: '도구', memo: '지지대 10개 + 끈', date: '2026-05-05' },
      { uid: uIds.minji,  kind: 'expense', amount: 10000, category: '모종/씨앗', memo: '방울토마토 3, 가지 2', date: '2026-05-08' },
      { uid: uIds.minji,  kind: 'income',  amount: 5000,  category: '기타', memo: '직접 키운 상추 친구 줬더니 답례', date: '2026-05-09' },
    ];
    for (const s of sample) {
      await pool.query(
        `INSERT INTO ${T.budgets} (user_id, kind, amount, category, memo, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6::date)`,
        [s.uid, s.kind, s.amount, s.category, s.memo, s.date]
      );
    }
  }
  // 게시판 4개 + 댓글 약간
  const hasPost = await pool.query(`SELECT 1 FROM ${T.posts} LIMIT 1`);
  if (hasPost.rowCount === 0) {
    const sample = [
      { uid: uIds.haneul, board: '자랑', title: '오늘 첫 수확 — 상추 한 줌 🥬', body: '심은 지 4주 만에 따 먹어요. 다음 주말 친구네 보냅니다.' },
      { uid: uIds.minji,  board: '질문', title: '토마토 잎이 노랗게 변해요', body: '아랫잎부터 노래지는데 물 부족인가요 비료 부족인가요?' },
      { uid: uIds.jisoo,  board: '정보', title: '5월 모종 살 때 체크리스트', body: '- 잎 색이 진한지\n- 줄기가 통통한지\n- 뿌리가 흙에서 잘 빠지지 않는지' },
      { uid: uIds.haneul, board: '자유', title: '이번 주 비 와서 못 갔네요', body: '다음주 토요일 가면 풀이 무성할 듯…' },
    ];
    const ids = [];
    for (const s of sample) {
      const r = await pool.query(
        `INSERT INTO ${T.posts} (user_id, board, title, body_md, image_urls)
         VALUES ($1, $2, $3, $4, '[]'::jsonb) RETURNING id`,
        [s.uid, s.board, s.title, s.body]
      );
      ids.push({ id: r.rows[0].id, uid: s.uid });
    }
    // 댓글 2~3개
    await pool.query(
      `INSERT INTO ${T.comments} (post_id, user_id, body) VALUES
       ($1, $2, '와 부럽습니다! 저도 다음 주말에 따 먹을 생각이에요'),
       ($3, $4, '아랫잎 노래짐은 보통 질소 부족이에요. 추비 한 번 주세요'),
       ($3, $5, '제 경우엔 물 너무 자주 줘서 그랬어요. 흙이 마르고 줘보세요')`,
      [ids[0].id, uIds.minji, ids[1].id, uIds.haneul, uIds.jisoo]
    );
  }
  // 내가 키우는 작물 — 하늘아빠 텃밭
  const hasMyCrop = await pool.query(`SELECT 1 FROM ${T.userCrops} LIMIT 1`);
  if (hasMyCrop.rowCount === 0) {
    const rows = [
      { uid: uIds.haneul, cid: cIds.상추, ap: 1.0 },
      { uid: uIds.haneul, cid: cIds.고추, ap: 2.0 },
      { uid: uIds.haneul, cid: cIds.깻잎, ap: 1.0 },
      { uid: uIds.minji,  cid: cIds.토마토, ap: 1.5 },
      { uid: uIds.minji,  cid: cIds.오이, ap: 1.0 },
      { uid: uIds.jisoo,  cid: cIds.오이, ap: 0.5 },
    ];
    for (const r of rows) {
      await pool.query(
        `INSERT INTO ${T.userCrops} (user_id, crop_id, area_pyeong, planted_at)
         VALUES ($1, $2, $3, CURRENT_DATE - INTERVAL '7 days')`,
        [r.uid, r.cid, r.ap]
      );
    }
  }
}

async function main() {
  console.log('🌱 schema ensure...');
  await ensureSchema();

  console.log('🌱 users seeding...');
  const uIds = {};
  for (const u of USERS) {
    const id = await ensureUser(u);
    uIds[u.email.split('@')[0]] = id;
    const tag = u.role === 'admin' ? '👑' : '🌱';
    console.log(`  · ${tag} ${u.display_name}  (${u.email}) → id=${id}`);
  }

  console.log('🌱 crops + ImageKit hero upload + tasks seeding...');
  const cIds = {};
  for (const c of CROPS) {
    const id = await ensureCrop(c);
    cIds[c.name_ko] = id;
    const taskCount = await ensureCropTasks(id, c.name_ko);
    console.log(`  ✓ ${c.emoji} ${c.name_ko} (${c.category}) → 작업 ${taskCount}건`);
  }

  console.log('🌱 sample logs/budgets/posts/user_crops...');
  await maybeSeedSamples(uIds, cIds);

  console.log('\n✔ seed 완료\n');
  console.log('로그인 계정');
  for (const u of USERS) console.log(`  · ${u.email} / ${u.password}  (${u.display_name})`);

  await pool.end();
}

main().catch((err) => {
  console.error('seed 실패:', err);
  pool.end();
  process.exit(1);
});
