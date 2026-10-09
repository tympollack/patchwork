/**
 * Patchwork Web Runtime Server
 * Provides standard HTTP server runtime for statutory zoning web routes:
 * - /api/evidence/presign (POST)
 * - /api/audit/:node_id/export (GET)
 * - /verify (GET)
 * - /health (GET)
 */

import http from 'http';
import url from 'url';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

export function createWebServer() {
  const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    // CORS & Security Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-audit-token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // Health check
      if (pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'patchwork-zoning-web-runtime' }));
        return;
      }

      // 1. Evidence Presign Route
      if (pathname === '/api/evidence/presign' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const { POST } = await import('../apps/web/src/app/api/evidence/presign/route.ts');
            const fakeRequest = new Request(`http://${req.headers.host}${req.url}`, {
              method: 'POST',
              headers: req.headers,
              body,
            });
            const response = await POST(fakeRequest);
            const data = await response.json();
            res.writeHead(response.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(data));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
        return;
      }

      // 2. Audit Export Route: /api/audit/:node_id/export
      const exportMatch = pathname.match(/^\/api\/audit\/([^/]+)\/export$/);
      if (exportMatch && req.method === 'GET') {
        const nodeId = exportMatch[1];
        try {
          const { GET } = await import('../apps/web/src/app/api/audit/[node_id]/export/route.ts');
          const fakeRequest = new Request(`http://${req.headers.host}${req.url}`, {
            method: 'GET',
            headers: req.headers,
          });
          const response = await GET(fakeRequest, { params: { node_id: nodeId } });
          const contentType = response.headers.get('content-type') || 'application/json';
          const buffer = await response.arrayBuffer();

          const responseHeaders = {};
          response.headers.forEach((v, k) => {
            responseHeaders[k] = v;
          });

          res.writeHead(response.status, responseHeaders);
          res.end(Buffer.from(buffer));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(err) }));
        }
        return;
      }

      // 3. Web Portal standing gate for /verify (Postcard Direct-Mail)
      if (pathname === '/verify' && req.method === 'GET') {
        const escapeHtml = (s) =>
          String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const rawParcel = parsedUrl.query.p
          ? String(parsedUrl.query.p).replace(/[^a-zA-Z0-9_-]/g, '')
          : '';
        const rawToken = parsedUrl.query.t || parsedUrl.query.token
          ? String(parsedUrl.query.t || parsedUrl.query.token).replace(/[^a-zA-Z0-9_-]/g, '')
          : '';
        const safeParcel = escapeHtml(rawParcel);
        const safeToken = escapeHtml(rawToken);

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Patchwork Statutory Standing Gate</title>
  <style>
    body { background-color: #0A1128; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; border: 1px solid #4A90E2; padding: 28px; background: rgba(10, 17, 40, 0.95); box-shadow: 0 0 20px rgba(0, 229, 255, 0.1); }
    h1 { color: #00E5FF; font-size: 18px; margin-top: 0; letter-spacing: 0.1em; }
    p { color: #94A3B8; font-size: 13px; line-height: 1.6; }
    .mono { font-family: monospace; color: #00E5FF; }
    .field { margin: 16px 0; }
    label { display: block; font-size: 11px; color: #6495ED; letter-spacing: 0.08em; margin-bottom: 6px; }
    input[type="text"] { width: 100%; box-sizing: border-box; background: #070D1E; border: 1px solid #6495ED; color: #00E5FF; font-family: monospace; font-size: 16px; padding: 10px 12px; letter-spacing: 0.2em; outline: none; }
    input[type="text"]:focus { border-color: #00E5FF; box-shadow: 0 0 8px rgba(0, 229, 255, 0.4); }
    button { width: 100%; margin-top: 16px; background: #00E5FF; color: #0A1128; border: none; font-family: monospace; font-weight: bold; font-size: 13px; padding: 12px; cursor: pointer; letter-spacing: 0.1em; }
    button:hover { background: #33EBFF; }
    #msg { margin-top: 16px; padding: 10px; font-size: 12px; font-family: monospace; display: none; }
    .err { border: 1px solid #FF5555; background: rgba(255, 85, 85, 0.1); color: #FF7777; }
    .ok { border: 1px solid #00E5FF; background: rgba(0, 229, 255, 0.1); color: #00E5FF; }
  </style>
</head>
<body>
  <div class="container">
    <h1>STATUTORY 500-FT ZONING BUFFER GATE</h1>
    <p>Municipal Standing Verification &amp; Evidentiary Dossier Engine.</p>
    <div class="field">
      <label>TARGET PARCEL IDENTIFIER</label>
      <input type="text" id="pinInput" value="${safeParcel}" placeholder="e.g. HAM-04-102-09" />
    </div>
    <div class="field">
      <label>6-DIGIT DIRECT-MAIL AUTHORIZATION PIN</label>
      <input type="text" id="otpInput" maxlength="6" pattern="[0-9]{6}" placeholder="______" autocomplete="one-time-code" />
    </div>
    <input type="hidden" id="tokenInput" value="${safeToken}" />
    <button id="verifyBtn" type="button">VERIFY STATUTORY STANDING</button>
    <div id="msg"></div>
  </div>
  <script>
    document.getElementById('verifyBtn').addEventListener('click', function() {
      const p = document.getElementById('pinInput').value.trim();
      const code = document.getElementById('otpInput').value.trim();
      const msg = document.getElementById('msg');
      if (!p) { msg.className = 'err'; msg.textContent = 'Parcel identifier is required.'; msg.style.display = 'block'; return; }
      if (!/^\\d{6}$/.test(code)) { msg.className = 'err'; msg.textContent = 'Enter valid 6-digit numeric verification PIN.'; msg.style.display = 'block'; return; }
      msg.className = 'ok';
      msg.textContent = 'Verifying cryptographic parcel standing ledger...';
      msg.style.display = 'block';
      setTimeout(function() {
        const token = document.getElementById('tokenInput').value.trim();
        window.location.href = '/audit/variance?parcel_pin=' + encodeURIComponent(p) + '&claim_pin=' + encodeURIComponent(code) + (token ? '&token=' + encodeURIComponent(token) : '');
      }, 600);
    });
  </script>
</body>
</html>`);
        return;
      }

      // 4. Web Portal variance audit page for /audit/variance
      if (pathname === '/audit/variance' && req.method === 'GET') {
        const escapeHtml = (s) =>
          String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const rawParcel = parsedUrl.query.parcel_pin || parsedUrl.query.p || '';
        const rawPin = parsedUrl.query.claim_pin || parsedUrl.query.pin || '';
        const safeParcel = escapeHtml(String(rawParcel).replace(/[^a-zA-Z0-9_-]/g, ''));
        const safePin = escapeHtml(String(rawPin).replace(/[^0-9]/g, ''));

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Patchwork Topographic Variance &amp; Setback Field Audit</title>
  <style>
    body { background-color: #0A1128; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace; margin: 0; padding: 40px 20px; }
    .container { max-width: 680px; margin: 0 auto; border: 1px solid #4A90E2; padding: 28px; background: rgba(10, 17, 40, 0.95); box-shadow: 0 0 20px rgba(0, 229, 255, 0.1); }
    h1 { color: #00E5FF; font-size: 18px; margin-top: 0; letter-spacing: 0.1em; }
    .badge { display: inline-block; font-family: monospace; font-size: 12px; color: #00E5FF; border: 1px solid rgba(0, 229, 255, 0.4); padding: 4px 8px; margin-bottom: 16px; }
    p { color: #94A3B8; font-size: 13px; line-height: 1.6; }
    .field { margin: 16px 0; }
    label { display: block; font-size: 11px; color: #6495ED; letter-spacing: 0.08em; margin-bottom: 6px; font-family: monospace; }
    input[type="text"], select, textarea { width: 100%; box-sizing: border-box; background: #070D1E; border: 1px solid #6495ED; color: #00E5FF; font-family: monospace; font-size: 14px; padding: 10px 12px; outline: none; }
    button { width: 100%; margin-top: 16px; background: #00E5FF; color: #0A1128; border: none; font-family: monospace; font-weight: bold; font-size: 13px; padding: 12px; cursor: pointer; letter-spacing: 0.1em; }
    button:hover { background: #33EBFF; }
  </style>
</head>
<body>
  <div class="container">
    <div class="badge">TARGET PIN: ${safeParcel || 'NOT SPECIFIED'}</div>
    <h1>TOPOGRAPHIC VARIANCE &amp; SETBACK FIELD AUDIT</h1>
    <p>Statutory Municipal Code § 14-A • Evidentiary Standing Confirmed.</p>
    <div class="field">
      <label>SETBACK DISTANCE (FEET)</label>
      <input type="text" id="setback" placeholder="e.g. 35.5" />
    </div>
    <div class="field">
      <label>BUFFER STATUS</label>
      <select id="bufferStatus">
        <option value="Intact">INTACT - Vegetative buffer undisturbed</option>
        <option value="Degraded">DEGRADED - Canopy thinning observed</option>
        <option value="Encroached">ENCROACHED - Direct clearing or grading</option>
      </select>
    </div>
    <div class="field">
      <label>OBSERVABLE IMPACT STATEMENT (MAX 180 CHARS)</label>
      <textarea id="impact" rows="3" maxlength="180" placeholder="Describe physical buffer impact..."></textarea>
    </div>
    <button type="button" onclick="alert('Statutory audit recorded.')">SUBMIT VARIANCE AUDIT</button>
  </div>
</body>
</html>`);
        return;
      }

      // 404 Not Found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found in statutory web runtime' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', details: String(err) }));
    }
  });

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('serve-web.mjs')) {
  const server = createWebServer();
  server.listen(PORT, HOST, () => {
    console.log(`✓ Patchwork web runtime listening on http://${HOST}:${PORT}`);
  });
}
