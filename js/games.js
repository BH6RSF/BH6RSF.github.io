/* ============================================================
   RsfNotes · 贪吃蛇（由 C++ 源码 games/snake.cpp 移植）
   逻辑忠实对应：
   30×20 地图 · WASD/方向键移动 · 撞墙或撞自己结束
   吃食物 +10 分 · 蛇占满地图胜利 · 速度随得分加快
   ============================================================ */
(function () {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  /* --- 常量（与 cpp 一致） --- */
  const W = 30, H = 20;
  const CELL = canvas.width / W;
  const UP = 1, DOWN = 2, LEFT = 3, RIGHT = 4;

  /* --- 游戏状态 --- */
  let snake = [];            // {x, y} 数组，头在前
  let food = null;
  let dir = RIGHT;
  let score = 0;
  let best = parseInt(localStorage.getItem("rsf_snake_best") || "0", 10);
  let state = "idle";        // idle | running | paused | over | win
  let timer = null;

  const $ = (id) => document.getElementById(id);
  /* 速度：初始 220ms，每 50 分加快 10ms，最快 90ms（比原版 200ms 略慢） */
  const speedMs = () => Math.max(90, 220 - Math.floor(score / 50) * 10);

  /* --- 主题色 --- */
  function themeColors() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      bg: dark ? "#161b22" : "#f6f8fa",
      grid: dark ? "rgba(255,255,255,0.05)" : "rgba(9,30,66,0.06)",
      snake: dark ? "#58a6ff" : "#0969da",
      head: dark ? "#79c0ff" : "#218bff",
      food: "#ff5f57",
    };
  }

  /* --- 核心逻辑（移植 cpp SnakeGame::update） --- */
  /* 食物生成：优先内圈（避免贴边），内圈满时回退全图，全图满则返回 */
  function randomFood() {
    const findEmpty = (minX, maxX, minY, maxY) => {
      const empty = [];
      for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++)
          if (!snake.some((s) => s.x === x && s.y === y)) empty.push({ x, y });
      return empty;
    };
    const inner = findEmpty(1, W - 2, 1, H - 2);
    const pool = inner.length ? inner : findEmpty(0, W - 1, 0, H - 1);
    if (!pool.length) return; /* 蛇已占满（将触发胜利） */
    food = pool[Math.floor(Math.random() * pool.length)];
  }

  function init() {
    dir = RIGHT;
    score = 0;
    snake = [
      { x: Math.floor(W / 2), y: Math.floor(H / 2) },
      { x: Math.floor(W / 2) - 1, y: Math.floor(H / 2) },
      { x: Math.floor(W / 2) - 2, y: Math.floor(H / 2) },
    ];
    if (snake.length < W * H) randomFood();
    state = "idle";
    updateHud();
    setOverlay("贪吃蛇", "按「开始游戏」或直接按方向键 / WASD", "▶ 开始游戏");
    draw();
  }

  function update() {
    /* 计算新蛇头（对应 cpp 的方向 switch） */
    const newHead = { x: snake[0].x, y: snake[0].y };
    switch (dir) {
      case LEFT:  newHead.x--; break;
      case RIGHT: newHead.x++; break;
      case UP:    newHead.y--; break;
      case DOWN:  newHead.y++; break;
    }

    /* 撞墙 */
    if (newHead.x < 0 || newHead.x >= W || newHead.y < 0 || newHead.y >= H) {
      return gameOver(false);
    }

    /* 是否吃到食物 */
    const eatFood = newHead.x === food.x && newHead.y === food.y;
    if (!eatFood) snake.pop();

    /* 撞到自己 */
    if (snake.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      return gameOver(false);
    }

    snake.unshift(newHead);

    if (eatFood) {
      score += 10;
      updateHud();
      if (snake.length >= W * H) return gameOver(true); /* 胜利：填满地图 */
      randomFood();
    }
  }

  function gameOver(win) {
    state = win ? "win" : "over";
    if (score > best) {
      best = score;
      localStorage.setItem("rsf_snake_best", String(best));
    }
    updateHud();
    setOverlay(
      win ? "🎉 You Win!" : "💀 Game Over!",
      win ? "你填满了整个地图！得分 " + score : "最终得分 " + score + "（历史最高 " + best + "）",
      "↻ 再来一局"
    );
    draw();
  }

  /* --- 控制 --- */
  function start() {
    if (state === "idle" || state === "over" || state === "win") init();
    state = "running";
    hideOverlay();
    clearInterval(timer);
    timer = setInterval(tick, speedMs());
    updateHud();
    syncPauseBtn();
  }

  function pause() {
    if (state !== "running") return;
    state = "paused";
    clearInterval(timer);
    setOverlay("⏸ 已暂停", "按 P / 空格，或点「继续」", "▶ 继续");
    syncPauseBtn();
  }

  function tick() {
    if (state !== "running") return;
    update();
    if (state === "running") {
      clearInterval(timer);
      timer = setInterval(tick, speedMs()); /* 速度随得分变化 */
    }
    draw();
  }

  function isReverse(a, b) {
    return (
      (a === UP && b === DOWN) || (a === DOWN && b === UP) ||
      (a === LEFT && b === RIGHT) || (a === RIGHT && b === LEFT)
    );
  }

  /* --- 输入：键盘 --- */
  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.game !== "snake") return; /* 仅贪吃蛇激活时响应 */
    const k = e.key.toLowerCase();
    const map = {
      w: UP, s: DOWN, a: LEFT, d: RIGHT,
      arrowup: UP, arrowdown: DOWN, arrowleft: LEFT, arrowright: RIGHT,
    };
    const d = map[k] || map[e.key.toLowerCase()];
    if (d) {
      e.preventDefault();
      if (state === "idle" || state === "over" || state === "win") start();
      if (state === "running" && !isReverse(d, dir)) dir = d;
      return;
    }
    if (k === "p" || e.key === " ") {
      e.preventDefault();
      if (state === "running") pause();
      else if (state === "paused") start();
      return;
    }
    if (k === "x" && state === "running") gameOver(false);
  });

  /* --- 输入：手机滑动（画布上滑动控制方向） --- */
  let touchStart = null;
  canvas.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true }
  );
  canvas.addEventListener(
    "touchend",
    (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      const d = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? RIGHT : LEFT)
        : (dy > 0 ? DOWN : UP);
      if (state === "idle" || state === "over" || state === "win") start();
      if (state === "running" && !isReverse(d, dir)) dir = d;
    },
    { passive: true }
  );

  /* --- 输入：触屏方向键 --- */
  document.querySelectorAll("#touchPad [data-dir]").forEach((b) => {
    b.addEventListener("click", () => {
      const d = { up: UP, down: DOWN, left: LEFT, right: RIGHT }[b.dataset.dir];
      if (state === "idle" || state === "over" || state === "win") start();
      if (state === "running" && !isReverse(d, dir)) dir = d;
    });
  });

  /* --- 按钮 --- */
  $("startBtn").addEventListener("click", start);
  const pauseBtn = $("pauseBtn");
  pauseBtn.addEventListener("click", () => {
    if (state === "running") pause();
    else if (state === "paused") start();
  });
  function syncPauseBtn() {
    if (state === "running") { pauseBtn.disabled = false; pauseBtn.textContent = "⏸ 暂停"; }
    else if (state === "paused") { pauseBtn.disabled = false; pauseBtn.textContent = "▶ 继续"; }
    else { pauseBtn.disabled = true; pauseBtn.textContent = "⏸ 暂停"; }
  }

  /* --- 界面 --- */
  function setOverlay(title, msg, btnText) {
    $("overlayTitle").textContent = title;
    $("overlayMsg").textContent = msg;
    $("startBtn").textContent = btnText;
    $("overlay").style.display = "flex";
  }
  function hideOverlay() { $("overlay").style.display = "none"; }

  function updateHud() {
    $("score").textContent = score;
    $("best").textContent = best;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  let tickCount = 0;

  function draw() {
    const c = themeColors();
    tickCount++;
    /* 背景 */
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    /* 网格（细线） */
    ctx.strokeStyle = c.grid;
    ctx.lineWidth = 0.5;
    for (let i = 1; i < W; i++) {
      ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
    }
    for (let j = 1; j < H; j++) {
      ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(canvas.width, j * CELL); ctx.stroke();
    }
    /* 食物（脉动 + 光晕） */
    if (food) {
      const fx = food.x * CELL + CELL / 2;
      const fy = food.y * CELL + CELL / 2;
      const pulse = 0.3 + 0.08 * Math.sin(tickCount * 0.15);
      /* 外圈光晕 */
      const glow = ctx.createRadialGradient(fx, fy, 0, fx, fy, CELL * 0.8);
      glow.addColorStop(0, "rgba(255,95,87,0.2)");
      glow.addColorStop(1, "rgba(255,95,87,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(fx, fy, CELL * 0.8, 0, Math.PI * 2);
      ctx.fill();
      /* 食物本体 */
      ctx.fillStyle = c.food;
      ctx.beginPath();
      ctx.arc(fx, fy, CELL * pulse, 0, Math.PI * 2);
      ctx.fill();
    }
    /* 蛇（渐变色 + 圆角） */
    const len = snake.length;
    snake.forEach((s, i) => {
      const t = len > 1 ? i / (len - 1) : 0;
      /* 从头到尾颜色从 accent 渐变到 snake 暗色 */
      const headC = c.snake;
      const r = parseInt(headC.slice(1, 3), 16);
      const g = parseInt(headC.slice(3, 5), 16);
      const b = parseInt(headC.slice(5, 7), 16);
      const ratio = 1 - t * 0.45;
      ctx.fillStyle = i === 0 ? c.head :
        `rgb(${Math.round(r * ratio)},${Math.round(g * ratio)},${Math.round(b * ratio)})`;
      const pad = i === 0 ? 0.5 : 1.5;
      const rad = i === 0 ? 5 : 4;
      roundRect(s.x * CELL + pad, s.y * CELL + pad, CELL - pad * 2, CELL - pad * 2, rad);
      ctx.fill();
    });
    /* 蛇头眼睛 */
    if (snake.length > 0) {
      const head = snake[0];
      const hx = head.x * CELL + CELL / 2;
      const hy = head.y * CELL + CELL / 2;
      ctx.fillStyle = c.bg;
      const eOff = CELL * 0.2;
      const eR = CELL * 0.09;
      if (dir === UP || dir === DOWN) {
        ctx.beginPath(); ctx.arc(hx - eOff, hy - eOff * 0.5, eR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + eOff, hy - eOff * 0.5, eR, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(hx - eOff * 0.5, hy - eOff, eR, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hx - eOff * 0.5, hy + eOff, eR, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* --- 主题切换时重绘 --- */
  new MutationObserver(() => draw()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  /* --- 加载 C++ 源码展示 --- */
  fetch("games/snake.cpp")
    .then((r) => r.text())
    .then((t) => { $("srcCode").textContent = t; })
    .catch(() => { $("srcCode").textContent = "（源码加载失败，请点击上方「下载 C++ 源码」查看）"; });

  /* --- 游戏中心 tab 切换 --- */
  const PANEL_IDS = { snake: "snakePanel", 2048: "game2048Panel", race: "racePanel", ms: "msPanel" };
  document.querySelectorAll(".game-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const g = tab.dataset.game;
      document.body.dataset.game = g;
      document.querySelectorAll(".game-tab").forEach((x) =>
        x.classList.toggle("active", x === tab)
      );
      Object.entries(PANEL_IDS).forEach(([key, id]) => {
        const p = document.getElementById(id);
        if (p) p.hidden = key !== g;
      });
      if (g !== "snake") pause(); /* 切走时暂停贪吃蛇 */
    });
  });

  /* --- 启动 --- */
  init();
})();
