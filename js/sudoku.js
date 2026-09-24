/* ============================================================
   RsfNotes · 数独 Sudoku
   9×9 标准数独 · 三种难度 · 唯一解保证
   功能：候选数（笔记）· 提示 · 冲突检测 · 同数高亮 · 计时 · 最快纪录
   键盘：1-9 填数 · 方向键移动 · Delete/Backspace 擦除 · N 切换笔记
   ============================================================ */
(function () {
  const root = document.getElementById("sdkRoot");
  if (!root) return;

  /* ---------- 难度配置（挖空数量） ---------- */
  const LEVELS = {
    easy:   { name: "简单", holes: 40 },
    medium: { name: "中等", holes: 48 },
    hard:   { name: "困难", holes: 54 },
  };

  const idx = (r, c) => r * 9 + c;
  const rowOf = (i) => (i / 9) | 0;
  const colOf = (i) => i % 9;
  const boxOf = (i) => (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);

  /* ---------- 谜题生成 ---------- */
  const BIT_VAL = {};           // 位掩码 → 数字
  for (let v = 1; v <= 9; v++) BIT_VAL[1 << (v - 1)] = v;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* 生成完整解（随机回溯） */
  function generateSolution() {
    const g = new Array(81).fill(0);
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);

    function fill(pos) {
      if (pos === 81) return true;
      const r = rowOf(pos), c = colOf(pos), b = boxOf(pos);
      const avail = ~(rows[r] | cols[c] | boxes[b]) & 0x1FF;
      const vals = shuffle(Object.keys(BIT_VAL).map(Number).filter((bit) => avail & bit));
      for (const bit of vals) {
        g[pos] = BIT_VAL[bit];
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        if (fill(pos + 1)) return true;
        g[pos] = 0;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      }
      return false;
    }
    fill(0);
    return g;
  }

  /* 统计解的个数（最多数到 limit，用 MRV 剪枝加速） */
  function countSolutions(grid, limit) {
    const g = grid.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      if (!g[i]) continue;
      const bit = 1 << (g[i] - 1);
      rows[rowOf(i)] |= bit; cols[colOf(i)] |= bit; boxes[boxOf(i)] |= bit;
    }
    let count = 0;

    function dfs() {
      // 选候选最少的空格（MRV）
      let best = -1, bestMask = 0, bestCnt = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const avail = ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & 0x1FF;
        let cnt = 0, m = avail;
        while (m) { m &= m - 1; cnt++; }
        if (cnt === 0) return;                 // 死路
        if (cnt < bestCnt) { bestCnt = cnt; best = i; bestMask = avail; if (cnt === 1) break; }
      }
      if (best === -1) { count++; return; }     // 填满 → 一个解
      const r = rowOf(best), c = colOf(best), b = boxOf(best);
      let m = bestMask;
      while (m) {
        const bit = m & -m;
        m ^= bit;
        g[best] = BIT_VAL[bit];
        rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        dfs();
        g[best] = 0;
        rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (count >= limit) return;
      }
    }
    dfs();
    return count;
  }

  /* 挖空生成谜题（保证唯一解） */
  function makePuzzle(level) {
    const solution = generateSolution();
    const puzzle = solution.slice();
    const target = LEVELS[level].holes;
    let holes = 0;
    for (const pos of shuffle([...Array(81).keys()])) {
      if (holes >= target) break;
      const backup = puzzle[pos];
      if (!backup) continue;
      puzzle[pos] = 0;
      if (countSolutions(puzzle, 2) === 1) holes++;
      else puzzle[pos] = backup;   // 破坏唯一解则还原
    }
    return { puzzle, solution };
  }

  /* ---------- 状态 ---------- */
  let level = "easy";
  let puzzle = [];      // 初始题目（0=空）
  let solution = [];    // 完整解
  let cells = [];       // 当前填写值
  let notes = [];       // 每格候选数（Set）
  let selected = -1;
  let noteMode = false;
  let playing = false;
  let seconds = 0;
  let timerId = null;
  let generating = false;
  let bestTime = {};
  let history = [];     // 撤销栈

  try { bestTime = JSON.parse(localStorage.getItem("rsf_sdk_best") || "{}"); } catch (e) { bestTime = {}; }

  /* ---------- DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const boardEl = $("sdkBoard");
  const padEl = $("sdkPad");
  const timeEl = $("sdkTime");
  const statusEl = $("sdkStatus");
  const noteBtn = $("sdkNoteBtn");
  const bestEl = $("sdkBest");

  /* ---------- 新游戏 ---------- */
  function newGame(lv) {
    level = lv;
    if (generating) return;
    generating = true;
    statusEl.textContent = "生成谜题中…";
    boardEl.classList.add("sdk-loading");

    // 让界面先渲染「生成中」，再执行较重的生成计算
    setTimeout(() => {
      const { puzzle: p, solution: s } = makePuzzle(lv);
      puzzle = p;
      solution = s;
      cells = p.slice();
      notes = Array.from({ length: 81 }, () => new Set());
      selected = -1;
      history = [];
      playing = true;
      seconds = 0;
      stopTimer();
      startTimer();
      noteMode = false;
      noteBtn.classList.remove("active");
      generating = false;
      boardEl.classList.remove("sdk-loading");
      buildBoard();
      render();
      updateBest();
      statusEl.textContent = "开始填数吧！";
    }, 30);
  }

  /* ---------- 构建棋盘 ---------- */
  function buildBoard() {
    boardEl.innerHTML = "";
    for (let i = 0; i < 81; i++) {
      const cell = document.createElement("div");
      cell.className = "sdk-cell";
      const r = rowOf(i), c = colOf(i);
      // 3×3 宫边框加粗
      if (c % 3 === 2 && c !== 8) cell.classList.add("br");
      if (r % 3 === 2 && r !== 8) cell.classList.add("bb");
      cell.dataset.i = i;

      const val = document.createElement("span");
      val.className = "sdk-val";
      cell.appendChild(val);

      const nt = document.createElement("div");
      nt.className = "sdk-notes";
      for (let n = 1; n <= 9; n++) {
        const s = document.createElement("span");
        s.textContent = n;
        nt.appendChild(s);
      }
      cell.appendChild(nt);

      cell.addEventListener("click", () => { select(i); });
      boardEl.appendChild(cell);
    }
  }

  /* ---------- 选中 ---------- */
  function select(i) {
    if (!playing) return;
    selected = i;
    render();
  }

  /* ---------- 填数 ---------- */
  function inputNumber(n) {
    if (!playing || selected < 0) return;
    if (puzzle[selected] !== 0) return;   // 题目给定格不可改

    if (noteMode) {
      history.push({ type: "notes", i: selected, prev: new Set(notes[selected]) });
      if (notes[selected].has(n)) notes[selected].delete(n);
      else notes[selected].add(n);
    } else {
      history.push({ type: "value", i: selected, prev: cells[selected], prevNotes: new Set(notes[selected]) });
      if (cells[selected] === n) {
        cells[selected] = 0;              // 再点同数字 = 擦除
      } else {
        cells[selected] = n;
        notes[selected].clear();
        // 自动清理同行/列/宫的相关候选数
        peersOf(selected).forEach((p) => notes[p].delete(n));
      }
    }
    render();
    checkWin();
  }

  function eraseCell() {
    if (!playing || selected < 0) return;
    if (puzzle[selected] !== 0) return;
    history.push({ type: "value", i: selected, prev: cells[selected], prevNotes: new Set(notes[selected]) });
    cells[selected] = 0;
    notes[selected].clear();
    render();
  }

  function undo() {
    if (!playing || !history.length) return;
    const h = history.pop();
    if (h.type === "notes") notes[h.i] = h.prev;
    else { cells[h.i] = h.prev; notes[h.i] = h.prevNotes; }
    selected = h.i;
    render();
  }

  function hint() {
    if (!playing) return;
    const empties = [];
    for (let i = 0; i < 81; i++) if (cells[i] !== solution[i]) empties.push(i);
    if (!empties.length) return;
    const i = empties[Math.floor(Math.random() * empties.length)];
    history.push({ type: "value", i, prev: cells[i], prevNotes: new Set(notes[i]) });
    cells[i] = solution[i];
    notes[i].clear();
    peersOf(i).forEach((p) => notes[p].delete(solution[i]));
    selected = i;
    render();
    checkWin();
  }

  /* 同宫/同行/同列坐标 */
  function peersOf(i) {
    const out = new Set();
    const r = rowOf(i), c = colOf(i), b = boxOf(i);
    for (let k = 0; k < 81; k++) {
      if (k === i) continue;
      if (rowOf(k) === r || colOf(k) === c || boxOf(k) === b) out.add(k);
    }
    return out;
  }

  /* 某格当前是否冲突 */
  function isConflict(i) {
    const v = cells[i];
    if (!v) return false;
    for (const p of peersOf(i)) if (cells[p] === v) return true;
    return false;
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const selVal = selected >= 0 ? cells[selected] : 0;
    const peers = selected >= 0 ? peersOf(selected) : new Set();

    for (let i = 0; i < 81; i++) {
      const cell = boardEl.children[i];
      const v = cells[i];
      const conflict = isConflict(i);

      cell.className = "sdk-cell";
      const r = rowOf(i), c = colOf(i);
      if (c % 3 === 2 && c !== 8) cell.classList.add("br");
      if (r % 3 === 2 && r !== 8) cell.classList.add("bb");
      if (puzzle[i] !== 0) cell.classList.add("sdk-given");
      if (i === selected) cell.classList.add("sdk-sel");
      else if (peers.has(i)) cell.classList.add("sdk-peer");
      if (v && selVal && v === selVal && i !== selected) cell.classList.add("sdk-same");
      if (conflict) cell.classList.add("sdk-conflict");

      cell.querySelector(".sdk-val").textContent = v || "";

      // 候选数显示
      const nt = cell.querySelector(".sdk-notes");
      if (!v && notes[i].size) {
        nt.style.display = "grid";
        for (let n = 1; n <= 9; n++) {
          nt.children[n - 1].textContent = notes[i].has(n) ? n : "";
          nt.children[n - 1].className = (selVal === n) ? "hl" : "";
        }
      } else {
        nt.style.display = "none";
      }
    }
    timeEl.textContent = fmtTime(seconds);
  }

  /* ---------- 计时 ---------- */
  function fmtTime(s) {
    const m = (s / 60) | 0;
    return String(m).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(() => { seconds++; timeEl.textContent = fmtTime(seconds); }, 1000);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  /* ---------- 胜利 ---------- */
  function checkWin() {
    for (let i = 0; i < 81; i++) if (cells[i] !== solution[i]) return;
    playing = false;
    stopTimer();
    statusEl.textContent = "🎉 完成！用时 " + fmtTime(seconds);
    boardEl.classList.add("sdk-win");

    const key = level;
    if (!bestTime[key] || seconds < bestTime[key]) {
      bestTime[key] = seconds;
      try { localStorage.setItem("rsf_sdk_best", JSON.stringify(bestTime)); } catch (e) {}
      updateBest();
      setTimeout(() => alert("🎉 恭喜完成！用时 " + fmtTime(seconds) + "，刷新纪录！"), 120);
    } else {
      setTimeout(() => alert("🎉 恭喜完成！用时 " + fmtTime(seconds)), 120);
    }
  }

  function updateBest() {
    if (!bestEl) return;
    const names = { easy: "简单", medium: "中等", hard: "困难" };
    const txt = Object.keys(bestTime).map((k) => names[k] + " " + fmtTime(bestTime[k])).join(" · ");
    bestEl.textContent = txt || "暂无纪录";
  }

  /* ---------- 数字键盘 ---------- */
  (function buildPad() {
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement("button");
      b.className = "sdk-pad-btn";
      b.textContent = n;
      b.addEventListener("click", () => inputNumber(n));
      padEl.appendChild(b);
    }
    const er = document.createElement("button");
    er.className = "sdk-pad-btn sdk-pad-fn";
    er.textContent = "⌫";
    er.title = "擦除";
    er.addEventListener("click", eraseCell);
    padEl.appendChild(er);
  })();

  /* ---------- 按钮 ---------- */
  noteBtn.addEventListener("click", () => {
    noteMode = !noteMode;
    noteBtn.classList.toggle("active", noteMode);
    statusEl.textContent = noteMode ? "笔记模式：填入候选数" : "填数模式";
  });
  $("sdkHintBtn").addEventListener("click", hint);
  $("sdkUndoBtn").addEventListener("click", undo);
  $("sdkNewBtn").addEventListener("click", () => newGame(level));

  document.querySelectorAll(".sdk-level-btn").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".sdk-level-btn").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      newGame(b.dataset.level);
    });
  });

  /* ---------- 键盘 ---------- */
  document.addEventListener("keydown", (e) => {
    if (document.body.dataset.game !== "sudoku" && !root.closest(".game-panel:not([hidden])")) {
      // 仅当数独面板可见时响应
      const panel = $("sdkPanel");
      if (!panel || panel.hidden) return;
    }
    if (e.key >= "1" && e.key <= "9") { e.preventDefault(); inputNumber(+e.key); return; }
    if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") { e.preventDefault(); eraseCell(); return; }
    if (e.key.toLowerCase() === "n") { e.preventDefault(); noteBtn.click(); return; }
    if (e.key.toLowerCase() === "h") { e.preventDefault(); hint(); return; }
    if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); undo(); return; }
    // 方向键移动选中
    if (selected >= 0 && e.key.startsWith("Arrow")) {
      e.preventDefault();
      let r = rowOf(selected), c = colOf(selected);
      if (e.key === "ArrowUp") r = (r + 8) % 9;
      if (e.key === "ArrowDown") r = (r + 1) % 9;
      if (e.key === "ArrowLeft") c = (c + 8) % 9;
      if (e.key === "ArrowRight") c = (c + 1) % 9;
      selected = idx(r, c);
      render();
    }
  });

  /* ---------- 启动 ---------- */
  updateBest();
  newGame("easy");
})();
