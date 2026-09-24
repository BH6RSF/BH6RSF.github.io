/* 临时验证脚本：在 Node 中模拟执行 posts.js + app.js，检查渲染输出 */
const fs = require("fs");
const vm = require("vm");

const postsSrc = fs.readFileSync("js/posts.js", "utf8");
const appSrc = fs.readFileSync("js/app.js", "utf8");

const fakeEl = {
  innerHTML: "",
  textContent: "",
  style: {},
  setAttribute() {},
  addEventListener() {},
  querySelectorAll() { return []; },
  classList: { toggle() {}, add() {}, remove() {} },
  appendChild() {},
};

const context = {
  console,
  localStorage: { getItem: () => null, setItem() {} },
  matchMedia: () => ({ matches: false }),
  URLSearchParams,
  location: { search: "?id=hello-world", pathname: "/post.html" },
  document: {
    documentElement: { setAttribute() {} },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => fakeEl,
    title: "",
    body: {},
  },
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    scrollTo() {},
    scrollY: 0,
  },
  // KaTeX 桩：让数学公式测试可在 Node 中运行（不加载真实 KaTeX）
  katex: {
    renderToString(tex, opts) {
      return `<span class="katex-stub" data-display="${!!opts.displayMode}">${tex}</span>`;
    },
  },
};
vm.createContext(context);
vm.runInContext(postsSrc, context);
vm.runInContext(appSrc, context);
vm.runInContext(`
  this.__test = { SITE, POSTS, allTags, sortedPosts, renderMarkdown, renderInline, highlightCode, readingMinutes };
`, context);
const { SITE, POSTS, allTags, sortedPosts, renderMarkdown, renderInline, highlightCode, readingMinutes } = context.__test;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  OK " + name); }
  else { fail++; console.log("  FAIL " + name); }
}

/* 1. 文章数据完整性 */
console.log("\n[1] 文章数据");
check("当前共 " + POSTS.length + " 篇文章（0 表示空模板）", Array.isArray(POSTS));
check("每篇都有 id/title/date/tags/summary/content", POSTS.every(p =>
  p.id && p.title && p.date && Array.isArray(p.tags) && p.tags.length && p.summary && p.content));
check("id 唯一", new Set(POSTS.map(p => p.id)).size === POSTS.length);
check("date 格式 YYYY-MM-DD", POSTS.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.date)));
check("sortedPosts 按日期倒序", (() => {
  const s = sortedPosts();
  return s.every((p, i) => i === 0 || s[i - 1].date >= p.date);
})());
check("allTags 有计数", allTags().every(([, c]) => c >= 1));

/* 2. Markdown 渲染 */
console.log("\n[2] Markdown 渲染器");
const md = `## 标题测试
**加粗** 和 \`code\`
- 列表一
- 列表二

\`\`\`js
const a = 1;
\`\`\`

> 引用内容

| 列A | 列B |
| --- | --- |
| 1 | 2 |

[链接](https://example.com) 结束`;
const html = renderMarkdown(md);
check("标题 -> <h2>", html.includes("<h2>标题测试</h2>"));
check("加粗 -> <strong>", html.includes("<strong>加粗</strong>"));
check("行内代码 -> <code>", html.includes("<code>code</code>"));
check("无序列表 -> <ul><li>", html.includes("<ul>") && html.includes("<li>列表一</li>"));
check("代码块 -> <pre><code>", html.includes("<pre>") && html.includes(">const<") && html.includes(">1<"));
check("代码块语言标注", html.includes("code-lang") && html.includes("js"));
check("引用 -> <blockquote>", html.includes("<blockquote>"));
check("表格 -> <table><th>", html.includes("<table>") && html.includes("<th>列A</th>") && html.includes("<td>1</td>"));
check("链接 -> <a href", html.includes('<a href="https://example.com"'));
check("图片 -> <img src", (() => {
  const imgHtml = renderInline("![测试图片](https://example.com/test.png)");
  return imgHtml.includes('<img src="https://example.com/test.png"') && imgHtml.includes('alt="测试图片"');
})());
check("图片不影响链接", (() => {
  const mixed = renderInline("![img](https://a.com/1.png) 和 [链接](https://b.com)");
  return mixed.includes("<img") && mixed.includes('<a href="https://b.com"');
})());

