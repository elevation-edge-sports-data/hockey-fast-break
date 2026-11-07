/**
 * Write one replay JSON into the repo replays/ folder.
 * Dev-server only. The browser posts the loaded frames and a file name.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { formationFileName } from "./formation-save.mjs";

export function saveReplayFile(root, rawName, frames, rawFrom) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  if (!Array.isArray(frames) || frames.length === 0) throw new Error("bad replay");
  if (frames.some((frame) => !frame || typeof frame !== "object" || Array.isArray(frame))) throw new Error("bad replay");
  const dir = join(root, "replays");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(frames, null, 2)}\n`);
  const from = typeof rawFrom === "string" ? formationFileName(rawFrom) : null;
  if (from && from !== name) {
    const prev = join(dir, from);
    if (existsSync(prev)) unlinkSync(prev);
  }
  return name;
}

/** Unlink one replay file. A missing file is already removed. Success means the file is gone. A Vite restart is required for the glob to drop the file completely. */
export function deleteReplayFile(root, rawName) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  const file = join(root, "replays", name);
  if (existsSync(file)) unlinkSync(file);
  if (existsSync(file)) throw new Error("file still on disk");
  return name;
}
