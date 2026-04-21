const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();

// ---------- ImageKit credentials ----------
// NOTE: Hardcoded fallback defaults are present for quick local testing only.
// For production, set these via environment variables on Vercel / your host.
const IMAGEKIT_PUBLIC_KEY = (
  process.env.IMAGEKIT_PUBLIC_KEY || 'public_7Wf9/9pM/Gp/HXOQfUeWh1jmm+Q='
).trim();
const IMAGEKIT_PRIVATE_KEY = (
  process.env.IMAGEKIT_PRIVATE_KEY || 'private_HUgMWoK582B2ZL8jpGQtksNy//M='
).trim();
const IMAGEKIT_URL_ENDPOINT = (
  process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/3um8y0hge'
).trim();

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(__dirname));

// ---------- API routes ----------
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

app.get('/api/imagekit-auth', (_req, res) => {
  try {
    if (!IMAGEKIT_PRIVATE_KEY || !IMAGEKIT_PUBLIC_KEY || !IMAGEKIT_URL_ENDPOINT) {
      return res
        .status(500)
        .json({ success: false, message: 'ImageKit env vars missing' });
    }
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 2400; // 40 minutes
    const signature = crypto
      .createHmac('sha1', IMAGEKIT_PRIVATE_KEY)
      .update(token + expire)
      .digest('hex');
    res.json({
      success: true,
      data: {
        token,
        expire,
        signature,
        publicKey: IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ---------- Express 5 SPA fallback ----------
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Dual mode export ----------
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`ImageKit upload test server listening on http://localhost:${PORT}`);
  });
}
