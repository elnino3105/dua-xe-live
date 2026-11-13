'use strict';
// Máy chủ game: giữ luật chơi và trạng thái, phát trạng thái cho màn hình qua SSE.
// Không cần cài thêm thư viện. Chạy: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const STATS_FILE = path.join(ROOT, 'data', 'stats.json');
const SETTINGS_FILE = path.join(ROOT, 'data', 'settings.json');
const { createBridge } = require('./tiktok');
const TICK = 0.05;

const COLORS = ['#ff4d5e', '#ffb02e', '#ffe14d', '#7be04a', '#27d3a2', '#35c9ff',
  '#4f8dff', '#9b6bff', '#e86bff', '#ff7ac0', '#f2f2f2', '#ff8a3d'];
const BOT_NAMES = ['Máy Sấm', 'Máy Gió', 'Máy Lửa', 'Máy Mây', 'Máy Sóng', 'Máy Núi',
  'Máy Sao', 'Máy Trăng', 'Máy Mưa', 'Máy Cát', 'Máy Băng', 'Máy Nắng'];

let stats = {};
try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { stats = {}; }
function saveStats() {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 1));
  } catch (e) { console.error('Không lưu được thành tích:', e.message); }
}

const game = {
  phase: 'lobby', timer: cfg.lobbySeconds, raceTime: 0, round: 1,
  cars: [], queue: [], feed: [], results: [],
  focus: null, focusUntil: 0, feedSeq: 0, endAt: 0
};

// ---------- tiện ích ----------
function cleanName(raw) {
  let s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 18);
  const low = s.toLowerCase();
  if (!s || cfg.bannedWords.some(w => low.includes(w))) s = 'Khách ' + Math.floor(100 + Math.random() * 900);
  return s;
}
function pushFeed(text, kind) {
  game.feed.push({ n: ++game.feedSeq, text, kind: kind || 'info' });
  if (game.feed.length > 6) game.feed.shift();
}
const findCar = id => game.cars.find(c => c.id === id);
const realCars = () => game.cars.filter(c => !c.bot);

function makeCar(id, name, bot) {
  const i = game.cars.length;
  return {
    id, name, bot: !!bot, color: COLORS[i % COLORS.length], lane: i % 4,
    dist: -8 - Math.floor(i / 4) * 16, speed: 0, form: 0, formT: 0,
    fx: { turbo: 0, super: 0, rocket: 0, slow: 0 },
    finished: false, time: 0, place: 0, active: true
  };
}

function applyEffect(car, effect, count) {
  const def = cfg.effects[effect];
  if (!def || car.finished) return;
  const dur = Math.min(def.seconds * Math.max(1, count), cfg.maxEffectSeconds);
  const add = (c, key, v) => { c.fx[key] = Math.min(c.fx[key] + v, cfg.maxEffectSeconds); };
  if (effect === 'storm') {
    for (const o of game.cars) if (o !== car && !o.finished && o.dist > car.dist) add(o, 'slow', def.seconds);
    add(car, 'super', dur);
  } else add(car, effect, dur);
}

// Trả về xe hoặc mục hàng chờ của người xem; tạo mới nếu chưa có.
function join(id, name) {
  const car = findCar(id);
  if (car) { car.active = true; return { car }; }
  let q = game.queue.find(e => e.id === id);
  if (q) return { queued: q };
  if (game.phase === 'lobby' && realCars().length < cfg.maxCars) {
    const c = makeCar(id, name, false);
    game.cars.push(c);
    pushFeed(name + ' vào đua', 'join');
    return { car: c };
  }
  if (game.queue.length >= 60) return {};
  q = { id, name, pending: [] };
  game.queue.push(q);
  pushFeed(name + ' xếp hàng cho vòng sau', 'join');
  return { queued: q };
}

function giftDef(name, coins) {
  const exact = cfg.gifts.find(g => g.name.toLowerCase() === String(name || '').toLowerCase());
  if (exact) return exact;
  let best = null;
  for (const g of cfg.gifts) if (g.coins <= coins && (!best || g.coins > best.coins)) best = g;
  return best || cfg.gifts[0];
}

