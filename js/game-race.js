/* ============================================================
   RsfNotes · 赛车（由 pygame 版移植）
   400×600 · 三条车道 · 左右移动
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
  const MAX_OBSTACLES = 4;       /* 同屏上限继续收紧 */
  const BLOCK_RANGE = 520;       /* 车道检测范围覆盖大半个屏幕 */
  const BASE_INTERVAL = 1400;    /* 起始生成间隔更稀 */
  const MIN_INTERVAL = 550;
  const BASE_SPEED = 110;

  /* --- 状态 --- */
  let player, obstacles, coins, score, best, state;
  let spawnTimer, spawnInterval, baseSpeed, roadOffset;
  let coinTimer, coinInterval;
  let holding = { left: false, right: false };
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

  /* 金币（随机车道位置，随道路向下滚动，避开障碍车） */
  function makeCoin() {
    const y = -COIN_RADIUS * 2;
    // 打乱车道顺序，优先选没有障碍车的车道
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    for (const i of lanes) {
      const cx = LANE_CENTERS[i];
      const blocked = obstacles.some(
        (o) => Math.abs(o.x + o.w / 2 - cx) < CAR_W && o.y < y + 200 && o.y + o.h > y - 100
      );
      if (!blocked) {
        return { x: cx, y: y, radius: COIN_RADIUS, speed: baseSpeed + rnd(-20, 20) };
      }
    }
    // 三条车道都有障碍，跳过本次金币生成
    return null;
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
    setOverlay("🏎️ 赛车", "左右移动躲避障碍车，超车 +10 分，收集金币 +30 分", "▶ 开始游戏");
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

    /* 障碍生成 */
    spawnTimer += dt;
    if (spawnTimer >= spawnInterval && obstacles.length < MAX_OBSTACLES) {
      const obs = makeObstacle();
      if (obs) obstacles.push(obs);
      spawnTimer = 0;
      if (spawnInterval > MIN_INTERVAL) spawnInterval -= 20;
      if (score % 100 === 0 && score > 0) baseSpeed = Math.min(baseSpeed + 35, 300);
    }

    /* 金币生成（车道全被障碍占满时跳过，下次再试） */
    coinTimer -= dt;
    if (coinTimer <= 0 && coins.length < 2) {
      const coin = makeCoin();
      if (coin) coins.push(coin);
      coinTimer = coinInterval;
      coinInterval = rnd(4000, 7000);
    }

    /* 障碍移动 */
    for (const o of obstacles) o.y += o.speed * dt / 1000;

    /* 金币移动 */
    for (let i = coins.length - 1; i >= 0; i--) {
      coins[i].y += coins[i].speed * dt / 1000;
      if (coins[i].y > H + 20) coins.splice(i, 1);
    }

    /* 超车计分 */
    const playerBottom = player.y + player.h;
    for (const o of obstacles) {
      if (!o.passed && o.y > playerBottom) {
        o.passed = true; score += 10; updateHud();
        addFloat(o.x + o.w / 2, o.y, "+10", "#FFD700");
      }
    }

    /* 金币碰撞 */
    const px1 = player.x - WHEEL, px2 = player.x + player.w + WHEEL;
    const py1 = player.y, py2 = player.y + player.h;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const cx1 = c.x - c.radius, cx2 = c.x + c.radius;
      const cy1 = c.y - c.radius, cy2 = c.y + c.radius;
      if (px1 < cx2 && px2 > cx1 && py1 < cy2 && py2 > cy1) {
        score += COIN_SCORE; coins.splice(i, 1); updateHud();
        addFloat(c.x, c.y, "+30", "#FFD700");
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
        crashAlpha = 255;
        if (score > best) { best = score; localStorage.setItem("rsf_race_best", String(best)); }
        updateHud();
        setOverlay("💥 游戏结束!", "得分 " + score + "（最高 " + best + "）· R 重开", "↻ 再来一局");
        syncRestartBtn();
        return;
      }
    }

    coinAngle += dt * 0.003;
    roadOffset = (roadOffset + dt * 0.12) % 40;
  }

  /* ---------- 绘制 ---------- */
  let crashAlpha = 0;       /* 撞击红色闪屏 */
  let floatingTexts = [];   /* 浮动得分文字 */
  let coinAngle = 0;        /* 金币旋转角度 */

  function addFloat(x, y, text, color) {
    floatingTexts.push({ x, y, text, color, life: 1, startY: y });
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

  /* 草地纹理（深浅交替绿色条纹） */
  function drawGrass() {
    for (let y = -8 + (roadOffset % 8); y < H; y += 8) {
      ctx.fillStyle = ((y - roadOffset) / 8 | 0) % 2 === 0 ? "#2d8f2d" : "#267a26";
      ctx.fillRect(0, y, ROAD_LEFT, 8);
      ctx.fillRect(ROAD_RIGHT, y, W - ROAD_RIGHT, 8);
    }
  }

  /* 道路（沥青 + 边缘线 + 车道虚线） */
  function drawRoad() {
    /* 沥青底色 */
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(ROAD_LEFT, 0, ROAD_RIGHT - ROAD_LEFT, H);
    /* 边缘双线 */
    ctx.fillStyle = "#fff";
    ctx.fillRect(ROAD_LEFT, 0, 3, H);
    ctx.fillRect(ROAD_RIGHT - 3, 0, 3, H);
    /* 两条车道分隔虚线 */
    const laneW = (ROAD_RIGHT - ROAD_LEFT) / 3;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = -40; i < H + 40; i += 40) {
      const yy = i + (roadOffset % 40);
      ctx.fillRect(ROAD_LEFT + laneW - 3, yy, 6, 20);
      ctx.fillRect(ROAD_LEFT + laneW * 2 - 3, yy, 6, 20);
    }
    /* 路面噪点质感 */
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let i = 0; i < 80; i++) {
      const nx = ROAD_LEFT + Math.random() * (ROAD_RIGHT - ROAD_LEFT);
      const ny = Math.random() * H;
      ctx.fillRect(nx, ny, 2 + Math.random() * 3, 1);
    }
  }

  /* 车辆（阴影 + 车灯） */
  function drawCar(car, isPlayer) {
    const { x, y, w, h, color } = car;
    /* 阴影 */
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    roundRect(x + 5, y + 5, w, h, 7);
    ctx.fill();
    /* 车身 */
    ctx.fillStyle = color;
    roundRect(x, y, w, h, 7);
    ctx.fill();
    /* 车身高光 */
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    roundRect(x + 3, y + 3, w - 6, h * 0.35, 4);
    ctx.fill();
    /* 车窗 */
    ctx.fillStyle = "rgba(10,15,30,0.85)";
    roundRect(x + 6, y + 8, w - 12, 14, 3);
    ctx.fill();
    roundRect(x + 6, y + h - 22, w - 12, 14, 3);
    ctx.fill();
    /* 车轮 */
    ctx.fillStyle = "#111";
    ctx.fillRect(x - WHEEL + 1, y + 8, 7, 14);
    ctx.fillRect(x + w - 2, y + 8, 7, 14);
    ctx.fillRect(x - WHEEL + 1, y + h - 22, 7, 14);
    ctx.fillRect(x + w - 2, y + h - 22, 7, 14);
    /* 车灯 */
    if (isPlayer) {
      /* 玩家前灯（亮黄） */
      ctx.fillStyle = "#fffde0";
      ctx.fillRect(x + 3, y - 3, 10, 4);
      ctx.fillRect(x + w - 13, y - 3, 10, 4);
    } else {
      /* 障碍车尾灯（红色） */
      ctx.fillStyle = "#ff4444";
      ctx.fillRect(x + 3, y + h - 2, 10, 4);
      ctx.fillRect(x + w - 13, y + h - 2, 10, 4);
    }
  }

  /* 金币（发光 + 旋转 + 光晕） */
  function drawCoin(c) {
    /* 外圈光晕 */
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.radius * 2.5);
    glow.addColorStop(0, "rgba(255,215,0,0.25)");
    glow.addColorStop(1, "rgba(255,215,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.radius * 2.5, 0, Math.PI * 2);
    ctx.fill();
    /* 金币主体（轻微椭圆模拟旋转） */
    const rx = c.radius * (0.8 + 0.2 * Math.abs(Math.cos(coinAngle)));
    ctx.fillStyle = "#FFD700";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx, c.radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#B8860B";
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, rx - 3, c.radius - 3, 0, 0, Math.PI * 2);
    ctx.fill();
    if (rx > c.radius * 0.5) {
      ctx.fillStyle = "#FFD700";
      ctx.font = "bold 13px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("$", c.x, c.y + 1);
    }
  }

  /* 浮动得分文字 */
  function drawFloats(dt) {
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const f = floatingTexts[i];
      f.life -= dt * 0.0012;
      f.y -= 40 * dt * 0.001;
      if (f.life <= 0) { floatingTexts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle = f.color;
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  /* 撞击闪屏 */
  function drawCrash() {
    if (crashAlpha > 0) {
      ctx.fillStyle = `rgba(255,40,40,${crashAlpha / 255 * 0.4})`;
      ctx.fillRect(0, 0, W, H);
      crashAlpha -= 12;
      if (crashAlpha < 0) crashAlpha = 0;
    }
  }

  /* HUD 底板 */
  function drawHudBg() {
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(8, 8, 200, 32, 8);
    ctx.fill();
    ctx.font = "bold 18px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("⭐ " + score, 20, 24);
    ctx.fillStyle = "#aaa";
    ctx.fillText("最高 " + best, 120, 24);
  }

  /* 主绘制 */
  function draw() {
    drawGrass();
    drawRoad();
    for (const c of coins) drawCoin(c);
    for (const o of obstacles) drawCar(o, false);
    drawCar(player, true);
    drawHudBg();
    drawFloats(16);
    drawCrash();
  }

  /* ---------- 输入 ---------- */
  const KEY_DIRS = {
    arrowleft: "left", arrowright: "right",
    a: "left", d: "right",
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
