#!/usr/bin/env node
/**
 * 本地预览服务器 —— 零依赖，只为预览静态产物。
 *
 *   node scripts/serve.mjs [端口]
 *
 * 直接双击 index.html 也能看，但用 http:// 预览更接近线上环境
 * （相对路径、404 页面、RSS 的行为都一致）。
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2]) || 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let filePath = path.join(ROOT, urlPath);

  // 防目录穿越：解析后的路径必须仍在仓库内
  if (!path.resolve(filePath).startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403 禁止访问");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    const notFound = path.join(ROOT, "404.html");
    const body = fs.existsSync(notFound)
      ? fs.readFileSync(notFound)
      : Buffer.from("404 Not Found");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(body);
    console.log(`404  ${urlPath}`);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(filePath).pipe(res);
  console.log(`200  ${urlPath}`);
});

server.listen(PORT, () => {
  console.log(`▶ 预览已启动：http://localhost:${PORT}/`);
  console.log(`  根目录：${ROOT}`);
  console.log("  按 Ctrl+C 停止");
});