// ---------- sự kiện từ người xem (cầu nối TikTok hoặc giả lập) ----------
function handleEvent(ev) {
  if (!ev || typeof ev !== 'object') return;
  const id = String(ev.user || ev.name || '').slice(0, 40);
  if (!id) return;
  const name = cleanName(ev.name || ev.user);
  const count = Math.max(1, Math.min(9999, Math.floor(Number(ev.count) || 1)));

  if (ev.type === 'comment') {
    const text = String(ev.text || '').trim().toLowerCase();
    if (text === cfg.joinKeyword.toLowerCase()) join(id, name);
    else { const c = findCar(id); if (c) c.active = true; }
  } else if (ev.type === 'like') {
    const c = findCar(id);
    if (c) {
      c.active = true;
      if (game.phase === 'race' && !c.finished) c.fx.turbo = Math.min(c.fx.turbo + cfg.likeTurboSeconds * count, 2);
    }
  } else if (ev.type === 'follow') {
    const r = join(id, name);
    if (r.car) applyEffect(r.car, 'turbo', 1);
    else if (r.queued) r.queued.pending.push({ effect: 'turbo', count: 1 });
    pushFeed(name + ' đã follow → ' + cfg.effects.turbo.label, 'follow');
  } else if (ev.type === 'gift') {
    const coins = Math.max(0, Number(ev.coins) || 0);
    const g = giftDef(ev.gift, coins);
    const r = join(id, name);
    if (r.car) {
      applyEffect(r.car, g.effect, count);
      if ((coins || g.coins) * count >= cfg.focusMinCoins) { game.focus = r.car.id; game.focusUntil = Date.now() + 4000; }
    } else if (r.queued) r.queued.pending.push({ effect: g.effect, count });
    pushFeed(name + ' tặng ' + (ev.gift || g.name) + (count > 1 ? ' ×' + count : '') + ' → ' + cfg.effects[g.effect].label, 'gift');
  }
}

// ---------- kết nối TikTok ----------
let settings = {};
try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (e) { settings = {}; }
function saveSettings() {
  try { fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true }); fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 1)); }
  catch (e) { console.error('Không lưu được cài đặt:', e.message); }
}
const bridge = createBridge(ev => handleEvent(ev), { apiKey: cfg.eulerApiKey || '' });

// ---------- vòng lặp game ----------
function startCountdown() {
  let b = 0;
  while (game.cars.length < cfg.minCars) {
    const used = new Set(game.cars.map(c => c.name));
    const nm = BOT_NAMES.find(n => !used.has(n)) || 'Máy ' + (++b);
    game.cars.push(makeCar('bot:' + nm, nm, true));
  }
  game.phase = 'countdown'; game.timer = 3;
}

function ranking() {
  return game.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.place - b.place;
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.dist - a.dist;
  });
}

function endRace() {
  game.results = ranking().slice(0, 3).map(c => ({ name: c.name, color: c.color, time: c.finished ? c.time : null }));
  for (const c of game.cars) {
    if (c.bot || !c.finished) continue;
    const s = stats[c.id] || (stats[c.id] = { name: c.name, wins: 0, best: null });
    s.name = c.name;
    if (c.place === 1) s.wins++;
    if (s.best == null || c.time < s.best) s.best = c.time;
  }
  saveStats();
  const w = game.results[0];
  if (w) pushFeed(w.name + ' thắng vòng ' + game.round, 'win');
  game.phase = 'podium'; game.timer = cfg.podiumSeconds;
}

function newLobby() {
  const keep = cfg.keepActivePlayers ? game.cars.filter(c => !c.bot && c.active) : [];
  game.cars = [];
  for (const k of keep) { const c = makeCar(k.id, k.name, false); c.active = false; game.cars.push(c); }
  while (game.queue.length && realCars().length < cfg.maxCars) {
    const q = game.queue.shift();
    const c = makeCar(q.id, q.name, false);
    game.cars.push(c);
    for (const p of q.pending) applyEffect(c, p.effect, p.count);
  }
  game.results = []; game.round++; game.raceTime = 0; game.endAt = 0;
  game.phase = 'lobby'; game.timer = cfg.lobbySeconds;
}

