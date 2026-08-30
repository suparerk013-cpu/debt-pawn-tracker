// Local static file server for the PWA — no API mocking needed anymore, since the app
// talks to Firestore directly from the browser. Use this only for local dev; the real
// deployment is Firebase Hosting (see README).
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5522;
const WWW = path.join(__dirname, 'www');
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  let filePath = path.join(WWW, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(WWW)) { res.writeHead(403); return res.end(); }
  fs.readFile(filePath, (err, data) => {
    if (err) { filePath = path.join(WWW, 'index.html'); return fs.readFile(filePath, (e2, d2) => {
      if (e2) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(d2);
    }); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dev static server running at http://localhost:${PORT}`);
});
