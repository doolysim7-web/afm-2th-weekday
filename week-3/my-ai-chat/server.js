const http = require('http');
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

const PORT = 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const SYSTEM_PROMPT = `당신은 따뜻하고 공감 능력이 뛰어난 심리상담사입니다.
이름은 "마음이"입니다.

상담 원칙:
1. 항상 공감과 경청의 자세로 대화합니다.
2. 판단하지 않고 내담자의 감정을 있는 그대로 수용합니다.
3. 적절한 질문을 통해 내담자가 스스로 감정을 탐색할 수 있도록 돕습니다.
4. 위기 상황(자해, 자살 등)이 감지되면 전문 상담 기관(자살예방상담전화 1393, 정신건강위기상담전화 1577-0199)을 안내합니다.
5. 답변은 너무 길지 않게, 대화체로 자연스럽게 합니다.
6. 필요한 경우 간단한 심리학적 기법(인지행동치료, 마음챙김 등)을 소개합니다.
7. 한국어로 대화합니다.`;

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

async function callOpenAI(messages) {
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    temperature: 0.8,
    max_tokens: 1000,
  });

  const url = new URL('https://api.openai.com/v1/chat/completions');

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const request = require('https').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed.choices[0].message.content);
        } catch (e) { reject(e); }
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Serve index.html
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const filePath = path.join(__dirname, 'index.html');
    const html = fs.readFileSync(filePath, 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // Chat API
  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const { messages } = await parseBody(req);
      const reply = await callOpenAI(messages);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error('OpenAI Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`심리상담 채팅 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
