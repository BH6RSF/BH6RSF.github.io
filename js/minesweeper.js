/* ============================================================
   RsfNotes · 扫雷 Minesweeper（Windows XP 经典界面复刻）
   三种难度：初级 9×9/10 雷 · 中级 16×16/40 雷 · 高级 30×16/99 雷
   特性：首点不炸 · 右键插旗/问号 · 双击数字快速翻开（chord）
         计时器 · 剩余雷数 · 最快纪录 · 手机长按插旗
         XP 标题栏 / 下拉菜单 / LED 计数 / 笑脸表情
   ============================================================ */
(function () {
  const root = document.getElementById("msRoot");
  if (!root) return;

  /* ---------- 难度 ---------- */
  const LEVELS = {
    easy:   { name: "初级", rows: 9,  cols: 9,  mines: 10 },
    medium: { name: "中级", rows: 16, cols: 16, mines: 40 },
    hard:   { name: "高级", rows: 16, cols: 30, mines: 99 },
  };

  /* ---------- 状态 ---------- */
  let level = "easy";
  let board = [];        // {mine, open, flag, question}
  let firstClick = true;
  let playing = false;
  let timerId = null;
  let seconds = 0;
  let flagCount = 0;
  let bestTime = {};
  let pausedByDialog = false;
  let pausedByCollapse = false;

  const $ = (id) => document.getElementById(id);
  const faceBtn = $("msFace");
  const mineLed = $("msMineLed");
  const timeLed = $("msTimeLed");
  const gridBox = $("msGrid");
  const statusEl = $("msStatus");

  /* 读取历史纪录 */
  try {
    bestTime = JSON.parse(localStorage.getItem("rsf_ms_best") || "{}");
    if (!bestTime || typeof bestTime !== "object") bestTime = {};
  } catch (e) { bestTime = {}; }

  /* ---------- 工具 ---------- */
  const pad3 = (n) => String(Math.max(0, Math.min(999, n))).padStart(3, "0");
  const NUM_COLOR = ["", "#0000ff", "#008000", "#ff0000", "#000080",
                     "#800000", "#008080", "#000000", "#808080"];
  const fmtTime = (s) => {
    const m = (s / 60) | 0;
    return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  };

  const cfg = () => LEVELS[level];
  const inBounds = (r, c) => r >= 0 && r < cfg().rows && c >= 0 && c < cfg().cols;

  /* ---------- 笑脸表情 ---------- */
  const FACE_LABEL = {
    smile: "重新开始",
    o: "按住中",
    cool: "通关了，再来一局",
    dead: "踩到雷了，再来一局",
  };
  function setFace(mood) {
    faceBtn.dataset.face = mood;
    faceBtn.title = FACE_LABEL[mood] || FACE_LABEL.smile;
    faceBtn.setAttribute("aria-label", faceBtn.title);
  }

  function neighbors(r, c) {
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        if (inBounds(r + dr, c + dc)) out.push([r + dr, c + dc]);
      }
    }
    return out;
  }

  const countMines = (r, c) =>
    neighbors(r, c).filter(([rr, cc]) => board[rr][cc].mine).length;

  /* ---------- 新游戏 ---------- */
  function newGame(lv) {
    level = lv || level;
    const c = cfg();
    board = Array.from({ length: c.rows }, () =>
      Array.from({ length: c.cols }, () => ({ mine: false, open: false, flag: false, question: false }))
    );
    firstClick = true;
    playing = true;          // 允许点击（首点时布置地雷）
    stopTimer();
    pausedByDialog = false;
    pausedByCollapse = false;
    seconds = 0;
    flagCount = 0;
    setFace("smile");
    gridBox.classList.remove("ms-win", "ms-lose");
    buildGrid();
    render();
    setStatus("点击任意格子开始");
  }

  /* ---------- 布置地雷（保证首点 3×3 安全） ---------- */
  function plantMines(safeR, safeC) {
    const c = cfg();
    let placed = 0;
    let guard = 0;
    const total = c.rows * c.cols;
    while (placed < c.mines && guard++ < total * 200) {
      const r = Math.floor(Math.random() * c.rows);
      const col = Math.floor(Math.random() * c.cols);
      if (board[r][col].mine) continue;
      if (Math.abs(r - safeR) <= 1 && Math.abs(col - safeC) <= 1) continue;
      board[r][col].mine = true;
      placed++;
    }
  }

  /* ---------- 构建棋盘 ---------- */
  function buildGrid() {
    const c = cfg();
    gridBox.style.setProperty("--ms-cols", c.cols);
    gridBox.innerHTML = "";
    for (let r = 0; r < c.rows; r++) {
      for (let col = 0; col < c.cols; col++) {
        const cell = document.createElement("div");
        cell.className = "ms-cell ms-covered";
        cell.dataset.r = r;
        cell.dataset.c = col;

        cell.addEventListener("click", () => onLeft(r, col));
        cell.addEventListener("contextmenu", (e) => { e.preventDefault(); onRight(r, col); });
        cell.addEventListener("dblclick", (e) => { e.preventDefault(); chord(r, col); });

        // 触屏：长按插旗，短按翻开
        let pressTimer = null;
        let longPressed = false;
        cell.addEventListener("touchstart", (e) => {
          e.preventDefault();
          longPressed = false;
          pressTimer = setTimeout(() => { longPressed = true; onRight(r, col); }, 380);
        }, { passive: false });
        cell.addEventListener("touchend", (e) => {
          e.preventDefault();
          clearTimeout(pressTimer);
          if (!longPressed) onLeft(r, col);
        }, { passive: false });
        cell.addEventListener("touchmove", () => clearTimeout(pressTimer), { passive: true });

        gridBox.appendChild(cell);
      }
    }
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const c = cfg();
    const cells = gridBox.children;
    for (let r = 0; r < c.rows; r++) {
      for (let col = 0; col < c.cols; col++) {
        const el = cells[r * c.cols + col];
        const b = board[r][col];
        el.className = "ms-cell";
        el.style.color = "";

        if (b.open) {
          if (b.mine) {
            el.classList.add("ms-open", "ms-mine");
            el.textContent = "";
          } else {
            const n = countMines(r, col);
            el.classList.add("ms-open");
            el.textContent = n ? String(n) : "";
            if (n) el.style.color = NUM_COLOR[n];
          }
        } else if (b.flag) {
          el.classList.add("ms-covered", "ms-flag");
          el.textContent = "";
        } else if (b.question) {
          el.classList.add("ms-covered", "ms-question");
          el.textContent = "?";
        } else {
          el.classList.add("ms-covered");
          el.textContent = "";
        }
        if (b.wrongFlag) {
          el.classList.add("ms-wrong");
          el.textContent = "";
        }
      }
    }
    mineLed.textContent = pad3(cfg().mines - flagCount);
    timeLed.textContent = pad3(seconds);
  }

  function setStatus(t) { if (statusEl) statusEl.textContent = t; }

  /* ---------- XP 菜单 ---------- */
  const menuBar = $("msMenubar");

  function closeMenus() {
    document.querySelectorAll("#msMenubar .ms-dropdown").forEach((d) => { d.hidden = true; });
    document.querySelectorAll("#msMenubar .ms-menu-btn").forEach((b) => {
      b.classList.remove("open");
      b.setAttribute("aria-expanded", "false");
    });
  }

  if (menuBar) {
    menuBar.querySelectorAll(".ms-menu-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = "msMenu" + btn.dataset.menu.charAt(0).toUpperCase() + btn.dataset.menu.slice(1);
        const box = $(id);
        if (!box) return;
        const wasOpen = !box.hidden;
        closeMenus();
        if (!wasOpen) {
          box.hidden = false;
          btn.classList.add("open");
          btn.setAttribute("aria-expanded", "true");
        }
      });
    });
  }

  document.addEventListener("click", (e) => {
    if (menuBar && !menuBar.contains(e.target)) closeMenus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });

  /* ---------- 收起 / 展开窗口 ---------- */
  const minBtn = $("msMinBtn");
  function setCollapsed(v) {
    if (v) {
      if (playing && timerId) {
        stopTimer();
        pausedByCollapse = true;
        setStatus("已暂停…");
      }
    } else if (pausedByCollapse && playing) {
      startTimer();
      setStatus("进行中…");
      pausedByCollapse = false;
    }
    root.classList.toggle("ms-collapsed", v);
    if (minBtn) {
      minBtn.textContent = v ? "❐" : "–";
      minBtn.title = v ? "展开窗口" : "收起窗口";
      minBtn.setAttribute("aria-label", minBtn.title);
    }
    if (v) closeMenus();
  }
  if (minBtn) minBtn.addEventListener("click", () => setCollapsed(!root.classList.contains("ms-collapsed")));

  /* ---------- XP 对话框 ---------- */
  const dlg = $("msDialog");
  const dlgTitle = $("msDialogTitle");
  const dlgBody = $("msDialogBody");

  const DIALOGS = {
    help: {
      title: "扫雷",
      html: "<p><b>玩法</b></p><ul>" +
        "<li><b>左键</b>翻开格子，数字表示周围 8 格的地雷数。</li>" +
        "<li><b>右键</b>依次插旗、问号、取消；手机上<b>长按</b>插旗。</li>" +
        "<li><b>双击数字</b>：周围旗数与数字相同时，快速翻开其余格子。</li>" +
        "<li>第一次点击保证不会踩雷；翻开全部非雷格即获胜。</li>" +
        "</ul><p class='ms-dialog-note'>快捷键：F2 / R 重开，Esc 关闭窗口。</p>",
    },
    about: {
      title: "关于扫雷",
      html: "<p><b>RsfNotes · 扫雷</b></p>" +
        "<p>Windows XP 经典界面复刻：Luna 蓝色标题栏、立体格子、红色 LED 计时与笑脸表情。</p>" +
        "<p>初级 9×9 / 10 雷 · 中级 16×16 / 40 雷 · 高级 30×16 / 99 雷。</p>" +
        "<p>固定使用 XP Luna 配色，不随博客明暗主题切换。</p>" +
        "<p>纯 HTML / CSS / JavaScript 实现，最快纪录保存在本机浏览器。</p>",
    },
  };

  function closeDialog() {
    if (!dlg) return;
    const wasPaused = pausedByDialog;
    pausedByDialog = false;
    if (typeof dlg.close === "function" && dlg.open) dlg.close();
    else dlg.removeAttribute("open");
    if (wasPaused && playing) {
      startTimer();
      setStatus("进行中…");
    }
    if (faceBtn) faceBtn.focus({ preventScroll: true });
  }

  function openDialog(kind) {
    const data = DIALOGS[kind];
    if (!data) return;
    showDialog(data.title, data.html);
  }

  function showDialog(title, html) {
    if (!dlg) return;
    closeMenus();
    dlgTitle.textContent = title;
    dlgBody.innerHTML = html;
    if (playing && timerId) {
      stopTimer();
      pausedByDialog = true;
      setStatus("已暂停…");
    }
    if (!dlg.open) {
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
    }
  }

  const helpBtn = $("msHelpBtn");
  if (helpBtn) helpBtn.addEventListener("click", () => openDialog("help"));
  const helpItem = $("msHelpItem");
  if (helpItem) helpItem.addEventListener("click", () => openDialog("help"));
  const aboutItem = $("msAboutItem");
  if (aboutItem) aboutItem.addEventListener("click", () => openDialog("about"));
  const dlgX = $("msDialogX");
  if (dlgX) dlgX.addEventListener("click", closeDialog);
  const dlgOk = $("msDialogOk");
  if (dlgOk) dlgOk.addEventListener("click", closeDialog);
  if (dlg) {
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDialog(); });
    dlg.addEventListener("close", () => {
      if (pausedByDialog && playing) {
        startTimer();
        setStatus("进行中…");
      }
      pausedByDialog = false;
    });
  }

  /* ---------- 按压时笑脸变惊讶 ---------- */
  gridBox.addEventListener("pointerdown", (e) => {
    if (!playing) return;
    const cell = e.target && e.target.closest ? e.target.closest(".ms-cell") : null;
    if (cell && cell.classList.contains("ms-covered")) setFace("o");
  });
  const restoreFace = () => { if (playing) setFace("smile"); };
  document.addEventListener("pointerup", restoreFace);
  document.addEventListener("pointercancel", restoreFace);
  window.addEventListener("blur", restoreFace);

  /* ---------- 计时 ---------- */
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      seconds = Math.min(999, seconds + 1);
      timeLed.textContent = pad3(seconds);
    }, 1000);
  }
  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  /* ---------- 左键翻开 ---------- */
  function onLeft(r, c) {
    if (!playing) return;
    const b = board[r][c];
    if (b.open || b.flag) return;
    if (b.question) b.question = false;

    // 首次点击：布雷 + 开始计时
    if (firstClick) {
      firstClick = false;
      plantMines(r, c);
      startTimer();
      setStatus("进行中…");
    }

    if (b.mine) { lose(r, c); return; }
    openCell(r, c);
    render();
    checkWin();
  }

  /* 洪泛展开空白区域 */
  function openCell(r, c) {
    const b = board[r][c];
    if (b.open || b.flag) return;
    b.open = true;
    b.question = false;
    if (countMines(r, c) === 0) {
      neighbors(r, c).forEach(([rr, cc]) => openCell(rr, cc));
    }
  }

  /* ---------- 右键：插旗 → 问号 → 取消 ---------- */
  function onRight(r, c) {
    if (!playing) return;
    const b = board[r][c];
    if (b.open) return;
    if (b.flag) { b.flag = false; b.question = true; flagCount--; }
    else if (b.question) { b.question = false; }
    else { b.flag = true; flagCount++; }
    render();
  }

  /* ---------- 双击数字：快速翻开周围（chord） ---------- */
  function chord(r, c) {
    if (!playing) return;
    const b = board[r][c];
    if (!b.open || b.mine) return;
    const nb = neighbors(r, c);
    const flags = nb.filter(([rr, cc]) => board[rr][cc].flag).length;
    if (flags !== countMines(r, c)) return;

    for (const [rr, cc] of nb) {
      const t = board[rr][cc];
      if (t.flag || t.open) continue;
      if (t.mine) { lose(rr, cc); return; }
      openCell(rr, cc);
    }
    render();
    checkWin();
  }

  /* ---------- 胜负 ---------- */
  function checkWin() {
    const c = cfg();
    for (let r = 0; r < c.rows; r++) {
      for (let col = 0; col < c.cols; col++) {
        if (!board[r][col].mine && !board[r][col].open) return; // 还有安全格未翻开
      }
    }
    win();
  }

  function win() {
    playing = false;
    stopTimer();
    setFace("cool");
    gridBox.classList.add("ms-win");

    // 自动为剩余地雷插旗
    const c = cfg();
    for (let r = 0; r < c.rows; r++) {
      for (let col = 0; col < c.cols; col++) {
        const b = board[r][col];
        if (b.mine && !b.flag) { b.flag = true; flagCount++; }
      }
    }
    render();
    setStatus("🎉 完成！用时 " + fmtTime(seconds));

    const key = level;
    const isRecord = !bestTime[key] || seconds < bestTime[key];
    if (isRecord) {
      bestTime[key] = seconds;
      try { localStorage.setItem("rsf_ms_best", JSON.stringify(bestTime)); } catch (e) {}
      updateBest();
    }
    showDialog("扫雷", "<p><b>恭喜通关！</b></p>" +
      "<p>用时 " + fmtTime(seconds) + (isRecord ? "，刷新纪录！" : "") + "</p>" +
      "<p class='ms-dialog-note'>点击「确定」返回棋盘。</p>");
  }

  function lose(hitR, hitC) {
    playing = false;
    stopTimer();
    setFace("dead");
    gridBox.classList.add("ms-lose");

    // 展示所有地雷 + 标出插错的旗子
    const c = cfg();
    for (let r = 0; r < c.rows; r++) {
      for (let col = 0; col < c.cols; col++) {
        const b = board[r][col];
        if (b.mine) b.open = true;
        else if (b.flag) { b.flag = false; b.wrongFlag = true; }
      }
    }
    render();

    // 踩中的那颗用红底突出
    const cell = gridBox.children[hitR * c.cols + hitC];
    if (cell) cell.classList.add("ms-hit");
    setStatus("💥 踩到地雷了");
  }

  /* ---------- 纪录显示 ---------- */
  function updateBest() {
    const el = $("msBest");
    if (!el) return;
    const names = { easy: "初级", medium: "中级", hard: "高级" };
    const txt = Object.keys(names)
      .filter((k) => bestTime[k])
      .map((k) => names[k] + " " + fmtTime(bestTime[k]))
      .join(" · ");
    el.textContent = txt || "暂无";
  }

  /* ---------- 难度切换 ---------- */
  document.querySelectorAll(".ms-level-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".ms-level-btn").forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      closeMenus();
      newGame(btn.dataset.level);
    });
  });

  /* ---------- 笑脸 = 重开 ---------- */
  faceBtn.addEventListener("click", () => newGame(level));
  const newBtn = $("msNewBtn");
  if (newBtn) newBtn.addEventListener("click", () => { closeMenus(); newGame(level); });

  /* ---------- 键盘：R / F2 重开 ---------- */
  document.addEventListener("keydown", (e) => {
    const panel = $("msPanel");
    if (!panel || panel.hidden) return;
    if (dlg && dlg.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.toLowerCase() === "r" || e.key === "F2") {
      e.preventDefault();
      newGame(level);
    }
  });

  /* ---------- 启动 ---------- */
  updateBest();
  newGame("easy");
})();