/* 2.5 语法高亮 */
console.log("\n[2.5] 语法高亮");
const hlHtml = renderMarkdown("```js\nconst a = 'hi'; // 注释\nconsole.log(a);\n```\n\n```py\ndef f(x):  # 注释\n    return x * 2\n```");
check("JS: 关键字高亮", hlHtml.includes('class="tok-keyword"') && hlHtml.includes(">const<"));
check("JS: 字符串高亮", hlHtml.includes("tok-string"));
check("JS: 注释高亮", hlHtml.includes("tok-comment"));
check("JS: 函数名高亮", hlHtml.includes("tok-func") && hlHtml.includes(">log<"));
check("Python: def 关键字高亮", hlHtml.includes(">def<") && hlHtml.includes("tok-keyword"));
check("Python: 注释高亮(#)", hlHtml.includes("tok-comment"));
check("高亮不破坏转义", !/<script/i.test(hlHtml));
check("阅读时长估算", (() => {
  const m1 = readingMinutes("这是一段中文文本。".repeat(300));
  const m2 = readingMinutes("word ".repeat(200));
  return m1 >= 1 && m2 >= 1;
})());

/* 2.6 KaTeX 数学公式 */
console.log("\n[2.6] KaTeX 数学公式");
check("行内公式 $...$", (() => {
  const h = renderInline("方程 $E = mc^2$ 成立");
  return h.includes("katex-stub") && h.includes("E = mc^2") && h.includes("data-display=\"false\"");
})());
check("反斜杠命令完整保留", (() => {
  const h = renderInline("$\\frac{a}{b}$ 与 $\\sqrt{x}$");
  return h.includes("\\frac{a}{b}") && h.includes("\\sqrt{x}");
})());
check("下标上标保留", renderInline("$a_1 + b^2$").includes("a_1 + b^2"));
check("块级公式 $$...$$", (() => {
  const h = renderMarkdown("$$E = mc^2$$");
  return h.includes("math-block") && h.includes('data-display="true"');
})());
check("跨行块级公式", (() => {
  const h = renderMarkdown("前\n\n$$\n\\int_0^1 x dx\n$$\n\n后");
  return h.includes("katex-stub") && h.includes("\\int_0^1 x dx") && h.includes("前") && h.includes("后");
})());
check("\\[...\\] 语法", renderMarkdown("\\[ \\sum_{i=1}^n i \\]").includes('data-display="true"'));
check("公式内 & 不被转义", (() => {
  const h = renderMarkdown("$$\\begin{aligned} a &= b \\end{aligned}$$");
  return h.includes("a &= b") && !h.includes("&amp;");
})());
check("行内代码里的 $ 不渲染", (() => {
  const h = renderInline("代码 `$x$` 原样");
  return !h.includes("katex-stub") && h.includes("<code>$x$</code>");
})());
check("公式外 HTML 仍被转义", (() => {
  const h = renderInline("<script>x</script> $y$");
  return !h.includes("<script>") && h.includes("&lt;script&gt;") && h.includes("katex-stub");
})());
check("孤立美元符号不误伤", !renderInline("价格 $ 100 元").includes("katex-stub"));
check("KaTeX 缺失时降级", (() => {
  // 临时移除 katex，验证降级不抛异常
  const saved = context.katex;
  delete context.katex;
  let ok = false;
  try {
    const h = renderMarkdown("$$\\frac{1}{2}$$");
    ok = h.includes("math-fallback") && h.includes("\\frac{1}{2}");
  } catch (e) { ok = false; }
  context.katex = saved;
  return ok;
})());

/* 3. 所有文章的 content 都能渲染且不残留标记 */
console.log("\n[3] 全部文章渲染");
POSTS.forEach(p => {
  const h = renderMarkdown(p.content);
  const leftover = (h.match(/```/g) || []).length;
  const unescaped = /<script/i.test(h);
  check("《" + p.title + "》渲染成功（残留```=" + leftover + ", 含script标签=" + unescaped + "）", leftover === 0 && !unescaped);
});

/* 4. 转义安全性 */
console.log("\n[4] XSS 转义");
const evil = renderInline('<script>alert(1)</script> & "quoted"');
check("特殊字符已转义", !evil.includes("<script>") && evil.includes("&lt;script&gt;"));

console.log("\n结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);
