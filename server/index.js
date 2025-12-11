const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 4000;
const FAL_KEY = process.env.FAL_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
// Model endpoints (can be overridden via .env)
// TEXT_MODEL_ENDPOINT should point to the base text-to-image endpoint (no extra /generate path)
const IMAGE_MODEL_ENDPOINT = process.env.IMAGE_MODEL_ENDPOINT || 'https://queue.fal.run/fal-ai/nano-banana-pro/edit';
const TEXT_MODEL_ENDPOINT = process.env.TEXT_MODEL_ENDPOINT || 'https://queue.fal.run/fal-ai/nano-banana-pro';

// Simple SQLite DB (file: data.db)
const DB_PATH = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(DB_PATH);

// Init tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password_hash TEXT,
    is_admin INTEGER DEFAULT 0,
    first_name TEXT DEFAULT '',
    last_name TEXT DEFAULT ''
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    fal_request_id TEXT,
    prompt TEXT,
    status TEXT,
    result_url TEXT,
    aspect_ratio TEXT DEFAULT '',
    resolution TEXT DEFAULT '',
    num_images INTEGER DEFAULT 1,
    output_format TEXT DEFAULT 'png',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    endpoint TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS fallback_map (
    original_fal_request_id TEXT UNIQUE,
    fallback_fal_request_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Helper: create JWT
function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, is_admin: !!user.is_admin }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No auth' });
  const token = auth.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Invalid token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Неверный токен' });
  }
}

// Ensure upload directory exists and serve uploads statically
const uploadDir = path.join(__dirname, 'uploads');
try { fs.mkdirSync(uploadDir, { recursive: true }) } catch (e) {}
app.use('/uploads', express.static(uploadDir));

// Multer storage config (limit to 4 files, max size 10MB each)
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    const name = Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { files: 4, fileSize: 10 * 1024 * 1024 } });

// Upload endpoint: accepts up to 4 images via multipart/form-data (field name: images)
app.post('/api/upload', authMiddleware, upload.array('images', 4), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  // For privacy and to avoid storing images locally, return only data URIs and delete saved files immediately.
  const dataUris = []
  req.files.forEach(f => {
    try {
      const full = path.join(uploadDir, f.filename);
      const buf = fs.readFileSync(full);
      const b64 = buf.toString('base64');
      const mime = f.mimetype || 'image/png';
      dataUris.push(`data:${mime};base64,${b64}`);
      // delete local file to free disk and avoid exposing local URLs
      try { fs.unlinkSync(full) } catch (e) { console.warn('Failed to delete upload', full, e) }
    } catch (err) {
      console.warn('Upload read error', err)
    }
  });
  res.json({ data_uris: dataUris });
});

// Auth routes
app.post('/api/register', async (req, res) => {
  // Public registration disabled. Users must be created by an admin via /api/admin/users.
  res.status(403).json({ error: 'Регистрация отключена. Пользователей создаёт админ.' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Отсутствуют имя пользователя или пароль' });
  db.get('SELECT id, username, password_hash, is_admin FROM users WHERE username = ?', [username], async (err, row) => {
    if (err) return res.status(500).json({ error: 'Ошибка базы данных' });
    if (!row) return res.status(401).json({ error: 'Неверные учетные данные' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Неверные учетные данные' });
    // fetch first/last name
    db.get('SELECT first_name, last_name FROM users WHERE id = ?', [row.id], (e2, names) => {
      const user = { id: row.id, username: row.username, is_admin: row.is_admin, first_name: (names && names.first_name) || '', last_name: (names && names.last_name) || '' };
      const token = createToken(user);
    res.json({ token, user });
    });
  });

// Get current user (validate token)
app.get('/api/me', authMiddleware, (req, res) => {
  // req.user comes from authMiddleware (contains id). Fetch full user record to include names.
  const uid = req.user && req.user.id
  if (!uid) return res.status(401).json({ error: 'No auth' })
  db.get('SELECT id, username, is_admin, first_name, last_name FROM users WHERE id = ?', [uid], (err, row) => {
    if (err) return res.status(500).json({ error: 'DB' })
    if (!row) {
      // fallback to token payload
      return res.json({ user: req.user })
    }
    res.json({ user: row })
  })
});
});

// List models (admin can add)
app.get('/api/models', (req, res) => {
  db.all('SELECT id, name, endpoint FROM models ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ models: rows });
  });
});

// Admin add model
app.post('/api/admin/models', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { name, endpoint } = req.body;
  if (!name || !endpoint) return res.status(400).json({ error: 'Missing' });
  db.run('INSERT INTO models (name, endpoint) VALUES (?, ?)', [name, endpoint], function (err) {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ id: this.lastID, name, endpoint });
  });
});

