import { UNIFORMS } from "./uniforms.ts";

/** Center-ice and jersey files never share a slot. */
export type LogoSlot = "center-ice" | "jersey";

export type LogoFile = {
  slot: LogoSlot;
  /** 1-based. kit-1 is UNIFORMS id 0. */
  kitNumber: number;
  depth: number;
  /** Relative path or filename, used in the skip list. */
  label: string;
  bytes: Uint8Array;
  mime?: string;
};

const MAX_LOGO_BYTES = 8 * 1024 * 1024;

/** `kit-N.png`, no zero padding. N is 1 through the kit list. */
export function kitNumberFromFile(filename: string): number | null {
  const m = /^kit-([1-9]\d*)\.png$/i.exec(filename);
  if (!m) return null;
  if (String(Number(m[1])) !== m[1]) return null;
  const n = Number(m[1]);
  if (n < 1 || n > UNIFORMS.length) return null;
  return n;
}

/** PNG, JPEG, or WebP. Anything else is ignored by the folder picker. */
export function imageMime(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function slotName(part: string): LogoSlot | null {
  const s = part.toLowerCase();
  if (s === "center-ice" || s === "jersey") return s;
  return null;
}

/**
 * Three accepted shapes, case-insensitive on the folders:
 * `logos/<slot>/kit-N.png`, `<one>/logos/<slot>/kit-N.png`, or `<slot>/kit-N.png`.
 * Depth is the segment count. A shallower path wins.
 */
export function classifyLogoPath(raw: string): { slot: LogoSlot; kitNumber: number; depth: number } | null {
  const parts = raw
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p.length > 0 && p !== ".");
  if (parts.some((p) => p === "..")) return null;
  if (parts.length < 2) return null;
  const kitNumber = kitNumberFromFile(parts[parts.length - 1] ?? "");
  const slot = slotName(parts[parts.length - 2] ?? "");
  if (kitNumber === null || slot === null) return null;
  if (parts.length === 2) return { slot, kitNumber, depth: 2 };
  if (parts.length === 3 && parts[0]?.toLowerCase() === "logos") return { slot, kitNumber, depth: 3 };
  if (parts.length === 4 && parts[1]?.toLowerCase() === "logos") return { slot, kitNumber, depth: 4 };
  return null;
}

/** `/__private-logos/<slot>/kit-N.png` to a relative file under `private-logos/logos/`. */
export function privateLogoRel(urlPath: string, kitCount: number): string | null {
  let pathOnly = urlPath.split("?", 1)[0] ?? "";
  try {
    pathOnly = decodeURIComponent(pathOnly);
  } catch {
    return null;
  }
  if (!pathOnly.startsWith("/__private-logos/")) return null;
  const rel = pathOnly.slice("/__private-logos/".length);
  if (rel.includes("..") || rel.includes("\\")) return null;
  const m = /^(center-ice|jersey)\/kit-([1-9]\d*)\.png$/i.exec(rel);
  if (!m) return null;
  const digits = m[2] ?? "";
  if (String(Number(digits)) !== digits) return null;
  const n = Number(digits);
  if (n < 1 || n > kitCount) return null;
  return `${(m[1] ?? "").toLowerCase()}/kit-${n}.png`;
}

/**
 * Imported blob, then the dev private file, then the bundled public file.
 * Center ice with nothing else uses the Elevation Edge mark. A jersey does not.
 */
export function pickLogoUrl(opts: {
  imported: string | null;
  privateUrl: string | null;
  publicUrl: string | null;
  eeUrl: string;
  slot: LogoSlot;
}): string | null {
  if (opts.imported) return opts.imported;
  if (opts.privateUrl) return opts.privateUrl;
  if (opts.publicUrl) return opts.publicUrl;
  if (opts.slot === "center-ice") return opts.eeUrl;
  return null;
}

function looksLikeKitPng(label: string): boolean {
  const base = label.replace(/\\/g, "/").split("/").pop() ?? label;
  return /^kit-.*\.png$/i.test(base);
}

/** A kit-*.png sitting in a slot folder that is padded, zero, or out of range. */
function rejectedKitName(label: string): boolean {
  const parts = label.replace(/\\/g, "/").split("/").filter((p) => p.length > 0);
  if (parts.length < 2) return false;
  const parent = parts[parts.length - 2]?.toLowerCase();
  const file = parts[parts.length - 1] ?? "";
  if (parent !== "center-ice" && parent !== "jersey") return false;
  return looksLikeKitPng(file) && kitNumberFromFile(file) === null;
}

