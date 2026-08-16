/* ============================================================
   RsfNotes · 全局脚本
   包含：主题切换 / Markdown 渲染 / 首页 / 文章页 / 侧边栏 / giscus
   依赖 js/posts.js（SITE、POSTS）
   ============================================================ */

/* ---------- giscus 评论配置 ----------
   启用步骤：
   1. 在 GitHub 仓库设置中开启 Discussions
      （https://github.com/BH6RSF/BH6RSF.github.io/settings → Features）
   2. 安装 giscus app：https://github.com/apps/giscus（授权给本仓库）
   3. 打开 https://giscus.app/zh-CN → 输入仓库名 → 选分类
      → 页面会给出 repo / repoId / category / categoryId 四个值
   4. 把 repoId 和 categoryId 填入下面（repo 和 category 已预填）
   5. 重新部署后，文章页底部即可评论
*/
const GISCUS = {
  repo: "BH6RSF/BH6RSF.github.io",
  repoId: "R_kgDOT53FaA",
  category: "General",
  categoryId: "DIC_kwDOT53FaM4DDf3A",
};

/* ============================================================
   工具函数
   ============================================================ */

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- 迷你 Markdown 渲染器 ---------- */
function renderInline(s) {
  // 先转义 HTML，防止 XSS（Markdown 语法符号不受转义影响）
  s = escapeHtml(s);
  // 保护行内代码
  const codeSpans = [];
  s = s.replace(/`([^`]+)`/g, (m, c) => {
    codeSpans.push(`<code>${c}</code>`);
    return `\u0000${codeSpans.length - 1}\u0000`;
  });
  // 链接（仅允许 http/https/mailto）
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // 粗体
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // 恢复行内代码
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => codeSpans[+i]);
}

/* ---------- 轻量代码语法高亮（GitHub Primer 风格配色） ---------- */
const HL_KEYWORDS = {
  js: new Set("const let var function return if else for while do switch case break continue class new import export from default async await try catch finally throw typeof instanceof true false null undefined this in of yield static extends super void delete".split(" ")),
  py: new Set("def class if elif else for while return import from as with try except finally lambda True False None and or not in is pass break continue global nonlocal yield raise assert del".split(" ")),
  bash: new Set("if then else elif fi for while do done case esac function local return export echo exit true false in".split(" ")),
  sql: new Set("select from where insert into update delete create table join on as group by order limit values set and or not null true false primary key index drop alter add".split(" ")),
  css: new Set("@media @import @keyframes @font-face @supports @charset".split(" ")),
};

function highlightCode(code, lang) {
  lang = (lang || "").toLowerCase();
  const isHtml = ["html", "htm", "xml", "svg"].includes(lang);
  const isJsLike = ["js", "jsx", "ts", "tsx", "javascript", "typescript", "node", "json"].includes(lang);
  const isPy = ["py", "python"].includes(lang);
  const isBash = ["bash", "sh", "shell", "zsh", "console"].includes(lang);
  const isSql = ["sql"].includes(lang);
  const isCss = ["css", "scss", "less"].includes(lang);

  let kw = new Set();
  if (isJsLike) kw = HL_KEYWORDS.js;
  else if (isPy) kw = HL_KEYWORDS.py;
  else if (isBash) kw = HL_KEYWORDS.bash;
  else if (isSql) kw = HL_KEYWORDS.sql;
  else if (isCss) kw = HL_KEYWORDS.css;

  const commentSrc = isPy || isBash
    ? "#[^\\n]*"
    : isSql
      ? "--[^\\n]*|/\\*[\\s\\S]*?\\*/"
      : isHtml
        ? "<!--[\\s\\S]*?-->"
        : "//[^\\n]*|/\\*[\\s\\S]*?\\*/";

  const re = new RegExp(
    `(?<comment>${commentSrc})|` +
    `(?<string>'(?:[^'\\\\\\n]|\\\\.)*'|"(?:[^"\\\\\\n]|\\\\.)*"|\`(?:[^\`\\\\\\n]|\\\\.)*\`)|` +
    `(?<number>\\b\\d+(?:\\.\\d+)?\\b)|` +
    `(?<at>@[\\w-]+)|` +
    (isHtml ? `(?<tag><\\/?[a-zA-Z][\\w-]*)|(?<attr>[a-zA-Z-]+(?==))|` : "") +
    (isBash ? `(?<var>\\$\\{[^}]*\\}|\\$[A-Za-z_][\\w]*)|` : "") +
    `(?<func>[A-Za-z_$][\\w$]*(?=\\s*\\())|` +
    `(?<word>[A-Za-z_$][\\w$-]*)`,
    "g"
  );

  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    const g = m.groups;
    const val = m[0];
    let cls = null;
    if (g.comment !== undefined) cls = "tok-comment";
    else if (g.string !== undefined) cls = "tok-string";
    else if (g.number !== undefined) cls = "tok-number";
    else if (g.at !== undefined) cls = kw.has(val) ? "tok-keyword" : "tok-tag";
    else if (g.tag !== undefined) cls = "tok-tag";
    else if (g.attr !== undefined) cls = "tok-attr";
    else if (g.var !== undefined) cls = "tok-attr";
    else if (g.func !== undefined) cls = "tok-func";
    else if (g.word !== undefined && kw.has(val)) cls = "tok-keyword";

    if (cls) out += `<span class="${cls}">${escapeHtml(val)}</span>`;
    else out += escapeHtml(val);
    last = m.index + val.length;
  }
  out += escapeHtml(code.slice(last));
  return out;
}

