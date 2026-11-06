/* ============================================================
   RsfNotes · 俄罗斯方块 Tetris（独立街机版嵌入）
   来源：WorkBuddy tetris.html，已适配博客游戏页
   规则：10×20 · 7-bag · 简化 SRS 踢墙 · Hold · Ghost
   皮肤：经典街机 / Game Boy 单色（只作用于 .tetris-app）
   ============================================================ */
(function () {
  'use strict';

  const panel = document.getElementById('tetrisPanel');
  const app = document.getElementById('tetrisRoot');
  if (!panel || !app) return;

  /* ---------- 常量与形状 ---------- */
  const COLS = 10, ROWS = 20, CELL = 30;
  const COLORS = {
    I: '#3fbdd0', J: '#3f57b8', L: '#cf7c24', O: '#d6bb2b',
    S: '#3fa04c', T: '#9344b0', Z: '#c33a3a',
  };
  const GB = { pale: '#9bbc0f', light: '#8bac0f', mid: '#306230', dark: '#0f380f' };
  const SHAPES = {
    I: [
      ['....', 'IIII', '....', '....'],
      ['..I.', '..I.', '..I.', '..I.'],
      ['....', '....', 'IIII', '....'],
      ['.I..', '.I..', '.I..', '.I..'],
    ],
    J: [
      ['J...', 'JJJ.', '....', '....'],
      ['.JJ.', '.J..', '.J..', '....'],
      ['....', 'JJJ.', '..J.', '....'],
      ['.J..', '.J..', 'JJ..', '....'],
    ],
    L: [
      ['..L.', 'LLL.', '....', '....'],
      ['.L..', '.L..', '.LL.', '....'],
      ['....', 'LLL.', 'L...', '....'],
      ['.LL.', '..L.', '..L.', '....'],
    ],
    O: [
      ['.OO.', '.OO.', '....', '....'],
      ['.OO.', '.OO.', '....', '....'],
      ['.OO.', '.OO.', '....', '....'],
      ['.OO.', '.OO.', '....', '....'],
    ],
    S: [
      ['.SS.', 'SS..', '....', '....'],
      ['.S..', '.SS.', '..S.', '....'],
      ['....', '.SS.', 'SS..', '....'],
      ['S...', 'SS..', '.S..', '....'],
    ],
    T: [
      ['.T..', 'TTT.', '....', '....'],
      ['.T..', '.TT.', '.T..', '....'],
      ['....', 'TTT.', '.T..', '....'],
      ['.T..', 'TT..', '.T..', '....'],
    ],
    Z: [
      ['ZZ..', '.ZZ.', '....', '....'],
      ['..Z.', '.ZZ.', '.Z..', '....'],
      ['....', 'ZZ..', '.ZZ.', '....'],
      ['.Z..', 'ZZ..', 'Z...', '....'],
    ],
  };
  const TYPES = Object.keys(SHAPES);
  const KICKS = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, -1], [0, -2]];
  const LINE_SCORE = [0, 100, 300, 500, 800];
  const DAS = 150, ARR = 42, SOFT_ARR = 38, CLEAR_MS = 210;

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const boardCv = $('tetrisBoard');
  const holdCv = $('tetrisHold');
  const nextCvs = Array.prototype.slice.call(document.querySelectorAll('.tetris-nxt'));
  const overlay = $('tetrisOverlay');
  if (!boardCv || !holdCv || !overlay) return;

  const ctx = setupCanvas(boardCv, COLS * CELL, ROWS * CELL);
  const holdCtx = setupCanvas(holdCv, 120, 76);
  const nextCtxs = nextCvs.map((c) => setupCanvas(c, 120, 62));

  function setupCanvas(cv, w, h) {
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  }

  /* ---------- 状态 ---------- */
  let board, queue, holdType, canHold, cur;
  let score, lines, level, best = 0, status = 'ready';
  let dropAcc = 0, clearAcc = 0, clearingRows = [];
  let audioOn = true, actx = null;
  let lastT = 0, theme = 'classic', dotPattern = null;
  try { best = parseInt(localStorage.getItem('rsf_tetris_best') || '0', 10) || 0; } catch (e) {}
  try { if (localStorage.getItem('rsf_tetris_theme') === 'gb') theme = 'gb'; } catch (e) {}

  function emptyRow() { return new Array(COLS).fill(null); }
  function emptyBoard() { return Array.from({ length: ROWS }, emptyRow); }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  function refill() {
    while (queue.length < 8) queue = queue.concat(shuffle(TYPES.slice()));
  }
  function takeNext() { refill(); return queue.shift(); }

  /* ---------- 8-bit 音效（WebAudio 合成，无外部资源） ---------- */
  function tone(freq, dur, vol, slide) {
    if (!audioOn) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol || 0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function sfx(kind) {
    if (kind === 'move') tone(210, 0.03, 0.012);
    if (kind === 'rotate') tone(470, 0.05, 0.026, 140);
    if (kind === 'lock') tone(150, 0.06, 0.032, -70);
    if (kind === 'drop') tone(100, 0.08, 0.038, -60);
    if (kind === 'hold') tone(320, 0.06, 0.026, 180);
    if (kind === 'clear') { tone(523, 0.07, 0.035); setTimeout(() => tone(784, 0.1, 0.035), 70); }
    if (kind === 'tetris') {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.11, 0.036), i * 65));
    }
    if (kind === 'start') {
      [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.09, 0.03), i * 80));
    }
    if (kind === 'over') {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.032), i * 120));
    }
  }

  /* ---------- 几何与碰撞 ---------- */
  function cellsOf(p) {
    const m = SHAPES[p.type][p.rot], out = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (m[r][c] !== '.') out.push([p.x + c, p.y + r]);
      }
    }
    return out;
  }
  function collides(p) {
    return cellsOf(p).some(([x, y]) =>
      x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null)
    );
  }
  function tryMove(dx, dy) {
    if (!cur) return false;
    const p = { type: cur.type, rot: cur.rot, x: cur.x + dx, y: cur.y + dy };
    if (collides(p)) return false;
    cur.x = p.x; cur.y = p.y;
    return true;
  }
  function rotate(dir) {
    const nr = (cur.rot + (dir > 0 ? 1 : 3)) % 4;
    for (const [kx, ky] of KICKS) {
      const p = { type: cur.type, rot: nr, x: cur.x + kx, y: cur.y + ky };
      if (!collides(p)) {
        cur.rot = nr; cur.x = p.x; cur.y = p.y;
        sfx('rotate');
        return true;
      }
    }
    return false;
  }
  function ghostY() {
    let y = cur.y;
    while (!collides({ type: cur.type, rot: cur.rot, x: cur.x, y: y + 1 })) y++;
    return y;
  }

  /* ---------- 游戏流程 ---------- */
  function makePiece(type) { return { type: type, rot: 0, x: 3, y: 0 }; }
  function spawnPiece(type) {
    cur = makePiece(type);
    dropAcc = 0;
    if (collides(cur)) gameOver();
  }
  function spawnFromQueue() {
    canHold = true;
    spawnPiece(takeNext());
    renderPreviews();
  }
  function newGame() {
    board = emptyBoard();
    queue = []; holdType = null; canHold = true; cur = null;
    score = 0; lines = 0; level = 1;
    dropAcc = 0; clearAcc = 0; clearingRows = [];
    refill();
    status = 'playing';
    spawnFromQueue();
    clearRepeats();
    updateHUD();
    drawMini(holdCtx, null, 120, 76);
    setOverlay(null);
    updatePauseBtn();
    sfx('start');
  }
  function gameOver() {
    status = 'over';
    if (score > best) {
      best = score;
      try { localStorage.setItem('rsf_tetris_best', String(best)); } catch (e) {}
    }
    updateHUD();
    updatePauseBtn();
    sfx('over');
    setOverlay('over');
  }
  function lock() {
    let topOut = false;
    for (const [x, y] of cellsOf(cur)) {
      if (y < 0) topOut = true;
      else board[y][x] = cur.type;
    }
    cur = null;
    sfx('lock');
    if (topOut) { gameOver(); return; }

    const full = [];
    for (let y = 0; y < ROWS; y++) {
      if (board[y].every((v) => v !== null)) full.push(y);
    }

    if (full.length) {
      clearingRows = full;
      clearAcc = 0;
      status = 'clearing';
      sfx(full.length >= 4 ? 'tetris' : 'clear');
    } else {
      spawnFromQueue();
    }
  }
  function finishClear() {
    const n = clearingRows.length;
    board = board.filter((_, i) => clearingRows.indexOf(i) === -1);
    while (board.length < ROWS) board.unshift(emptyRow());
    clearingRows = [];
    score += LINE_SCORE[Math.min(n, 4)] * level;
    lines += n;
    level = Math.floor(lines / 10) + 1;
    updateHUD();
    status = 'playing';
    spawnFromQueue();
  }
  function stepDown() {
    if (!tryMove(0, 1)) lock();
  }
  function softDrop() {
    if (tryMove(0, 1)) { score += 1; dropAcc = 0; updateHUD(); }
    else lock();
  }
  function hardDrop() {
    let d = 0;
    while (tryMove(0, 1)) d++;
    score += d * 2;
    updateHUD();
    sfx('drop');
    lock();
  }
  function holdPiece() {
    if (!canHold || status !== 'playing') return;
    const old = holdType;
    holdType = cur.type;
    if (old) spawnPiece(old); else spawnFromQueue();
    canHold = false;
    drawMini(holdCtx, holdType, 120, 76);
    sfx('hold');
  }
  function togglePause() {
    if (status === 'clearing') finishClear();
    if (status === 'playing') {
      status = 'paused';
      setOverlay('paused');
      clearRepeats();
      updatePauseBtn();
    } else if (status === 'paused') {
      status = 'playing';
      setOverlay(null);
      updatePauseBtn();
      focusGame();
    }
  }
  function pauseGame() {
    if (status === 'clearing') finishClear();
    if (status === 'playing') togglePause();
    clearRepeats();
  }
  function updatePauseBtn() {
    const b = $('tetrisBtnPause');
    if (b) b.textContent = status === 'paused' ? '继续' : '暂停';
  }
  function dropInterval() { return Math.max(70, 800 * Math.pow(0.84, level - 1)); }

  /* ---------- HUD 与主题 ---------- */
  function updateHUD() {
    $('tetrisScore').textContent = score.toLocaleString('en-US');
    $('tetrisBest').textContent = Math.max(best, score).toLocaleString('en-US');
    $('tetrisLines').textContent = lines;
    $('tetrisLevel').textContent = level;
  }
  function setOverlay(mode) {
    if (!mode) { overlay.classList.add('hidden'); return; }
    const cfg = {
      paused: ['▣', 'PAUSE', '游戏已暂停', 'CONTINUE', '按 P 继续'],
      over: ['▣', 'GAME OVER',
        '本次得分 ' + score.toLocaleString('en-US') + '\n最高分 ' + best.toLocaleString('en-US'),
        'RETRY', 'PRESS SPACE TO RESTART'],
    }[mode];
    if (!cfg) return;
    $('tetrisOvIcon').textContent = cfg[0];
    $('tetrisOvTitle').textContent = cfg[1];
    $('tetrisOvText').textContent = cfg[2];
    $('tetrisOvBtn').textContent = cfg[3];
    $('tetrisOvHint').textContent = cfg[4];
    $('tetrisOvHint').classList.toggle('blink', mode === 'over');
    overlay.classList.remove('hidden');
  }
  function applyTheme() {
    app.dataset.theme = theme;
    const btn = $('tetrisBtnTheme');
    if (btn) btn.textContent = '风格: ' + (theme === 'gb' ? 'GB 单色' : '经典街机');
    try { localStorage.setItem('rsf_tetris_theme', theme); } catch (e) {}
    drawMini(holdCtx, holdType, 120, 76);
    renderPreviews();
  }
  function toggleTheme() {
    theme = theme === 'classic' ? 'gb' : 'classic';
    applyTheme();
    sfx('rotate');
  }

  /* ---------- 绘制 ---------- */
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    return 'rgb(' + [r, g, b].map((v) => Math.round(v + (t - v) * a)).join(',') + ')';
  }
  function drawClassicCell(c, x, y, w, h, type, ghost) {
    const color = COLORS[type];
    if (ghost) {
      c.save();
      c.strokeStyle = color; c.globalAlpha = 0.5; c.lineWidth = 1;
      c.setLineDash([3, 3]);
      c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      c.restore();
      return;
    }
    const b = Math.max(2, Math.round(w * 0.11));
    c.fillStyle = color; c.fillRect(x, y, w, h);
    c.fillStyle = shade(color, 0.5);
    c.fillRect(x, y, w, b); c.fillRect(x, y, b, h);
    c.fillStyle = shade(color, -0.5);
    c.fillRect(x, y + h - b, w, b); c.fillRect(x + w - b, y, b, h);
    c.fillStyle = 'rgba(0,0,0,.3)';
    c.fillRect(x + b, y + b, w - 2 * b, 1); c.fillRect(x + b, y + b, 1, h - 2 * b);
    c.fillStyle = 'rgba(255,255,255,.42)';
    c.fillRect(Math.round(x + w / 2) - 1, Math.round(y + h / 2) - 1, 2, 2);
  }
  function drawGBCell(c, x, y, w, h, type, ghost) {
    if (ghost) {
      c.save();
      c.strokeStyle = GB.mid; c.lineWidth = 1; c.setLineDash([2, 3]);
      c.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      c.restore();
      return;
    }
    c.fillStyle = GB.mid; c.fillRect(x, y, w, h);
    c.fillStyle = GB.dark;
    c.fillRect(x, y, w, 2); c.fillRect(x, y + h - 2, w, 2);
    c.fillRect(x, y, 2, h); c.fillRect(x + w - 2, y, 2, h);
    const cx = x + w / 2, cy = y + h / 2;
    c.fillStyle = GB.dark;
    switch (type) {
      case 'I': c.fillRect(x + 5, cy - 1, w - 10, 2); break;
      case 'J': c.fillRect(cx - 3, cy - 3, 6, 6); break;
      case 'L': c.fillRect(x + 5, y + 5, 3, 3); c.fillRect(x + w - 8, y + h - 8, 3, 3); break;
      case 'O': c.fillRect(cx - 4, cy - 4, 8, 8); c.fillStyle = GB.light; c.fillRect(cx - 2, cy - 2, 4, 4); break;
      case 'S': c.fillRect(cx - 1, y + 5, 2, h - 10); c.fillRect(x + 5, cy - 1, w - 10, 2); break;
      case 'T': c.strokeStyle = GB.dark; c.lineWidth = 2; c.strokeRect(cx - 4, cy - 4, 8, 8); break;
      case 'Z': for (let i = 0; i < 3; i++) c.fillRect(x + 5, y + 7 + i * 5, w - 10, 2); break;
    }
  }
  function drawCell(c, px, py, size, type, ghost) {
    const pad = Math.max(1, Math.round(size * 0.055));
    const x = px + pad, y = py + pad, w = size - pad * 2, h = size - pad * 2;
    if (theme === 'gb') drawGBCell(c, x, y, w, h, type, ghost);
    else drawClassicCell(c, x, y, w, h, type, ghost);
  }
  function makeDotPattern() {
    const t = document.createElement('canvas');
    t.width = 4; t.height = 4;
    const c = t.getContext('2d');
    c.fillStyle = GB.light; c.fillRect(0, 0, 4, 4);
    c.fillStyle = 'rgba(15,56,15,.13)'; c.fillRect(0, 0, 1, 1);
    dotPattern = ctx.createPattern(t, 'repeat');
  }
  function renderBoard() {
    const W = COLS * CELL, H = ROWS * CELL;
    if (theme === 'gb') {
      ctx.fillStyle = dotPattern || GB.light; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    }
    ctx.strokeStyle = theme === 'gb' ? 'rgba(15,56,15,.16)' : 'rgba(255,255,255,.065)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < COLS; x++) { ctx.moveTo(x * CELL + 0.5, 0); ctx.lineTo(x * CELL + 0.5, H); }
    for (let y = 1; y < ROWS; y++) { ctx.moveTo(0, y * CELL + 0.5); ctx.lineTo(W, y * CELL + 0.5); }
    ctx.stroke();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = board[y][x];
        if (t) drawCell(ctx, x * CELL, y * CELL, CELL, t, false);
      }
    }

    if (cur && (status === 'playing' || status === 'paused')) {
      const gy = ghostY();
      if (gy !== cur.y) {
        const probe = { type: cur.type, rot: cur.rot, x: cur.x, y: gy };
        for (const [x, y] of cellsOf(probe)) {
          if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, cur.type, true);
        }
      }
      for (const [x, y] of cellsOf(cur)) {
        if (y >= 0) drawCell(ctx, x * CELL, y * CELL, CELL, cur.type, false);
      }
    }

    if (status === 'clearing') {
      const k = clearAcc / CLEAR_MS;
      const a = 0.3 + 0.6 * Math.abs(Math.sin(k * Math.PI * 3));
      ctx.fillStyle = theme === 'gb'
        ? 'rgba(15,56,15,' + a.toFixed(3) + ')'
        : 'rgba(255,255,255,' + a.toFixed(3) + ')';
      for (const y of clearingRows) ctx.fillRect(0, y * CELL, W, CELL);
    }
  }
  function drawMini(c, type, w, h) {
    c.clearRect(0, 0, w, h);
    if (!type) return;
    const m = SHAPES[type][0];
    let r0 = 4, r1 = -1, c0 = 4, c1 = -1;
    for (let r = 0; r < 4; r++) {
      for (let k = 0; k < 4; k++) {
        if (m[r][k] !== '.') {
          r0 = Math.min(r0, r); r1 = Math.max(r1, r);
          c0 = Math.min(c0, k); c1 = Math.max(c1, k);
        }
      }
    }
    const pw = c1 - c0 + 1, ph = r1 - r0 + 1;
    const size = Math.min(h - 12, (w - 14) / pw, (h - 12) / ph, 24);
    const ox = (w - pw * size) / 2, oy = (h - ph * size) / 2;
    for (let r = r0; r <= r1; r++) {
      for (let k = c0; k <= c1; k++) {
        if (m[r][k] !== '.') drawCell(c, ox + (k - c0) * size, oy + (r - r0) * size, size, type, false);
      }
    }
  }
  function renderPreviews() {
    for (let i = 0; i < nextCtxs.length; i++) drawMini(nextCtxs[i], queue[i], 120, 62);
  }

  /* ---------- 主循环 ---------- */
  function isActive() { return !panel.hidden; }
  function loop(t) {
    const dt = Math.min(60, t - lastT || 16);
    lastT = t;
    if (!isActive()) {
      requestAnimationFrame(loop);
      return;
    }
    if (status === 'playing') {
      handleRepeats(dt);
      dropAcc += dt;
      if (dropAcc >= dropInterval()) { dropAcc = 0; stepDown(); }
    } else if (status === 'clearing') {
      clearAcc += dt;
      if (clearAcc >= CLEAR_MS) finishClear();
    }
    renderBoard();
    requestAnimationFrame(loop);
  }

  /* ---------- 输入 ---------- */
  const held = { left: false, right: false, down: false };
  const timer = { left: 0, right: 0, down: 0 };
  const action = {
    left: () => { if (tryMove(-1, 0)) sfx('move'); },
    right: () => { if (tryMove(1, 0)) sfx('move'); },
    down: softDrop,
  };
  function press(dir) {
    if (status !== 'playing') return;
    if (!held[dir]) {
      held[dir] = true;
      action[dir]();
      timer[dir] = -(dir === 'down' ? 60 : DAS) + (dir === 'down' ? SOFT_ARR : ARR);
    }
  }
  function release(dir) { held[dir] = false; }
  function clearRepeats() { held.left = held.right = held.down = false; }
  function handleRepeats(dt) {
    for (const d of ['left', 'right', 'down']) {
      if (!held[d]) continue;
      const arr = d === 'down' ? SOFT_ARR : ARR;
      timer[d] += dt;
      let guard = 0;
      while (timer[d] >= arr && guard++ < 8 && status === 'playing' && cur) {
        action[d]();
        timer[d] -= arr;
      }
    }
  }
  function doAct(a) {
    if (a === 'pause') { togglePause(); return; }
    if (a === 'new') { newGame(); return; }
    if (a === 'sound') { toggleSound(); return; }
    if (a === 'theme') { toggleTheme(); return; }
    if (status === 'ready' || status === 'over') { if (a === 'drop') newGame(); return; }
    if (status !== 'playing') return;
    if (a === 'left' || a === 'right' || a === 'down') press(a);
    else if (a === 'rotate') rotate(1);
    else if (a === 'ccw') rotate(-1);
    else if (a === 'drop') hardDrop();
    else if (a === 'hold') holdPiece();
  }
  function toggleSound() {
    audioOn = !audioOn;
    const btn = $('tetrisBtnSound');
    if (btn) btn.textContent = '音效 ' + (audioOn ? '开' : '关');
    if (audioOn) sfx('rotate');
  }
  function focusGame() {
    try { app.focus({ preventScroll: true }); } catch (e) { app.focus(); }
  }
  function isFormTarget(el) {
    return !!(el && el.closest && el.closest('input, textarea, select, button, a, [contenteditable="true"]'));
  }

  document.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isFormTarget(e.target)) return;

    const k = e.key.toLowerCase();
    const block = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'spacebar',
      'p', 'r', 'c', 'z', 'x', 'enter', 't'];
    if (block.indexOf(k) !== -1) e.preventDefault();
    if (e.repeat && ['arrowleft', 'arrowright', 'arrowdown'].indexOf(k) === -1) return;

    if (k === 't') { toggleTheme(); return; }
    if (k === 'r') { newGame(); focusGame(); return; }
    if (k === 'p' || k === 'escape') { togglePause(); return; }
    if (status === 'ready' || status === 'over') {
      if (k === ' ' || k === 'enter') { newGame(); focusGame(); }
      return;
    }
    if (status !== 'playing') return;
    switch (k) {
      case 'arrowleft': press('left'); break;
      case 'arrowright': press('right'); break;
      case 'arrowdown': press('down'); break;
      case 'arrowup': case 'x': rotate(1); break;
      case 'z': rotate(-1); break;
      case ' ': case 'spacebar': hardDrop(); break;
      case 'c': case 'shift': holdPiece(); break;
    }
  });

  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'arrowleft') release('left');
    if (k === 'arrowright') release('right');
    if (k === 'arrowdown') release('down');
  });

  window.addEventListener('blur', () => {
    clearRepeats();
    pauseGame();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearRepeats();
      pauseGame();
    }
  });

  /* ---------- 按钮 ---------- */
  const ovBtn = $('tetrisOvBtn');
  if (ovBtn) {
    ovBtn.addEventListener('click', () => {
      if (status === 'paused') togglePause();
      else newGame();
      focusGame();
    });
  }
  const btnNew = $('tetrisBtnNew');
  if (btnNew) btnNew.addEventListener('click', () => { newGame(); focusGame(); });
  const btnPause = $('tetrisBtnPause');
  if (btnPause) btnPause.addEventListener('click', () => { togglePause(); focusGame(); });
  const btnSound = $('tetrisBtnSound');
  if (btnSound) btnSound.addEventListener('click', () => { toggleSound(); focusGame(); });
  const btnTheme = $('tetrisBtnTheme');
  if (btnTheme) btnTheme.addEventListener('click', () => { toggleTheme(); focusGame(); });

  document.querySelectorAll('.tetris-tbtn').forEach((btn) => {
    const a = btn.dataset.act;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.classList.add('on');
      doAct(a);
    });
    const off = () => {
      btn.classList.remove('on');
      if (a === 'left' || a === 'right' || a === 'down') release(a);
    };
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
  window.addEventListener('pointerup', clearRepeats);

  app.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('button, a, input, textarea, select')) return;
    focusGame();
  });

  /* ---------- 棋盘手势：滑动移动、下滑硬降、轻点旋转 ---------- */
  let touchStart = null;
  boardCv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  boardCv.addEventListener('pointerup', (e) => {
    if (!touchStart) return;
    if (status !== 'playing') { touchStart = null; return; }
    const dx = e.clientX - touchStart.x, dy = e.clientY - touchStart.y;
    const dt = Date.now() - touchStart.t;
    touchStart = null;
    if (dy > 45 && Math.abs(dy) > Math.abs(dx)) {
      hardDrop();
    } else if (dx > 28) {
      for (let i = 0; i < Math.min(3, Math.round(dx / 28)); i++) tryMove(1, 0);
    } else if (dx < -28) {
      for (let i = 0; i < Math.min(3, Math.round(-dx / 28)); i++) tryMove(-1, 0);
    } else if (dt < 400) {
      rotate(1);
    }
  });

  /* ---------- 对外 API（博客切换标签时暂停） ---------- */
  window.RsfTetris = { pause: pauseGame, focus: focusGame };

  /* ---------- 启动 ---------- */
  board = emptyBoard();
  queue = []; holdType = null; cur = null;
  score = 0; lines = 0; level = 1; status = 'ready';
  makeDotPattern();
  refill();
  applyTheme();
  updateHUD();
  updatePauseBtn();
  requestAnimationFrame((t) => {
    lastT = t;
    requestAnimationFrame(loop);
  });
})();
