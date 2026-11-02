import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { formationFileName, saveFormationFile } from "./formation-save.mjs";

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