/* ---------- 阅读时长估算 ---------- */
function readingMinutes(content) {
  const text = content.replace(/```[\s\S]*?```/g, " ");
  const cn = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (text.match(/[A-Za-z]+/g) || []).length;
  return Math.max(1, Math.round(cn / 300 + words / 200));
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  let listType = null;
  let inQuote = false;

  const closeList = () => {
    if (listType) { html += `</${listType}>`; listType = null; }
  };
  const closeQuote = () => {
    if (inQuote) { html += "</blockquote>"; inQuote = false; }
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();

    /* 代码块 */
    if (t.startsWith("```")) {
      if (!inCode) {
        closeList(); closeQuote();
        inCode = true;
        codeLang = t.slice(3).trim();
        codeBuf = [];
      } else {
        html += `<pre><span class="code-lang">${escapeHtml(codeLang)}</span><code>${highlightCode(codeBuf.join("\n"), codeLang)}</code></pre>`;
        inCode = false;
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    /* 空行 */
    if (t === "") { closeList(); closeQuote(); continue; }

    /* 标题 */
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList(); closeQuote();
      html += `<h${h[1].length}>${renderInline(h[2])}</h${h[1].length}>`;
      continue;
    }

    /* 分割线 */
    if (/^(-{3,}|\*{3,})$/.test(t)) { closeList(); closeQuote(); html += "<hr>"; continue; }

    /* 表格 */
    if (t.startsWith("|")) {
      closeList(); closeQuote();
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim());
        i++;
      }
      i--;
      const parseRow = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      let bodyStart = 1;
      if (rows[1] && /^[\s|:-]+$/.test(rows[1].replace(/\|/g, ""))) bodyStart = 2;
      let tbl = "<table><thead><tr>";
      parseRow(rows[0]).forEach((c) => (tbl += `<th>${renderInline(c)}</th>`));
      tbl += "</tr></thead><tbody>";
      for (let r = bodyStart; r < rows.length; r++) {
        tbl += "<tr>";
        parseRow(rows[r]).forEach((c) => (tbl += `<td>${renderInline(c)}</td>`));
        tbl += "</tr>";
      }
      html += tbl + "</tbody></table>";
      continue;
    }

    /* 无序列表 */
    if (/^[-*]\s+/.test(t)) {
      if (listType !== "ul") { closeList(); html += "<ul>"; listType = "ul"; }
      html += `<li>${renderInline(t.replace(/^[-*]\s+/, ""))}</li>`;
      continue;
    }

    /* 有序列表 */
    const ol = t.match(/^\d+[.)]\s+(.*)$/);
    if (ol) {
      if (listType !== "ol") { closeList(); html += "<ol>"; listType = "ol"; }
      html += `<li>${renderInline(ol[1])}</li>`;
      continue;
    }

    /* 引用 */
    if (t.startsWith(">")) {
      if (!inQuote) { closeList(); html += "<blockquote>"; inQuote = true; }
      html += `<p>${renderInline(t.replace(/^>\s?/, ""))}</p>`;
      continue;
    }

    /* 普通段落 */
    closeList(); closeQuote();
    html += `<p>${renderInline(t)}</p>`;
  }

  closeList(); closeQuote();
  if (inCode) {
    html += `<pre><span class="code-lang">${escapeHtml(codeLang)}</span><code>${highlightCode(codeBuf.join("\n"), codeLang)}</code></pre>`;
  }
  return html;
}

