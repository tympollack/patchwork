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

      // 3. Static Web Portal fallback for /verify
      if (pathname === '/verify' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Patchwork Statutory Standing Gate</title>
  <style>
    body { background-color: #0A1128; color: #FFFFFF; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; border: 1px solid #4A90E2; padding: 24px; background: rgba(10, 17, 40, 0.95); }
    h1 { color: #00E5FF; font-size: 20px; margin-top: 0; text-transform: uppercase; letter-spacing: 0.05em; }
    p { color: #94A3B8; font-size: 14px; line-height: 1.5; }
    .mono { font-family: monospace; color: #00E5FF; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Statutory 500-Ft Zoning Buffer Portal</h1>
    <p>Municipal Standing Verification & Evidentiary Dossier Engine active.</p>
    <p>Target Parcel: <span class="mono">${parsedUrl.query.p || 'Pending'}</span></p>
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
