#!/usr/bin/env node
/**
 * 新建一篇文章 —— 生成带 front matter 的 Markdown 骨架。
 *
 *   node scripts/new-post.mjs hello-world "你好，世界"
 *   node scripts/new-post.mjs hello-world "你好，世界" --tags 随笔,博客
 *
 * 参数：
 *   <slug>    文件名用的英文短名（必填，建议用短横线连接）
 *   [标题]    文章标题，省略时用 slug 代替
 *   --tags    逗号分隔的标签，可选
 *
 * 创建后不会自动构建，确认内容后再跑 `npm run build`。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "posts");

function usage(msg) {
  if (msg) console.error(`✖ ${msg}\n`);
  console.log(`用法：node scripts/new-post.mjs <slug> [标题] [--tags a,b]

示例：
  node scripts/new-post.mjs linux-tips "几个省时间的 Linux 小技巧"
  node scripts/new-post.mjs hello "你好" --tags 随笔,博客`);
  process.exit(msg ? 1 : 0);
}

const argv = process.argv.slice(2);

if (!argv.length || argv.includes("-h") || argv.includes("--help")) usage();

// 解析 --tags
let tags = [];
const tagsIdx = argv.findIndex((a) => a === "--tags");
if (tagsIdx !== -1) {
  const raw = argv[tagsIdx + 1] || "";
  tags = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  argv.splice(tagsIdx, 2);
}

const [slugArg, titleArg] = argv;

if (!slugArg) usage("缺少 slug 参数");

const slug = slugArg
  .trim()
  .toLowerCase()
  .replace(/[^\w\u4e00-\u9fff-]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .replace(/-{2,}/g, "-");

if (!slug) usage("slug 不合法");

const title = (titleArg || slugArg).trim();

const today = new Date();
const pad = (n) => String(n).padStart(2, "0");
const dateStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

const filePath = path.join(CONTENT_DIR, `${dateStr}-${slug}.md`);

if (fs.existsSync(filePath)) {
  console.error(`✖ 文件已存在：${path.relative(ROOT, filePath)}`);
  process.exit(1);
}

const frontMatter = [
  "---",
  `title: ${title}`,
  `date: ${dateStr}`,
  "summary: 一句话摘要，会显示在首页列表和 RSS 里。",
  tags.length ? `tags: [${tags.join(", ")}]` : "tags: []",
  "---",
  "",
].join("\n");

const body = `开头先写清楚这篇要解决什么问题。

## 正文

在这里展开。支持标题、**粗体**、*斜体*、\`行内代码\`、列表、引用、表格和围栏代码块。

\`\`\`bash
# 代码块记得标注语言
echo "hello"
\`\`\`

## 小结

留一句可执行的结论。
`;

fs.mkdirSync(CONTENT_DIR, { recursive: true });
fs.writeFileSync(filePath, frontMatter + body, "utf8");

console.log(`✅ 已创建：${path.relative(ROOT, filePath)}`);
console.log("\n下一步：");
console.log("   1. 编辑上面的 Markdown 文件");
console.log("   2. npm run build    # 渲染成静态 HTML");
console.log("   3. npm run serve    # 本地预览");
