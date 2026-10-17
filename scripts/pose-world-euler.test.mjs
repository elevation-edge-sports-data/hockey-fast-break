import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Cases import a TypeScript module. The repo test script does not pass Node's
// type-stripping flag, so run them in a child process that does.
test("pose world euler", () => {
  const cases = fileURLToPath(new URL("./pose-world-euler.cases.mjs", import.meta.url));
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("NODE_CHANNEL") || key.startsWith("NODE_TEST")) delete env[key];
  }
  const res = spawnSync(process.execPath, ["--experimental-strip-types", "--test", cases], { encoding: "utf8", env });
  if (res.status !== 0) {
    throw new Error(`${res.stdout}\n${res.stderr}`);
  }
  assert.match(res.stdout, /# fail 0/);
});
