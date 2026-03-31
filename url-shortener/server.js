const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const dbPath = path.join(__dirname, 'db', 'urls.db');

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
app.use('/api/', limiter);

// Validate URL function
function isValidUrl(string) {
  try {
    new URL(string.startsWith('http') ? string : 'http://' + string);
    return true;
  } catch {
    return false;
  }
}

// Init DB
const db = new sqlite3.Database(dbPath);
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT UNIQUE NOT NULL,
    clicks INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_clicked DATETIME
  )`);
});

// Base62
const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function generateShortCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Short code exists
function shortCodeExists(code, callback) {
  db.get('SELECT id FROM urls WHERE short_code = ?', [code], (err, row) => {
    callback(!err && row);
  });
}

// POST /api/shorten
app.post('/api/shorten', (req, res) => {
  const { url, expiresInDays = 7 } = req.body;

  if (!isValidUrl(url)) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const fullUrl = url.startsWith('http') ? url : 'https://' + url;
  const expiresAt = new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString();

  const tryCode = (attempt) => {
    const code = generateShortCode();
    shortCodeExists(code, (exists) => {
      if (exists && attempt < 5) {
        tryCode(attempt + 1);
      } else if (exists) {
        res.status(500).json({ error: 'Could not generate unique short code' });
      } else {
        db.run('INSERT INTO urls (original_url, short_code, expires_at) VALUES (?, ?, ?)', 
          [fullUrl, code, expiresAt], function(err) {
          if (err) {
            res.status(500).json({ error: 'Database error' });
          } else {
            const shortUrl = `${req.protocol}://${req.get('host')}/${code}`;
            res.json({ 
              short_url: shortUrl,
              short_code: code,
              original_url: fullUrl,
              expires_at: expiresAt 
            });
          }
        });
      }
    });
  };
  tryCode(0);
});

// GET /:short_code redirect
app.get('/:short_code', (req, res) => {
  const { short_code } = req.params;
  db.get('SELECT * FROM urls WHERE short_code = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime(\'now\'))', 
    [short_code], (err, row) => {
    if (err || !row) {
      return res.status(404).send('<h1 class="text-center mt-20 text-2xl text-gray-500">Short link not found or expired</h1>');
    }
    db.run('UPDATE urls SET clicks = clicks + 1, last_clicked = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
    res.redirect(301, row.original_url);
  });
});

// GET /api/links (HTML for HTMX, JSON for API)
app.get('/api/links', (req, res) => {
  const accept = req.headers.accept || '';
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  db.all(`SELECT id, original_url, short_code, clicks, created_at, expires_at FROM urls 
    WHERE (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ORDER BY created_at DESC LIMIT 50`, [], (err, rows) => {
    if (err) {
      if (accept.includes('html')) {
        res.status(500).send('<tr><td colspan="6" class="px-6 py-8 text-center text-red-400">Error loading links</td></tr>');
      } else {
        res.status(500).json({ error: 'Database error' });
      }
      return;
    }
    if (accept.includes('text/html') || accept.includes('html')) {
      let html = '';
      if (rows.length === 0) {
        html = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 text-lg font-medium">No short links yet. Create your first one above! 🎉</td></tr>';
      } else {
        rows.forEach(row => {
          const shortLink = `${baseUrl}/${row.short_code}`;
          const createdDate = new Date(row.created_at).toLocaleDateString('en-US');
          const expiryDate = row.expires_at ? new Date(row.expires_at).toLocaleDateString('en-US') : 'Never';
          html += `
            <tr class="table-row">
              <td class="px-6 py-4 whitespace-nowrap font-mono">
                <a href="${shortLink}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-semibold">${row.short_code}</a>
              </td>
              <td class="px-6 py-4">
                <div title="${row.original_url}" class="text-sm text-gray-900 truncate max-w-xs">${row.original_url}</div>
              </td>
              <td class="px-6 py-4">
                <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-semibold">${row.clicks}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${createdDate}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${expiryDate}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="flex items-center gap-2">
                  <button onclick="copyToClipboard('${shortLink}')" class="copy-btn">Copy</button>
                  <canvas id="qr-${row.short_code}" class="w-8 h-8 rounded"></canvas>
                </div>
              </td>
            </tr>`;
        });
      }
      res.type('html');
      res.send(html);
    } else {
      res.json(rows);
    }
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`💾 DB: ${dbPath}`);
});

