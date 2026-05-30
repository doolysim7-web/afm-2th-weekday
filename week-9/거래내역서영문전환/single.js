require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const { Pool, types } = require('pg');

types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

const app = express();
const PORT = process.env.PORT || 3002;
const PFX = 'trans_kr2eng_';
const T = {
  dictionary: `${PFX}dictionary`,
  jobs: `${PFX}jobs`,
  rows: `${PFX}rows`,
};

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').trim(),
  ssl: { rejectUnauthorized: false },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// ----------------------------------------------------------------------------
// DB init (lazy)
// ----------------------------------------------------------------------------
let dbReady = false;
async function initDB() {
  if (dbReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.dictionary} (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,          -- 'stock' | 'memo'
      ko TEXT NOT NULL,
      en TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'ai',   -- 'ai' | 'seed' | 'manual'
      hit_count INT NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (kind, ko)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.dictionary}_kind_idx ON ${T.dictionary}(kind);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.jobs} (
      id BIGSERIAL PRIMARY KEY,
      source_type TEXT NOT NULL,           -- 'excel' | 'csv' | 'image'
      source_name TEXT NOT NULL DEFAULT '',
      source_image_url TEXT NOT NULL DEFAULT '',
      row_count INT NOT NULL DEFAULT 0,
      ai_new_terms INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${T.rows} (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES ${T.jobs}(id) ON DELETE CASCADE,
      row_index INT NOT NULL,
      date TEXT NOT NULL DEFAULT '',
      stock_ko TEXT NOT NULL DEFAULT '',
      stock_en TEXT NOT NULL DEFAULT '',
      memo_ko TEXT NOT NULL DEFAULT '',
      memo_en TEXT NOT NULL DEFAULT '',
      quantity TEXT NOT NULL DEFAULT '',
      unit_price TEXT NOT NULL DEFAULT '',
      amount TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'KRW',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS ${T.rows}_job_idx ON ${T.rows}(job_id);`);

  dbReady = true;
}

app.use('/api', async (_req, res, next) => {
  try {
    await initDB();
    next();
  } catch (err) {
    console.error('initDB failed:', err);
    res.status(500).json({ success: false, message: 'DB init failed' });
  }
});

// ----------------------------------------------------------------------------
// Gemini — text translation (batch) + vision (image OCR/translation)
// ----------------------------------------------------------------------------
const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function callGemini(payload) {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('GEMINI_API_KEY missing');
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        if ([429, 500, 502, 503, 504].includes(resp.status)) {
          lastErr = new Error(`${model} ${resp.status}: ${txt.slice(0, 120)}`);
          continue;
        }
        throw new Error(`${model} ${resp.status}: ${txt.slice(0, 200)}`);
      }
      const data = await resp.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) { lastErr = new Error(`${model}: empty response`); continue; }
      return text;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('All Gemini models failed');
}

/**
 * Batch translate {kind, ko} pairs → {ko, en} map.
 * kind: 'stock' | 'memo'
 */
async function translateBatch(items) {
  if (!items.length) return {};
  const groupedStock = items.filter(i => i.kind === 'stock').map(i => i.ko);
  const groupedMemo  = items.filter(i => i.kind === 'memo').map(i => i.ko);

  const prompt = `너는 한국 증권회사의 거래내역서를 영문으로 변환하는 전문 번역가야.
아래 두 그룹의 한글 표현을 영문으로 번역해줘.

규칙:
- "stock_names"는 한국 상장사 종목명. 회사의 공식 영문명을 우선 사용. 모를 경우 한국식 로마자 표기(국립국어원 표기법). 회사 형태 약어(Co./Corp./Inc.)는 가능하면 생략하고 핵심 브랜드명만.
- "memos"는 증권사 거래내역서의 거래 사유(적요). 표준 영어 회계/증권 용어로. 예: "현금매수" → "Cash Purchase", "배당금" → "Dividend", "원천징수" → "Withholding Tax", "출고이체" → "Outbound Transfer".
- 같은 한글에는 정확히 하나의 영문만. 동의어 후보를 늘어놓지 말 것.
- 결과는 JSON. {"stocks": {"한글":"English", ...}, "memos": {"한글":"English", ...}}

stock_names: ${JSON.stringify(groupedStock)}
memos: ${JSON.stringify(groupedMemo)}`;

  const text = await callGemini({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Gemini returned non-JSON'); }

  const out = {};
  for (const [ko, en] of Object.entries(parsed.stocks || {})) {
    out[`stock::${ko}`] = String(en || '').slice(0, 200);
  }
  for (const [ko, en] of Object.entries(parsed.memos || {})) {
    out[`memo::${ko}`] = String(en || '').slice(0, 200);
  }
  return out;
}

/**
 * Use Gemini Vision to extract Korean trade rows from an image.
 */
async function extractRowsFromImage(imageUrl) {
  // Fetch image bytes → base64 (Gemini wants inline data or fileData URI).
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error(`이미지를 불러오지 못했어요 (${r.status})`);
  const arr = Buffer.from(await r.arrayBuffer());
  const b64 = arr.toString('base64');
  const mime = r.headers.get('content-type') || 'image/png';

  const prompt = `이 이미지는 한국 증권사 거래내역서야. 모든 거래 행을 JSON으로 추출해줘.

추출 필드 (없으면 빈 문자열):
- date: 거래일자 (YYYY-MM-DD)
- stock_ko: 종목명 (한글)
- memo_ko: 적요/거래사유 (한글)
- quantity: 수량 (숫자 문자열)
- unit_price: 단가 (숫자 문자열, 쉼표 제거)
- amount: 거래금액 (숫자 문자열, 쉼표 제거)
- currency: 통화 (기본 KRW)

응답은 정확히 다음 형식의 JSON:
{ "rows": [ { "date":"...", "stock_ko":"...", "memo_ko":"...", "quantity":"...", "unit_price":"...", "amount":"...", "currency":"KRW" }, ... ] }`;

  const text = await callGemini({
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        { inlineData: { mimeType: mime, data: b64 } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('이미지에서 거래 행을 인식하지 못했어요'); }
  return Array.isArray(parsed.rows) ? parsed.rows : [];
}

// ----------------------------------------------------------------------------
// Dictionary lookup + AI fallback + persist
// ----------------------------------------------------------------------------
async function lookupDictionary(items) {
  if (!items.length) return {};
  // items: [{kind, ko}]
  const conds = items.map((_, i) => `(kind = $${i*2+1} AND ko = $${i*2+2})`).join(' OR ');
  const params = items.flatMap(i => [i.kind, i.ko]);
  const r = await pool.query(
    `SELECT kind, ko, en FROM ${T.dictionary} WHERE ${conds}`,
    params
  );
  const m = {};
  for (const row of r.rows) m[`${row.kind}::${row.ko}`] = row.en;
  return m;
}

async function bumpHit(kind, ko) {
  await pool.query(
    `UPDATE ${T.dictionary} SET hit_count = hit_count + 1, updated_at = NOW()
      WHERE kind = $1 AND ko = $2`,
    [kind, ko]
  );
}

async function insertTranslation(kind, ko, en, source = 'ai') {
  await pool.query(
    `INSERT INTO ${T.dictionary} (kind, ko, en, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (kind, ko) DO UPDATE SET hit_count = ${T.dictionary}.hit_count + 1, updated_at = NOW()`,
    [kind, (ko || '').slice(0, 200), (en || '').slice(0, 200), source]
  );
}

/**
 * Convert an array of Korean rows to English rows.
 * Returns { rows, aiNewTerms }.
 */
async function convertRows(rows) {
  // Collect distinct (kind, ko) terms across rows.
  const terms = new Map(); // key -> {kind, ko}
  for (const r of rows) {
    const s = (r.stock_ko || '').trim();
    const m = (r.memo_ko || '').trim();
    if (s) terms.set(`stock::${s}`, { kind: 'stock', ko: s });
    if (m) terms.set(`memo::${m}`,  { kind: 'memo',  ko: m });
  }
  const items = [...terms.values()];

  // 1. Look up in dictionary
  const dictMap = items.length ? await lookupDictionary(items) : {};

  // 2. Build list of misses
  const misses = items.filter(i => !dictMap[`${i.kind}::${i.ko}`]);
  let aiMap = {};
  let aiNewTerms = 0;

  if (misses.length) {
    try {
      aiMap = await translateBatch(misses);
      // Persist new terms
      for (const i of misses) {
        const en = aiMap[`${i.kind}::${i.ko}`];
        if (en) {
          await insertTranslation(i.kind, i.ko, en, 'ai');
          aiNewTerms++;
        }
      }
    } catch (e) {
      console.warn('Gemini batch failed:', e.message);
      // 이어서 진행 — 미스 행은 영문이 빈 칸으로 남음
    }
  }

  // 3. Bump hit_count for existing dictionary hits
  for (const i of items) {
    if (dictMap[`${i.kind}::${i.ko}`]) {
      bumpHit(i.kind, i.ko).catch(() => {});
    }
  }

  // 4. Resolve each row
  const out = rows.map((r, idx) => {
    const sKo = (r.stock_ko || '').trim();
    const mKo = (r.memo_ko  || '').trim();
    const sEn = sKo ? (dictMap[`stock::${sKo}`] || aiMap[`stock::${sKo}`] || '') : '';
    const mEn = mKo ? (dictMap[`memo::${mKo}`]  || aiMap[`memo::${mKo}`]  || '') : '';
    return {
      row_index: idx,
      date: (r.date || '').toString(),
      stock_ko: sKo,
      stock_en: sEn,
      memo_ko: mKo,
      memo_en: mEn,
      quantity: (r.quantity || '').toString(),
      unit_price: (r.unit_price || '').toString(),
      amount: (r.amount || '').toString(),
      currency: (r.currency || 'KRW').toString(),
    };
  });

  return { rows: out, aiNewTerms };
}

// ----------------------------------------------------------------------------
// Excel / CSV parsing
// ----------------------------------------------------------------------------
const COL_MAP = {
  date:        ['일자', '거래일', '거래일자', '날짜', 'date'],
  stock_ko:    ['종목명', '종목', '상품명', 'stock', 'name'],
  memo_ko:     ['적요', '거래구분', '거래내용', '비고', 'memo', 'description'],
  quantity:    ['수량', '거래수량', 'qty', 'quantity'],
  unit_price:  ['단가', '체결단가', '거래단가', 'price'],
  amount:      ['거래금액', '금액', '체결금액', 'amount'],
  currency:    ['통화', 'currency', 'ccy'],
};

function mapHeader(h) {
  const norm = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, '');
  const target = norm(h);
  for (const [key, aliases] of Object.entries(COL_MAP)) {
    if (aliases.some(a => norm(a) === target)) return key;
  }
  return null;
}

function parseWorkbook(buffer, fileName = '') {
  const ext = (fileName.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
  let wb;
  if (ext === 'csv') {
    // Decode as UTF-8 string so Korean headers/values aren't mojibake.
    const text = buffer.toString('utf8').replace(/^﻿/, '');
    wb = XLSX.read(text, { type: 'string', raw: true });
  } else {
    wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001 });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  if (aoa.length < 2) return [];
  const headers = aoa[0];
  const mapped = headers.map(mapHeader);
  return aoa.slice(1).map((row) => {
    const r = { currency: 'KRW' };
    headers.forEach((_, i) => {
      const k = mapped[i];
      if (k && row[i] !== '' && row[i] != null) r[k] = String(row[i]).trim();
    });
    return r;
  }).filter(r => r.stock_ko || r.memo_ko || r.amount || r.date);
}

// ----------------------------------------------------------------------------
// Excel / PDF output
// ----------------------------------------------------------------------------
function buildExcelBuffer(rows) {
  const aoa = [
    ['No.', 'Date', 'Stock (KR)', 'Stock (EN)', 'Memo (KR)', 'Memo (EN)', 'Quantity', 'Unit Price', 'Amount', 'CCY'],
    ...rows.map((r, i) => [
      i + 1, r.date, r.stock_ko, r.stock_en, r.memo_ko, r.memo_en,
      r.quantity, r.unit_price, r.amount, r.currency,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 5 }, { wch: 12 }, { wch: 16 }, { wch: 22 },
    { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 6 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Trade Statement');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPdfBuffer(rows, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36, layout: 'landscape' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ----- Header -----
    doc.fillColor('#1f3a5f').fontSize(18).font('Helvetica-Bold')
       .text('Trade Statement (English Conversion)', { align: 'left' });
    doc.moveDown(0.2);
    doc.fillColor('#666').fontSize(9).font('Helvetica')
       .text(`Generated: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`);
    if (meta.source_name) {
      doc.text(`Source: ${meta.source_name}`);
    }
    doc.moveDown(0.4);

    // elegant divider
    doc.strokeColor('#c9b88c').lineWidth(0.6)
       .moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    doc.moveDown(0.6);

    // ----- Table -----
    const headers = ['No.', 'Date', 'Stock', 'Memo', 'Quantity', 'Unit Price', 'Amount', 'CCY'];
    const colW = [28, 65, 130, 165, 60, 70, 80, 40];

    const drawRow = (cells, opts = {}) => {
      const y = doc.y;
      let x = 36;
      doc.fontSize(opts.fontSize || 9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      doc.fillColor(opts.color || '#222');
      cells.forEach((c, i) => {
        const w = colW[i];
        const align = i >= 4 ? 'right' : 'left';
        doc.text(String(c ?? ''), x + 2, y + 2, { width: w - 4, align, ellipsis: true });
        x += w;
      });
      const rowH = 16;
      // zebra
      if (opts.zebra) {
        doc.fillColor('#f6f1e6').rect(36, y, colW.reduce((a, b) => a + b, 0), rowH).fill();
        // redraw text on top of fill
        x = 36;
        doc.fillColor(opts.color || '#222');
        cells.forEach((c, i) => {
          const w = colW[i];
          const align = i >= 4 ? 'right' : 'left';
          doc.text(String(c ?? ''), x + 2, y + 2, { width: w - 4, align, ellipsis: true });
          x += w;
        });
      }
      doc.moveDown();
      doc.y = y + rowH;
    };

    // header row
    doc.fillColor('#1f3a5f').rect(36, doc.y, colW.reduce((a, b) => a + b, 0), 18).fill();
    let hy = doc.y;
    let hx = 36;
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
    headers.forEach((h, i) => {
      const align = i >= 4 ? 'right' : 'left';
      doc.text(h, hx + 2, hy + 4, { width: colW[i] - 4, align });
      hx += colW[i];
    });
    doc.y = hy + 18;
    doc.moveDown(0.2);

    rows.forEach((r, i) => {
      drawRow([
        i + 1,
        r.date,
        r.stock_en || r.stock_ko,
        r.memo_en  || r.memo_ko,
        r.quantity,
        r.unit_price,
        r.amount,
        r.currency,
      ], { zebra: i % 2 === 1 });
      if (doc.y > doc.page.height - 60) doc.addPage({ layout: 'landscape', margin: 36 });
    });

    // ----- Footer divider + note -----
    doc.moveDown(0.8);
    doc.strokeColor('#c9b88c').lineWidth(0.6)
       .moveTo(36, doc.y).lineTo(doc.page.width - 36, doc.y).stroke();
    doc.moveDown(0.4);
    doc.fillColor('#888').fontSize(8).font('Helvetica-Oblique')
       .text(`Total ${rows.length} row(s). This is an auto-translated copy for reference. The original Korean statement is the authoritative record.`, { align: 'center' });

    doc.end();
  });
}

// ----------------------------------------------------------------------------
// API — ImageKit signature
// ----------------------------------------------------------------------------
app.get('/api/upload/auth', (_req, res) => {
  try {
    const expire = Math.floor(Date.now() / 1000) + 60 * 5;
    const token = crypto.randomUUID();
    const signature = crypto
      .createHmac('sha1', process.env.IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
      success: true,
      data: {
        token, expire, signature,
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    console.error('upload/auth failed:', err);
    res.status(500).json({ success: false, message: '업로드 인증 실패' });
  }
});

// ----------------------------------------------------------------------------
// API — parse uploaded file → Korean rows
// ----------------------------------------------------------------------------
app.post('/api/parse-file', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '파일이 없어요' });
    const ext = (req.file.originalname.match(/\.(\w+)$/) || ['', ''])[1].toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return res.status(400).json({ success: false, message: '엑셀(.xlsx/.xls) 또는 CSV만 지원해요' });
    }
    const rows = parseWorkbook(req.file.buffer, req.file.originalname);
    res.json({
      success: true,
      data: {
        source_type: ext === 'csv' ? 'csv' : 'excel',
        source_name: req.file.originalname,
        rows,
      },
    });
  } catch (err) {
    console.error('parse-file failed:', err);
    res.status(500).json({ success: false, message: '파일 파싱 실패' });
  }
});

// ----------------------------------------------------------------------------
// API — extract rows from image (uploaded to ImageKit)
// ----------------------------------------------------------------------------
app.post('/api/parse-image', async (req, res) => {
  try {
    const { url, source_name } = req.body || {};
    if (!url) return res.status(400).json({ success: false, message: '이미지 URL이 필요해요' });
    const rows = await extractRowsFromImage(url);
    res.json({
      success: true,
      data: {
        source_type: 'image',
        source_name: source_name || url,
        source_image_url: url,
        rows,
      },
    });
  } catch (err) {
    console.error('parse-image failed:', err);
    res.status(500).json({ success: false, message: err.message || '이미지 인식 실패' });
  }
});

// ----------------------------------------------------------------------------
// API — convert + persist job
// ----------------------------------------------------------------------------
app.post('/api/convert', async (req, res) => {
  try {
    const { rows, source_type, source_name, source_image_url } = req.body || {};
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: '변환할 거래 행이 없어요' });
    }
    const { rows: converted, aiNewTerms } = await convertRows(rows);

    const j = await pool.query(
      `INSERT INTO ${T.jobs} (source_type, source_name, source_image_url, row_count, ai_new_terms)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [
        (source_type || 'excel').slice(0, 16),
        (source_name || '').slice(0, 200),
        (source_image_url || '').slice(0, 500),
        converted.length,
        aiNewTerms,
      ]
    );
    const jobId = j.rows[0].id;
    for (const r of converted) {
      await pool.query(
        `INSERT INTO ${T.rows}
           (job_id, row_index, date, stock_ko, stock_en, memo_ko, memo_en, quantity, unit_price, amount, currency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          jobId, r.row_index, r.date,
          r.stock_ko, r.stock_en, r.memo_ko, r.memo_en,
          r.quantity, r.unit_price, r.amount, r.currency,
        ]
      );
    }

    res.json({
      success: true,
      data: { job_id: jobId, rows: converted, ai_new_terms: aiNewTerms },
    });
  } catch (err) {
    console.error('convert failed:', err);
    res.status(500).json({ success: false, message: err.message || '변환 실패' });
  }
});

// ----------------------------------------------------------------------------
// API — download English Excel / PDF
// ----------------------------------------------------------------------------
app.post('/api/download/excel', (req, res) => {
  try {
    const { rows } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ success: false, message: 'rows 필요' });
    const buf = buildExcelBuffer(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="trade-statement-en-${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('excel download failed:', err);
    res.status(500).json({ success: false, message: '엑셀 생성 실패' });
  }
});

app.post('/api/download/pdf', async (req, res) => {
  try {
    const { rows, source_name } = req.body || {};
    if (!Array.isArray(rows)) return res.status(400).json({ success: false, message: 'rows 필요' });
    const buf = await buildPdfBuffer(rows, { source_name });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="trade-statement-en-${Date.now()}.pdf"`);
    res.send(buf);
  } catch (err) {
    console.error('pdf download failed:', err);
    res.status(500).json({ success: false, message: 'PDF 생성 실패' });
  }
});