/** Filename only. `webkitRelativePath` may be `jersey/kit-1.png` or just `image.png`. */
export function folderFileName(file: { name: string; webkitRelativePath?: string }): string {
  const rel = (file.webkitRelativePath ?? "").replace(/\\/g, "/").split("/").filter((part) => part.length > 0);
  const base = rel.length > 0 ? rel[rel.length - 1] : "";
  return base || file.name;
}

const FILE_NAME_SORT = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Numeric filename order. Extras past `kitCount` are dropped. Missing kits are simply absent. */
export function assignFolderImages<T extends { name: string }>(files: readonly T[], kitCount: number): T[] {
  const sorted = [...files].sort((a, b) => FILE_NAME_SORT.compare(a.name, b.name));
  return sorted.slice(0, Math.max(0, kitCount));
}

/**
 * Folder mode. An imported set that lacks this kit draws nothing.
 * With no import yet, a dev private file can still show.
 */
export function folderIceUrl(opts: { assignedUrl: string | null; anyAssigned: boolean; privateUrl: string | null }): string | null {
  if (opts.assignedUrl) return opts.assignedUrl;
  if (opts.anyAssigned) return null;
  return opts.privateUrl;
}

/**
 * Jersey crest. Custom for that side wins, then a folder file for that kit.
 * A folder pack with no file for the kit draws nothing. Otherwise the private or public fallback.
 */
export function jerseyCrestUrl(opts: {
  off: boolean;
  customUrl: string | null;
  folderUrl: string | null;
  anyFolder: boolean;
  fallbackUrl: string | null;
}): string | null {
  if (opts.off) return null;
  if (opts.customUrl) return opts.customUrl;
  if (opts.folderUrl) return opts.folderUrl;
  if (opts.anyFolder) return null;
  return opts.fallbackUrl;
}

/** Default is the Elevation Edge mark. Custom with no saved image is null. Off and a blank folder kit are null. */
export function iceLogoForMode(
  mode: "default" | "ee" | "custom" | "folder" | "kit" | "off",
  opts: {
    eeUrl: string;
    customUrl: string | null;
    assignedUrl: string | null;
    anyAssigned: boolean;
    privateUrl: string | null;
  },
): string | null {
  if (mode === "off") return null;
  if (mode === "default" || mode === "ee") return opts.eeUrl;
  if (mode === "custom") {
    if (opts.customUrl && opts.customUrl.startsWith("data:image/")) return opts.customUrl;
    return null;
  }
  return folderIceUrl({
    assignedUrl: opts.assignedUrl,
    anyAssigned: opts.anyAssigned,
    privateUrl: opts.privateUrl,
  });
}

/**
 * Keep kit PNGs from a folder listing. Paths are `webkitRelativePath` values.
 * A shallower match wins. A missing kit is simply absent.
 */
export function collectLogoFiles(entries: readonly { path: string; bytes: Uint8Array }[]): {
  records: LogoFile[];
  skipped: string[];
} {
  const chosen = new Map<string, LogoFile>();
  const skipped: string[] = [];
  for (const entry of entries) {
    const classified = classifyLogoPath(entry.path);
    if (!classified) {
      if (rejectedKitName(entry.path)) skipped.push(entry.path);
      continue;
    }
    if (entry.bytes.byteLength > MAX_LOGO_BYTES) {
      skipped.push(`${entry.path} (too large)`);
      continue;
    }
    if (!isPng(entry.bytes)) {
      skipped.push(`${entry.path} (not a png)`);
      continue;
    }
    const key = `${classified.slot}:${classified.kitNumber}`;
    const prev = chosen.get(key);
    if (!prev || classified.depth <= prev.depth) {
      const copy = new Uint8Array(entry.bytes.byteLength);
      copy.set(entry.bytes);
      chosen.set(key, {
        slot: classified.slot,
        kitNumber: classified.kitNumber,
        depth: classified.depth,
        label: entry.path,
        bytes: copy,
      });
    }
  }
  const records = [...chosen.values()].sort((a, b) =>
    a.slot === b.slot ? a.kitNumber - b.kitNumber : a.slot < b.slot ? -1 : 1,
  );
  return { records, skipped };
}
