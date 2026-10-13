#!/usr/bin/env node
/** Pack the public pose editor. Same checks as the public gallery. */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const child = spawn(process.execPath, [join(root, "scripts/pack-pose-editor.mjs"), "--public"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
child.on("exit", (code) => process.exit(code ?? 1));
