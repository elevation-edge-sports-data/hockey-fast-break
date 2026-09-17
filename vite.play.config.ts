import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Client-only IIFE build for a double-clickable HTML file.
 * Does not use TanStack Start / Nitro — those need a server.
 */
export default defineConfig({
  publicDir: false,
  plugins: [tailwindcss(), viteReact()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist-play",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 10_000_000,
    minify: true,
    target: "es2020",
    rollupOptions: {
      input: "src/game/standalone.tsx",
      output: {
        format: "iife",
        name: "HockeyFastBreak",
        inlineDynamicImports: true,
        entryFileNames: "game.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