// Submit generate request
app.post('/api/generate', authMiddleware, async (req, res) => {
  const { prompt, image_urls = [], num_images = 1, aspect_ratio = 'auto', output_format = 'png', resolution = '1K' } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Отсутствует подсказка' });

  // Decide whether this is an image-edit (has images) or text-only generation.
  const hasImages = Array.isArray(image_urls) && image_urls.length > 0;

  // Build payload for Fal.
  const payload = {
    prompt,
    num_images,
    aspect_ratio,
    output_format,
    resolution
  };
  if (hasImages) payload.image_urls = image_urls;

  // Select endpoint based on presence of images.
  const IMAGE_MODEL_ENDPOINT = process.env.IMAGE_MODEL_ENDPOINT || 'https://queue.fal.run/fal-ai/nano-banana-pro/edit';
  const TEXT_MODEL_ENDPOINT = process.env.TEXT_MODEL_ENDPOINT || 'https://queue.fal.run/fal-ai/nano-banana-pro/generate';
  const modelEndpoint = hasImages ? IMAGE_MODEL_ENDPOINT : TEXT_MODEL_ENDPOINT;
  // Log decision for debugging: whether we treat this as text-only or image-edit
  try {
    const who = req.user && req.user.username ? req.user.username : (req.user && req.user.id ? `user:${req.user.id}` : 'unknown');
    console.log(`[Generate] user=${who} hasImages=${hasImages} usingEndpoint=${modelEndpoint} payloadSummary=${JSON.stringify({ prompt: prompt.slice(0,120), num_images, aspect_ratio, resolution, images: hasImages ? image_urls.length : 0 })}`);
  } catch (err) {
    console.log('[Generate] decision log error', err);
  }

  try {
    // First attempt
    let falResp = await fetch(modelEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    let json = await falResp.json();
    let requestId = json.request_id || json.requestId || null;
    let usedFallback = false;

    // Detect case where text endpoint does not exist or returned error indicating missing path.
    const detailStr = JSON.stringify(json.detail || json).toLowerCase();
    if ((!falResp.ok) || detailStr.includes('path /generate not found') || detailStr.includes('path /generate')) {
      // Do NOT create fallback. Mark original as failed or billing_error and return error to client.
      if (detailStr.includes('exhausted') || detailStr.includes('user is locked') || detailStr.includes('balance')) {
        db.run('INSERT INTO requests (user_id, fal_request_id, prompt, status) VALUES (?, ?, ?, ?)', [req.user.id, null, prompt, 'billing_error'], function (err) {
          if (err) console.error('DB insert billing_error', err);
        });
        return res.status(402).json({ error: 'Ошибка биллинга', meta: json });
      } else {
        db.run('INSERT INTO requests (user_id, fal_request_id, prompt, status) VALUES (?, ?, ?, ?)', [req.user.id, requestId || null, prompt, 'failed'], function (err) {
          if (err) console.error('DB insert failed', err);
        });
        return res.status(400).json({ error: 'Текстовый endpoint недоступен', meta: json });
      }
    }

    db.run('INSERT INTO requests (user_id, fal_request_id, prompt, status, aspect_ratio, resolution, num_images, output_format) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [req.user.id, requestId, prompt, 'submitted', aspect_ratio, resolution, num_images, output_format], function (err) {
      if (err) console.error('DB insert request error', err);
      // Return used endpoint info and whether fallback was used for client-side logs
      res.json({ request_id: requestId, meta: json, used_endpoint: modelEndpoint, fallback: usedFallback });
    });
  } catch (err) {
    console.error('Fal request error', err);
    res.status(500).json({ error: 'Fal request error' });
  }
});

