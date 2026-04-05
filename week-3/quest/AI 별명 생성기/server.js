const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// .env 파일 로드
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) process.env[key.trim()] = val.join('=').trim();
  });
}

const PORT = 3003;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function buildPrompt({ keywords, tone, style, count }) {
  return `다음 조건에 맞는 별명 ${count}개를 만들어줘.

입력 키워드 (이름, 특징, 직업 등): "${keywords}"
톤/분위기: ${tone}
스타일: ${style}

요구사항:
- 별명만 목록으로 출력해. 설명이나 번호는 포함하지 마.
- 각 별명은 새 줄에 하나씩.
- 창의적이고 기억에 남는 별명으로 만들어줘.
- 스타일에 맞게 한글/영어/이모지를 적절히 활용해.`;
}

function callOpenAI(prompt) {
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: '당신은 창의적인 별명 생성 전문가입니다. 요청에 따라 재미있고 독창적인 별명을 만들어 줍니다.' },
      { role: 'user', content: prompt },
    ],
    temperature: 1.0,
    max_tokens: 500,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.choices[0].message.content.trim());
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'POST' && req.url === '/api/generate') {
    try {
      const body = await parseBody(req);
      if (!body.keywords || !body.keywords.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '키워드를 입력해 주세요.' }));
      }

      const prompt = buildPrompt(body);
      const text = await callOpenAI(prompt);
      const nicknames = text.split('\n').map(n => n.trim()).filter(n => n.length > 0);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ nicknames }));
    } catch (err) {
      console.error('OpenAI Error:', err.message);
      let userMessage = '별명 생성 중 오류가 발생했습니다.';
      if (err.message.includes('Incorrect API key') || err.message.includes('invalid_api_key')) {
        userMessage = 'API 키가 유효하지 않습니다. .env 파일에서 OPENAI_API_KEY를 확인해 주세요.';
      } else if (err.message.includes('quota') || err.message.includes('billing')) {
        userMessage = 'OpenAI 크레딧이 부족합니다. OpenAI 계정의 결제 정보를 확인해 주세요.';
      }
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: userMessage }));
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`AI 별명 생성기 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
