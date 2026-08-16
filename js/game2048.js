/* ============================================================
   RsfNotes · 2048（动画版）
   经典 4×4 合并游戏：方向键 / WASD / 手机滑动
   移动带滑动动画 · 合并带弹出效果 · 新块带出现动画
   ============================================================ */
(function () {
  const boardEl = document.getElementById("board2048");
  if (!boardEl) return;

  const N = 4;
  const ANIM_MS = 120; /* 滑动动画时长 */
  const $ = (id) => document.getElementById(id);

  let grid = [];       // N×N 数值矩阵
  let score = 0;
  let best = parseInt(localStorage.getItem("rsf_2048_best") || "0", 10);
  let state = "idle";  // idle | running | over | win
  let won = false;     // 是否已达 2048（可继续）
  let animating = false;

  /* ---------- 核心逻辑 ---------- */
  function emptyGrid() {
    return Array.from({ length: N }, () => Array(N).fill(0));
  }

  function randomCell() {
    const empty = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        if (grid[i][j] === 0) empty.push({ r: i, c: j });
    if (!empty.length) return null;
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function init() {
    grid = emptyGrid();
    score = 0;
    won = false;
    animating = false;
    state = "idle";
    updateHud();
    setOverlay("2048", "按「新游戏」或方向键 / WASD 开始", "▶ 新游戏");
    rebuild(grid, [], null); /* 初始棋盘为空，点击开始才生成数字 */
  }

  /* 按方向提取行/列并合并，返回移动轨迹与新网格 */
  function computeMoves(oldGrid, dir) {
    const g = emptyGrid();
    const moves = [];   // {fr,fc,tr,tc,merged}
    const mergedCells = []; // {r,c,val} 合并发生的位置
    let gained = 0;

    /* 方向坐标映射：i=主索引（4 条线），j=沿线位置（0 为移动方向最前） */
    const cellAt = (i, j) => {
      switch (dir) {
        case "left":  return { r: i, c: j };
        case "right": return { r: i, c: N - 1 - j };
        case "up":    return { r: j, c: i };
        case "down":  return { r: N - 1 - j, c: i };
      }
    };
    const putAt = (i, j, val) => {
      const p = cellAt(i, j);
      g[p.r][p.c] = val;
      return p;
    };

    for (let i = 0; i < N; i++) {
      /* 提取沿线非零块（沿移动方向排序） */
      const seq = [];
      for (let j = 0; j < N; j++) {
        const p = cellAt(i, j);
        if (oldGrid[p.r][p.c] !== 0) {
          seq.push({ val: oldGrid[p.r][p.c], r: p.r, c: p.c });
        }
      }
      /* 压缩 + 单次合并 */
      const placed = []; // {val, r, c, locked}
      for (let k = 0; k < seq.length; k++) {
        const item = seq[k];
        if (
          placed.length &&
          placed[placed.length - 1].val === item.val &&
          !placed[placed.length - 1].locked
        ) {
          const prev = placed[placed.length - 1];
          prev.val *= 2;
          prev.locked = true;
          gained += prev.val;
          mergedCells.push({ r: prev.r, c: prev.c, val: prev.val });
          moves.push({ fr: item.r, fc: item.c, tr: prev.r, tc: prev.c, merged: true });
        } else {
          placed.push({ val: item.val, r: item.r, c: item.c, locked: false });
        }
      }
      /* 写回目标槽位 */
      for (let k = 0; k < placed.length; k++) {
        const p = putAt(i, k, placed[k].val);
        if (placed[k].r !== p.r || placed[k].c !== p.c) {
          moves.push({ fr: placed[k].r, fc: placed[k].c, tr: p.r, tc: p.c, merged: false });
        }
      }
    }
    return { moves, grid: g, gained, mergedCells };
  }

  function move(dir) {
    if (animating) return;
    /* idle 首次操作开局；win 时继续游戏（隐藏胜利遮罩） */
    if (state === "idle" || state === "win") start();
    if (state !== "running" && state !== "win") return;

    const { moves, grid: nextGrid, gained, mergedCells } = computeMoves(grid, dir);
    if (moves.length === 0) return; /* 无法移动 */

    score += gained;
    updateHud();
    grid = nextGrid;

    /* 新块 */
    const newCell = randomCell();
    if (newCell) grid[newCell.r][newCell.c] = Math.random() < 0.9 ? 2 : 4;

    animating = true;
    animateTiles(moves);

    setTimeout(() => {
      rebuild(grid, mergedCells, newCell);
      animating = false;
      finishStep();
    }, ANIM_MS + 40);
  }

  /* 动画：现有块滑动到新位置 */
  function animateTiles(moves) {
    const layer = $("board2048tiles");
    moves.forEach((m) => {
      const el = layer.querySelector(
        '.tile[data-r="' + m.fr + '"][data-c="' + m.fc + '"]'
      );
      if (el) {
        el.style.transform = "translate(" + m.tc * 100 + "%," + m.tr * 100 + "%)";
        el.dataset.r = m.tr;
        el.dataset.c = m.tc;
      }
    });
  }

  function finishStep() {
    if (!won && grid.some((row) => row.includes(2048))) {
      won = true;
      state = "win";
      setOverlay("🎉 达成 2048!", "得分 " + score + "，可继续挑战更高分", "▶ 继续游戏");
      return;
    }
    if (state !== "running") return;
    if (!canMove()) {
      state = "over";
      saveBest();
      updateHud();
      setOverlay("💀 Game Over!", "最终得分 " + score + "（历史最高 " + best + "）", "↻ 再来一局");
    }
  }

  function canMove() {
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        if (grid[i][j] === 0) return true;
        if (j + 1 < N && grid[i][j] === grid[i][j + 1]) return true;
        if (i + 1 < N && grid[i][j] === grid[i + 1][j]) return true;
      }
    return false;
  }

  function saveBest() {
    if (score > best) {
      best = score;
      localStorage.setItem("rsf_2048_best", String(best));
    }
  }

  /* ---------- 控制 ---------- */
  function start() {
    if (state === "over") init();
    if (state === "idle") {
      /* 首次开局：生成两个初始块（都带出现动画） */
      const a = randomCell();
      if (a) grid[a.r][a.c] = 2;
      const b = randomCell();
      if (b) grid[b.r][b.c] = Math.random() < 0.9 ? 2 : 4;
      rebuild(grid, [], null);
      $("board2048tiles")
        .querySelectorAll(".tile-inner")
        .forEach((el) => el.classList.add("appear"));
    }
    if (state === "win") {
      state = "running";
      hideOverlay();
      syncRestartBtn();
      return;
    }
    state = "running";
    hideOverlay();
    updateHud();
    syncRestartBtn();
  }

  function restart() {
    init();      /* 清空棋盘 */
    start();     /* 生成初始块并开始 */
  }

  /* ---------- 输入 ---------- */
  const KEYS = {
    w: "up", s: "down", a: "left", d: "right",
    arrowup: "up", arrowdown: "down", arrowleft: "left", arrowright: "right",
  };

  window.addEventListener("keydown", (e) => {
    if (document.body.dataset.game !== "2048") return;
    const dir = KEYS[e.key.toLowerCase()];
    if (dir) {
      e.preventDefault();
      move(dir);
    }
  });

  /* 手机滑动 */
  let touchStart = null;
  boardEl.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  boardEl.addEventListener("touchend", (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? "right" : "left");
    else move(dy > 0 ? "down" : "up");
  }, { passive: true });

  /* ---------- 按钮 ---------- */
  $("startBtn2048").addEventListener("click", start);
  const restartBtn = $("restartBtn2048");
  restartBtn.addEventListener("click", restart);
  function syncRestartBtn() {
    restartBtn.disabled = state === "idle" || state === "over";
  }

  /* ---------- 界面 ---------- */
  function setOverlay(title, msg, btnText) {
    $("overlayTitle2048").textContent = title;
    $("overlayMsg2048").textContent = msg;
    $("startBtn2048").textContent = btnText;
    $("overlay2048").style.display = "flex";
  }
  function hideOverlay() { $("overlay2048").style.display = "none"; }

  function updateHud() {
    $("score2048").textContent = score;
    $("best2048").textContent = best;
  }

  /* ---------- 渲染（绝对定位 + 动画类） ---------- */
  function renderBg() {
    const bg = $("board2048bg");
    bg.innerHTML = "";
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.innerHTML = '<div class="cell-inner"></div>';
        cell.style.transform = "translate(" + j * 100 + "%," + i * 100 + "%)";
        bg.appendChild(cell);
      }
  }

  function tileClass(v) {
    if (v === 0) return "tile-0";
    if (v <= 2048) return "tile-" + v;
    return "tile-super";
  }

  function placeTile(r, c, val, fx) {
    const el = document.createElement("div");
    el.className = "tile";
    el.dataset.r = r;
    el.dataset.c = c;
    const inner = document.createElement("div");
    inner.className = "tile-inner " + tileClass(val);
    inner.textContent = val === 0 ? "" : val;
    if (fx) inner.classList.add(fx);
    el.appendChild(inner);
    el.style.transform = "translate(" + c * 100 + "%," + r * 100 + "%)";
    $("board2048tiles").appendChild(el);
    return el;
  }

  function rebuild(nextGrid, mergedCells, newCell) {
    const layer = $("board2048tiles");
    layer.innerHTML = "";
    const placed = [];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        if (nextGrid[i][j] !== 0) {
          placed.push(placeTile(i, j, nextGrid[i][j], null));
        }
      }
    /* 合并弹出效果 */
    if (mergedCells) {
      mergedCells.forEach((mc) => {
        const el = layer.querySelector('.tile[data-r="' + mc.r + '"][data-c="' + mc.c + '"]');
        if (el) el.querySelector(".tile-inner").classList.add("pop");
      });
    }
    /* 新块出现效果 */
    if (newCell) {
      const el = layer.querySelector('.tile[data-r="' + newCell.r + '"][data-c="' + newCell.c + '"]');
      if (el) el.querySelector(".tile-inner").classList.add("appear");
    }
  }

  function render() {
    rebuild(grid, [], null);
  }

  /* 主题切换时重绘 */
  new MutationObserver(() => render()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });

  /* ---------- 启动 ---------- */
  renderBg();
  init();

  /* 测试钩子（生产环境不调用，仅供自动化测试） */
  if (typeof window !== "undefined" && typeof window.__test2048 === "function") {
    window.__test2048({ getGrid: () => grid, getState: () => state, start: start, move: move, init: init });
  }
})();
