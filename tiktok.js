'use strict';
// Cầu nối TikTok LIVE: đọc bình luận, quà, tim, follow rồi đổi về dạng sự kiện chung của game.
// Đây là khối duy nhất biết về TikTok. Thư viện dùng ở đây không phải của TikTok phát hành.

function createBridge(handleEvent, opts) {
  const status = { state: 'off', user: '', message: 'Chưa kết nối' };
  let conn = null, retry = null, wanted = '', streaks = new Map();

  function set(state, message) { status.state = state; status.message = message; console.log('[TikTok] ' + message); }

  function stop() {
    wanted = '';
    clearTimeout(retry); retry = null;
    if (conn) { try { conn.disconnect(); } catch (e) {} conn = null; }
    status.user = ''; set('off', 'Đã ngắt kết nối');
  }

  function scheduleRetry(seconds) {
    clearTimeout(retry);
    if (wanted) retry = setTimeout(() => open(wanted), seconds * 1000);
  }

  function open(username) {
    let lib;
    try { lib = require('tiktok-live-connector'); }
    catch (e) { return set('error', 'Thiếu thư viện. Hãy chạy lệnh: npm install'); }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    if (conn) { try { conn.disconnect(); } catch (e) {} }
    streaks = new Map();
    status.user = username;
    set('connecting', 'Đang kết nối tới @' + username + '…');

    const options = {};
    if (opts.apiKey) options.signApiKey = opts.apiKey;
    const c = conn = new TikTokLiveConnection(username, options);
    const mine = () => conn === c && wanted === username;
    const who = d => {
      const u = (d && d.user) || {};
      return { user: u.uniqueId || u.userId || '', name: u.nickname || u.uniqueId || '' };
    };

    c.on(WebcastEvent.CHAT, d => { const w = who(d); if (w.user) handleEvent({ type: 'comment', ...w, text: d.comment }); });
    c.on(WebcastEvent.LIKE, d => { const w = who(d); if (w.user) handleEvent({ type: 'like', ...w, count: d.likeCount || 1 }); });
    c.on(WebcastEvent.FOLLOW, d => { const w = who(d); if (w.user) handleEvent({ type: 'follow', ...w }); });
    c.on(WebcastEvent.GIFT, d => {
      const w = who(d); if (!w.user) return;
      const g = d.giftDetails || {};
      let count = Number(d.repeatCount) || 1;
      if (g.giftType === 1) {
        // Quà combo: TikTok gửi lại nhiều lần với số đếm tăng dần. Chỉ tính phần mới tăng thêm để hiệu ứng tới ngay.
        const key = w.user + ':' + d.giftId + ':' + (d.groupId || '');
        const prev = streaks.get(key);
        const add = count - (prev ? prev.n : 0);
        if (d.repeatEnd) streaks.delete(key); else streaks.set(key, { n: count, t: Date.now() });
        if (add <= 0) return;
        count = add;
      }
      handleEvent({ type: 'gift', ...w, gift: g.giftName || 'Quà', coins: Number(g.diamondCount) || 0, count });
    });
    c.on(WebcastEvent.STREAM_END, () => { if (mine()) { set('offline', 'Phiên LIVE đã kết thúc. Sẽ thử lại sau 30 giây.'); scheduleRetry(30); } });
    c.on(ControlEvent.DISCONNECTED, () => { if (mine() && status.state === 'live') { set('connecting', 'Mất kết nối. Sẽ thử lại sau 15 giây.'); scheduleRetry(15); } });
    c.on(ControlEvent.ERROR, e => { console.error('[TikTok] lỗi:', (e && e.info) || '', (e && e.exception && e.exception.message) || ''); });

    c.connect().then(() => { if (mine()) set('live', 'Đã kết nối tới LIVE của @' + username); })
      .catch(err => {
        if (!mine()) return;
        const text = String((err && err.message) || err);
        const offline = /offline|not.*live|isn't online/i.test((err && err.name) + ' ' + text);
        set(offline ? 'offline' : 'error', offline
          ? '@' + username + ' chưa phát LIVE. Sẽ thử lại sau 30 giây.'
          : 'Không kết nối được: ' + text.slice(0, 160) + '. Sẽ thử lại sau 30 giây.');
        scheduleRetry(30);
      });
  }

  setInterval(() => { // dọn các combo bị bỏ dở
    const old = Date.now() - 60000;
    for (const [k, v] of streaks) if (v.t < old) streaks.delete(k);
  }, 30000).unref();

  return {
    status,
    connect(username) {
      username = String(username || '').trim().replace(/^@/, '').slice(0, 40);
      if (!/^[\w.]+$/.test(username)) return set('error', 'Tên tài khoản không hợp lệ');
      clearTimeout(retry); wanted = username; open(username);
    },
    disconnect: stop
  };
}

module.exports = { createBridge };
