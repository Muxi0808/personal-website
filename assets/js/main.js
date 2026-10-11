/* ==========================================================================
   Muxi0808 — 站点交互脚本
   无依赖，约 2KB。所有功能都做了渐进增强：禁用 JS 时页面依然完整可读。
   ========================================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var STORAGE_KEY = "muxi-theme";

  /* --- 主题切换 --------------------------------------------------------- */
  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function applyTheme(theme, persist) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    try {
      if (persist) localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* 隐私模式下 localStorage 可能不可用，忽略即可 */
    }
    syncToggle(theme);
  }

  function syncToggle(theme) {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    var isDark = theme === "dark";
    btn.textContent = isDark ? "☀" : "☾";
    btn.setAttribute(
      "aria-label",
      isDark ? "切换到浅色主题" : "切换到深色主题"
    );
    btn.setAttribute("title", isDark ? "切换到浅色主题" : "切换到深色主题");
  }

  function initTheme() {
    var btn = document.querySelector(".theme-toggle");
    if (!btn) return;

    syncToggle(currentTheme());

    btn.addEventListener("click", function () {
      applyTheme(currentTheme() === "dark" ? "light" : "dark", true);
    });

    // 用户没手动选过时，跟随系统主题变化
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onChange = function (e) {
        var saved = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
        } catch (err) {
          saved = null;
        }
        if (!saved) applyTheme(e.matches ? "dark" : "light", false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* --- 代码块一键复制 ---------------------------------------------------- */
  function initCopyButtons() {
    var blocks = document.querySelectorAll(".prose pre");
    if (!blocks.length || !navigator.clipboard) return;

    Array.prototype.forEach.call(blocks, function (pre) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "复制";

      btn.addEventListener("click", function () {
        var code = pre.querySelector("code");
        var text = code ? code.innerText : pre.innerText;
        navigator.clipboard.writeText(text).then(
          function () {
            btn.textContent = "已复制";
            btn.classList.add("copied");
            setTimeout(function () {
              btn.textContent = "复制";
              btn.classList.remove("copied");
            }, 1600);
          },
          function () {
            btn.textContent = "复制失败";
            setTimeout(function () {
              btn.textContent = "复制";
            }, 1600);
          }
        );
      });

      pre.appendChild(btn);
      pre.classList.add("has-copy");
    });
  }

  /* --- 页脚年份 --------------------------------------------------------- */
  function initYear() {
    var el = document.querySelector("[data-year]");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function init() {
    initTheme();
    initCopyButtons();
    initYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