function formatDate(d) {
  const [y, m, day] = d.split("-");
  return `${y} 年 ${+m} 月 ${+day} 日`;
}

/* ============================================================
   主题切换
   ============================================================ */
/* 评论框主题：跟随博客主题（暗色 → giscus dark，亮色 → light） */
function giscusTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark" : "light";
}

/* 博客主题切换后，同步评论框（giscus iframe）主题 */
function syncGiscusTheme() {
  const frame = document.querySelector("iframe.giscus-frame");
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage(
      { giscus: { setConfig: { theme: giscusTheme() } } },
      "https://giscus.app"
    );
  }
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = saved || (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", theme);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = theme === "dark" ? "☀️" : "🌙";
    btn.title = theme === "dark" ? "切换到亮色模式" : "切换到暗色模式";
    btn.addEventListener("click", () => {
      const next =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
      btn.textContent = next === "dark" ? "☀️" : "🌙";
      btn.title = next === "dark" ? "切换到亮色模式" : "切换到暗色模式";
      syncGiscusTheme(); /* 同步评论框主题 */
    });
  }
}

/* ============================================================
   导航高亮
   ============================================================ */
function initNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === path) a.classList.add("active");
  });
}

/* ============================================================
   页脚
   ============================================================ */
function initFooter() {
  const el = document.getElementById("footerYear");
  if (el) el.textContent = new Date().getFullYear();
}

/* ============================================================
   回到顶部
   ============================================================ */
function initBackTop() {
  const btn = document.getElementById("backTop");
  if (!btn) return;
  window.addEventListener("scroll", () => {
    btn.classList.toggle("show", window.scrollY > 400);
  });
  btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

/* ============================================================
   阅读进度条（文章页顶部）
   ============================================================ */
function initReadingProgress() {
  const bar = document.getElementById("readingProgress");
  if (!bar) return;
  const onScroll = () => {
    const doc = document.documentElement;
    const total = doc.scrollHeight - doc.clientHeight;
    bar.style.width = (total > 0 ? (doc.scrollTop / total) * 100 : 0) + "%";
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   滚动渐入（IntersectionObserver 驱动 .fade-up）
   ============================================================ */
function initReveal() {
  const els = document.querySelectorAll(".fade-up:not(.visible)");
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add("visible");
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.08 }
  );
  els.forEach((el) => io.observe(el));
}

/* ============================================================
   首页
   ============================================================ */
const PER_PAGE = 5;
let currentTag = null;
let currentPage = 1;

function initIndex() {
  initTypewriter();
  renderTagCloud();
  renderSidebar();
  renderPostList();
}

/* Hero 打字机 */
function initTypewriter() {
  const el = document.querySelector(".typing");
  if (!el) return;
  const phrases = [
    "const dev = (idea) => code(idea);",
    "> 记录技术 · 分享思考 · 持续学习",
    "vim 高手 · 咖啡成瘾 · 生产环境杀手",
  ];
  let pi = 0;
  let ci = 0;
  let deleting = false;
  const tick = () => {
    const word = phrases[pi];
    el.textContent = word.slice(0, ci);
    if (!deleting) {
      ci++;
      if (ci > word.length) { deleting = true; setTimeout(tick, 1600); return; }
      setTimeout(tick, 90);
    } else {
      ci--;
      if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; setTimeout(tick, 400); return; }
      setTimeout(tick, 40);
    }
  };
  tick();
}