function tick(dt) {
  if (game.phase === 'lobby') {
    game.timer -= dt;
    if (game.timer <= 0) startCountdown();
  } else if (game.phase === 'countdown') {
    game.timer -= dt;
    if (game.timer <= 0) { game.phase = 'race'; game.raceTime = 0; }
  } else if (game.phase === 'race') {
    game.raceTime += dt;
    const total = cfg.laps * cfg.lapLength;
    let lead = -Infinity;
    for (const c of game.cars) if (!c.finished && c.dist > lead) lead = c.dist;
    let placed = game.cars.filter(c => c.finished).length;
    for (const c of game.cars) {
      if (c.finished) { c.speed *= 0.97; c.dist += c.speed * dt; continue; }
      c.formT -= dt;
      if (c.formT <= 0) { c.formT = 1.5 + Math.random() * 2; c.formGoal = (Math.random() * 2 - 1) * 0.07; }
      c.form += ((c.formGoal || 0) - c.form) * Math.min(1, dt * 1.5);
      let m = 1;
      for (const k of ['turbo', 'super', 'rocket']) if (c.fx[k] > 0) { m += cfg.effects[k].boost; c.fx[k] = Math.max(0, c.fx[k] - dt); }
      m = Math.min(m, cfg.maxSpeedMult);
      if (c.fx.slow > 0) { m *= 1 - cfg.effects.storm.slow; c.fx.slow = Math.max(0, c.fx.slow - dt); }
      const catchUp = Math.min(cfg.catchUpMax, Math.max(0, lead - c.dist) / cfg.lapLength * 0.4);
      const target = cfg.baseSpeed * (1 + c.form + catchUp) * m;
      c.speed += (target - c.speed) * Math.min(1, dt * 3);
      c.dist += c.speed * dt;
      if (c.dist >= total) { c.finished = true; c.place = ++placed; c.time = Math.round(game.raceTime * 100) / 100; }
    }
    if (placed >= Math.min(3, game.cars.length) && !game.endAt) game.endAt = game.raceTime + 4;
    if (placed === game.cars.length || (game.endAt && game.raceTime >= game.endAt) || game.raceTime >= cfg.maxRaceSeconds) endRace();
  } else if (game.phase === 'podium') {
    for (const c of game.cars) { c.speed *= 0.97; c.dist += c.speed * dt; }
    game.timer -= dt;
    if (game.timer <= 0) newLobby();
  }
}

function snapshot() {
  const rank = ranking();
  const list = Object.values(stats);
  return {
    phase: game.phase, timer: Math.max(0, game.timer), raceTime: game.raceTime, round: game.round,
    laps: cfg.laps, lapLength: cfg.lapLength, joinKeyword: cfg.joinKeyword, maxCars: cfg.maxCars,
    cars: rank.map((c, i) => ({
      id: c.id, name: c.name, color: c.color, lane: c.lane, d: Math.round(c.dist * 100) / 100,
      v: Math.round(c.speed * 10) / 10, bot: c.bot, fin: c.finished, time: c.time, rank: i + 1,
      fx: Object.keys(c.fx).filter(k => c.fx[k] > 0)
    })),
    queue: game.queue.slice(0, 6).map(q => q.name), queueLen: game.queue.length,
    feed: game.feed, results: game.results,
    tiktok: { state: bridge.status.state, user: bridge.status.user || settings.tiktokUser || '', message: bridge.status.message },
    focus: Date.now() < game.focusUntil ? game.focus : null,
    gifts: cfg.gifts.map(g => ({ name: g.name, coins: g.coins, label: cfg.effects[g.effect].label, effect: g.effect })),
    topWins: list.filter(s => s.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, 6).map(s => ({ name: s.name, wins: s.wins })),
    topBest: list.filter(s => s.best != null).sort((a, b) => a.best - b.best).slice(0, 6).map(s => ({ name: s.name, best: s.best }))
  };
}

function adminAction(a) {
  if (!a) return;
  if (a.action === 'start' && game.phase === 'lobby') game.timer = 0;
  else if (a.action === 'end' && game.phase === 'race') endRace();
  else if (a.action === 'reset') { game.cars = []; game.queue = []; game.feed = []; game.round = 0; newLobby(); }
  else if (a.action === 'tiktok-connect') { settings.tiktokUser = String(a.username || '').trim().replace(/^@/, ''); saveSettings(); bridge.connect(settings.tiktokUser); }
  else if (a.action === 'tiktok-disconnect') { settings.tiktokUser = ''; saveSettings(); bridge.disconnect(); }
  else if (a.action === 'kick') {
    game.cars = game.cars.filter(c => c.id !== a.id);
    game.queue = game.queue.filter(q => q.id !== a.id);
  }
}

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
      if (url.pathname === '/api/event') handleEvent(data);
      else if (url.pathname === '/api/admin') adminAction(data);
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
  tick(TICK);
  if (!clients.size) return;
  const msg = 'data: ' + JSON.stringify(snapshot()) + '\n\n';
  for (const c of clients) c.write(msg);
}, TICK * 1000);

server.listen(Number(process.env.PORT) || cfg.port, process.env.HOST || '127.0.0.1', () => {
  console.log('Màn hình game:    http://localhost:' + cfg.port);
  console.log('Bảng điều khiển:  http://localhost:' + cfg.port + '/admin');
  if (settings.tiktokUser) bridge.connect(settings.tiktokUser);
});

module.exports = { handleEvent };
