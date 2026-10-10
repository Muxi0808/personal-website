#!/usr/bin/env node
/**
 * 极简静态博客构建脚本 —— 零依赖，只用 Node 内置模块。
 *
 *   node scripts/build.mjs
 *
 * 做三件事：
 *   1. 读取 content/posts/*.md（带 front matter），渲染成 posts/<slug>.html
 *   2. 用最新文章列表替换 index.html 里 <!-- POSTS:START --> … <!-- POSTS:END --> 之间的内容
 *   3. 生成 feed.xml（RSS 2.0）
 *
 * 设计取舍：产物是纯静态 HTML，所以部署后不依赖任何运行时 JS/CSS 框架，
 * 离线打开、被搜索引擎抓取、被 RSS 阅读器订阅都没问题。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "posts");
const POSTS_DIR = path.join(ROOT, "posts");
const INDEX_FILE = path.join(ROOT, "index.html");
const FEED_FILE = path.join(ROOT, "feed.xml");

/** 站点配置：部署到 GitHub Pages 后，把 siteUrl 改成你的真实地址 */
const SITE = {
  name: "Muxi0808",
  title: "Muxi0808 的博客",
  description: "记录开发、阅读与折腾的极简博客。",
  siteUrl: "https://muxi0808.github.io",
  author: "Muxi0808",
  lang: "zh-CN",
};

const POSTS_START = "<!-- POSTS:START -->";
const POSTS_END = "<!-- POSTS:END -->";

