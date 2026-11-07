import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { deleteFormationFile, formationFileName, saveFormationFile } from "./formation-save.mjs";
import { deleteReplayFile, saveReplayFile } from "./replay-save.mjs";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));

test("formation file names stay inside formations/", () => {
  assert.equal(formationFileName("power play"), "power play.json");
  assert.equal(formationFileName("odd-man.json"), "odd-man.json");
  assert.equal(formationFileName("../secret"), "secret.json");
  assert.equal(formationFileName("a/b"), "b.json");
  assert.equal(formationFileName(".."), null);
  assert.equal(formationFileName(""), null);
});

test("save writes the frame json and not a path outside formations/", () => {
  const root = mkdtempSync(join(tmpdir(), "hfb-formations-"));
  const name = saveFormationFile(root, "slot.json", { frame: 3, time: 1.5 });
  assert.equal(name, "slot.json");
  const text = readFileSync(join(root, "formations", "slot.json"), "utf8");
  assert.equal(JSON.parse(text).frame, 3);
  assert.equal(JSON.parse(text).time, 1.5);
  assert.equal(saveFormationFile(root, "../nope", { frame: 1 }), "nope.json");
  assert.equal(JSON.parse(readFileSync(join(root, "formations", "nope.json"), "utf8")).frame, 1);
  assert.throws(() => saveFormationFile(root, "..", { frame: 1 }));
  saveFormationFile(root, "slot.json", { frame: 3, time: 1.5 });
  const renamed = saveFormationFile(root, "renamed", { frame: 3, time: 1.5 }, "slot.json");
  assert.equal(renamed, "renamed.json");
  assert.equal(existsSync(join(root, "formations", "slot.json")), false);
  assert.equal(JSON.parse(readFileSync(join(root, "formations", "renamed.json"), "utf8")).frame, 3);
  saveFormationFile(root, "renamed.json", { frame: 4, time: 2 }, "renamed.json");
  assert.equal(existsSync(join(root, "formations", "renamed.json")), true);
  assert.equal(JSON.parse(readFileSync(join(root, "formations", "renamed.json"), "utf8")).frame, 4);
});

test("save writes a replay array under replays/ and rename removes the old file", () => {
  const root = mkdtempSync(join(tmpdir(), "hfb-replays-"));
  const frames = [
    { frame: 1, time: 0 },
    { frame: 2, time: 1 / 60 },
  ];
  const name = saveReplayFile(root, "clip", frames);
  assert.equal(name, "clip.json");
  const text = readFileSync(join(root, "replays", "clip.json"), "utf8");
  assert.equal(JSON.parse(text).length, 2);
  assert.equal(JSON.parse(text)[1].frame, 2);
  const renamed = saveReplayFile(root, "renamed", frames, "clip.json");
  assert.equal(renamed, "renamed.json");
  assert.equal(existsSync(join(root, "replays", "clip.json")), false);
  assert.equal(JSON.parse(readFileSync(join(root, "replays", "renamed.json"), "utf8")).length, 2);
  assert.throws(() => saveReplayFile(root, "nope", { frame: 1 }));
  assert.throws(() => saveReplayFile(root, "..", frames));
  assert.throws(() => saveReplayFile(root, "empty", []));
  assert.equal(deleteReplayFile(root, "renamed.json"), "renamed.json");
  assert.equal(existsSync(join(root, "replays", "renamed.json")), false);
  assert.equal(deleteReplayFile(root, "renamed"), "renamed.json");
  assert.throws(() => deleteReplayFile(root, ".."));
});

test("delete removes a formation file and treats a missing file as already removed", () => {
  const root = mkdtempSync(join(tmpdir(), "hfb-formations-"));
  saveFormationFile(root, "slot.json", { frame: 3, time: 1.5 });
  assert.equal(deleteFormationFile(root, "slot.json"), "slot.json");
  assert.equal(existsSync(join(root, "formations", "slot.json")), false);
  assert.equal(deleteFormationFile(root, "slot"), "slot.json");
  assert.equal(deleteFormationFile(root, "../secret"), "secret.json");
  assert.throws(() => deleteFormationFile(root, ".."));
  assert.throws(() => deleteFormationFile(root, ""));
  const vite = readFileSync(join(repo, "vite.config.ts"), "utf8");
  assert.match(vite, /deleteFormationFile\(server\.config\.root, body\.name\)/);
  assert.match(vite, /pathOnly === "\/api\/formations"/);
  assert.match(vite, /req\.method === "DELETE"/);
  assert.match(vite, /deleteReplayFile\(server\.config\.root, body\.name\)/);
  const formationSave = readFileSync(join(repo, "scripts/formation-save.mjs"), "utf8");
  const replaySave = readFileSync(join(repo, "scripts/replay-save.mjs"), "utf8");
  assert.match(formationSave, /file still on disk/);
  assert.match(replaySave, /file still on disk/);
  assert.match(formationSave, /Vite\s+restart is required for the glob to drop the file completely/);
  assert.match(replaySave, /Vite\s+restart is required for the glob to drop the file completely/);
});
