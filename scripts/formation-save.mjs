/**
 * Write one formation JSON into the repo formations/ folder.
 * Dev-server only. The browser posts the current frame and a file name.
 */
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function formationFileName(raw) {
  if (typeof raw !== "string") return null;
  const base = raw.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  const stripped = base.replace(/\.json$/i, "").trim();
  if (!stripped || stripped === "." || stripped === "..") return null;
  if (stripped.length > 80) return null;
  if (/[<>:"|?*\u0000-\u001f]/.test(stripped)) return null;
  return `${stripped}.json`;
}

export function saveFormationFile(root, rawName, frame, rawFrom) {
  const name = formationFileName(rawName);
  if (!name) throw new Error("bad name");
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) throw new Error("bad frame");
  const dir = join(root, "formations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(frame, null, 2)}\n`);
  const from = typeof rawFrom === "string" ? formationFileName(rawFrom) : null;
  if (from && from !== name) {
    const prev = join(dir, from);
    if (existsSync(prev)) unlinkSync(prev);
  }
  return name;
}
