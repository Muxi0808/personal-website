# 个人静态博客

用 Markdown 写作、零依赖构建、托管在 GitHub Pages 的极简博客。没有框架、没有数据库、没有 `npm install`——克隆下来就能写。

![首页预览](docs/screenshot.png)

## 特点

- **零运行时依赖** —— 站点只用原生 HTML / CSS / JS，不请求任何 CDN，断网也能完整打开
- **零构建依赖** —— 构建脚本只用 Node 内置模块，不需要安装任何包
- **纯静态产物** —— 部署后是普通 HTML 文件，快、稳、几乎不用维护
- **自带自检** —— 一条命令检查死链、渲染残留和 RSS 完整性
- **深浅色主题** —— 跟随系统，也可手动切换并记住选择
- **响应式 + 无障碍** —— 移动端适配，支持键盘导航、跳转正文、`prefers-reduced-motion`
- **顺手的中文排版** —— 段落内软换行在中文之间不会多出空格

## 目录结构

```text
.
├── content/posts/          # ✍️  Markdown 原文，唯一需要手写的内容
├── posts/                  # 📦 构建产物：每篇文章一个 HTML
├── index.html              # 首页，文章列表由脚本注入
├── about.html              # 关于页
├── 404.html                # 404 页（自包含样式，任意路径都能正常显示）
├── feed.xml                # 📦 构建产物：RSS 订阅
├── assets/
│   ├── css/style.css       # 样式表，深浅色主题变量都在这里
│   ├── js/main.js          # 主题切换 + 代码块复制
│   └── img/                # 文章配图
├── scripts/
│   ├── build.mjs           # 构建：Markdown → HTML + 更新首页 + 生成 RSS
│   ├── check.mjs           # 自检：死链、渲染残留、RSS 完整性
│   ├── new-post.mjs        # 新建文章骨架
│   └── serve.mjs           # 本地预览服务器
├── .nojekyll               # 告诉 GitHub Pages 不要跑 Jekyll
└── package.json            # 只用来放几条 npm script，没有依赖
```

## 快速开始

需要 Node 18 以上（只用内置模块，不需要 `npm install`）。

```bash
git clone https://github.com/Muxi0808/personal-website.git
cd personal-website

npm run serve        # 启动本地预览：http://localhost:8000/
```

## 写作流程

```bash
# 1. 新建一篇文章（会自动带上当天的日期前缀和 front matter）
npm run new -- my-first-post "文章标题" --tags 随笔,技术

# 2. 编辑 content/posts/2026-10-10-my-first-post.md

# 3. 构建，生成 posts/my-first-post.html 并刷新首页列表和 feed.xml
npm run build

# 4. 本地预览
npm run serve
```

### front matter

```markdown
---
title: 文章标题
date: 2026-10-10
summary: 一句话摘要，显示在首页列表和 RSS 里；省略时自动取正文第一段。
tags: [随笔, 技术]
draft: false
---

正文从这里开始。
```

把 `draft` 设为 `true` 可以暂时不发布这篇文章——构建时会跳过它。

## 部署到 GitHub Pages

产物是纯静态文件，`posts/*.html` 和 `feed.xml` 都已经提交进仓库，所以不需要任何 CI：

1. 把仓库推到 GitHub
2. 打开 **Settings → Pages**
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，目录选 `/ (root)`，保存
5. 等一分钟，访问 `https://<用户名>.github.io/<仓库名>/`

仓库根目录的 `.nojekyll` 是必需的：否则 GitHub Pages 会先跑一遍 Jekyll，忽略掉下划线开头的文件并做多余的构建。

> 如果仓库名是 `<用户名>.github.io`，站点会直接部署在域名根路径，不用改任何配置。
>
> 如果部署在**项目页**（`https://<用户名>.github.io/<仓库名>/`），记得把 `404.html` 顶部的 `window.SITE_BASE` 改成 `"/<仓库名>/"`——404 页面会被任意深度的路径命中，只有绝对路径才能保证样式和链接正确。

## 自定义

| 想改什么 | 改哪里 |
| --- | --- |
| 站点名、标题、描述、RSS 地址 | `scripts/build.mjs` 顶部的 `SITE` 对象 |
| 配色、字体、间距 | `assets/css/style.css` 顶部的 CSS 变量 |
| 首页自我介绍 | `index.html` 里的 `.intro` 区块 |
| 关于页内容 | `about.html` |
| 导航链接 / 页脚 | 各页面里的 `.site-nav` 和 `.site-footer` |

改完记得跑一次 `npm run build`，让文章列表和 RSS 重新生成。

## 自检

```bash
npm run check
```

会先构建，然后检查：

- 所有 `href` / `src` 指向的文件真实存在（相对路径和站点根路径都检查）
- 没有残留的渲染占位符、空段落、缺失的 `<title>`
- 每篇文章都有实际渲染出的正文
- `feed.xml` 标签配对，且条目数与文章数一致

有任何错误会以非 0 退出码结束，可以直接挂到 CI 或 pre-push 钩子上。

## 渲染器支持范围

只支持日常写作会用到的语法，不追求完整的 CommonMark：

**支持**：标题、段落、软换行与硬换行（行尾两个空格）、粗体、斜体、删除线、行内代码（含 N 个反引号包裹）、围栏代码块、引用、有序与无序列表（可嵌套）、分隔线、链接、图片、自动链接、管道表格。

**不支持**：原始 HTML（会被转义，这是有意的安全设计）、脚注、任务列表、数学公式、Setext 标题。

## 许可

[MIT](LICENSE)
