import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PACK_SCRIPTS, poseSaveBody, saveAndRebuild } from "./pose-save-server.mjs";

test("pose save body accepts poseName", () => {
  const body = poseSaveBody({ poseName: "deke", joints: { body: [0.1, 0, 0] } });
  assert.equal(body.pose, "deke");
});

test("save writes the pose then rebuilds galleries, editor, and game in order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hfb-pose-save-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "poseOverrides.json"), "{}\n");
  const ran = [];
  const result = await saveAndRebuild(
    { poseName: "poke", joints: { lLeg: [0.41, 0, 0] } },
    async (script) => {
      ran.push(script);
    },
    dir,
  );
  assert.equal(result.ok, true);
  assert.equal(result.pose, "poke");
  assert.deepEqual(ran, PACK_SCRIPTS);
  const file = JSON.parse(readFileSync(join(dir, "src", "game", "poseOverrides.json"), "utf8"));
  assert.deepEqual(file.poke.lLeg, [0.41, 0, 0]);
});

test("the public editor can save default and cannot save a private pose", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hfb-pose-save-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "poseOverrides.json"), '{ "neutral": { "body": [0.2, 0, 0] } }\n');
  const result = await saveAndRebuild(
    { poseName: "default", joints: { body: [0.3, 0, 0] }, publicOnly: true },
    async () => {},
    dir,
  );
  assert.equal(result.pose, "default");
  const file = JSON.parse(readFileSync(join(dir, "src", "game", "poseOverrides.json"), "utf8"));
  assert.deepEqual(file.default.body, [0.3, 0, 0]);
  assert.deepEqual(file.neutral.body, [0.2, 0, 0]);
});

test("the public editor can save idle and deke", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hfb-pose-save-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "poseOverrides.json"), "{}\n");
  for (const poseName of ["idle", "deke", "check", "dive", "getUp", "brawl", "tumble"]) {
    const result = await saveAndRebuild(
      { poseName, joints: { body: [0.1, 0, 0] }, publicOnly: true },
      async () => {},
      dir,
    );
    assert.equal(result.pose, poseName);
  }
  const file = JSON.parse(readFileSync(join(dir, "src", "game", "poseOverrides.json"), "utf8"));
  assert.deepEqual(file.idle.body, [0.1, 0, 0]);
  assert.deepEqual(file.deke.body, [0.1, 0, 0]);
  assert.deepEqual(file.check.body, [0.1, 0, 0]);
  assert.deepEqual(file.dive.body, [0.1, 0, 0]);
  assert.deepEqual(file.getUp.body, [0.1, 0, 0]);
  assert.deepEqual(file.brawl.body, [0.1, 0, 0]);
  assert.deepEqual(file.tumble.body, [0.1, 0, 0]);
});

test("the public editor cannot save a private pose name", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hfb-pose-save-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "poseOverrides.json"), "{}\n");
  await assert.rejects(
    saveAndRebuild({ poseName: "goalieBench", joints: { body: [0.1, 0, 0] }, publicOnly: true }, async () => {}, dir),
    /public editor/,
  );
  const file = JSON.parse(readFileSync(join(dir, "src", "game", "poseOverrides.json"), "utf8"));
  assert.equal(file.goalieBench, undefined);
});

test("a failed pack still keeps the written pose and reports the error", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hfb-pose-save-"));
  mkdirSync(join(dir, "src", "game"), { recursive: true });
  writeFileSync(join(dir, "src", "game", "poseOverrides.json"), "{}\n");
  await assert.rejects(
    saveAndRebuild({ poseName: "wrist", joints: { body: [0.2, 0, 0] } }, async (script) => {
      throw new Error(`${script} exited 1`);
    }, dir),
    /pack-galleries\.mjs exited 1/,
  );
  const file = JSON.parse(readFileSync(join(dir, "src", "game", "poseOverrides.json"), "utf8"));
  assert.deepEqual(file.wrist.body, [0.2, 0, 0]);
});
