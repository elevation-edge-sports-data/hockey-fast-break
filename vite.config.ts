import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, isAbsolute, join, relative } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";

const ARCHIVE_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function versionArchivePlugin(): Plugin {
  return {
    name: "hfb-version-archive",
    apply: "serve",
    configureServer(server) {
      const archiveRoot = join(server.config.root, "docs", "archive");
      server.middlewares.use((req, res, next) => {
        try {
          const pathOnly = decodeURIComponent((req.url ?? "").split("?", 1)[0] ?? "");
          if (pathOnly !== "/archive" && !pathOnly.startsWith("/archive/")) {
            next();
            return;
          }
          let rel = pathOnly.slice("/archive".length).replace(/^\/+/, "");
          if (rel === "" || rel.endsWith("/")) rel += "index.html";
          const file = join(archiveRoot, rel);
          const fromRoot = relative(archiveRoot, file);
          if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
            next();
            return;
          }
          if (!existsSync(file) || !statSync(file).isFile()) {
            next();
            return;
          }
          res.statusCode = 200;
          res.setHeader(
            "Content-Type",
            ARCHIVE_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
          );
          createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// The dev server starts once `src/router.tsx` and `src/routes/` exist — see
// AGENTS.md § "First scaffold".
export default defineConfig(({ command, isPreview }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 8081,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    versionArchivePlugin(),
    appEnvPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build" || isPreview
      ? [
          nitro({
            preset: "vercel",
            // Nitro v3 defaults serverDir to false, which drops ./server on deploy.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