// Check status (proxy to fal queue status)
app.get('/api/requests/:id/status', authMiddleware, async (req, res) => {
  const requestId = req.params.id;
  if (!requestId) return res.status(400).json({ error: 'Missing id' });
  try {
    // Fetch status from Fal Queue
    const falStatusResp = await fetch(`https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}/status`, {
      method: 'GET',
      headers: { 'Authorization': `Key ${FAL_KEY}` }
    });
    const statusJson = await falStatusResp.json();

    const statusLower = (statusJson.status || '').toString().toLowerCase();

    // If completed (case-insensitive), fetch the full response to obtain image URLs
    let fullOutput = null;
    if (statusLower === 'completed' || statusLower === 'succeeded') {
      try {
        const falRespFull = await fetch(`https://queue.fal.run/fal-ai/nano-banana-pro/requests/${requestId}`, {
          method: 'GET',
          headers: { 'Authorization': `Key ${FAL_KEY}` }
        });
        fullOutput = await falRespFull.json();
        // If Fal indicates the text endpoint failed (generate not supported) or missing images,
        // do NOT create fallback. Instead, mark original failed or billing_error as appropriate.
        const detailStr = JSON.stringify(fullOutput || '').toLowerCase();
        if (detailStr.includes('path /generate') || detailStr.includes('at least one image url') || detailStr.includes('field required')) {
          console.log(`[Status] detected generate error for ${requestId}: ${detailStr}`);
        if (detailStr.includes('exhausted') || detailStr.includes('user is locked') || detailStr.includes('balance')) {
            db.run('UPDATE requests SET status = ? WHERE fal_request_id = ?', ['billing_error', requestId]);
            return res.json({ status: 'Ошибка биллинга', detail: fullOutput });
          } else {
            db.run('UPDATE requests SET status = ? WHERE fal_request_id = ?', ['failed', requestId]);
            return res.json({ status: 'Не удалось', detail: fullOutput });
          }
        }
        // update DB with result_url if available
        const imageUrl = Array.isArray(fullOutput.images) && fullOutput.images[0]?.url ? fullOutput.images[0].url : null;
        if (imageUrl) {
          db.run('UPDATE requests SET status = ?, result_url = ? WHERE fal_request_id = ?', [statusLower, imageUrl, requestId]);
        } else {
          db.run('UPDATE requests SET status = ? WHERE fal_request_id = ?', [statusLower, requestId]);
        }
      } catch (err) {
        console.error('Error fetching full fal response', err);
        db.run('UPDATE requests SET status = ? WHERE fal_request_id = ?', [statusLower, requestId]);
      }
    } else {
      // Not completed yet — just update status
      db.run('UPDATE requests SET status = ? WHERE fal_request_id = ?', [statusLower || 'processing', requestId]);
    }

    // Return normalized status and, if available, the full output
    const clientResponse = Object.assign({}, fullOutput || {}, { status: statusLower });
    res.json(clientResponse);
  } catch (err) {
    res.status(500).json({ error: 'Error fetching status' });
  }
});

// Get local request history for user
app.get('/api/my/requests', authMiddleware, (req, res) => {
  db.all('SELECT id, fal_request_id, prompt, status, result_url, aspect_ratio, resolution, num_images, output_format, created_at FROM requests WHERE user_id = ? ORDER BY created_at DESC', [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ requests: rows });
  });
});

// Admin: list users and requests
app.get('/api/admin/users', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  // Return users with total generation count (gen_count)
  const sql = `
    SELECT u.id, u.username, u.is_admin, u.first_name, u.last_name,
      IFNULL((SELECT COUNT(1) FROM requests r WHERE r.user_id = u.id), 0) as gen_count
    FROM users u
    ORDER BY u.id DESC
  `
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ users: rows });
  });
});

