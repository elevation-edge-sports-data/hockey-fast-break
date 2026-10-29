#!/usr/bin/env node
/**
 * Write a self-contained procedural function visualizer.
 * Output is the local page public/function-viewer.html. Open that file locally.
 * Does not write docs/, GitHub Pages, or the play pack.
 *
 * npm run function-viewer
 * node scripts/pack-function-viewer.mjs
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(root, "node_modules/vite/bin/vite.js");
const distName = "dist-function-viewer";
const outName = "public/function-viewer.html";
if (outName.replaceAll("\\", "/").startsWith("docs/") || outName.replaceAll("\\", "/").includes("/docs/")) {
  throw new Error("pack-function-viewer: must not write to docs/");
}
const names = [
  "poseSkaterReady",
  "poseNeutralCarry",
  "poseBurstCarry",
  "posePoke",
  "poseWristLeg",
  "poseSlapLeg",
  "poseCheer",
  "poseGoalieStance",
  "poseGoaliePads",
  "poseGoalieCheer",
  "poseGoalieCover",
  "poseGoalieGetUp",
  "poseBrawl",
  "poseDefaultSkate",
  "poseCarrySkate",
  "poseDive",
  "poseTumble",
  "poseCheckDeliver",
  "poseCheckReceive",
  "poseWristSequence",
  "poseSlapSequence",
];

function run() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [viteBin, "build", "--config", "vite.function-viewer.config.ts"], {
      cwd: root,
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`function viewer build exited ${code}`));
    });
  });
}

function escapeScript(js) {
  return js.replace(/<\/script/gi, "<\\/script");
}

function fixCss(css) {
  return css.replaceAll("unicode-range:U+??", "unicode-range:U+0000-00FF");
}

await run();

const dist = join(root, distName);
const files = readdirSync(dist);
const jsName = files.find((f) => f === "function-viewer.js") ?? files.find((f) => f.endsWith(".js"));
const cssName = files.find((f) => f.endsWith(".css"));
if (!jsName) throw new Error(`pack-function-viewer: no JS bundle in ${dist}`);
if (files.filter((f) => f.endsWith(".js")).length !== 1) {
  throw new Error("pack-function-viewer: expected one JS file");
}
const js = readFileSync(join(dist, jsName), "utf8");
const css = cssName ? fixCss(readFileSync(join(dist, cssName), "utf8")) : "";
for (const token of names) {
  if (!js.includes(token)) throw new Error(`pack-function-viewer: bundle is missing ${token}`);
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="theme-color" content="#070b12" />
  <title>FUNCTION VIEWER</title>
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

writeFileSync(join(root, outName), html);
console.log(`wrote ${outName} (${Buffer.byteLength(html)} bytes)`);
