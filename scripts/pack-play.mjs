#!/usr/bin/env node
/**
 * Bundle the game into a single HTML file that can be opened with a
 * double-click (file://). Chrome blocks ES modules on file://, so the
 * JS is an IIFE inside a classic <script> tag.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist-play");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`));
    });
  });
}

function escapeScript(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

const htmlShell = (css, js) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="theme-color" content="#070b12" />
  <title>Hockey Fast Break</title>
  <link rel="icon" href="./favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
  <style>
html,body,#app{height:100%;margin:0}
${css}
.lab-versions{position:fixed;top:max(8px,env(safe-area-inset-top,0px));right:max(10px,env(safe-area-inset-right,0px));z-index:40;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;align-items:center;max-width:calc(100% - 20px);margin:0;font-family:"IBM Plex Sans","Segoe UI",sans-serif;font-size:0.72rem;color:#8b97a4;pointer-events:auto}
.lab-versions-list{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;align-items:center}
.lab-versions-list[hidden]{display:none}
.lab-versions button,.lab-versions a,.lab-versions [aria-current="page"]{color:#e8ece6;text-decoration:none;border:1px solid #243040;background:#10161f;border-radius:6px;padding:4px 8px;min-height:32px;display:inline-flex;align-items:center;font:inherit;line-height:1.2;margin:0;box-sizing:border-box;cursor:pointer;appearance:none;-webkit-appearance:none}
.lab-versions button:hover,.lab-versions a:hover,.lab-versions button[aria-expanded="true"],.lab-versions [aria-current="page"]{border-color:#7eb8d4;color:#7eb8d4}
.lab-versions [aria-current="page"]{cursor:default}
.hud .lab-versions{display:none!important}
.hud{padding-top:max(48px,calc(42px + env(safe-area-inset-top,0px)))!important}
  </style>
</head>
<body>
  <nav class="lab-versions" id="lab-versions" aria-label="Version archive">
    <button type="button" id="lab-archive" aria-expanded="false" aria-controls="lab-version-list">Archive</button>
    <div class="lab-versions-list" id="lab-version-list" hidden>
      <a href="archive/v0/index.html">v0</a>
      <a href="archive/v1/index.html">v1</a>
      <a href="archive/v2/index.html">v2</a>
      <a href="archive/v3/index.html">v3</a>
      <span aria-current="page">v4</span>
    </div>
  </nav>
  <div id="app"></div>
  <script>
${escapeScript(js)}
  </script>
  <script>
    (function () {
      var nav = document.getElementById("lab-versions");
      var btn = document.getElementById("lab-archive");
      var list = document.getElementById("lab-version-list");
      var app = document.getElementById("app");
      if (!nav || !btn || !list || !app) return;
      var sawResume = false;

      function isOpen() {
        return btn.getAttribute("aria-expanded") === "true";
      }

      function setOpen(open) {
        list.hidden = !open;
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (!open) sawResume = false;
      }

      function syncResume() {
        if (!isOpen()) {
          sawResume = false;
          return;
        }
        if (app.querySelector('[aria-label="Resume"]')) {
          sawResume = true;
          return;
        }
        if (sawResume) setOpen(false);
      }

      btn.addEventListener("click", function () {
        if (isOpen()) {
          setOpen(false);
          return;
        }
        var api = window.__hfb;
        if (api && typeof api.pause === "function") api.pause();
        setOpen(true);
        syncResume();
      });

      document.addEventListener(
        "pointerdown",
        function (e) {
          if (!isOpen()) return;
          var t = e.target;
          if (t && t.nodeType && nav.contains(t)) return;
          setOpen(false);
        },
        true,
      );

      new MutationObserver(syncResume).observe(app, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["aria-label"],
      });
    })();
  </script>
</body>
</html>
`;

await run(process.execPath, [
  join(root, "node_modules/vite/bin/vite.js"),
  "build",
  "--config",
  "vite.play.config.ts",
]);

const files = readdirSync(dist);
const jsName = files.find((f) => f.endsWith(".js"));
const cssName = files.find((f) => f.endsWith(".css"));
if (!jsName) throw new Error("pack-play: no JS bundle in dist-play");

const js = readFileSync(join(dist, jsName), "utf8");
const css = cssName ? readFileSync(join(dist, cssName), "utf8") : "";
// Vite minify rewrites U+0000-00FF to U+??, which drops Latin glyphs.
const cssFixed = css.replaceAll("unicode-range:U+??", "unicode-range:U+0000-00FF");
const html = htmlShell(cssFixed, js);

const outHtml = join(root, "docs", "index.html");
writeFileSync(outHtml, html);

console.log(
  `packed ${outHtml} (${Buffer.byteLength(html)} bytes, js ${js.length}, css ${css.length})`,
);
