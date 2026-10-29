import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { poseOverridesDataPlugin } from "./scripts/pose-overrides-plugin.mjs";

/**
 * One classic-script bundle for the procedural function visualizer.
 *
 * npx vite build --config vite.function-viewer.config.ts
 * node scripts/pack-function-viewer.mjs
 */
export default defineConfig({
  publicDir: false,
  resolve: { tsconfigPaths: true },
  plugins: [poseOverridesDataPlugin(), tailwindcss(), viteReact()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist-function-viewer",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 10_000_000,
    minify: true,
    target: "es2020",
    rollupOptions: {
      input: "src/game/functionViewerPublicEntry.tsx",
      output: {
        format: "iife" as const,
        name: "FunctionViewer",
        inlineDynamicImports: true,
        entryFileNames: "function-viewer.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
