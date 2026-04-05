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

const PORT = 3002;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// DALL-E 3 지원 사이즈 매핑
const SIZE_MAP = {
  'landscape_4_3': '1792x1024',
  'square_hd':     '1024x1024',
  'portrait_4_3':  '1024x1792',
};

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

function callDALLE(prompt, imageSize) {
  const size = SIZE_MAP[imageSize] || '1792x1024';
  const payload = JSON.stringify({
    model: 'dall-e-3',
    prompt,
    n: 1,
    size,
    quality: 'standard',
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/images/generations',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 60000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          resolve({ url: parsed.data[0].url });
        } catch (e) { reject(e); }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
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
      const { prompt, stylePrompt, imageSize } = await parseBody(req);
      if (!prompt && !stylePrompt) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '프롬프트를 입력해 주세요.' }));
      }

      const fullPrompt = stylePrompt
        ? `${prompt}, ${stylePrompt}, high quality, detailed`
        : `${prompt}, high quality, detailed`;

      console.log('Generating:', fullPrompt);
      const result = await callDALLE(fullPrompt, imageSize);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(result));
    } catch (err) {
      console.error('DALL-E Error:', err.message);
      let userMessage = '이미지 생성 중 오류가 발생했습니다.';
      if (err.message.includes('Incorrect API key') || err.message.includes('invalid_api_key')) {
        userMessage = 'API 키가 유효하지 않습니다. .env 파일을 확인해 주세요.';
      } else if (err.message.includes('quota') || err.message.includes('billing') || err.message.includes('insufficient')) {
        userMessage = 'OpenAI 크레딧이 부족합니다. OpenAI 계정의 결제 정보를 확인해 주세요.';
      } else if (err.message.includes('timeout')) {
        userMessage = '요청 시간이 초과됐습니다. 다시 시도해 주세요.';
      } else if (err.message.includes('safety')) {
        userMessage = '안전 정책에 위반되는 내용이 포함되어 있습니다. 다른 표현으로 시도해 주세요.';
      }
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: userMessage }));
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`My Midjourney 서버가 http://localhost:${PORT} 에서 실행 중입니다 (DALL-E 3)`);
});