// ----------------------------------------------------------------------------
// API — dictionary / jobs (read-only inspection)
// ----------------------------------------------------------------------------
app.get('/api/dictionary', async (req, res) => {
  try {
    const kind = req.query.kind;
    const where = ['stock', 'memo'].includes(kind) ? `WHERE kind = $1` : '';
    const params = where ? [kind] : [];
    const r = await pool.query(
      `SELECT kind, ko, en, source, hit_count, updated_at
         FROM ${T.dictionary} ${where}
        ORDER BY hit_count DESC, updated_at DESC LIMIT 500`,
      params
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: '사전 조회 실패' });
  }
});

app.get('/api/jobs', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, source_type, source_name, row_count, ai_new_terms, created_at
         FROM ${T.jobs} ORDER BY id DESC LIMIT 50`
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: '작업 이력 조회 실패' });
  }
});

// ----------------------------------------------------------------------------
// Docs (MISSION.md / DEV.md) — markdown 그대로 반환
// ----------------------------------------------------------------------------
const DOCS = {
  mission: { file: 'documents/MISSION.md', title: '🎯 기획서 (MISSION)' },
  dev:     { file: 'documents/DEV.md',     title: '🛠️ 개발문서 (DEV)' },
};
app.get('/api/docs/:name', (req, res) => {
  const meta = DOCS[req.params.name];
  if (!meta) return res.status(404).json({ success: false, message: '문서 없음' });
  try {
    const content = fs.readFileSync(path.join(__dirname, meta.file), 'utf8');
    res.json({ success: true, data: { name: req.params.name, title: meta.title, content } });
  } catch (err) {
    console.error('docs read failed:', err);
    res.status(500).json({ success: false, message: '문서 읽기 실패' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ success: true, data: { db: 'ok' } });
  } catch {
    res.status(500).json({ success: false, message: 'db down' });
  }
});

// ----------------------------------------------------------------------------
// SPA fallback
// ----------------------------------------------------------------------------
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error('unhandled:', err);
  res.status(500).json({ success: false, message: '서버 오류' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🌐 거래내역서 영문 변환기: http://localhost:${PORT}`);
  });
}

module.exports = app;
