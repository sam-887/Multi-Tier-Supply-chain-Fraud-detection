/**
 * BillGuard v6 — Backend Server (app.js)
 *
 * Responsibilities:
 *   1. Serve the static frontend (public/)
 *   2. Proxy calls to the Anthropic Claude API so the API key
 *      never has to be embedded in the browser bundle.
 *
 * Usage:
 *   npm install
 *   node app.js
 *
 * Environment variables:
 *   PORT          - HTTP port to listen on (default: 3000)
 *   ANTHROPIC_KEY - Optional server-side API key.
 *                   If set, clients do NOT need to supply their own key.
 *                   If not set, clients must send { apiKey: "sk-ant-..." }
 *                   in the request body.
 */

'use strict';

const express = require('express');
const path    = require('path');
const https   = require('https');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── Middleware ── */
app.use(express.json({ limit: '20mb' }));   // images arrive as base-64 strings
app.use(express.static(path.join(__dirname, 'public')));

/* ═══════════════════════════════════════════════════════════════
   ROUTE: POST /api/analyze
   ───────────────────────────────────────────────────────────────
   Expected request body (JSON):
   {
     "apiKey"  : "sk-ant-..."    // required if ANTHROPIC_KEY not set server-side
     "image"   : "<base-64>",    // base-64 encoded image (no data-URL prefix)
     "mimeType": "image/png",    // MIME type of the image
     "ocrText" : "...",          // text already extracted by Tesseract in the browser
     "dataset" : {               // user-supplied transaction parameters (all optional)
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

   Response body (JSON):
   {
     "ok"    : true,
     "result": { ... }  // Claude's JSON verdict object
   }
   — or on error —
   {
     "ok"    : false,
     "error" : "Human-readable error message"
   }
   ═══════════════════════════════════════════════════════════════ */
