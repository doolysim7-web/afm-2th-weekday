/**
 * ZARA 향수 이미지 생성 + ImageKit 업로드
 *
 * SVG로 미니멀한 ZARA-스타일 향수 보틀을 4종 그려서
 * ImageKit에 업로드한 뒤, 로컬에도 .svg 사본을 저장합니다.
 *
 * 실행: node generate.js
 */
require('dotenv').config({ path: '../.env' });
const fs = require('fs');
const path = require('path');
const ImageKit = require('imagekit');

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || 'public_7Wf9/9pM/Gp/HXOQfUeWh1jmm+Q=',
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || 'private_HUgMWoK582B2ZL8jpGQtksNy//M=',
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/3um8y0hge',
});

// ---------------------------------------------------------------------------
// SVG 보틀 디자인 — 미니멀, ZARA 룩북 스타일
// ---------------------------------------------------------------------------
function shadow() {
  return `<filter id="sh" x="-20%" y="-20%" width="140%" height="140%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
    <feOffset dx="0" dy="6" result="offsetblur"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.25"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>`;
}

function bottleSvg({
  bg = '#f4ede4',
  bottle = '#1a1a1a',
  bottleStroke = '#0a0a0a',
  cap = '#bfa46a',
  capStroke = '#8b7841',
  label = '#ffffff',
  labelText = '#1a1a1a',
  name = 'BLACK AMBER',
  scent = 'EAU DE PARFUM · 100ML',
  accent = '#bfa46a',
  shape = 'rect', // 'rect' | 'curved' | 'tall' | 'orb'
  liquid = '#3a2a1a',
}) {
  const W = 800, H = 800;
  const cx = W / 2;

  // bottle silhouette by shape
  const bottlePath = (() => {
    if (shape === 'tall') {
      return `<rect x="${cx - 110}" y="220" width="220" height="440" rx="18" fill="${bottle}" stroke="${bottleStroke}" stroke-width="2" />`;
    }
    if (shape === 'curved') {
      return `<path d="M ${cx - 130} 280 Q ${cx - 150} 460 ${cx - 130} 660 Q ${cx} 690 ${cx + 130} 660 Q ${cx + 150} 460 ${cx + 130} 280 Z"
              fill="${bottle}" stroke="${bottleStroke}" stroke-width="2" />`;
    }
    if (shape === 'orb') {
      return `<circle cx="${cx}" cy="500" r="170" fill="${bottle}" stroke="${bottleStroke}" stroke-width="2" />`;
    }
    // rect (default ZARA-classic squared bottle)
    return `<rect x="${cx - 140}" y="270" width="280" height="380" rx="10" fill="${bottle}" stroke="${bottleStroke}" stroke-width="2" />`;
  })();

  // liquid hint (subtle gradient overlay)
  const liquidOverlay = `
    <defs>
      <linearGradient id="liq" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${liquid}" stop-opacity="0.0"/>
        <stop offset="60%" stop-color="${liquid}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${liquid}" stop-opacity="0.7"/>
      </linearGradient>
    </defs>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    ${shadow()}
  </defs>
  ${liquidOverlay}

  <!-- background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- subtle marble/paper texture lines -->
  <g opacity="0.06" stroke="#000">
    <line x1="0" y1="160" x2="${W}" y2="160" stroke-width="1"/>
    <line x1="0" y1="700" x2="${W}" y2="700" stroke-width="1"/>
  </g>

  <!-- bottle group with shadow -->
  <g filter="url(#sh)">
    ${bottlePath}

    <!-- liquid shading overlay (clipped to a generic full bottle area) -->
    ${shape === 'orb'
      ? `<circle cx="${cx}" cy="500" r="170" fill="url(#liq)"/>`
      : `<rect x="${cx - 140}" y="270" width="280" height="380" rx="10" fill="url(#liq)"/>`}

    <!-- neck -->
    <rect x="${cx - 36}" y="190" width="72" height="80" fill="${bottle}" stroke="${bottleStroke}" stroke-width="2"/>

    <!-- cap -->
    <rect x="${cx - 64}" y="120" width="128" height="80" rx="6" fill="${cap}" stroke="${capStroke}" stroke-width="2"/>
    <rect x="${cx - 64}" y="120" width="128" height="14" rx="2" fill="${capStroke}" opacity="0.4"/>
  </g>

  <!-- label -->
  <g>
    <rect x="${cx - 105}" y="430" width="210" height="120" rx="2" fill="${label}" opacity="0.97"/>
    <line x1="${cx - 80}" y1="455" x2="${cx + 80}" y2="455" stroke="${accent}" stroke-width="1"/>
    <text x="${cx}" y="445" text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="14" letter-spacing="6" font-weight="700" fill="${labelText}">ZARA</text>
    <text x="${cx}" y="495" text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="20" letter-spacing="3" font-weight="500" fill="${labelText}">${name}</text>
    <text x="${cx}" y="525" text-anchor="middle"
          font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
          font-size="10" letter-spacing="2" fill="${labelText}" opacity="0.7">${scent}</text>
  </g>

  <!-- floor reflection -->
  <ellipse cx="${cx}" cy="700" rx="220" ry="14" fill="#000" opacity="0.08"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// 4가지 ZARA 향수 디자인
// ---------------------------------------------------------------------------
const DESIGNS = [
  {
    key: 'black-amber',
    name: 'BLACK AMBER',
    scent: 'EAU DE PARFUM · 100ML',
    bg: '#f4ede4',
    bottle: '#1a1a1a',
    bottleStroke: '#000',
    cap: '#bfa46a',
    capStroke: '#8b7841',
    accent: '#bfa46a',
    liquid: '#3a2a1a',
    shape: 'rect',
  },
  {
    key: 'rose-vanilla',
    name: 'ROSE VANILLA',
    scent: 'EAU DE TOILETTE · 80ML',
    bg: '#fce7e7',
    bottle: '#f3c8c8',
    bottleStroke: '#b87a7a',
    cap: '#d6a3a3',
    capStroke: '#8e5e5e',
    accent: '#b87a7a',
    liquid: '#d68f8f',
    shape: 'curved',
  },
  {
    key: 'gold-for-her',
    name: 'GOLD FOR HER',
    scent: 'EAU DE PARFUM · 100ML',
    bg: '#1a1612',
    bottle: '#0d0b09',
    bottleStroke: '#3a2f20',
    cap: '#e6c674',
    capStroke: '#a8843c',
    accent: '#e6c674',
    label: '#1a1612',
    labelText: '#e6c674',
    liquid: '#f0d28c',
    shape: 'tall',
  },
  {
    key: 'wonder-rose',
    name: 'WONDER ROSE',
    scent: 'EAU DE PARFUM · 50ML',
    bg: '#f7f4ef',
    bottle: '#fffdf8',
    bottleStroke: '#cdbfa8',
    cap: '#e8d8b8',
    capStroke: '#a89262',
    accent: '#a89262',
    liquid: '#e8c8c8',
    shape: 'orb',
  },
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const outDir = __dirname;
  const results = [];

  for (const d of DESIGNS) {
    const svg = bottleSvg(d);
    const localPath = path.join(outDir, `zara-${d.key}.svg`);
    fs.writeFileSync(localPath, svg, 'utf8');

    const base64 = Buffer.from(svg, 'utf8').toString('base64');
    const fileName = `zara-${d.key}.svg`;
    process.stdout.write(`▶ uploading ${fileName} ... `);
    const r = await imagekit.upload({
      file: base64,
      fileName,
      folder: '/zara-perfume',
      useUniqueFileName: true,
    });
    console.log('OK');
    results.push({
      key: d.key,
      name: d.name,
      local: path.relative(process.cwd(), localPath),
      url: r.url,
      width: r.width,
      height: r.height,
    });
  }

  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2), 'utf8');

  console.log('\n✔ 완료\n');
  results.forEach((r) => console.log(`  · ${r.name}  →  ${r.url}`));
  console.log(`\n로컬 사본: ${outDir}`);
  console.log(`매니페스트: ${manifestPath}`);
}

main().catch((err) => {
  console.error('생성 실패:', err);
  process.exit(1);
});
