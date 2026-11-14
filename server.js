'use strict';
// Máy chủ game: chạy luật chơi (engine.js), phát trạng thái cho màn hình qua SSE, nối với TikTok (tiktok.js).
// Chạy: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const createEngine = require('./engine');
const { createBridge } = require('./tiktok');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const STATS_FILE = path.join(ROOT, 'data', 'stats.json');
const SETTINGS_FILE = path.join(ROOT, 'data', 'settings.json');
const TICK = 0.05;

function readJsonFile(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; } }
function writeJsonFile(file, data) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); }
  catch (e) { console.error('Không lưu được ' + path.basename(file) + ':', e.message); }
}

const settings = readJsonFile(SETTINGS_FILE);
const bridge = createBridge(ev => engine.handleEvent(ev), { apiKey: cfg.eulerApiKey || '' });
const engine = createEngine(cfg, {
  stats: readJsonFile(STATS_FILE),
  saveStats: stats => writeJsonFile(STATS_FILE, stats),
  tiktok: () => ({ state: bridge.status.state, user: bridge.status.user || settings.tiktokUser || '', message: bridge.status.message }),
  admin(a) {
    if (a.action === 'tiktok-connect') { settings.tiktokUser = String(a.username || '').trim().replace(/^@/, ''); writeJsonFile(SETTINGS_FILE, settings); bridge.connect(settings.tiktokUser); return true; }
    if (a.action === 'tiktok-disconnect') { settings.tiktokUser = ''; writeJsonFile(SETTINGS_FILE, settings); bridge.disconnect(); return true; }
    return false;
  }
});

// ---------- HTTP ----------
const clients = new Set();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

function readJson(req, cb) {
  let body = '';
  req.on('data', d => { body += d; if (body.length > 20000) req.destroy(); });
  req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch (e) { cb(null); } });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST') {
    // Chỉ nhận lệnh từ chính trang của game, không nhận từ trang web khác.
    const origin = req.headers.origin;
    const hosts = [req.headers.host, req.headers['x-forwarded-host']].filter(Boolean);
    let from = ''; try { from = new URL(origin).host; } catch (e) {}
    if (origin && !hosts.includes(from)) { res.writeHead(403); return res.end(); }
    return readJson(req, data => {
      if (url.pathname === '/api/event') engine.handleEvent(data);
      else if (url.pathname === '/api/admin') engine.adminAction(data);
      res.writeHead(204); res.end();
    });
  }
  if (url.pathname === '/api/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('retry: 1000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  let file = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname;
  // Thư viện đồ họa 3D được phục vụ thẳng từ node_modules.
  const base = file.startsWith('/vendor/') ? path.join(ROOT, 'node_modules', 'three', 'build') : path.join(ROOT, 'public');
  if (file.startsWith('/vendor/')) file = file.slice(7);
  file = path.normalize(path.join(base, file));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Không tìm thấy'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

setInterval(() => {
  engine.tick(TICK);
  if (!clients.size) return;
  const msg = 'data: ' + JSON.stringify(engine.snapshot()) + '\n\n';
  for (const c of clients) c.write(msg);
}, TICK * 1000);

const PORT = Number(process.env.PORT) || cfg.port;
server.listen(PORT, process.env.HOST || '127.0.0.1', () => {
  console.log('Màn hình game:    http://localhost:' + PORT);
  console.log('Bảng điều khiển:  http://localhost:' + PORT + '/admin');
  if (settings.tiktokUser) bridge.connect(settings.tiktokUser);
});

module.exports = { engine };
