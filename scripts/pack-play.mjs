#!/usr/bin/env node
/**
 * Bundle the game into a single HTML file that can be opened with a
 * double-click (file://). Chrome blocks ES modules on file://, so the
 * JS is an IIFE inside a classic <script> tag.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
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
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
  <style>
html,body,#app{height:100%;margin:0}
${css}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
${escapeScript(js)}
  </script>
</body>
</html>
`;

await run(join(root, "node_modules/.bin/vite"), [
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
const html = htmlShell(css, js);

const outHtml = join(dist, "index.html");
writeFileSync(outHtml, html);

const artifacts = join(root, "artifacts");
mkdirSync(artifacts, { recursive: true });
copyFileSync(outHtml, join(artifacts, "HockeyFastBreak.html"));
copyFileSync(outHtml, join(artifacts, "index.html"));

const publicDir = join(root, "public");
copyFileSync(outHtml, join(publicDir, "HockeyFastBreak.html"));

console.log(
  `packed ${outHtml} (${Buffer.byteLength(html)} bytes, js ${js.length}, css ${css.length})`,
);