app.post('/api/analyze', async (req, res) => {
  /* ── Resolve API key ── */
  const apiKey = process.env.ANTHROPIC_KEY || req.body.apiKey;
  if (!apiKey) {
    return res.status(400).json({
      ok: false,
      error: 'No Anthropic API key provided. Set the ANTHROPIC_KEY environment variable on the server, or pass apiKey in the request body.',
    });
  }

  /* ── Validate required fields ── */
  const { image, mimeType, ocrText = '', dataset = {} } = req.body;
  if (!image || !mimeType) {
    return res.status(400).json({
      ok: false,
      error: 'Request body must contain "image" (base-64) and "mimeType".',
    });
  }

  /* ── Build Claude prompt ── */
  const systemPrompt = `You are Dr. Forensics — India's foremost payment fraud investigator with 18+ years at NPCI and RBI.
The OCR engine has already extracted the following text from the image:
<ocr_text>${ocrText}</ocr_text>
Use the OCR text AND the image together for maximum accuracy.
BANK IDENTIFICATION: Use logo, header colour, IFSC prefix visible in image.
AMOUNT: Compare all amounts digit-by-digit. Any mismatch = CRITICAL.
CALIBRATION: Bank in verified list AND platformVerified → verdict=SAFE, confidence 94–97.
Return ONLY a JSON object (no markdown):
{
  "bankDetected":bool,
  "bankName":"name or null",
  "paymentId":"string or null",
  "upiVpa":"string or null",
  "amount":"exact string or null",
  "amountDisplayMismatch":bool,
  "dateTime":"string or null",
  "paymentMethod":"string or null",
  "senderReceiver":"string or null",
  "ifscCode":"string or null",
  "accountMasked":"string or null",
  "paymentStatus":"SUCCESS/FAILED/PENDING/UNKNOWN",
  "platformVerified":bool,
  "amountMismatch":bool,
  "txnIdMismatch":bool,
  "recipientMismatch":bool,
  "narrationMismatch":bool,
  "accountNumberMismatch":bool,
  "accountTypeMismatch":bool,
  "holderNameMismatch":bool,
  "mobileNumberMismatch":bool,
  "pincodeMismatch":bool,
  "datasetMatchScore":0-100,
  "upiHandleValid":bool,
  "txnIdFormatValid":bool,
  "ifscFormatValid":bool,
  "timestampPlausible":bool,
  "visualIntegrityScore":0-100,
  "brandingConsistency":0-100,
  "typographyConsistency":0-100,
  "dataConsistency":0-100,
  "editingArtifacts":bool,
  "suspectedEdits":[],
  "demoWatermark":bool,
  "confidence":0-100,
  "isSuspicious":bool,
  "suspiciousReasons":[],
  "verdict":"SAFE/SUSPICIOUS/FAKE",
  "forensicNotes":"3-5 sentences",
  "summary":"1-2 sentence conclusion"
}`;

  const userPrompt =
    `DATASET: narration="${dataset.narration || ''}", accNum="${dataset.accNum || ''}", ` +
    `accType="${dataset.accType || ''}", name="${dataset.holderName || ''}", ` +
    `mobile="${dataset.mobile || ''}", pincode="${dataset.pincode || ''}", ` +
    `platform="${dataset.platform || ''}", amount="${dataset.amt || ''}", ` +
    `txnId="${dataset.txn || ''}", recipient="${dataset.rcpt || ''}"\n\n` +
    `Analyze this payment image thoroughly.`;

  const requestBody = JSON.stringify({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1800,
    system:     systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: image } },
          { type: 'text',  text: userPrompt },
        ],
      },
    ],
  });

  /* ── Forward to Anthropic API ── */
  const claudeResponse = await callAnthropic(requestBody, apiKey);

  if (!claudeResponse.ok) {
    return res.status(502).json({ ok: false, error: claudeResponse.error });
  }

  /* ── Parse the JSON verdict from the response ── */
  const rawText = (claudeResponse.data.content || [])
    .map(b => b.text || '')
    .join('')
    .trim();

  let verdict = null;
  try {
    verdict = JSON.parse(
      rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim()
    );
  } catch (_) {
    return res.status(502).json({
      ok: false,
      error: 'Claude returned a non-JSON response. Raw: ' + rawText.slice(0, 200),
    });
  }

  return res.json({ ok: true, result: verdict });
});

/* ═══════════════════════════════════════════════════════════════
   UTILITY: callAnthropic
   Wraps the Node.js https module to POST to the Anthropic API.
   Returns { ok: true, data: <parsed JSON> } or { ok: false, error: string }
   ═══════════════════════════════════════════════════════════════ */
function callAnthropic(bodyString, apiKey) {
  return new Promise(resolve => {
    const options = {
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':        'application/json',
        'Content-Length':      Buffer.byteLength(bodyString),
        'anthropic-version':   '2023-06-01',
        'x-api-key':           apiKey,
      },
    };

    const req = https.request(options, httpRes => {
      let raw = '';
      httpRes.on('data', chunk => { raw += chunk; });
      httpRes.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (httpRes.statusCode >= 400) {
            resolve({ ok: false, error: `Anthropic API error ${httpRes.statusCode}: ${parsed.error?.message || raw}` });
          } else {
            resolve({ ok: true, data: parsed });
          }
        } catch (_) {
          resolve({ ok: false, error: 'Failed to parse Anthropic response: ' + raw.slice(0, 200) });
        }
      });
    });

    req.on('error', err => resolve({ ok: false, error: 'Network error: ' + err.message }));
    req.write(bodyString);
    req.end();
  });
}

/* ═══════════════════════════════════════════════════════════════
   404 FALLBACK — serve index.html for any unknown route
   (supports client-side navigation if added later)
   ═══════════════════════════════════════════════════════════════ */
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ── Start ── */
app.listen(PORT, () => {
  console.log(`BillGuard v6 running at http://localhost:${PORT}`);
  console.log(`API key source: ${process.env.ANTHROPIC_KEY ? 'server environment variable' : 'client-supplied per request'}`);
});

module.exports = app;   // allows require() in tests
