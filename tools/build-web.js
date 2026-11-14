'use strict';
// Tạo bản thử chạy hoàn toàn trong trình duyệt (không cần máy chủ, không kết nối TikTok).
// Chạy: node tools/build-web.js  → ghi ra web/index.html
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const page = read('public/index.html');
const cut = (a, b) => { const i = page.indexOf(a) + a.length; return page.slice(i, page.indexOf(b, i)); };
const css = cut('<style>', '</style>');
const body = cut('<body>', '<script type="module">');
const view = cut('<script type="module">', '</script>');
const cfg = JSON.parse(read('config.json'));
delete cfg.eulerApiKey; delete cfg.port;

const demoCss = `
:root { color-scheme: dark; }
#demo { display: flex; height: 100%; }
#frame { position: relative; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: #000; }
#panel { width: 310px; flex: none; overflow: auto; background: var(--panel); color: var(--ink); border-left: 1px solid var(--line);
  padding: 18px 16px; display: flex; flex-direction: column; gap: 14px; font: 15px/1.45 system-ui, "Segoe UI", sans-serif; }
#panel h1 { margin: 0; font: 800 26px var(--font); letter-spacing: .04em; text-transform: uppercase; color: var(--hot); }
#panel p { margin: 0; color: var(--dim); font-size: 13.5px; }
#panel label { display: block; font-size: 13px; color: var(--dim); margin-bottom: 4px; }
#panel .btns { display: flex; flex-wrap: wrap; gap: 8px; }
#panel button { font: 600 14px system-ui, sans-serif; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); cursor: pointer; }
#panel button:hover { border-color: var(--hot); }
#panel button:focus-visible, #panel input:focus-visible { outline: 2px solid var(--hot); outline-offset: 2px; }
#panel input[type=text] { font: inherit; width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
#panel .check { display: flex; gap: 8px; align-items: center; color: var(--ink); font-size: 15px; margin: 0; }
@media (max-width: 760px) {
  #demo { flex-direction: column; }
  #panel { width: auto; max-height: 38%; border-left: 0; border-top: 1px solid var(--line); gap: 10px;
    padding-block: 12px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
  #panel p { display: none; }
}
`;

const panel = `
<aside id="panel">
  <h1>Bản thử trên web</h1>
  <p>Game chạy ngay trong trình duyệt với người xem giả lập. Bản này không kết nối TikTok.</p>
  <label class="check" for="dAuto"><input id="dAuto" type="checkbox" checked> Tự tạo người xem và quà</label>
  <div class="btns">
    <button id="dCrowd" type="button">Thêm 5 người xem</button>
    <button id="dStart" type="button">Xuất phát ngay</button>
  </div>
  <div>
    <label for="dWho">Tên của bạn trong game</label>
    <input id="dWho" type="text" value="ban_choi" maxlength="18">
  </div>
  <div class="btns">
    <button id="dJoin" type="button">Bình luận “1”</button>
    <button id="dLike" type="button">Thả 10 tim</button>
    <button id="dFollow" type="button">Follow</button>
  </div>
  <div>
    <label>Tặng quà cho xe của bạn</label>
    <div class="btns" id="dGifts"></div>
  </div>
</aside>`;

const shim = `
(() => {
  const CONFIG = ${JSON.stringify(cfg)};
  let stats = {};
  try { stats = JSON.parse(localStorage.getItem('dxl-stats')) || {}; } catch (e) {}
  const engine = createEngine(CONFIG, { stats, saveStats: s => { try { localStorage.setItem('dxl-stats', JSON.stringify(s)); } catch (e) {} } });

  // Màn hình game mở "api/stream"; ở bản thử, luồng đó là engine chạy ngay trong trang.
  window.EventSource = class {
    constructor() {
      let last = performance.now();
      setInterval(() => {
        const now = performance.now(); let left = Math.min(0.25, (now - last) / 1000); last = now;
        while (left > 0) { engine.tick(Math.min(0.05, left)); left -= 0.05; }
        if (this.onmessage) this.onmessage({ data: JSON.stringify(engine.snapshot()) });
      }, 50);
    }
  };

  const $ = id => document.getElementById(id);
  const NAMES = ['minh_anh', 'tuan.kiet', 'be_na', 'hoang99', 'linh_chi', 'khoa_pug', 'mit_uot', 'bao_ngoc', 'duc_tri', 'thao_my', 'long_vu', 'nhi_nhi', 'gia_huy', 'tram_anh'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const who = () => $('dWho').value.trim() || 'ban_choi';
  const stranger = () => engine.handleEvent({ type: 'comment', user: pick(NAMES) + Math.floor(Math.random() * 90 + 10), text: CONFIG.joinKeyword });

  $('dCrowd').onclick = () => { for (let i = 0; i < 5; i++) stranger(); };
  $('dStart').onclick = () => engine.adminAction({ action: 'start' });
  $('dJoin').onclick = () => engine.handleEvent({ type: 'comment', user: who(), text: CONFIG.joinKeyword });
  $('dLike').onclick = () => engine.handleEvent({ type: 'like', user: who(), count: 10 });
  $('dFollow').onclick = () => engine.handleEvent({ type: 'follow', user: who() });
  for (const g of CONFIG.gifts) {
    const b = document.createElement('button'); b.type = 'button';
    b.textContent = g.name + ' · ' + g.coins + ' xu'; b.title = CONFIG.effects[g.effect].label;
    b.onclick = () => engine.handleEvent({ type: 'gift', user: who(), gift: g.name, coins: g.coins, count: 1 });
    $('dGifts').appendChild(b);
  }

  for (let i = 0; i < 4; i++) stranger();
  setInterval(() => {
    if (!$('dAuto').checked) return;
    const real = engine.snapshot().cars.filter(c => !c.bot && c.id !== who());
    const r = Math.random();
    if (r < 0.2 || !real.length) stranger();
    else if (r < 0.6) engine.handleEvent({ type: 'like', user: pick(real).id, count: 5 + Math.floor(Math.random() * 20) });
    else { const g = pick(CONFIG.gifts.slice(0, Math.random() < 0.9 ? 2 : 4)); engine.handleEvent({ type: 'gift', user: pick(real).id, gift: g.name, coins: g.coins, count: pick([1, 1, 1, 5]) }); }
  }, 1100);
})();`;

const out = `<title>Đua Xe LIVE</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700;800&display=swap">
<style>${css}${demoCss}</style>
<div id="demo">
  <div id="frame">${body.trim()}
  </div>${panel}
</div>
<script>
${read('engine.js')}
</script>
<script>${shim}
</script>
<script type="module">${view}</script>
`;

fs.mkdirSync(path.join(ROOT, 'web', 'vendor'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'web', 'index.html'), out);
for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(ROOT, 'node_modules', 'three', 'build', f), path.join(ROOT, 'web', 'vendor', f));
console.log('Đã ghi web/index.html (' + Math.round(out.length / 1024) + ' KB)');
