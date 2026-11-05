import { framesFromUnknown, parseFormationJson, type FormationFrame } from "./formationLibrary";

export type ReplayClip = {
  id: string;
  name: string;
  frames: FormationFrame[];
};

const STORAGE_KEY = "hfb-replay-library";
const RETIRED_KEY = "hfb-replay-retired";

const bundledModules = import.meta.glob("../../replays/*.json", { eager: true });

function moduleJson(mod: unknown): unknown {
  if (mod && typeof mod === "object" && "default" in mod) return (mod as { default: unknown }).default;
  return mod;
}

function asClip(v: unknown): ReplayClip | null {
  if (!v || typeof v !== "object") return null;
  const row = v as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  const frames = framesFromUnknown(row.frames);
  if (typeof frames === "string") return null;
  return { id: row.id, name: row.name, frames };
}

/** One loaded file is one clip, including a range download. */
export function replayClipFromFile(fileName: string, text: string, id: string): ReplayClip | string {
  const frames = parseFormationJson(text);
  if (typeof frames === "string") return frames;
  return { id, name: fileName, frames };
}

export function readReplayLibrary(): ReplayClip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.flatMap((item) => {
      const clip = asClip(item);
      return clip ? [clip] : [];
    });
  } catch {
    return [];
  }
}

export function writeReplayLibrary(clips: ReplayClip[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clips));
    return null;
  } catch {
    return "The browser could not store that replay.";
  }
}

/** Names removed from the right panel. Kept so a stale dev glob does not bring them back. */
export function readRetiredReplays(): string[] {
  try {
    const raw = localStorage.getItem(RETIRED_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((item) => typeof item === "string");
  } catch {
    return [];
  }
}

export function writeRetiredReplays(names: readonly string[]): void {
  try {
    localStorage.setItem(RETIRED_KEY, JSON.stringify(names));
  } catch {
    /* The list still updates for this session. */
  }
}

/**
 * Left list is unsaved loads. Right list is replays/ files, plus a file
 * saved earlier in this session. A shared name does not hide the load.
 * Retired names drop only the repo copy that was renamed away.
 */
export function partitionReplayLibrary(
  local: readonly ReplayClip[],
  bundled: readonly ReplayClip[],
  saved: readonly ReplayClip[] = [],
  retired: readonly string[] = [],
): { imported: ReplayClip[]; repo: ReplayClip[] } {
  const repoSaved = saved.filter((clip) => !retired.includes(clip.name));
  const taken = new Set(repoSaved.map((clip) => clip.name));
  const repo = [
    ...repoSaved,
    ...bundled.filter((clip) => !retired.includes(clip.name) && !taken.has(clip.name)),
  ];
  const imported = local.filter((clip) => !clip.id.startsWith("bundled:"));
  return { imported, repo };
}

/** JSON files checked in under replays/. One file is one clip. */
export function bundledReplayEntries(): ReplayClip[] {
  const out: ReplayClip[] = [];
  for (const [path, mod] of Object.entries(bundledModules)) {
    const name = path.split("/").pop() ?? path;
    const frames = framesFromUnknown(moduleJson(mod));
    if (typeof frames === "string") continue;
    out.push({ id: `bundled:${path}:0`, name, frames });
  }
  return out;
}
