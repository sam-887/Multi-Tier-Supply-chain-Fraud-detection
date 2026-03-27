# BillGuard v6 — Project Structure

```
billguard/
├── app.js              ← Node/Express backend server
├── package.json
├── README.md
└── public/             ← Static frontend (served by app.js)
    ├── index.html      ← HTML structure (no inline CSS/JS)
    ├── style.css       ← All styles
    └── main.js         ← All client-side logic
```

---

## Frontend (public/)

| File         | Responsibility |
|-------------|----------------|
| `index.html` | Pure HTML structure — no `<style>` or `<script>` blocks. Loads `style.css` and `main.js`. |
| `style.css`  | All CSS custom properties, resets, layouts, animations, and component styles. |
| `main.js`    | All JavaScript — bank/platform data, OCR via Tesseract.js, field extraction, verdict logic, result rendering. Organised into 14 clearly commented sections. |

The frontend is **self-contained**: it works by opening `index.html` directly in a browser (no server required for OCR-only mode). The Anthropic API call in `main.js` goes directly to `api.anthropic.com` from the browser when an API key is entered by the user.

---

## Backend (app.js)

An **Express** server with two responsibilities:

1. **Static file serving** — serves `public/` so you can visit `http://localhost:3000`.
2. **API proxy** (`POST /api/analyze`) — forwards image + OCR text to the Anthropic Claude API.  
   This keeps the API key on the server side (`ANTHROPIC_KEY` env var) rather than in the browser.

### Running the server

```bash
npm install
node app.js
# or for auto-reload during development:
node --watch app.js
```

### Environment variables

| Variable        | Default | Description |
|----------------|---------|-------------|
| `PORT`          | `3000`  | HTTP port   |
| `ANTHROPIC_KEY` | —       | Server-side Anthropic API key. If set, the browser UI does **not** need an API key field. |

### API endpoint

```
POST /api/analyze
Content-Type: application/json

{
  "apiKey"  : "sk-ant-...",   // required only if ANTHROPIC_KEY not set server-side
  "image"   : "<base-64>",    // raw base-64 image (no data-URL prefix)
  "mimeType": "image/png",
  "ocrText" : "...",          // text pre-extracted by Tesseract in the browser
  "dataset" : {               // all fields optional
    "narration" : "",
    "accNum"    : "",
    "accType"   : "",
    "holderName": "",
    "mobile"    : "",
    "pincode"   : "",
    "platform"  : "",
    "amt"       : "",
    "txn"       : "",
    "rcpt"      : ""
  }
}
```

Response:
```json
{ "ok": true, "result": { /* Claude verdict object */ } }
```

---

## Indentation fixes applied

All files now use **2-space indentation** consistently:
- `index.html` — 2-space nested HTML
- `style.css`  — 2-space property blocks, aligned values in data tables
- `main.js`    — 2-space blocks, consistent arrow-function bodies, template literals properly indented
- `app.js`     — 2-space blocks throughout
