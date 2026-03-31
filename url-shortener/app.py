from flask import Flask, request, redirect, jsonify, send_from_directory, abort
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime, timedelta
from urllib.parse import urlparse, urlunparse
import secrets
import string

app = Flask(__name__)
CORS(app)

PORT = int(os.environ.get('PORT', 5000))
DB_PATH = 'db/urls.db'

# Ensure db dir
os.makedirs('db', exist_ok=True)

# Base62 chars
CHARS = string.digits + string.ascii_uppercase + string.ascii_lowercase

def generate_short_code(length=6):
    return ''.join(secrets.choice(CHARS) for _ in range(length))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Init DB
with get_db() as conn:
    conn.execute('''
        CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_url TEXT NOT NULL,
            short_code TEXT UNIQUE NOT NULL,
            clicks INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME,
            last_clicked DATETIME
        )
    ''')
    conn.commit()

def normalize_url(url):
    if not url:
        return None
    url = url.strip()
    if len(url) > 2048 or ' ' in url:
        return None

    parsed = urlparse(url, scheme='https')
    if not parsed.netloc:
        parsed = urlparse(f'https://{url}')

    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        return None

    return urlunparse(parsed)

def is_valid_url(url):
    return normalize_url(url) is not None

@app.route('/')
def index():
    return send_from_directory('public', 'index.html')

@app.route('/<path:path>')
def serve_file_or_redirect(path):
    if path == 'favicon.ico':
        return abort(404)

    public_path = os.path.join('public', path)
    if os.path.isfile(public_path):
        return send_from_directory('public', path)

    conn = get_db()
    row = conn.execute('''
        SELECT * FROM urls 
        WHERE short_code = ? AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    ''', (path,)).fetchone()
    if not row:
        return '<h1 style="text-align: center; margin-top: 100px; font-family: Arial;">Short link not found or expired</h1>', 404
    conn.execute('UPDATE urls SET clicks = clicks + 1, last_clicked = CURRENT_TIMESTAMP WHERE id = ?', (row['id'],))
    conn.commit()
    conn.close()
    return redirect(row['original_url'], code=301)

@app.route('/api/shorten', methods=['POST'])
def shorten():
    data = request.form.to_dict() if request.form else (request.json or {})
    url = data.get('url', '').strip()
    expires_in_days = int(data.get('expiresInDays', 7))

    normalized_url = normalize_url(url)
    if not normalized_url:
        return jsonify({'error': 'Invalid URL format'}), 400

    full_url = normalized_url
    expires_at = (datetime.now() + timedelta(days=expires_in_days)).isoformat()

    conn = get_db()
    attempt = 0
    while attempt < 5:
        code = generate_short_code()
        try:
            conn.execute(
                'INSERT INTO urls (original_url, short_code, expires_at) VALUES (?, ?, ?)',
                (full_url, code, expires_at)
            )
            conn.commit()
            base_url = request.host_url.rstrip('/')
            short_url = f'{base_url}/{code}'
            conn.close()
            return jsonify({
                'short_url': short_url,
                'short_code': code,
                'original_url': full_url,
                'expires_at': expires_at
            })
        except sqlite3.IntegrityError:
            attempt += 1
    conn.close()
    return jsonify({'error': 'Could not generate unique code'}), 500

@app.route('/api/links')
def links():
    accept = request.headers.get('Accept', '')
    base_url = request.host_url.rstrip('/')
    conn = get_db()
    rows = conn.execute('''
        SELECT id, original_url, short_code, clicks, created_at, expires_at FROM urls 
        WHERE (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
        ORDER BY created_at DESC LIMIT 50
    ''').fetchall()
    conn.close()

    if 'html' in accept.lower() or request.headers.get('HX-Request') == 'true':
        html = ''
        if not rows:
            html = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 text-lg font-medium">No short links yet. Create your first one above! 🎉</td></tr>'
        else:
            for row in rows:
                short_link = f'{base_url}/{row["short_code"]}'
                created = datetime.fromisoformat(row['created_at']).strftime('%m/%d/%Y')
                expiry = datetime.fromisoformat(row['expires_at']).strftime('%m/%d/%Y') if row['expires_at'] else 'Never'
                html += f'''
                <tr class="table-row">
                  <td class="px-6 py-4 whitespace-nowrap font-mono">
                    <a href="{short_link}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-semibold">{row["short_code"]}</a>
                  </td>
                  <td class="px-6 py-4">
                    <div title="{row["original_url"]}" class="text-sm text-gray-900 truncate max-w-xs">{row["original_url"]}</div>
                  </td>
                  <td class="px-6 py-4">
                    <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-semibold">{row["clicks"]}</span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{created}</td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expiry}</td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                      <button onclick="copyToClipboard('{short_link}')" class="copy-btn">Copy</button>
                      <canvas id="qr-{row['short_code']}" class="w-8 h-8 rounded"></canvas>
                    </div>
                  </td>
                </tr>'''
        return html, 200, {'Content-Type': 'text/html'}

    return jsonify([dict(row) for row in rows])

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=False)

