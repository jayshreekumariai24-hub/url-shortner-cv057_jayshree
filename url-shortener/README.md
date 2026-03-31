   # Smart URL Shortener with Analytics 🚀

## Features
- 🔗 URL shortening with unique codes (base62)
- 📊 Real-time click analytics
- ⏰ Automatic expiry (customizable: 7/30/90/365 days)
- 📱 Responsive UI with Tailwind CSS
- 🔄 Live dashboard updates (HTMX)
- 📲 QR codes for each short link
- 🛡️ Rate limiting & security (Helmet)
- 💾 SQLite database (zero setup)

## Tech Stack
- **Backend**: Python + Flask
- **Database**: SQLite3 (built-in)
- **Frontend**: HTML + Tailwind CSS + HTMX + QRCode.js
- **Deployment-ready**: Render.com, Railway, PythonAnywhere

## Quick Start (Local)

1. **Setup virtual env & install:**
   ```
   cd url-shortener
   python -m venv venv
   venv\Scripts\activate  # Windows
   pip install -r requirements.txt
   ```

2. **Run the app**
   ```
   python app.py
   ```
   Opens: http://localhost:3000

3. **Usage**
   - Enter URL → Click Shorten
   - View dashboard for analytics
   - Click short links redirect + track clicks
   - Copy links / scan QR codes

## File Structure
```
.
├── server.js          # Express API + DB
├── package.json       # Dependencies
├── public/            # Static frontend
│   ├── index.html     # Dashboard
│   ├── style.css      # Custom styles
│   └── script.js      # Client logic
├── db/urls.db         # Auto-created SQLite
└── README.md          # This file
```

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/shorten` | Create short link |
| `GET`  | `/:short_code` | Redirect + track |
| `GET`  | `/api/links` | Get all links |

## Deployment (Free)

### Render.com (Recommended)
1. Push to GitHub
2. New Web Service → Connect repo
3. Build: `npm install`
4. Start: `npm start`
5. SQLite works! DB persists.

### Railway
```
npm install -g @railway/cli
railway init
railway up
```


Or use Git Bash / VSCode terminal.


###Deployed in Render
https://url-shortner-cv057-jayshree.onrender.com/
This is the code after Deployment....

## Troubleshooting
- **Port busy?** Change `PORT=3001 node server.js`
- **DB locked?** Delete `db/urls.db` and restart
- **No analytics?** Test redirect clicks

Perfect, zero-config, production-ready! ⭐