/* 侧边栏：最近文章 + 关于 */
function renderSidebar() {
  const recent = document.getElementById("recentPosts");
  if (recent) {
    recent.innerHTML = sortedPosts()
      .slice(0, 5)
      .map(
        (p) =>
          `<li><a href="post.html?id=${p.id}">${escapeHtml(p.title)}</a>` +
          `<span class="recent-date">${p.date.slice(5)}</span></li>`
      )
      .join("");
  }
  const about = document.getElementById("sideAbout");
  if (about) {
    about.innerHTML =
      `<p style="font-weight:600;color:var(--text);">👤 ${escapeHtml(SITE.author)}</p>` +
      `<p>${escapeHtml(SITE.description)}</p>`;
  }
}

/* 标签云 */
function renderTagCloud() {
  const el = document.getElementById("tagCloud");
  if (!el) return;
  el.innerHTML = allTags()
    .map(
      ([tag, count]) =>
        `<a class="tag" data-tag="${escapeHtml(tag)}" href="javascript:void(0)"># ${escapeHtml(tag)} (${count})</a>`
    )
    .join("");
  el.querySelectorAll("a.tag").forEach((a) =>
    a.addEventListener("click", () => {
      const tag = a.getAttribute("data-tag");
      currentTag = currentTag === tag ? null : tag;
      currentPage = 1;
      renderPostList();
      el.querySelectorAll("a.tag").forEach((x) => {
        x.style.outline = x.getAttribute("data-tag") === currentTag ? "2px solid var(--accent)" : "";
      });
      document.getElementById("listTitle")?.scrollIntoView({ behavior: "smooth", block: "start" });
    })
  );
}

/* 文章列表（支持标签过滤 + 分页） */
function renderPostList() {
  const list = document.getElementById("postList");
  if (!list) return;

  let posts = sortedPosts();
  if (currentTag) posts = posts.filter((p) => p.tags.includes(currentTag));

  const totalPages = Math.max(1, Math.ceil(posts.length / PER_PAGE));
  if (currentPage > totalPages) currentPage = totalPages;
  const pagePosts = posts.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  const titleEl = document.getElementById("listTitle");
  if (titleEl) {
    titleEl.textContent = currentTag
      ? `标签：# ${currentTag}`
      : posts.length
        ? `全部文章（${posts.length}）`
        : "暂无文章";
  }

  list.innerHTML = pagePosts.length
    ? pagePosts
        .map(
          (p) => `
          <article class="post-card fade-up">
            <h2><a href="post.html?id=${p.id}">${escapeHtml(p.title)}</a></h2>
            <div class="post-meta">
              <span>📅 ${formatDate(p.date)}</span>
              <span class="sep">·</span>
              <span>${p.tags.map((t) => `<a class="tag" href="javascript:void(0)" data-jump="${escapeHtml(t)}">${escapeHtml(t)}</a>`).join("")}</span>
              <span class="sep">·</span>
              <span class="read-time">⏱ ${readingMinutes(p.content)} 分钟</span>
            </div>
            <p class="post-summary">${escapeHtml(p.summary)}</p>
            <a href="post.html?id=${p.id}">阅读全文 →</a>
          </article>`
        )
        .join("")
    : POSTS.length === 0
      ? `<div class="widget" style="text-align:center;padding:40px;">
           📝 还没有文章<br><br>
           打开 <code>js/posts.js</code>，在 <code>POSTS</code> 数组中添加第一篇文章吧！
         </div>`
      : `<div class="widget" style="text-align:center;padding:40px;">该标签下暂无文章</div>`;

  /* 卡片内标签点击 → 过滤 */
  list.querySelectorAll("a.tag[data-jump]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      currentTag = a.getAttribute("data-jump");
      currentPage = 1;
      renderTagCloud(); // 同步高亮
      renderPostList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );

  renderPagination(totalPages);
  initReveal(); /* 新渲染的卡片重新观察渐入 */
}

function renderPagination(totalPages) {
  const box = document.getElementById("pagination");
  if (!box) return;
  if (totalPages <= 1) { box.innerHTML = ""; return; }
  box.innerHTML = `
    <button id="prevPage" ${currentPage === 1 ? "disabled" : ""}>← 上一页</button>
    <span class="page-info">${currentPage} / ${totalPages}</span>
    <button id="nextPage" ${currentPage === totalPages ? "disabled" : ""}>下一页 →</button>`;
  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; renderPostList(); }
  });
  document.getElementById("nextPage")?.addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; renderPostList(); }
  });
}

