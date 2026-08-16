# RsfNotes · 个人技术博客

纯静态的个人技术博客，零构建、零依赖，打开浏览器即可运行。

## 特性

- 🚀 纯静态 HTML/CSS/JS，无需构建工具与服务器
- 📝 文章用 Markdown 写在 `js/posts.js` 中，JS 动态渲染
- 🌙 暗色 / 亮色主题一键切换（记忆选择，跟随系统偏好）
- 🏷️ 标签云 + 标签过滤 + 文章分页
- 📖 上一篇 / 下一篇导航
- 💬 giscus 评论（基于 GitHub Discussions，可配置）
- 📱 响应式布局，手机 / 平板 / 桌面均适配

## 目录结构

```
blog/
├── index.html          # 首页（文章列表 + 侧边栏）
├── post.html           # 文章详情页（?id=xxx）
├── about.html          # 关于我
├── friends.html        # 友情链接
├── css/
│   └── style.css       # 全部样式（主题变量驱动）
├── js/
│   ├── posts.js        # ★ 文章数据（写作只改这里）
│   └── app.js          # 渲染逻辑 + Markdown 渲染器 + 评论
└── README.md
```

## 快速开始

### 本地预览

直接双击 `index.html` 即可在浏览器中打开；或启动任意静态服务器：

```bash
# Python
python -m http.server 8080

# Node.js
npx serve .
```

然后访问 `http://localhost:8080`。

### 发布新文章

打开 `js/posts.js`，在 `POSTS` 数组**开头**添加一个对象：

```js
{
  id: "my-new-post",                 // 唯一 ID，决定链接 post.html?id=my-new-post
  title: "文章标题",
  date: "2026-02-10",                // YYYY-MM-DD
  tags: ["JavaScript", "随笔"],
  summary: "列表页显示的一句话摘要",
  content: `
## 正文开始（支持 Markdown）

支持：**加粗**、\`行内代码\`、代码块、列表、引用、表格、链接、分割线
  `,
},
```

保存后刷新页面即可生效。

## 部署

### GitHub Pages（推荐，免费）

1. 创建仓库并推送代码：
   ```bash
   git init
   git add .
   git commit -m "init blog"
   git remote add origin https://github.com/<你的用户名>/<你的用户名>.github.io.git
   git push -u origin main
   ```
2. 仓库设置 → Pages → Source 选择 `main` 分支的根目录。
3. 访问 `https://<你的用户名>.github.io`。

### 其他平台

- **Vercel / Netlify**：导入仓库，构建命令留空，输出目录为根目录即可。
- **任意服务器**：把整个 `blog/` 目录放到 Nginx / 静态目录下。

## 个性化配置

| 配置项 | 位置 | 说明 |
| ------ | ---- | ---- |
| 站点名称 / 作者 | `js/posts.js` 顶部 `SITE` | 博客名、作者名、简介、联系方式 |
| 主题颜色 | `css/style.css` 顶部 `:root` | 修改 CSS 变量即可换色 |
| 头像 / 技术栈 / 经历 | `about.html` | 直接编辑 HTML |
| 友链列表 | `friends.html` | 复制 `<a class="friend-card">` 结构新增 |
| giscus 评论 | `js/app.js` 顶部 `GISCUS` | 见下方说明 |

### 启用评论（giscus）

1. 在 GitHub 仓库开启 **Discussions** 功能。
2. 安装 [giscus app](https://github.com/apps/giscus)。
3. 打开 <https://giscus.app>，选择仓库并生成配置。
4. 将生成的 `repo / repoId / category / categoryId` 填入 `js/app.js` 顶部的 `GISCUS` 常量。
5. 刷新文章页即可看到评论框。

> 未配置时文章页会显示配置提示，不影响其他功能。

## 技术说明

- **Markdown 渲染**：`js/app.js` 内置轻量渲染器（标题 / 代码块 / 行内代码 / 粗斜体 / 列表 / 引用 / 表格 / 链接 / 分割线），所有内容先转义再渲染，避免 XSS。
- **暗色模式**：`data-theme` 属性 + CSS 变量，选择持久化到 localStorage。
- **无需后端**：全部数据在 `posts.js`，天然支持任意静态托管。

## 测试

修改渲染逻辑后，可运行内置验证脚本（需 Node.js）：

```bash
node test-render.js
```

覆盖：文章数据完整性、Markdown 渲染、全部文章渲染、XSS 转义安全。
