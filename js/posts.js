/* ============================================================
   RsfNotes · 文章数据
   新增文章：在 POSTS 数组中添加一个对象即可，无需改其他文件
   content 支持 Markdown 语法：
     # / ## / ### 标题 · **加粗** · `行内代码`
     ```lang 代码块 ``` · - 无序列表 · 1. 有序列表
     > 引用 · [文字](链接) · --- 分割线
   ============================================================ */

const SITE = {
  name: "RsfNotes",
  author: "BH6RSF",
  description: "一名高中生的技术博客，记录编程路上的思考与实践。",
  github: "https://github.com/BH6RSF",
  email: "bh6rsf@gmail.com",
};

/* ---------- 文章模板（复制下面的结构到 POSTS 数组中即可） ----------
{
  id: "my-first-post",                // 唯一 ID，决定链接 post.html?id=my-first-post
  title: "我的第一篇文章",
  date: "2026-02-10",                 // YYYY-MM-DD
  tags: ["随笔", "前端"],
  summary: "列表页显示的一句话摘要",
  content: `
## 正文开始

支持 **加粗**、\`行内代码\`、代码块、列表、引用、表格、链接、分割线
  `,
},
---------------------------------------------------------------- */

const POSTS = [];

/* 工具函数：按日期倒序 */
function sortedPosts() {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* 工具函数：收集所有标签（带计数） */
function allTags() {
  const map = {};
  POSTS.forEach((p) =>
    p.tags.forEach((t) => (map[t] = (map[t] || 0) + 1))
  );
  return Object.entries(map).sort((a, b) => b[1] - a[1]);
}
