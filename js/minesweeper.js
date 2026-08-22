/* ============================================================
   RsfNotes · Windows XP 经典扫雷
   三种难度：初级 9×9/10 雷 · 中级 16×16/40 雷 · 高级 30×16/99 雷
   特性：首点不炸 / 右键插旗·问号 / 双击数字快速翻开 / 计时器
         XP 风格 3D 边框、红色 LED 计数、笑脸按钮
   ============================================================ */
(function () {
  const root = document.getElementById("msRoot");
  if (!root) return;

  /* --- 难度配置 --- */
  const LEVELS = {
    easy:   { name: "初级", rows: 9,  cols: 9,  mines: 10 },
    medium: { name: "中级", rows: 16, cols: 16, mines: 40 },
    hard:   { name: "高级", rows: 16, cols: 30, mines: 99 },
  };

  /* --- 状态 --- */
  let level = "easy";
  let board = [];      // 二维数组：{mine, open, flag, question}
  let firstClick = true;
  let playing = false; // 游戏进行中
  let timerId = null;
  let seconds = 0;
  let flagCount = 0;
  let bestTime = {};

  /* --- DOM --- */
  const $ = (id) => document.getElementById(id);
  const faceBtn = $("msFace");
  const mineLed = $("msMineLed");
  const timeLed = $("msTimeLed");
  const gridBox = $("msGrid");

  /* 读取历史最佳（localStorage） */
  try {
    bestTime = JSON.parse(localStorage.getItem("rsf_ms_best") || "{}");
  } catch (e) { bestTime = {}; }

  /* --- 工具 --- */
  const pad3 = (n) => String(Math.max(0, Math.min(999, n))).padStart(3, "0");
  const numColor = (n) =>
    ["", "#0000ff", "#008000", "#ff0000", "#000080", "#800000", "#008080", "#000000", "#808080"][n] || "";

  /* --- 初始化 --- */
  function newGame(lv) {
    level = lv;
    const cfg = LEVELS[lv];
    board = Array.from({ length: cfg.rows }, () =>
      Array.from({ length: cfg.cols }, () => ({ mine: false, open: false, flag: false, question: false }))
    );
    firstClick = true;
    playing = false;
    stopTimer();
    seconds = 0;
    flagCount = 0;
    faceBtn.textContent = "🙂";
    updateLed();
    buildGrid();
    updateBestInfo();
  }

  /* 布置地雷（保证首次点击位置及其周围安全） */
  function plantMines(safeR, safeC) {
    const cfg = LEVELS[level];
    let placed = 0;
    while (placed < cfg.mines) {
      const r = Math.floor(Math.random() * cfg.rows);
      const c = Math.floor(Math.random() * cfg.cols);
      if (board[r][c].mine) continue;
      if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue; // 首点 3×3 安全
      board[r][c].mine = true;
      placed++;
    }
  }

  const inBounds = (r, c) =>
    r >= 0 && r < LEVELS[level].rows && c >= 0 && c < LEVELS[level].cols;

  const neighbors = (r, c) => {
    const out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        if (inBounds(r + dr, c + dc)) out.push([r + dr, c + dc]);
      }
    return out;
  };

  const countMines = (r, c) =>
    neighbors(r, c).filter(([rr, cc]) => board[rr][cc].mine).length;

  /* --- 网格 --- */
  function buildGrid() {
    const cfg = LEVELS[level];
    gridBox.style.gridTemplateColumns = `repeat(${cfg.cols}, 24px)`;
    gridBox.innerHTML = "";
    for (let r = 0; r < cfg.rows; r++) {
      for (let c = 0; c < cfg.cols; c++) {
        const cell = document.createElement("div");
        cell.className = "ms-cell";
        cell.dataset.r = r;
        cell.dataset.c = c;

        cell.addEventListener("click", () => onLeft(r, c));
        cell.addEventListener("contextmenu", (e) => { e.preventDefault(); onRight(r, c); });

        // 触屏：长按 = 插旗（350ms），短按 = 翻开
        let pressTimer = null;
        let longPress = false;
        cell.addEventListener("touchstart", (e) => {
          e.preventDefault();
          longPress = false;
          pressTimer = setTimeout(() => { longPress = true; onRight(r, c); }, 350);
        }, { passive: false });
        cell.addEventListener("touchend", (e) => {
          e.preventDefault();
          clearTimeout(pressTimer);
          if (!longPress) onLeft(r, c);
        }, { passive: false });
        cell.addEventListener("touchmove", () => clearTimeout(pressTimer), { passive: true });

        // 双击数字：chord 快速翻开
        cell.addEventListener("dblclick", (e) => {
          e.preventDefault();
          const cellState = board[r][c];
          if (cellState.open && !cellState.mine) chord(r, c);
        });

        gridBox.appendChild(cell);
      }
    }
    render();
  }

  /* --- 渲染 --- */
  function render() {
    const cells = gridBox.children;
    for (let i = 0; i < cells.length; i++) {
      const r = +cells[i].dataset.r;
      const c = +cells[i].dataset.c;
      const b = board[r][c];
      const el = cells[i];
      el.className = "ms-cell";

      if (b.open) {
        if (b.mine) {
          el.classList.add("ms-open", "ms-mine");
          el.textContent = "💣";
        } else {
          const n = countMines(r, c);
          el.classList.add("ms-open");
          el.textContent = n ? n : "";
          el.style.color = numColor(n);
          if (n === 0) el.classList.add("ms-zero");
        }
      } else if (b.flag) {
        el.classList.add("ms-flag");
        el.textContent = "🚩";
      } else if (b.question) {
        el.classList.add("ms-question");
        el.textContent = "?";
      } else {
        el.classList.add("ms-covered");
        el.textContent = "";
      }
    }
    updateLed();
  }

  /* --- LED 显示 --- */
  function updateLed() {
    const cfg = LEVELS[level];
    mineLed.textContent = pad3(cfg.mines - flagCount);
    timeLed.textContent = pad3(seconds);
  }

  /* --- 计时器 --- */
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      seconds++;
      if (seconds > 999) seconds = 999;
      updateLed();
    }, 1000);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* --- 左键翻开 --- */
  function onLeft(r, c) {
    // 首次点击：布置地雷 + 开始计时（必须先于 playing 检查）
    if (firstClick) {
      firstClick = false;
      playing = true;
      plantMines(r, c);
      startTimer();
    }
    if (!playing) return;
    const b = board[r][c];
    if (b.open || b.flag) return;
    if (b.question) { b.question = false; }

    if (b.mine) {
      revealAll(false);
      return;
    }

    openCell(r, c);
    render();
    checkWin();
  }

  function openCell(r, c) {
    const b = board[r][c];
    if (b.open || b.flag) return;
    b.open = true;
    b.question = false;
    // 空白：洪泛展开
    if (countMines(r, c) === 0) {
      neighbors(r, c).forEach(([rr, cc]) => openCell(rr, cc));
    }
  }

  /* --- 右键：插旗 / 问号 / 取消 --- */
  function onRight(r, c) {
    if (!playing) return;
    const b = board[r][c];
    if (b.open) return;
    if (b.flag) { b.flag = false; b.question = true; flagCount--; }
    else if (b.question) { b.question = false; }
    else { b.flag = true; flagCount++; }
    render();
  }

  /* --- 双击数字：chord 快速翻开周围 --- */
  function chord(r, c) {
    const b = board[r][c];
    if (!b.open || b.mine) return;
    const nb = neighbors(r, c);
    const flagN = nb.filter(([rr, cc]) => board[rr][cc].flag).length;
    if (flagN !== countMines(r, c)) return;

    for (const [rr, cc] of nb) {
      const t = board[rr][cc];
      if (t.flag || t.open) continue;
      if (t.mine) { revealAll(false); return; }
      openCell(rr, cc);
    }
    render();
    checkWin();
  }

  /* --- 胜负 --- */
  function checkWin() {
    const cfg = LEVELS[level];
    let safeLeft = 0;
    for (let r = 0; r < cfg.rows; r++)
      for (let c = 0; c < cfg.cols; c++)
        if (!board[r][c].mine && !board[r][c].open) safeLeft++;
    if (safeLeft === 0) win();
  }

  function win() {
    playing = false;
    stopTimer();
    faceBtn.textContent = "😎";
    // 自动标旗剩余地雷
    const cfg = LEVELS[level];
    for (let r = 0; r < cfg.rows; r++)
      for (let c = 0; c < cfg.cols; c++)
        if (board[r][c].mine) { board[r][c].flag = true; flagCount++; }
    render();
    if (!bestTime[level] || seconds < bestTime[level]) {
      bestTime[level] = seconds;
      try { localStorage.setItem("rsf_ms_best", JSON.stringify(bestTime)); } catch (e) {}
      updateBestInfo();
      setTimeout(() => alert(`🎉 恭喜！用时 ${seconds} 秒，刷新纪录！`), 100);
    } else {
      setTimeout(() => alert(`🎉 恭喜！用时 ${seconds} 秒`), 100);
    }
  }

  function revealAll(won) {
    playing = false;
    stopTimer();
    faceBtn.textContent = "😵";
    const cfg = LEVELS[level];
    for (let r = 0; r < cfg.rows; r++)
      for (let c = 0; c < cfg.cols; c++) {
        const b = board[r][c];
        if (b.mine && !b.flag) { b.open = true; }
        if (!b.mine && b.flag) { b.flag = false; b.open = true; b.wrongFlag = true; } // 错旗标红
      }
    render();
    // 错旗标红处理
    const cells = gridBox.children;
    for (let i = 0; i < cells.length; i++) {
      const r = +cells[i].dataset.r;
      const c = +cells[i].dataset.c;
      if (board[r][c].wrongFlag) {
        cells[i].classList.add("ms-wrong");
        cells[i].textContent = "❌";
      }
    }
  }

  /* --- 难度切换 --- */
  document.querySelectorAll(".ms-level-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ms-level-btn").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      newGame(btn.dataset.level);
    });
  });

  /* --- 笑脸：重新开始 --- */
  faceBtn.addEventListener("click", () => newGame(level));

  /* --- 最佳成绩显示 --- */
  function updateBestInfo() {
    const el = $("msBest");
    if (!el) return;
    const names = { easy: "初级", medium: "中级", hard: "高级" };
    el.textContent = Object.keys(bestTime)
      .map((k) => `${names[k]} ${bestTime[k]} 秒`)
      .join(" · ") || "暂无纪录";
  }

  /* --- 启动 --- */
  newGame("easy");
})();
