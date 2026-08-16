/* ============================================================
   RsfNotes · 赛车（由 pygame 版移植）
   400×600 · 三条车道 · 上下左右移动
   躲避障碍车 · 超车 +10 分 · 金币 +30 分 · 碰撞结束
   难度递增：生成间隔缩短 + 障碍速度提升（每 100 分）
   ============================================================ */
(function () {
  const canvas = document.getElementById("raceCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  /* --- 常量 --- */
  const W = 400, H = 600;
  const ROAD_LEFT = 50, ROAD_RIGHT = W - 50;
  const LANE_CENTERS = [100, 200, 300];
  const CAR_W = 40, CAR_H = 65, WHEEL = 4;       /* 缩小障碍车 */
  const PLAYER_SPEED = 280;
  const OBST_COLORS = ["#ffff00", "#0000ff", "#ffa500", "#a020f0"];
  const COIN_RADIUS = 14;
  const COIN_SCORE = 30;
  const COIN_LIFETIME = 5000;
  const MAX_OBSTACLES = 4;       /* 同屏上限继续收紧 */
  const BLOCK_RANGE = 520;       /* 车道检测范围覆盖大半个屏幕 */
  const BASE_INTERVAL = 1400;    /* 起始生成间隔更稀 */
  const MIN_INTERVAL = 550;
  const BASE_SPEED = 110;

  /* --- 状态 --- */
  let player, obstacles, coins, score, best, state;
  let spawnTimer, spawnInterval, baseSpeed, roadOffset;
  let coinTimer, coinInterval;
  let holding = { up: false, down: false, left: false, right: false };
  let lastTs = 0;

  const $ = (id) => document.getElementById(id);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

  /* ---------- 对象创建 ---------- */
  function makePlayer() {
    return { x: W / 2 - CAR_W / 2, y: H - 120, w: CAR_W, h: CAR_H, color: "#ff0000", speed: PLAYER_SPEED };
  }

  /* 障碍车生成（核心防堵：确保玩家前方至少有一个车道可通行） */
  function makeObstacle() {
    const dangerTop = player.y - 300; /* 玩家上方300px危险区 */
    const dangerBot = player.y + 100; /* 玩家下方100px（刚过去的区域） */

    /* 检查：三条车道在危险区内是否都有车 → 全堵则跳过 */
    let allBlocked = true;
    for (const cx of LANE_CENTERS) {
      if (!obstacles.some((o) => o.x === cx - CAR_W / 2 && o.y > dangerTop && o.y < dangerBot)) {
        allBlocked = false;
        break;
      }
    }
    if (allBlocked) return null;

    /* 车道避让：优先选危险区内无车的车道 */
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const i of lanes) {
      const cx = LANE_CENTERS[i];
      const blocked = obstacles.some(
        (o) => o.x === cx - CAR_W / 2 && o.y > dangerTop && o.y < dangerBot
      );
      if (!blocked) {
        return {
          x: cx - CAR_W / 2, y: -CAR_H,
          w: CAR_W, h: CAR_H,
          color: OBST_COLORS[rnd(0, OBST_COLORS.length - 1)],
          speed: baseSpeed + rnd(-30, 30), passed: false,
        };
      }
    }
    return null;
  }

  /* 金币（随机车道位置，随道路向下滚动） */
  function makeCoin() {
    const laneX = LANE_CENTERS[rnd(0, 2)];
    return { x: laneX, y: -COIN_RADIUS * 2, radius: COIN_RADIUS, life: COIN_LIFETIME, speed: baseSpeed * 0.6 };
  }

  /* ---------- 初始化 ---------- */
  function reset() {
    player = makePlayer();
    obstacles = [];
    coins = [];
    score = 0;
    spawnTimer = 0;
    spawnInterval = BASE_INTERVAL;
    baseSpeed = BASE_SPEED;
    roadOffset = 0;
    coinTimer = rnd(2000, 4000);
    coinInterval = rnd(4000, 7000);
    holding = { up: false, down: false, left: false, right: false };
    state = "idle";
    updateHud();
    setOverlay("🏎️ 赛车", "躲避障碍车，超车 +10 分，收集金币 +30 分", "▶ 开始游戏");
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

  /* ---------- 更新 ---------- */
  function update(dt) {
    /* 玩家移动 */
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

    /* 障碍生成 */
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval && obstacles.length < MAX_OBSTACLES) {
      const obs = makeObstacle();
      if (obs) obstacles.push(obs);
      spawnTimer = 0;
      if (spawnInterval > MIN_INTERVAL) spawnInterval -= 20;
      if (score % 100 === 0 && score > 0) baseSpeed = Math.min(baseSpeed + 35, 300);
    }

    /* 金币生成 */
    coinTimer -= dt;
    if (coinTimer <= 0 && coins.length < 2) {
      coins.push(makeCoin());
      coinTimer = coinInterval;
      coinInterval = rnd(4000, 7000);
    }

    /* 障碍移动 */
    for (const o of obstacles) o.y += o.speed * dt / 1000;

    /* 金币移动 + 衰减 */
    for (let i = coins.length - 1; i >= 0; i--) {
      coins[i].y += coins[i].speed * dt / 1000;
      coins[i].life -= dt;
      if (coins[i].life <= 0 || coins[i].y > H + 20) coins.splice(i, 1);
    }

    /* 超车计分 */
    const playerBottom = player.y + player.h;
    for (const o of obstacles) {
      if (!o.passed && o.y > playerBottom) { o.passed = true; score += 10; updateHud(); }
    }

    /* 金币碰撞 */
    const px1 = player.x - WHEEL, px2 = player.x + player.w + WHEEL;
    const py1 = player.y, py2 = player.y + player.h;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const cx1 = c.x - c.radius, cx2 = c.x + c.radius;
      const cy1 = c.y - c.radius, cy2 = c.y + c.radius;
      if (px1 < cx2 && px2 > cx1 && py1 < cy2 && py2 > cy1) {
        score += COIN_SCORE;
        coins.splice(i, 1);
        updateHud();
      }
    }

    /* 移除出屏 */
    obstacles = obstacles.filter((o) => o.y <= H);

    /* 碰撞检测 */
    for (const o of obstacles) {
      const bx1 = o.x - WHEEL, bx2 = o.x + o.w + WHEEL;
      const by1 = o.y, by2 = o.y + o.h;
      if (px1 < bx2 && px2 > bx1 && py1 < by2 && py2 > by1) {
        state = "over";
        if (score > best) { best = score; localStorage.setItem("rsf_race_best", String(best)); }
        updateHud();
        setOverlay("💥 游戏结束!", "得分 " + score + "（最高 " + best + "）· R 重开", "↻ 再来一局");
        syncRestartBtn();
        return;
      }
    }

    roadOffset = (roadOffset + dt * 0.12) % 40;
  }

  /* ---------- 绘制 ---------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawCar(car) {
    const { x, y, w, h, color } = car;
    ctx.fillStyle = color;
    roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.fillStyle = "#111";
    roundRect(x + 7, y + 8, w - 14, 16, 3); ctx.fill();
    roundRect(x + 7, y + 38, w - 14, 16, 3); ctx.fill();
    ctx.fillRect(x - WHEEL, y + 8, 8, 16);
    ctx.fillRect(x + w - WHEEL + 0, y + 8, 8, 16);
    ctx.fillRect(x - WHEEL, y + 38, 8, 16);
    ctx.fillRect(x + w - WHEEL + 0, y + 38, 8, 16);
  }

  function drawCoin(c) {
    /* 衰减闪烁 */
    const flash = c.life < 1500 && Math.floor(c.life / 150) % 2 === 0;
    if (flash) return;
    /* 金色圆形 */
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius, 0, Math.PI * 2);
    ctx.fill();
    /* 内圆 + $ 符号 */
    ctx.fillStyle = "#B8860B";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius - 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFD700";
    ctx.font = "bold 14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$", c.x, c.y + 1);
  }

  function draw() {
    ctx.fillStyle = "#008000";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#404040";
    ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);
    ctx.fillStyle = "#fff";
    ctx.fillRect(ROAD_LEFT, 0, 4, H);
    ctx.fillRect(ROAD_RIGHT - 4, 0, 4, H);
    ctx.fillRect(W / 2 - 4, 0, 8, H); /* 中线 */
    /* 虚线 */
    ctx.fillStyle = "#fff";
    for (let i = -40; i < H + 40; i += 40) {
      ctx.fillRect(ROAD_LEFT + (ROAD_RIGHT - ROAD_LEFT) / 3 - 4, i + roadOffset, 8, 20);
      ctx.fillRect(ROAD_LEFT + ((ROAD_RIGHT - ROAD_LEFT) * 2) / 3 - 4, i + roadOffset, 8, 20);
    }
    /* 金币 */
    for (const c of coins) drawCoin(c);
    /* 障碍 */
    for (const o of obstacles) drawCar(o);
    /* 玩家 */
    drawCar(player);
  }

  /* ---------- 输入 ---------- */
  const KEY_DIRS = {
    arrowleft: "left", arrowright: "right", arrowup: "up", arrowdown: "down",
    a: "left", d: "right", w: "up", s: "down",
  };
  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.game !== "race") return;
    const dir = KEY_DIRS[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); if (state === "idle") start(); holding[dir] = true; return; }
    if (e.key.toLowerCase() === "r" && state === "over") start();
  });
  window.addEventListener("keyup", (e) => { const d = KEY_DIRS[e.key.toLowerCase()]; if (d) holding[d] = false; });

  /* 触屏按住 */
  document.querySelectorAll("#touchPadRace [data-dir]").forEach((btn) => {
    const dir = btn.dataset.dir;
    const press = (e) => { e.preventDefault(); if (state === "idle") start(); holding[dir] = true; };
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
  $("restartBtnRace").addEventListener("click", () => { if (state === "over") start(); });
  function syncRestartBtn() { $("restartBtnRace").disabled = state !== "over"; }

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

  /* ---------- 主循环 ---------- */
  function loop(ts) {
    const dt = Math.min(50, ts - lastTs);
    lastTs = ts;
    if (state === "running") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame((ts) => { lastTs = ts; requestAnimationFrame(loop); });
})();
