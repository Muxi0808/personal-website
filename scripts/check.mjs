#!/usr/bin/env node
/**
 * 站点自检 —— 先构建，再检查产物的完整性。
 *
 *   node scripts/check.mjs
 *
 * 检查项：
 *   1. 所有 HTML 内部链接（href）指向的文件真实存在
 *   2. 所有资源引用（src、link[href]）真实存在
 *   3. 没有残留的渲染占位符 / NaN / undefined
 *   4. feed.xml 是最小的合法 XML，且条目数与文章数一致
 *   5. 每篇文章都有对应的正文内容块
 *
 * 退出码非 0 表示有问题，方便接到 CI 或 pre-push 钩子上。
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const errors = [];
const warnings = [];
let checkedLinks = 0;

/* --- 先构建 ------------------------------------------------------------- */
console.log("▶ 运行构建…");
try {
  const out = execFileSync(process.execPath, [path.join(__dirname, "build.mjs")], {
    encoding: "utf8",
  });
  process.stdout.write(out.replace(/^/gm, "  "));
} catch (e) {
  console.error("✖ 构建失败：");
  console.error(e.stdout || "", e.stderr || e.message);
  process.exit(1);
}

/* --- 收集 HTML ---------------------------------------------------------- */
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

const htmlFiles = walk(ROOT);
console.log(`\n▶ 检查 ${htmlFiles.length} 个 HTML 文件…`);

const isExternal = (u) =>
  /^(https?:|mailto:|tel:|data:|javascript:|#|\/\/)/i.test(u) || u.trim() === "";

for (const file of htmlFiles) {
  const rel = path.relative(ROOT, file);
  const html = fs.readFileSync(file, "utf8");
  const dir = path.dirname(file);

  /* 1 & 2. 链接与资源 */
  const refRe = /(?:href|src)\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = refRe.exec(html))) {
    const raw = m[1];
    if (isExternal(raw)) continue;

    const clean = decodeURIComponent(raw.split("#")[0].split("?")[0]);
    if (!clean) continue;

    checkedLinks++;
    // 以 / 开头的是站点根路径（例如 404.html 里的 /feed.xml），按仓库根解析
    const target = clean.startsWith("/")
      ? path.join(ROOT, clean)
      : path.resolve(dir, clean);
    if (!fs.existsSync(target)) {
      errors.push(`${rel}: 死链 → ${raw}`);
    }
  }

  /* 3. 渲染残留 */
  if (html.includes("\u0000")) errors.push(`${rel}: 残留占位符 \\u0000（行内代码替换未还原）`);
  if (/<p>\s*<\/p>/.test(html)) warnings.push(`${rel}: 存在空段落 <p></p>`);
  if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${rel}: 缺少 <title>`);
  if (/\bundefined\b|\bNaN\b/.test(html.replace(/<script[\s\S]*?<\/script>/g, ""))) {
    warnings.push(`${rel}: 正文里出现 undefined / NaN`);
  }
  if (!/<html[^>]*\slang="/.test(html)) warnings.push(`${rel}: <html> 缺少 lang 属性`);

  /* 5. 文章页必须有正文 */
  if (rel.startsWith("posts" + path.sep)) {
    if (!/<div class="prose">[\s\S]*?<\/(?:p|ul|ol|pre|blockquote|table|h2)>/.test(html)) {
      errors.push(`${rel}: 正文为空或未渲染`);
    }
  }
}

/* --- 4. feed.xml -------------------------------------------------------- */
const feedPath = path.join(ROOT, "feed.xml");
if (!fs.existsSync(feedPath)) {
  errors.push("feed.xml 不存在");
} else {
  const feed = fs.readFileSync(feedPath, "utf8");
  if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(feed)) {
    errors.push("feed.xml: 缺少 XML 声明");
  }
  // 逐标签统计嵌套深度，自闭合与 <?xml ?> 不算
  const tags = feed.match(/<\/?[A-Za-z_][\w:.-]*(?:\s[^>]*)?\/?>/g) || [];
  let depth = 0;
  let depthOk = true;
  for (const t of tags) {
    if (/\/>$/.test(t)) continue;
    depth += /^<\//.test(t) ? -1 : 1;
    if (depth < 0) depthOk = false;
  }
  if (!depthOk || depth !== 0) {
    errors.push(`feed.xml: 标签不配对（最终深度 ${depth}）`);
  }
  const itemCount = (feed.match(/<item>/g) || []).length;
  const postCount = fs.existsSync(path.join(ROOT, "posts"))
    ? fs.readdirSync(path.join(ROOT, "posts")).filter((f) => f.endsWith(".html")).length
    : 0;
  if (itemCount !== postCount) {
    errors.push(`feed.xml: 条目数 ${itemCount} 与文章数 ${postCount} 不一致`);
  } else {
    console.log(`  ✓ feed.xml：${itemCount} 个条目`);
  }
}

/* --- 汇总 --------------------------------------------------------------- */
console.log(`\n▶ 已检查 ${checkedLinks} 个内部链接/资源引用`);

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} 条警告：`);
  warnings.forEach((w) => console.log(`   · ${w}`));
}

if (errors.length) {
  console.log(`\n✖ ${errors.length} 个错误：`);
  errors.forEach((e) => console.log(`   · ${e}`));
  process.exit(1);
}

console.log("\n✅ 自检通过：没有死链，产物完整。");
