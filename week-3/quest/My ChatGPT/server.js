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

const PORT = 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

function buildSystemPrompt(profile) {
  return `당신은 ${profile.name}입니다.

성격: ${profile.personality}
말투: ${profile.speakingStyle}
전문분야: ${profile.expertise}
${profile.description ? '추가 설명: ' + profile.description : ''}

대화 방식:
- 처음 인사할 때는 다정하고 따뜻한 말투로 먼저 말을 건네고, 어떤 도움을 줄 수 있는지 자연스럽게 소개하세요.
- 질문에 답변할 때는 전문가다운 신뢰감 있는 톤으로 명확하게 답하세요.
- 답변은 너무 길지 않게, 대화체로 자연스럽게 합니다.
- 한국어로 대화합니다.
- 설정된 전문분야와 성격을 일관되게 유지합니다.`;
}

function buildGreetingPrompt(profile) {
  return `당신은 ${profile.name}입니다.

성격: ${profile.personality}
말투: ${profile.speakingStyle}
전문분야: ${profile.expertise}
${profile.description ? '추가 설명: ' + profile.description : ''}

지금 사용자가 채팅을 처음 시작했습니다.
다정하고 따뜻한 말투로 먼저 인사를 건네고, 당신이 어떤 도움을 줄 수 있는지 간략히 소개해 주세요.
2~3문장 정도로 자연스럽게 시작해 주세요. 한국어로 대화합니다.`;
}

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

function callOpenAI(systemPrompt, messages) {
  const payload = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [{ role: 'system', content: systemPrompt }, ...messages],
    temperature: 0.8,
    max_tokens: 1000,
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
          else resolve(parsed.choices[0].message.content);
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

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    try {
      const { messages, profile, isGreeting } = await parseBody(req);
      if (!profile) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '프로필이 설정되지 않았습니다.' }));
      }
      const systemPrompt = isGreeting
        ? buildGreetingPrompt(profile)
        : buildSystemPrompt(profile);
      const greetingMessages = isGreeting
        ? [{ role: 'user', content: '안녕하세요.' }]
        : messages;
      const reply = await callOpenAI(systemPrompt, greetingMessages);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error('OpenAI Error:', err.message);
      let userMessage = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.';
      if (err.message.includes('Incorrect API key') || err.message.includes('invalid_api_key')) {
        userMessage = 'API 키가 유효하지 않습니다. 서버의 .env 파일에서 OPENAI_API_KEY를 확인해 주세요.';
      } else if (err.message.includes('quota') || err.message.includes('billing')) {
        userMessage = 'OpenAI 크레딧이 부족합니다. OpenAI 계정의 결제 정보를 확인해 주세요.';
      } else if (err.message.includes('Rate limit')) {
        userMessage = '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
      }
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ error: userMessage }));
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`AI 프로필 채팅 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
