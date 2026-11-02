import { createReadStream, existsSync, statSync } from "node:fs";
// @ts-expect-error JS helper alongside the TS vite config
import { saveFormationFile } from "./scripts/formation-save.mjs";
import { extname, isAbsolute, join, relative } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { appEnvPlugin } from "./scripts/app-env-plugin.mjs";
// @ts-expect-error JS plugin alongside the TS vite config
import { poseOverridesDataPlugin, poseOverridesPlugin } from "./scripts/pose-overrides-plugin.mjs";

const ARCHIVE_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function formationsSavePlugin(): Plugin {
  return {
    name: "hfb-formations-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0] ?? "";
        if (pathOnly !== "/api/formations" || req.method !== "POST") {
          next();
          return;
        }
        const chunks: Buffer[] = [];
        let tooBig = false;
        req.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          if (chunks.reduce((n, part) => n + part.length, 0) > 1_000_000) tooBig = true;
        });
        req.on("end", () => {
          if (tooBig) {
            res.statusCode = 413;
            res.end("too large");
            return;
          }
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              name?: unknown;
              frame?: unknown;
              from?: unknown;
            };
            const name = saveFormationFile(server.config.root, body.name, body.frame, body.from);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ name }));
          } catch {
            res.statusCode = 400;
            res.setHeader("Content-Type", "text/plain");
            res.end("bad formation");
          }
        });
      });
    },
  };
}

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
    formationsSavePlugin(),
    poseOverridesDataPlugin(),
    poseOverridesPlugin(),
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
