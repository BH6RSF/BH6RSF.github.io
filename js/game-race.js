/* ============================================================
   RsfNotes · 赛车（由 pygame 版移植）
   玩法对应原版：
   400×600 · 三条车道 · 上下左右移动（车轮不越界）
   躲避障碍车 · 超车 +10 分 · 碰撞结束 · R 重开
   难度递增：生成间隔缩短 + 障碍速度提升（每 100 分）
   ============================================================ */
(function () {
  const canvas = document.getElementById("raceCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  /* --- 常量（与原版一致） --- */
  const W = 400, H = 600;
  const ROAD_LEFT = 50, ROAD_RIGHT = W - 50;
  const LANE_CENTERS = [100, 200, 300];
  const CAR_W = 50, CAR_H = 80, WHEEL = 5;
  const PLAYER_SPEED = 300;   /* px/s（原 5 px/帧 @60fps） */
  const OBST_COLORS = ["#ffff00", "#0000ff", "#ffa500", "#a020f0"]; /* 黄蓝橙紫（无红色） */

  /* --- 状态 --- */
  let player = null;
  let obstacles = [];
  let score = 0;
  let best = parseInt(localStorage.getItem("rsf_race_best") || "0", 10);
  let state = "idle";          /* idle | running | over */
  let spawnTimer = 0;
  let spawnInterval = 700;     /* ms（原 30 帧=500ms，调稀避免三车道全堵） */
  let baseSpeed = 150;         /* px/s（原 3 px/帧=180，整体放缓） */
  let roadOffset = 0;
  let holding = { up: false, down: false, left: false, right: false };
  let lastTs = 0;

  const $ = (id) => document.getElementById(id);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const MAX_OBSTACLES = 8;     /* 同屏障碍上限 */

  /* ---------- 游戏对象 ---------- */
  function makePlayer() {
    return { x: W / 2 - CAR_W / 2, y: H - 150, w: CAR_W, h: CAR_H, color: "#ff0000", speed: PLAYER_SPEED };
  }

  /* 车道避让：优先选择顶部区域空闲的车道；全堵则返回 null（跳过本次生成） */
  function makeObstacle() {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    let lane = -1;
    for (const i of lanes) {
      const cx = LANE_CENTERS[i];
      const blocked = obstacles.some(
        (o) => o.x === cx - CAR_W / 2 && o.y < 300 && o.y > -CAR_H * 2
      );
      if (!blocked) { lane = i; break; }
    }
    if (lane < 0) return null;
    const laneX = LANE_CENTERS[lane];
    return {
      x: laneX - CAR_W / 2,
      y: -CAR_H,
      w: CAR_W,
      h: CAR_H,
      color: OBST_COLORS[rnd(0, OBST_COLORS.length - 1)],
      speed: baseSpeed + rnd(0, 2) * 50, /* 原 base + rand 0-2（px/帧→×60 px/s） */
      passed: false,
    };
  }

  /* ---------- 重置 / 开始 ---------- */
  function reset() {
    player = makePlayer();
    obstacles = [];
    score = 0;
    spawnTimer = 0;
    spawnInterval = 700;
    baseSpeed = 150;
    roadOffset = 0;
    holding = { up: false, down: false, left: false, right: false };
    state = "idle";
    updateHud();
    setOverlay("🏎️ 赛车", "躲避障碍车，超车 +10 分", "▶ 开始游戏");
    syncRestartBtn();
    draw();
  }

  function start() {
    if (state === "over") reset();
    state = "running";
    hideOverlay();
    syncRestartBtn();
    updateHud();
  }

  /* ---------- 逻辑更新（对应原版 run 循环） ---------- */
  function update(dt) {
    /* 玩家移动（按住持续，对应原版 get_pressed） */
    const step = player.speed * dt / 1000;
    if (holding.left) {
      player.x -= step;
      if (player.x - WHEEL < ROAD_LEFT) player.x = ROAD_LEFT + WHEEL;
    }
    if (holding.right) {
      player.x += step;
      if (player.x + player.w + WHEEL > ROAD_RIGHT) player.x = ROAD_RIGHT - player.w - WHEEL;
    }
    if (holding.up) {
      player.y -= step;
      if (player.y < 0) player.y = 0;
    }
    if (holding.down) {
      player.y += step;
      if (player.y > H - player.h) player.y = H - player.h;
    }

    /* 生成障碍物（难度递增 + 车道避让 + 同屏上限） */
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval) {
      if (obstacles.length < MAX_OBSTACLES) {
        const obs = makeObstacle();
        if (obs) obstacles.push(obs);
      }
      spawnTimer = 0;
      if (spawnInterval > 250) spawnInterval -= 17; /* 每 100ms 缩短 17ms，最小 250ms */
      if (score % 100 === 0 && score > 0) baseSpeed = Math.min(baseSpeed + 50, 360); /* 每 100 分提速 */
    }

    /* 障碍物移动 */
    obstacles.forEach((o) => { o.y += o.speed * dt / 1000; });

    /* 超车计分 */
    const playerBottom = player.y + player.h;
    obstacles.forEach((o) => {
      if (!o.passed && o.y > playerBottom) {
        o.passed = true;
        score += 10;
        updateHud();
      }
    });

    /* 移除出屏 */
    obstacles = obstacles.filter((o) => o.y <= H);

    /* 碰撞检测 */
    if (checkCollision()) {
      state = "over";
      if (score > best) {
        best = score;
        localStorage.setItem("rsf_race_best", String(best));
      }
      updateHud();
      setOverlay("💥 游戏结束!", "得分 " + score + "（历史最高 " + best + "）· 按 R 重开", "↻ 再来一局");
      syncRestartBtn();
      return;
    }

    /* 道路虚线滚动 */
    roadOffset = (roadOffset + dt * 0.12) % 40;
  }

  function checkCollision() {
    const a = player;
    const ax1 = a.x - WHEEL, ax2 = a.x + a.w + WHEEL, ay1 = a.y, ay2 = a.y + a.h;
    for (const b of obstacles) {
      const bx1 = b.x - WHEEL, bx2 = b.x + b.w + WHEEL, by1 = b.y, by2 = b.y + b.h;
      if (ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1) return true;
    }
    return false;
  }

  /* ---------- 绘制 ---------- */
  function drawCar(car) {
    const { x, y, w, h, color } = car;
    /* 车身 */
    ctx.fillStyle = color;
    roundRect(x, y, w, h, 8);
    ctx.fill();
    /* 车窗 */
    ctx.fillStyle = "#111111";
    roundRect(x + 10, y + 10, w - 20, 20, 4);
    ctx.fill();
    roundRect(x + 10, y + 50, w - 20, 20, 4);
    ctx.fill();
    /* 车轮（突出车身） */
    ctx.fillRect(x - WHEEL, y + 10, 10, 20);
    ctx.fillRect(x + w - WHEEL, y + 10, 10, 20);
    ctx.fillRect(x - WHEEL, y + 50, 10, 20);
    ctx.fillRect(x + w - WHEEL, y + 50, 10, 20);
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

  function draw() {
    /* 背景（草地） */
    ctx.fillStyle = "#008000";
    ctx.fillRect(0, 0, W, H);

    /* 道路 */
    ctx.fillStyle = "#404040";
    ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);

    /* 道路边缘线 */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(ROAD_LEFT, 0, 5, H);
    ctx.fillRect(ROAD_RIGHT - 5, 0, 5, H);

    /* 中间虚线（滚动） */
    ctx.fillStyle = "#ffffff";
    for (let i = -40; i < H + 40; i += 40) {
      ctx.fillRect(W / 2 - 5, i + roadOffset, 10, 20);
    }

    /* 障碍车 */
    obstacles.forEach((o) => drawCar(o));

    /* 玩家车 */
    drawCar(player);
  }

  /* ---------- 输入：键盘（按住持续） ---------- */
  const KEY_DIRS = {
    arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down",
    a: "left", d: "right", w: "up", s: "down",
  };

  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.game !== "race") return;
    const k = e.key.toLowerCase();
    const dir = KEY_DIRS[k];
    if (dir) {
      e.preventDefault();
      if (state === "idle") start();
      holding[dir] = true;
      return;
    }
    if (k === "r") {
      if (state === "over") start();
    }
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEY_DIRS[e.key.toLowerCase()];
    if (dir) holding[dir] = false;
  });

  /* ---------- 输入：触屏方向键（按住持续） ---------- */
  document.querySelectorAll("#touchPadRace [data-dir]").forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => {
      e.preventDefault();
      if (state === "idle") start();
      holding[dir] = true;
    };
    const release = () => { holding[dir] = false; };
    btn.addEventListener("touchstart", press, { passive: false });
    btn.addEventListener("touchend", release);
    btn.addEventListener("touchcancel", release);
    btn.addEventListener("mousedown", press);
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);
  });

  /* ---------- 按钮 ---------- */
  $("startBtnRace").addEventListener("click", start);
  const restartBtn = $("restartBtnRace");
  restartBtn.addEventListener("click", () => { if (state === "over") start(); });
  function syncRestartBtn() {
    restartBtn.disabled = state !== "over";
  }

  /* ---------- 界面 ---------- */
  function setOverlay(title, msg, btnText) {
    $("overlayTitleRace").textContent = title;
    $("overlayMsgRace").textContent = msg;
    $("startBtnRace").textContent = btnText;
    $("overlayRace").style.display = "flex";
  }
  function hideOverlay() { $("overlayRace").style.display = "none"; }

  function updateHud() {
    $("scoreRace").textContent = score;
    $("bestRace").textContent = best;
  }

  /* ---------- 主循环（requestAnimationFrame + 时间步长） ---------- */
  function loop(ts) {
    const dt = Math.min(50, ts - lastTs);
    lastTs = ts;
    if (state === "running") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  /* ---------- 启动 ---------- */
  reset();
  requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(loop); });
})();