app.get('/api/admin/requests', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const userId = req.query.user_id;
  const fields = 'r.id, r.fal_request_id, r.prompt, r.status, r.result_url, r.aspect_ratio, r.resolution, r.num_images, r.output_format, r.created_at, u.username';
  const sql = userId ? `SELECT ${fields} FROM requests r LEFT JOIN users u ON u.id = r.user_id WHERE r.user_id = ? ORDER BY r.created_at DESC` : `SELECT ${fields} FROM requests r LEFT JOIN users u ON u.id = r.user_id ORDER BY r.created_at DESC`;
  const params = userId ? [userId] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'DB' });
    res.json({ requests: rows });
  });
});

// Admin: fetch server log (simple access for admin)
app.get('/api/admin/logs', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  try {
    const logPath = path.join(__dirname, 'server.log')
    if (!fs.existsSync(logPath)) return res.json({ logs: '' })
    const txt = fs.readFileSync(logPath, 'utf8')
    // return last ~20000 chars to avoid huge payloads
    const tail = txt.length > 20000 ? txt.slice(-20000) : txt
    res.json({ logs: tail })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read logs' })
  }
})

// Client-side error reporting (append to server.log) - accepts anonymous reports
app.post('/api/client/error', async (req, res) => {
  try {
    const payload = { at: new Date().toISOString(), body: req.body || {} }
    const line = JSON.stringify(payload) + '\n'
    fs.appendFileSync(path.join(__dirname, 'server.log'), line)
    res.json({ ok: true })
  } catch (err) {
    console.error('Failed to write client error', err)
    res.status(500).json({ error: 'Failed to write' })
  }
})

// Admin: clear all requests and delete uploads (destructive)
app.post('/api/admin/clear_history', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  // delete all rows from requests and fallback_map
  db.serialize(() => {
    db.run('DELETE FROM requests', [], function (err) {
      if (err) console.error('Failed clearing requests', err);
    });
    db.run('DELETE FROM fallback_map', [], function (err) {
      if (err) console.error('Failed clearing fallback_map', err);
    });
  });
  // delete all files in uploads directory
  try {
    const files = fs.readdirSync(uploadDir);
    files.forEach(fn => {
      const full = path.join(uploadDir, fn);
      try { fs.unlinkSync(full) } catch (e) { console.warn('Failed deleting', full, e) }
    });
  } catch (e) {
    console.warn('Failed reading uploads dir', e)
  }
  res.json({ ok: true, message: 'History cleared and uploads deleted' });
});

// Admin: create new user (with optional admin flag)
app.post('/api/admin/users', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const { username, password, is_admin } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing username or password' });
  const hash = bcrypt.hashSync(password, 10);
  const adminFlag = is_admin ? 1 : 0;
  db.run('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)', [username, hash, adminFlag], function (err) {
    if (err) return res.status(400).json({ error: 'Could not create user (exists?)' });
    res.json({ id: this.lastID, username, is_admin: adminFlag });
  });
});

// Admin: update user (e.g., grant/revoke admin)
app.put('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const userId = req.params.id;
  const { is_admin } = req.body;
  const adminFlag = is_admin ? 1 : 0;
  db.run('UPDATE users SET is_admin = ? WHERE id = ?', [adminFlag, userId], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (this.changes === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ id: userId, is_admin: adminFlag });
  });
});

// Admin delete user
app.delete('/api/admin/users/:id', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const userId = req.params.id;
  console.log(`[AdminDelete] request by=${req.user && req.user.username ? req.user.username : 'unknown'} target=${userId}`);
  db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
    if (err) {
      console.error('[AdminDelete] DB error', err);
      return res.status(500).json({ error: 'DB error' });
    }
    console.log(`[AdminDelete] deleted rows=${this.changes} for target=${userId}`);
    res.json({ ok: true, deleted: this.changes });
  });
});

// Admin update user names
app.post('/api/admin/users/:id/name', authMiddleware, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Forbidden' });
  const userId = req.params.id;
  const { first_name = '', last_name = '' } = req.body;
  db.run('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?', [first_name, last_name, userId], function (err) {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json({ ok: true, id: userId, first_name, last_name });
  });
});

// Serve a basic static frontend if built (optional)
const staticPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use('/', express.static(staticPath));

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  if (!FAL_KEY) console.warn('Warning: FAL_KEY not set in environment. Set FAL_KEY to call Fal.ai Queue.');
});


