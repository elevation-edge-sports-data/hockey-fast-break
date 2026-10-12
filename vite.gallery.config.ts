import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * One classic-script bundle for a pose-gallery HTML file.
 * GALLERY_ENTRY and GALLERY_OUT select the public or private entry.
 * This does not use the play-pack config or write docs/index.html.
 */
export default defineConfig(() => {
  const entry = process.env.GALLERY_ENTRY || "src/game/poseGalleryPublicEntry.tsx";
  const outDir = process.env.GALLERY_OUT || "dist-gallery-public";
  return {
    publicDir: false,
    resolve: { tsconfigPaths: true },
    plugins: [tailwindcss(), viteReact()],
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
