const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const SECRET_FILE = path.join(__dirname, 'secret.txt');

// ========================================
// Helper: parse JSON body
// ========================================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// ========================================
// Helper: send JSON response
// ========================================
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// ========================================
// Helper: serve static files
// ========================================
function serveStatic(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// ========================================
// Server
// ========================================
const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // CORS preflight
  if (method === 'OPTIONS') {
    sendJSON(res, 204, {});
    return;
  }

  // POST /api/check — 비밀번호 확인
  if (method === 'POST' && url === '/api/check') {
    const body = await parseBody(req);
    const { password } = body;

    if (!password) {
      sendJSON(res, 400, { success: false, message: '비밀번호를 입력해주세요.' });
      return;
    }

    fs.readFile(SECRET_FILE, 'utf8', (err, data) => {
      if (err) {
        sendJSON(res, 500, { success: false, message: '서버 오류가 발생했습니다.' });
        return;
      }

      const correct = data.trim();
      if (password.trim() === correct) {
        sendJSON(res, 200, { success: true, message: '비밀의 문이 열렸습니다.' });
      } else {
        sendJSON(res, 401, { success: false, message: '비밀번호가 틀렸습니다.' });
      }
    });
    return;
  }

  // GET / — index.html 서빙
  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    serveStatic(res, path.join(__dirname, 'index.html'), 'text/html');
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
  console.log(`API 엔드포인트: POST http://localhost:${PORT}/api/check`);
});