/* ============================================================
   文章详情页
   ============================================================ */
function initPost() {
  const id = new URLSearchParams(location.search).get("id");
  const post = POSTS.find((p) => p.id === id);

  if (!post) {
    document.body.innerHTML = `
      <nav class="nav"><div class="nav-inner">
        <a class="nav-brand" href="index.html"><span class="logo">&lt;/&gt;</span>${escapeHtml(SITE.name)}</a>
      </div></nav>
      <div class="error-page">
        <div class="code">404</div>
        <h2>文章不存在或已被删除</h2>
        <p>回到首页看看其他文章吧</p>
        <a class="btn" href="index.html">返回首页</a>
      </div>`;
    return;
  }

  document.title = `${post.title} · ${SITE.name}`;

  const idx = sortedPosts().findIndex((p) => p.id === id);
  const posts = sortedPosts();
  const prev = idx > 0 ? posts[idx - 1] : null;
  const next = idx < posts.length - 1 ? posts[idx + 1] : null;

  document.getElementById("postTitle").textContent = post.title;
  document.getElementById("postDate").textContent = formatDate(post.date);
  const authorEl = document.getElementById("postAuthor");
  if (authorEl) authorEl.textContent = SITE.author;
  const rtEl = document.getElementById("postReadTime");
  if (rtEl) rtEl.textContent = `⏱ 约 ${readingMinutes(post.content)} 分钟`;
  initReadingProgress();
  document.getElementById("postTags").innerHTML = post.tags
    .map((t) => `<a class="tag" href="index.html"># ${escapeHtml(t)}</a>`)
    .join(" ");
  document.getElementById("postContent").innerHTML = renderMarkdown(post.content);

  /* 上一篇 / 下一篇 */
  const navBox = document.getElementById("postNav");
  if (navBox) {
    navBox.innerHTML =
      (prev
        ? `<a class="prev" href="post.html?id=${prev.id}"><span class="nav-label">← 上一篇</span><span class="nav-title">${escapeHtml(prev.title)}</span></a>`
        : `<a class="prev" style="visibility:hidden"></a>`) +
      (next
        ? `<a class="next" href="post.html?id=${next.id}"><span class="nav-label">下一篇 →</span><span class="nav-title">${escapeHtml(next.title)}</span></a>`
        : `<a class="next" style="visibility:hidden"></a>`);
  }

  initComments(post);
}

/* giscus 评论 */
function initComments(post) {
  const box = document.getElementById("giscusBox");
  if (!box) return;

  if (!GISCUS.repo || !GISCUS.repoId || !GISCUS.categoryId) {
    box.innerHTML = `
      <div class="giscus-placeholder">
        💬 评论功能待启用<br><br>
        打开 <a href="https://giscus.app/zh-CN" target="_blank" rel="noopener noreferrer">giscus.app</a>，
        输入仓库 <code>BH6RSF/BH6RSF.github.io</code> 生成配置，<br>
        然后把 <code>repoId</code> 和 <code>categoryId</code> 填入
        <code>js/app.js</code> 顶部的 <code>GISCUS</code> 常量即可开启
      </div>`;
    return;
  }

  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.async = true;
  script.crossOrigin = "anonymous";
  script.setAttribute("data-repo", GISCUS.repo);
  script.setAttribute("data-repo-id", GISCUS.repoId);
  script.setAttribute("data-category", GISCUS.category);
  script.setAttribute("data-category-id", GISCUS.categoryId);
  script.setAttribute("data-mapping", "specific");
  script.setAttribute("data-term", post.id);
  script.setAttribute("data-strict", "0");
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "top");
  script.setAttribute("data-theme", giscusTheme());
  script.setAttribute("data-lang", "zh-CN");
  box.appendChild(script);
}

/* ============================================================
   入口
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initNav();
  initFooter();
  initBackTop();

  if (document.getElementById("postList")) initIndex();
  if (document.getElementById("postContent")) initPost();
  initReveal();
});
