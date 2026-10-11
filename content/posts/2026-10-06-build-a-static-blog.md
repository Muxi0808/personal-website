---
title: 用 200 行脚本搭一个不要框架的静态博客
date: 2026-10-06
summary: 不用 Jekyll、不用 Hexo、不装 npm 依赖。一个 Node 脚本把 Markdown 变成纯静态 HTML，托管到 GitHub Pages 就完事。
tags: [Node.js, 静态站点, 工程实践]
---

我想要的博客系统只需要满足三件事：Markdown 写作、纯静态产物、没有依赖。听起来 Jekyll 或 Hexo 都能搞定，但它们各自带进来一整套需要理解的概念——模板语言、插件生态、构建缓存。对一个个人博客来说，这些成本换不回对应的价值。

于是我自己写了一个构建脚本。核心逻辑不到 200 行，零依赖。

## 整体结构

项目目录大致是这样：

```text
.
├── content/posts/*.md      # Markdown 原文，唯一需要手写的地方
├── posts/*.html            # 构建产物：每篇文章一个页面
├── index.html              # 首页，文章列表由脚本注入
├── about.html
├── 404.html
├── feed.xml                # 构建产物：RSS
├── assets/css/style.css
├── assets/js/main.js
└── scripts/build.mjs       # 全部构建逻辑
```

构建流程只有三步，跑 `node scripts/build.mjs` 就全做完：

1. 读 `content/posts/*.md`，解析 front matter，渲染正文
2. 把最新的文章列表写回 `index.html` 的标记块
3. 生成 `feed.xml`

## front matter 用最土的写法

不引 YAML 解析库，因为有依赖就违背了初衷。格式约定得很简单：

```markdown
---
title: 文章标题
date: 2026-10-06
summary: 列表页和 RSS 里显示的摘要。
tags: [Node.js, 静态站点]
---

正文从这里开始。
```

解析就是逐行找第一个冒号切分，`tags` 额外按逗号切开。够用，而且出错时一眼能看出问题——这一点比「支持完整 YAML」重要得多。

## Markdown 渲染的几个取舍

自己写渲染器，最容易失控的地方是「想支持全部 CommonMark」。我给自己划了条线：**只支持我自己会写的语法**。

具体做法是把渲染拆成两层：

- `renderBlocks()` 处理块级：标题、段落、围栏代码、引用、列表、表格、分隔线
- `renderInline()` 处理行内：粗体、斜体、行内代码、链接、图片、删除线

行内这一层有个容易踩的坑：**必须先处理行内代码，再处理其他规则**。否则 `` `a * b` `` 里的星号会被当成斜体标记。我的做法是把代码片段先抽出来换成占位符，等其他规则跑完再替换回去：

```js
function renderInline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let s = escapeHtml(text);
  // 行内代码最先处理，避免内部内容被后续规则改写
  s = s.replace(/`([^`]+)`/g, (_, code) => keep(`<code>${code}</code>`));
  // ……其他规则……
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}
```

用 `\u0000` 作占位符是因为它不可能出现在正常的 Markdown 文本里，不用担心和正文冲突。

## 中文排版的细节

顺手解决了一个中文写作里挺烦的问题：**软换行**。

英文 Markdown 里，段落内换行会被渲染成空格——因为英文单词之间本来就要空格。但中文不需要，如果我在源文件里为了可读性手动折行：

```text
这是一段很长的中文，
我把它折成了两行。
```

按英文规则渲染就会变成「这是一段很长的中文， 我把它折成了两行。」——中间多出一个空格，中英混排时格外明显。

所以判断换行处两侧的字符，都是中日韩字符就拼接，否则补空格：

```js
const CJK_RE = /[\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const needSpace = (a, b) => !(CJK_RE.test(a.slice(-1)) && CJK_RE.test(b.charAt(0)));
```

顺便也支持了行尾两个空格强制换行（`<br>`），需要时可以手动断开。

## 首页为什么用标记块而不是整页生成

`index.html` 是我手写的，只有文章列表那段交给脚本：

```html
<h2 class="section-title">全部文章</h2>

<!-- POSTS:START -->
<!-- POSTS:END -->
```

脚本用正则替换两个标记之间的内容。这样首页的自我介绍、导航、页脚都还能直接改 HTML，不用去动构建脚本，也不用学模板语法。

> 一个原则：构建脚本只负责我懒得手写、且确实会重复的部分。凡是只出现一次的东西，手写比模板更省事。

## 部署

产物是纯静态文件，扔哪都能跑。GitHub Pages 的流程：

1. 推到 GitHub 仓库
2. Settings → Pages → Source 选 `Deploy from a branch`
3. 分支选 `main`，目录选 `/ (root)`
4. 等一分钟，访问 `https://<用户名>.github.io/<仓库名>/`

仓库里那个 `.nojekyll` 空文件是必须的：GitHub Pages 默认会跑一遍 Jekyll，它会忽略掉下划线开头的文件，也会做多余的构建。放一个 `.nojekyll` 就让它老老实实按静态文件直接发布。

## 值不值得自己写

如果你的需求和我一样——写 Markdown、产出静态页、不想维护——那自己写一个确实划算，一晚上能搞定，之后几年都不用管。

但如果需要分类、标签页、分页、搜索、多语言，还是老老实实用现成框架。**自己写的边界感很重要：一旦开始加功能，成本曲线会立刻变得比用框架更陡。**

对我来说，这套东西的价值不在于省了多少事，而在于整个链路上每一行我都清楚它在干什么。出问题时不需要去读别人的源码。
