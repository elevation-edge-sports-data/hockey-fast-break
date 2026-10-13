#!/usr/bin/env node
/**
 * Write a self-contained pose editor page to public/pose-editor.html.
 * Does not run the play pack and does not write docs/index.html.
 *
 * Build the bundle:
 *   npx vite build --config vite.pose-editor.config.ts
 * Pack the HTML (this also runs that build):
 *   node scripts/pack-pose-editor.mjs
 *
 * Open public/pose-editor.html, or serve the public folder. The script is
 * inlined, so the page does not need the TanStack Start dev server.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { poseOverrideSummary } from "./pose-overrides-plugin.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(root, "node_modules/vite/bin/vite.js");
const isPublic = process.argv.includes("--public");
const distName = isPublic ? "dist-pose-editor-public" : "dist-pose-editor";
const outName = isPublic ? "public/pose-editor-public.html" : "public/pose-editor.html";

function run() {
  const env = { ...process.env };
  if (isPublic) {
    env.POSE_EDITOR_PUBLIC = "1";
    env.POSE_EDITOR_ENTRY = "src/game/poseEditorPublicEntry.tsx";
    env.POSE_EDITOR_OUT = distName;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, "build", "--config", "vite.pose-editor.config.ts"], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pose editor build exited ${code}`));
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
  const jsName = files.find((f) => f === "pose-editor.js") ?? files.find((f) => f.endsWith(".js"));
  const cssName = files.find((f) => f.endsWith(".css"));
  if (!jsName) throw new Error(`pack-pose-editor: no JS bundle in ${dir}`);
  const js = readFileSync(join(dir, jsName), "utf8");
  const css = cssName ? fixCss(readFileSync(join(dir, cssName), "utf8")) : "";
  if (files.filter((f) => f.endsWith(".js")).length !== 1) {
    throw new Error("pack-pose-editor: expected one JS file");
  }
  return { js, css };
}

console.log(`pose overrides: ${poseOverrideSummary(root)}`);
await run();

const dist = join(root, distName);
const { js, css } = bundleFrom(dist);
if (isPublic) {
  const stripped = js.replaceAll("NeutralToneMapping", "").replaceAll("`Neutral`", "");
  // idle, deke, ready, and stride are public. These tokens stay private.
  const leak = ["poseGalleryFull", "goalieBench", "Goalie bench", "neutralCarry", "wristBackhand", "Neutral"].find((token) =>
    stripped.includes(token),
  );
  if (leak) throw new Error(`pack-pose-editor: public bundle references the private gallery (${leak})`);
}
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="theme-color" content="#070b12" />
  <title>POSE EDITOR</title>
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
  <script>
${escapeScript(js)}
  </script>
</body>
</html>
`;

const out = join(root, outName);
writeFileSync(out, html);
console.log(`wrote ${outName} (${Buffer.byteLength(html)} bytes)`);
