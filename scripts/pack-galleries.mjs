#!/usr/bin/env node
/**
 * Write clickable pose-gallery HTML into public/.
 * Does not run the play pack and does not write docs/index.html.
 *
 * public/pose-gallery.html inlines only the two public stills.
 * public/pose-gallery-full.html loads public/pose-gallery-full.js when that
 * built file exists, and otherwise shows the missing-copy message.
 * The js file is the built form of src/game/poseGalleryFull.tsx.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(root, "node_modules/vite/bin/vite.js");
const MISSING = "The full pose gallery is not included in this copy.";

function run(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, "build", "--config", "vite.gallery.config.ts"], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gallery build exited ${code}`));
    });
  });
}

function escapeScript(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

function fixCss(css) {
  return css.replaceAll("unicode-range:U+??", "unicode-range:U+0000-00FF");
}

function bundleFrom(dir) {
  const files = readdirSync(dir);
  const jsName = files.find((f) => f.endsWith(".js"));
  const cssName = files.find((f) => f.endsWith(".css"));
  if (!jsName) throw new Error(`pack-galleries: no JS bundle in ${dir}`);
  const js = readFileSync(join(dir, jsName), "utf8");
  const css = cssName ? fixCss(readFileSync(join(dir, cssName), "utf8")) : "";
  if (files.filter((f) => f.endsWith(".js")).length !== 1) {
    throw new Error(`pack-galleries: expected one JS file in ${dir}`);
  }
  return { js, css };
}

function page(title, css, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="theme-color" content="#070b12" />
  <title>${title}</title>
  <link rel="icon" href="./favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" />
  <style>
html,body,#app{height:100%;margin:0;background:#070b12}
${css}
  </style>
</head>
<body>
  <div id="app"></div>
${body}
</body>
</html>
`;
}

const publicDir = join(root, "dist-gallery-public");
await run({
  GALLERY_ENTRY: "src/game/poseGalleryPublicEntry.tsx",
  GALLERY_OUT: "dist-gallery-public",
});
const pub = bundleFrom(publicDir);
if (pub.js.includes("poseGalleryFull") || pub.js.includes("puckDropSet")) {
  throw new Error("pack-galleries: public bundle references the private gallery");
}
const publicHtml = page(
  "Pose gallery",
  pub.css,
  `  <script>
${escapeScript(pub.js)}
  </script>`,
);
writeFileSync(join(root, "public/pose-gallery.html"), publicHtml);

const fullJsPath = join(root, "public/pose-gallery-full.js");
const fullSource = join(root, "src/game/poseGalleryFull.tsx");
if (existsSync(fullSource)) {
  const fullDir = join(root, "dist-gallery-full");
  await run({
    GALLERY_ENTRY: "src/game/poseGalleryFullEntry.tsx",
    GALLERY_OUT: "dist-gallery-full",
  });
  const full = bundleFrom(fullDir);
  if (!full.js.includes("puckDropSet")) {
    throw new Error("pack-galleries: private bundle is missing the full pose set");
  }
  const cssBoot = `(function(){var s=document.createElement("style");s.textContent=${JSON.stringify(full.css)};document.head.appendChild(s);})();\n`;
  writeFileSync(fullJsPath, cssBoot + full.js);
} else if (existsSync(fullJsPath)) {
  rmSync(fullJsPath);
}

const fullHtml = page(
  "Full pose gallery",
  "",
  `  <script>
    function showMissingGallery() {
      var app = document.getElementById("app");
      if (!app || app.dataset.ready === "1") return;
      app.style.cssText = "height:100dvh;display:grid;place-items:center;background:#070b12;color:#8b97a4;font-family:Barlow Condensed,sans-serif;letter-spacing:0.04em";
      app.textContent = ${JSON.stringify(MISSING)};
    }
    window.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.src && String(t.src).indexOf("pose-gallery-full.js") !== -1) showMissingGallery();
    }, true);
  </script>
  <script src="./pose-gallery-full.js" onerror="showMissingGallery()"></script>`,
);
writeFileSync(join(root, "public/pose-gallery-full.html"), fullHtml);

console.log(`wrote public/pose-gallery.html (${Buffer.byteLength(publicHtml)} bytes)`);
console.log(
  existsSync(fullJsPath)
    ? `wrote public/pose-gallery-full.js (${readFileSync(fullJsPath).length} bytes)`
    : "public/pose-gallery-full.js omitted; the html shell shows the missing message",
);
