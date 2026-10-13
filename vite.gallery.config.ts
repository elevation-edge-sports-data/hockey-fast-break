import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { poseOverridesDataPlugin } from "./scripts/pose-overrides-plugin.mjs";

const PUBLIC_POSE_IDS = new Set([
  "default",
  "ready",
  "stride",
  "idle",
  "deke",
  "wrist",
  "slap",
  "shot-follow-through",
  "poke",
  "check",
  "dive",
  "tumble",
  "getUp",
  "cheer",
  "brawl",
]);

/** Public gallery bundle keeps only the public pose entries from poseOverrides.json. */
function publicPoseOverridesPlugin() {
  return {
    name: "hfb-public-pose-overrides",
    enforce: "post" as const,
    transform(_code: string, id: string) {
      const file = id.split("?", 1)[0]?.replaceAll("\\", "/") ?? "";
      if (!file.endsWith("/src/game/poseOverrides.json")) return null;
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      if (data.neutral && !data.default) data.default = data.neutral;
      delete data.neutral;
      if (data.puckDropSet && !data.idle) data.idle = data.puckDropSet;
      delete data.puckDropSet;
      const next: Record<string, unknown> = {};
      for (const key of Object.keys(data)) {
        if (PUBLIC_POSE_IDS.has(key)) next[key] = data[key];
      }
      return `export default ${JSON.stringify(next)};`;
    },
  };
}

/**
 * One classic-script bundle for a pose-gallery HTML file.
 * GALLERY_ENTRY and GALLERY_OUT select the public or private entry.
 * This does not use the play-pack config or write docs/index.html.
 */
export default defineConfig(() => {
  const entry = process.env.GALLERY_ENTRY || "src/game/poseGalleryPublicEntry.tsx";
  const outDir = process.env.GALLERY_OUT || "dist-gallery-public";
  const publicGallery = !entry.includes("poseGalleryFull");
  return {
    publicDir: false,
    resolve: { tsconfigPaths: true },
    plugins: [poseOverridesDataPlugin(), tailwindcss(), viteReact(), ...(publicGallery ? [publicPoseOverridesPlugin()] : [])],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      assetsInlineLimit: 10_000_000,
      minify: true,
      target: "es2020",
      rollupOptions: {
        input: entry,
        output: {
          format: "iife" as const,
          name: "PoseGallery",
          inlineDynamicImports: true,
          entryFileNames: "gallery.js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  };
});