/* ==========================================================================
   1. 工具函数
   ========================================================================== */

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 属性值转义（双引号包裹的属性） */
const attr = (s) => escapeHtml(s).replace(/"/g, "&quot;");

/** URL 属性转义：HTML 实体之外再把裸引号转成百分号编码 */
const urlAttr = (s) => escapeHtml(String(s).trim()).replace(/"/g, "%22");

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const CJK_RE =
  /[\u2e80-\u303f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const isCJK = (ch) => !!ch && CJK_RE.test(ch);

/** 中英混排时，软换行在中文之间不该插入空格 */
const needSpace = (a, b) => !(isCJK(a.slice(-1)) && isCJK(b.charAt(0)));

/** YYYY-MM-DD → { iso, text, cn } */
function parseDate(raw, fallback) {
  const m = String(raw || "").match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/
  );
  if (!m) return parseDate(fallback, "1970-01-01");
  const [, y, mo, d, hh = "00", mm = "00"] = m;
  const iso = `${y}-${mo}-${d}T${hh}:${mm}:00+08:00`;
  return { iso, text: `${y}-${mo}-${d}`, cn: `${y} 年 ${+mo} 月 ${+d} 日` };
}

/** 中文按 400 字/分钟、英文按 200 词/分钟估阅读时长 */
function readingTime(markdown) {
  const text = markdown.replace(/```[\s\S]*?```/g, " ").replace(/[#*`>\[\]()!-]/g, " ");
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, " ").match(/[A-Za-z0-9']+/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 400 + words / 200));
  return `${minutes} 分钟阅读`;
}

/* ==========================================================================
   2. Markdown 渲染器（够用就好，不追求 100% CommonMark）
   支持：标题 / 段落 / 软换行 / 硬换行 / 粗体 / 斜体 / 删除线 / 行内代码 /
        围栏代码块 / 引用 / 有序与无序列表（可嵌套）/ 分隔线 / 链接 / 图片 /
        自动链接 / 管道表格
   ========================================================================== */

function renderInline(text) {
  const stash = [];
  const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;

  let s = escapeHtml(text);

  // 行内代码最先处理，避免内部内容被后续规则改写。
  // 支持 N 个反引号包裹，这样 `` `code` `` 才能正确显示字面反引号。
  s = s.replace(/(`+)([\s\S]*?)\1(?!`)/g, (_, _ticks, raw) => {
    let code = raw;
    // CommonMark 规则：内容首尾各有一个空格且内容不全为空格时，各去掉一个
    if (code.length > 2 && code.startsWith(" ") && code.endsWith(" ") && code.trim() !== "") {
      code = code.slice(1, -1);
    }
    return keep(`<code>${code}</code>`);
  });

  // 图片 ![alt](src "title")
  s = s.replace(
    /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
    (_, alt, src, title) =>
      keep(
        `<img src="${urlAttr(src)}" alt="${attr(alt)}"` +
          (title ? ` title="${attr(title)}"` : "") +
          ` loading="lazy">`
      )
  );

  // 链接 [text](url "title")
  s = s.replace(
    /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
    (_, label, href, title) =>
      keep(
        `<a href="${urlAttr(href)}"` + (title ? ` title="${attr(title)}"` : "") + `>${label}</a>`
      )
  );

  // 自动链接 <https://example.com>
  s = s.replace(
    /&lt;(https?:\/\/[^\s&]+)&gt;/g,
    (_, url) => keep(`<a href="${urlAttr(url)}" rel="noopener">${escapeHtml(url)}</a>`)
  );

  // 粗体 / 斜体 / 删除线
  s = s.replace(/\*\*([^\s*][\s\S]*?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(?<![*\w])__(?!\s)([^_]+?)(?<!\s)__(?![\w_])/g, "<strong>$1</strong>");
  s = s.replace(/(?<!\*)\*(?!\s)([^*]+?)(?<!\s)\*(?!\*)/g, "<em>$1</em>");
  s = s.replace(/(?<![\w_])_(?!\s)([^_]+?)(?<!\s)_(?![\w_])/g, "<em>$1</em>");
  s = s.replace(/~~(?!\s)([^~]+?)(?<!\s)~~/g, "<del>$1</del>");

  // 还原受保护片段
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[Number(i)]);
}

const isBlank = (l) => /^\s*$/.test(l);
const indentOf = (l) => (l.match(/^[ \t]*/) || [""])[0].replace(/\t/g, "    ").length;

const isFence = (l) => /^\s*(```|~~~)/.test(l);
const isHeading = (l) => /^#{1,6}\s+/.test(l);
const isHr = (l) => /^\s*([-*_])\s*(?:\1\s*){2,}$/.test(l);
const isQuote = (l) => /^\s*>/.test(l);
const isListItem = (l) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(l);

/** 表格分隔行，如 | --- | :--: | */
const isTableSep = (l) =>
  /\|/.test(l) && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(l) && l.includes("-");

function renderBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let out = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i++;
      continue;
    }

    // --- 围栏代码块 ---
    const fenceMatch = line.match(/^\s*(```|~~~)\s*([\w+#.-]*)\s*$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const lang = fenceMatch[2];
      const body = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${marker}`).test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      const cls = lang ? ` class="language-${attr(lang)}"` : "";
      out += `<pre><code${cls}>${escapeHtml(body.join("\n"))}</code></pre>\n`;
      continue;
    }

    // --- 标题 ---
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const level = h[1].length;
      out += `<h${level}>${renderInline(h[2])}</h${level}>\n`;
      i++;
      continue;
    }

    // --- 分隔线 ---
    if (isHr(line)) {
      out += "<hr>\n";
      i++;
      continue;
    }

    // --- 引用块（可嵌套，递归渲染）---
    if (isQuote(line)) {
      const body = [];
      while (i < lines.length && (isQuote(lines[i]) || (!isBlank(lines[i]) && body.length))) {
        body.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out += `<blockquote>\n${renderBlocks(body.join("\n"))}</blockquote>\n`;
      continue;
    }

    // --- 表格 ---
    if (line.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const splitRow = (row) =>
        row
          .replace(/^\s*\|/, "")
          .replace(/\|\s*$/, "")
          .split("|")
          .map((c) => c.trim());

      const head = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => {
        const left = c.startsWith(":");
        const right = c.endsWith(":");
        if (left && right) return "center";
        if (right) return "right";
        if (left) return "left";
        return "";
      });

      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes("|") && !isBlank(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }

      const th = head
        .map(
          (c, idx) =>
            `<th${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ""}>${renderInline(c)}</th>`
        )
        .join("");
      const tb = rows
        .map(
          (r) =>
            "<tr>" +
            head
              .map(
                (_, idx) =>
                  `<td${aligns[idx] ? ` style="text-align:${aligns[idx]}"` : ""}>${renderInline(
                    r[idx] || ""
                  )}</td>`
              )
              .join("") +
            "</tr>"
        )
        .join("\n");

      out += `<table>\n<thead>\n<tr>${th}</tr>\n</thead>\n<tbody>\n${tb}\n</tbody>\n</table>\n`;
      continue;
    }

    // --- 列表 ---
    if (isListItem(line)) {
      const parsed = collectList(lines, i);
      out += renderList(parsed);
      i = parsed.next;
      continue;
    }

    // --- 段落 ---
    const para = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !isFence(lines[i]) &&
      !isHeading(lines[i]) &&
      !isHr(lines[i]) &&
      !isQuote(lines[i]) &&
      !isListItem(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1]))
    ) {
      para.push(lines[i]);
      i++;
    }
    out += `<p>${renderParagraph(para)}</p>\n`;
  }

  return out;
}

/** 段落内的软换行 / 硬换行（行尾两个空格）处理 */
function renderParagraph(lines) {
  let out = "";
  let buf = "";
  let prev = "";

  const flush = () => {
    if (buf) {
      out += renderInline(buf);
      buf = "";
      prev = "";
    }
  };

  for (const raw of lines) {
    const hardBreak = /\s{2,}$/.test(raw);
    const text = raw.replace(/\s+$/, "");
    if (buf === "") {
      buf = text;
    } else {
      buf += (needSpace(prev, text) ? " " : "") + text;
    }
    prev = text;
    if (hardBreak) {
      out += renderInline(buf) + "<br>\n";
      buf = "";
      prev = "";
    }
  }
  flush();
  return out;
}

/**
 * 收集一个列表的全部条目。支持嵌套：缩进更深的行会作为上一条目的续表，
 * 交给 renderBlocks 递归处理时自然会变成子列表。
 */
function collectList(lines, start) {
  const baseIndent = indentOf(lines[start]);
  const ordered = /^\s*\d+[.)]\s+/.test(lines[start]);
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      // 空行后若仍是本列表的内容，则视为「松散列表」继续
      let j = i;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j < lines.length) {
        const nextIndent = indentOf(lines[j]);
        const stillOurs =
          nextIndent > baseIndent ||
          (nextIndent === baseIndent && isListItem(lines[j]));
        if (stillOurs && items.length) {
          items[items.length - 1].push("");
          i++;
          continue;
        }
      }
      break;
    }

    const m = line.match(/^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/);
    const ind = indentOf(line);

    if (m && ind === baseIndent) {
      items.push([m[2]]);
      i++;
      continue;
    }

    if (ind > baseIndent && items.length) {
      // 续表 / 子列表：按父级缩进量去缩进
      items[items.length - 1].push(line.slice(Math.min(ind, baseIndent + 2)));
      i++;
      continue;
    }

    break;
  }

  return { ordered, items, next: i };
}

function renderList({ ordered, items }) {
  const tag = ordered ? "ol" : "ul";
  const body = items
    .map((itemLines) => {
      const tight = !itemLines.some(isBlank);
      let html = renderBlocks(itemLines.join("\n")).trim();
      // 紧凑列表不包 <p>
      if (tight) html = html.replace(/^<p>([\s\S]*?)<\/p>(?![\s\S]*<)/, "$1");
      return `<li>${html}</li>`;
    })
    .join("\n");
  return `<${tag}>\n${body}\n</${tag}>\n`;
}

/* ==========================================================================
   3. Front matter
   ========================================================================== */

function parseFrontMatter(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!m) return { data: {}, body: text };

  const data = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    } else if (key === "tags" || key === "categories") {
      data[key] = value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    } else {
      data[key] = value;
    }
  }
  return { data, body: text.slice(m[0].length) };
}

/* ==========================================================================
   4. 页面模板
   ========================================================================== */

function layout({ title, description, base, main, active = "", ogType = "website", dateIso = "" }) {
  const fullTitle =
    active === "home" ? `${SITE.title} · ${SITE.name}` : `${title} · ${SITE.title}`;

  const navLink = (href, label, key) =>
    `<a href="${base}${href}"${active === key ? ' aria-current="page"' : ""}>${label}</a>`;

  return `<!DOCTYPE html>
<html lang="${SITE.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(fullTitle)}</title>
<meta name="description" content="${attr(description)}">
<meta name="author" content="${attr(SITE.author)}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${attr(fullTitle)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:site_name" content="${attr(SITE.title)}">
${dateIso ? `<meta property="article:published_time" content="${attr(dateIso)}">\n` : ""}<link rel="stylesheet" href="${base}assets/css/style.css">
<link rel="icon" href="${base}favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${attr(SITE.title)}" href="${base}feed.xml">
<script>
/* 在样式生效前定好主题，避免深色模式刷新时白屏闪烁 */
(function () {
  try {
    var saved = localStorage.getItem("muxi-theme");
    var dark = saved
      ? saved === "dark"
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.setAttribute("data-theme", "dark");
  } catch (e) {}
})();
</script>
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="${base}index.html"><span class="brand-mark">M</span><span>${SITE.name}</span></a>
    <nav class="site-nav" aria-label="主导航">
      ${navLink("index.html", "首页", "home")}
      ${navLink("about.html", "关于", "about")}
      <a href="${base}feed.xml">RSS</a>
      <button class="theme-toggle" type="button" aria-label="切换主题">☾</button>
    </nav>
  </div>
</header>
<main id="main">
${main}</main>
<footer class="site-footer">
  <div class="wrap">
    <span>© <span data-year>${new Date().getFullYear()}</span> ${SITE.name}</span>
    <span>用 Markdown 写作 · 静态托管于 GitHub Pages</span>
  </div>
</footer>
<script src="${base}assets/js/main.js"></script>
</body>
</html>
`;
}

/* ==========================================================================
   5. 读取文章
   ========================================================================== */

function loadPosts() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn(`⚠️  未找到内容目录：${path.relative(ROOT, CONTENT_DIR)}`);
    return [];
  }

  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md") || f.endsWith(".markdown"));

  const posts = [];

  for (const file of files) {
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const { data, body } = parseFrontMatter(raw);

    if (String(data.draft) === "true") continue;

    // slug：去掉文件名前面的日期前缀
    const slug = file
      .replace(/\.(md|markdown)$/, "")
      .replace(/^\d{4}-\d{2}-\d{2}[-_]/, "");

    const filenameDate = (file.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1];
    const date = parseDate(data.date || filenameDate, "1970-01-01");

    // 摘要：显式声明优先，否则取正文第一段
    let summary = data.summary || "";
    if (!summary) {
      const firstPara = body
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .find((p) => p && !p.startsWith("#") && !p.startsWith("```"));
      summary = (firstPara || "").replace(/[#*`>\[\]]/g, "").slice(0, 90);
    }

    const title = data.title || slug;

    posts.push({
      slug,
      file,
      title,
      date,
      summary,
      tags: Array.isArray(data.tags) ? data.tags : [],
      html: renderBlocks(body),
      markdown: body,
    });
  }

  // 按日期倒序，同日按标题稳定排序
  posts.sort((a, b) => (a.date.text === b.date.text
    ? a.slug.localeCompare(b.slug)
    : b.date.text.localeCompare(a.date.text)));

  return posts;
}

/* ==========================================================================
   6. 生成产物
   ========================================================================== */

function buildPostPages(posts) {
  fs.mkdirSync(POSTS_DIR, { recursive: true });

  posts.forEach((post, idx) => {
    const newer = posts[idx - 1];
    const older = posts[idx + 1];

    const navBits = [];
    if (newer) navBits.push(`<a href="${newer.slug}.html">← ${escapeHtml(newer.title)}</a>`);
    if (older) navBits.push(`<a href="${older.slug}.html">${escapeHtml(older.title)} →</a>`);

    const tags = post.tags.length
      ? `<div class="tags">${post.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
      : "";

    const main = `  <div class="wrap">
    <article>
      <header class="post-header">
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-meta">
          <time datetime="${post.date.iso}">${post.date.cn}</time>
          <span class="dot"></span>
          <span>${readingTime(post.markdown)}</span>
        </div>
        ${tags}
      </header>
      <div class="prose">
${post.html}      </div>
    </article>
    <div class="post-footer">
      <a href="../index.html">← 返回首页</a>
      <span>${navBits.join(" · ")}</span>
    </div>
  </div>
`;

    const page = layout({
      title: post.title,
      description: post.summary || SITE.description,
      base: "../",
      main,
      active: "",
      ogType: "article",
      dateIso: post.date.iso,
    });

    fs.writeFileSync(path.join(POSTS_DIR, `${post.slug}.html`), page, "utf8");
  });
}

function buildPostList(posts) {
  if (!posts.length) {
    return `<div class="empty-state">还没有文章。在 <code>content/posts/</code> 里新建一个 <code>.md</code>，然后运行 <code>node scripts/build.mjs</code>。</div>`;
  }

  const items = posts
    .map(
      (p) => `  <li>
    <time datetime="${p.date.iso}">${p.date.text}</time>
    <a class="post-link" href="posts/${p.slug}.html">${escapeHtml(p.title)}</a>
    ${p.summary ? `<p class="post-summary">${escapeHtml(p.summary)}</p>` : ""}
    ${
      p.tags.length
        ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>`
        : ""
    }
  </li>`
    )
    .join("\n");

  return `<ul class="post-list">\n${items}\n</ul>`;
}

function updateIndex(posts) {
  if (!fs.existsSync(INDEX_FILE)) {
    console.warn("⚠️  未找到 index.html，跳过列表更新");
    return;
  }
  const html = fs.readFileSync(INDEX_FILE, "utf8");
  const re = new RegExp(
    `${escapeRegExp(POSTS_START)}[\\s\\S]*?${escapeRegExp(POSTS_END)}`
  );

  if (!re.test(html)) {
    console.warn(
      `⚠️  index.html 里找不到 ${POSTS_START} / ${POSTS_END} 标记，文章列表未更新`
    );
    return;
  }

  const next = html.replace(re, `${POSTS_START}\n${buildPostList(posts)}\n${POSTS_END}`);
  fs.writeFileSync(INDEX_FILE, next, "utf8");
}

function buildFeed(posts) {
  const base = SITE.siteUrl.replace(/\/$/, "");
  const items = posts
    .slice(0, 20)
    .map(
      (p) => `    <item>
      <title>${escapeHtml(p.title)}</title>
      <link>${base}/posts/${p.slug}.html</link>
      <guid isPermaLink="true">${base}/posts/${p.slug}.html</guid>
      <pubDate>${new Date(p.date.iso).toUTCString()}</pubDate>
      <description>${escapeHtml(p.summary)}</description>
    </item>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(SITE.title)}</title>
    <link>${base}</link>
    <description>${escapeHtml(SITE.description)}</description>
    <language>${SITE.lang}</language>
    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  fs.writeFileSync(FEED_FILE, xml, "utf8");
}

/* ==========================================================================
   7. 主流程
   ========================================================================== */

function main() {
  const started = Date.now();
  const posts = loadPosts();

  buildPostPages(posts);
  updateIndex(posts);
  buildFeed(posts);

  const ms = Date.now() - started;
  console.log(`✅ 构建完成：${posts.length} 篇文章，耗时 ${ms}ms`);
  posts.forEach((p) => console.log(`   · ${p.date.text}  ${p.title}  →  posts/${p.slug}.html`));
}

main();
