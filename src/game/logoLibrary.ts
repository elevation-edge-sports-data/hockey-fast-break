import eeUrl from "../../logo-center-ice.png";
import { useGame, type CenterIceLogo } from "./store";
import { UNIFORMS } from "./uniforms";
import {
  assignFolderImages,
  classifyLogoPath,
  folderFileName,
  iceLogoForMode,
  imageMime,
  jerseyCrestUrl,
  pickLogoUrl,
  type LogoFile,
  type LogoSlot,
} from "./zipLogos";

export type LogoImportResult = {
  ok: boolean;
  kept: number;
  skipped: string[];
  message: string;
};

const DB_NAME = "hfb-logos";
const DB_VERSION = 1;

const importedUrls = new Map<string, string>();
const privateReady = new Map<string, boolean>();
const imageCache = new Map<string, HTMLImageElement>();
/** Import and clear bump this so a late startup read cannot wipe a newer library. */
let libraryEpoch = 0;

const publicModules = import.meta.glob("./logos/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const publicUrls = new Map<string, string>();
for (const [path, url] of Object.entries(publicModules)) {
  const classified = classifyLogoPath(path.replace(/\\/g, "/").replace(/^\.\//, ""));
  if (classified && typeof url === "string") publicUrls.set(`${classified.slot}:${classified.kitNumber}`, url);
}

function logoKey(slot: LogoSlot, kitNumber: number): string {
  return `${slot}:${kitNumber}`;
}

function summarize(skipped: string[]): string {
  const shown = skipped.slice(0, 4).join(", ");
  const more = skipped.length > 4 ? ` +${skipped.length - 4}` : "";
  return `${shown}${more}`;
}

function statusMessage(kept: number, skipped: string[]): string {
  const base = `Imported ${kept} ${kept === 1 ? "logo" : "logos"}.`;
  if (skipped.length === 0) return base;
  return `${base} Skipped ${summarize(skipped)}.`;
}

function emptyMessage(skipped: string[]): string {
  if (skipped.length === 0) return "No kit logos found.";
  return `No kit logos found. Skipped ${summarize(skipped)}.`;
}

function revokeImported(): void {
  for (const url of importedUrls.values()) URL.revokeObjectURL(url);
  importedUrls.clear();
}

function remember(files: readonly LogoFile[]): void {
  revokeImported();
  for (const file of files) {
    const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    importedUrls.set(logoKey(file.slot, file.kitNumber), URL.createObjectURL(new Blob([copy], { type: "image/png" })));
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function hydrateIdb(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const epoch = libraryEpoch;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readonly");
    const store = tx.objectStore("files");
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const req = store.getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as unknown[]);
      req.onerror = () => reject(req.error);
    });
    await txDone(tx);
    if (epoch !== libraryEpoch) return;
    revokeImported();
    for (let i = 0; i < keys.length; i++) {
      const blob = values[i];
      if (blob instanceof Blob) importedUrls.set(String(keys[i]), URL.createObjectURL(blob));
    }
  } finally {
    db.close();
  }
}

async function probePrivate(): Promise<void> {
  if (!import.meta.env.DEV) return;
  const slots: LogoSlot[] = ["center-ice", "jersey"];
  await Promise.all(
    UNIFORMS.flatMap((kit) =>
      slots.map(async (slot) => {
        const n = kit.id + 1;
        const key = logoKey(slot, n);
        try {
          const res = await fetch(`/__private-logos/${slot}/kit-${n}.png`, { method: "HEAD" });
          privateReady.set(key, res.ok);
        } catch {
          privateReady.set(key, false);
        }
      }),
    ),
  );
}

function privateUrlFor(slot: LogoSlot, kitNumber: number): string | null {
  if (!import.meta.env.DEV) return null;
  if (!privateReady.get(logoKey(slot, kitNumber))) return null;
  return `/__private-logos/${slot}/kit-${kitNumber}.png`;
}

/** Resolved URL for one slot and one internal kit id. Null means draw nothing. */
export function resolveLogoUrl(slot: LogoSlot, kitId: number): string | null {
  startLogoLibrary();
  const n = kitId + 1;
  if (!Number.isInteger(kitId) || kitId < 0 || n > UNIFORMS.length) {
    return slot === "center-ice" ? eeUrl : null;
  }
  const key = logoKey(slot, n);
  return pickLogoUrl({
    imported: importedUrls.get(key) ?? null,
    privateUrl: privateUrlFor(slot, n),
    publicUrl: publicUrls.get(key) ?? null,
    eeUrl,
    slot,
  });
}

function centerIceAssigned(kitNumber: number): { url: string | null; anyAssigned: boolean } {
  let anyAssigned = false;
  let url: string | null = null;
  for (const [key, value] of importedUrls) {
    if (!key.startsWith("center-ice:")) continue;
    anyAssigned = true;
    if (key === logoKey("center-ice", kitNumber)) url = value;
  }
  return { url, anyAssigned };
}

/** Ice image for the current mode. Off, and a folder kit with no file, are null. */
export function resolveIceLogoUrl(mode: CenterIceLogo, homeKitId: number, customDataUrl: string | null): string | null {
  startLogoLibrary();
  const kitNumber = homeKitId + 1;
  const assigned =
    Number.isInteger(homeKitId) && kitNumber >= 1 && kitNumber <= UNIFORMS.length
      ? centerIceAssigned(kitNumber)
      : { url: null, anyAssigned: [...importedUrls.keys()].some((key) => key.startsWith("center-ice:")) };
  return iceLogoForMode(mode, {
    eeUrl,
    customUrl: customDataUrl,
    assignedUrl: assigned.url,
    anyAssigned: assigned.anyAssigned,
    privateUrl:
      Number.isInteger(homeKitId) && kitNumber >= 1 && kitNumber <= UNIFORMS.length
        ? privateUrlFor("center-ice", kitNumber)
        : null,
  });
}

function jerseyFolderState(kitId: number): { folderUrl: string | null; anyFolder: boolean } {
  const kitNumber = kitId + 1;
  const want =
    Number.isInteger(kitId) && kitNumber >= 1 && kitNumber <= UNIFORMS.length
      ? logoKey("jersey", kitNumber)
      : null;
  let anyFolder = false;
  let folderUrl: string | null = null;
  for (const [key, value] of importedUrls) {
    if (!/^jersey:\d+$/.test(key)) continue;
    anyFolder = true;
    if (key === want) folderUrl = value;
  }
  return { folderUrl, anyFolder };
}

/** Crest for one worn kit. Off hides every crest. Folder files apply only in folder mode. */
export function resolveJerseyCrestUrl(
  kitId: number,
  homeKitId: number,
  awayKitId: number,
  off: boolean,
  folderMode: boolean,
  homeCustomMode: boolean,
  awayCustomMode: boolean,
): string | null {
  startLogoLibrary();
  let customUrl: string | null = null;
  let customBlank = false;
  if (kitId === homeKitId && homeCustomMode) {
    customUrl = importedUrls.get("jersey-custom:home") ?? null;
    customBlank = customUrl === null;
  } else if (kitId === awayKitId && awayCustomMode) {
    customUrl = importedUrls.get("jersey-custom:away") ?? null;
    customBlank = customUrl === null;
  }
  if (off || customBlank) return null;
  const folder = folderMode ? jerseyFolderState(kitId) : { folderUrl: null, anyFolder: false };
  const kitNumber = kitId + 1;
  const fallback =
    folderMode || !Number.isInteger(kitId) || kitNumber < 1 || kitNumber > UNIFORMS.length
      ? null
      : pickLogoUrl({
          imported: null,
          privateUrl: privateUrlFor("jersey", kitNumber),
          publicUrl: publicUrls.get(logoKey("jersey", kitNumber)) ?? null,
          eeUrl,
          slot: "jersey",
        });
  return jerseyCrestUrl({
    off,
    customUrl,
    folderUrl: folder.folderUrl,
    anyFolder: folderMode,
    fallbackUrl: fallback,
  });
}

export function jerseyCustomSaved(side: "home" | "away"): boolean {
  return importedUrls.has(`jersey-custom:${side}`);
}

export function jerseyFolderSaved(): boolean {
  return jerseyFolderState(0).anyFolder;
}

/** Loaded ice image, or null until that URL finishes decoding. */
export function iceLogoElement(mode: CenterIceLogo, homeKitId: number, customDataUrl: string | null): HTMLImageElement | null {
  const url = resolveIceLogoUrl(mode, homeKitId, customDataUrl);
  if (!url || typeof Image === "undefined") return null;
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = url;
    imageCache.set(url, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

async function writeLibrary(files: readonly LogoFile[], skipped: string[]): Promise<void> {
  libraryEpoch += 1;
  const db = await openDb();
  try {
    const tx = db.transaction(["files", "meta"], "readwrite");
    const store = tx.objectStore("files");
    store.clear();
    for (const file of files) {
      const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
      store.put(new Blob([copy], { type: "image/png" }), logoKey(file.slot, file.kitNumber));
    }
    tx.objectStore("meta").put(
      { at: Date.now(), via: "directory", kept: files.length, skipped: skipped.slice(0, 40) },
      "last-import",
    );
    await txDone(tx);
  } finally {
    db.close();
  }
  remember(files);
  useGame.getState().applyLogoImport();
}

/** Replace the library. An empty set leaves the previous library in place. */
export async function importLogoFiles(files: readonly LogoFile[], skipped: string[]): Promise<LogoImportResult> {
  if (files.length === 0) return { ok: false, kept: 0, skipped, message: emptyMessage(skipped) };
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, skipped, message: "Could not store those logos." };
  }
  await writeLibrary(files, skipped);
  return { ok: true, kept: files.length, skipped, message: statusMessage(files.length, skipped) };
}

function rememberCenterIce(files: readonly LogoFile[]): void {
  for (const key of [...importedUrls.keys()]) {
    if (!key.startsWith("center-ice:")) continue;
    const prev = importedUrls.get(key);
    if (prev) URL.revokeObjectURL(prev);
    importedUrls.delete(key);
  }
  for (const file of files) {
    const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    const blob = new Blob([copy], { type: file.mime ?? "image/png" });
    importedUrls.set(logoKey("center-ice", file.kitNumber), URL.createObjectURL(blob));
  }
}

async function replaceSlot(
  prefix: "center-ice:" | "jersey:",
  files: readonly LogoFile[],
  dropped: number,
  noun: string,
): Promise<LogoImportResult> {
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, skipped: [], message: "Could not store those logos." };
  }
  libraryEpoch += 1;
  const db = await openDb();
  try {
    const existing = await new Promise<IDBValidKey[]>((resolve, reject) => {
      const read = db.transaction("files", "readonly");
      const req = read.objectStore("files").getAllKeys();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction(["files", "meta"], "readwrite");
    const store = tx.objectStore("files");
    for (const key of existing) {
      if (String(key).startsWith(prefix) && /^\d+$/.test(String(key).slice(prefix.length))) store.delete(key);
    }
    for (const file of files) {
      const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
      store.put(new Blob([copy], { type: file.mime ?? "image/png" }), logoKey(file.slot, file.kitNumber));
    }
    tx.objectStore("meta").put(
      { at: Date.now(), via: "directory", kept: files.length, dropped, slot: prefix },
      "last-import",
    );
    await txDone(tx);
  } finally {
    db.close();
  }
  if (prefix === "center-ice:") rememberCenterIce(files);
  else rememberJersey(files);
  if (prefix === "center-ice:") useGame.getState().applyLogoImport();
  else {
    useGame.getState().setJerseyFolderMode(true);
    useGame.getState().bumpLogoLibrary();
  }
  const extra = dropped > 0 ? ` Dropped ${dropped}.` : "";
  return { ok: true, kept: files.length, skipped: [], message: `Assigned ${files.length} ${noun}.${extra}` };
}

function rememberJersey(files: readonly LogoFile[]): void {
  for (const key of [...importedUrls.keys()]) {
    if (!key.startsWith("jersey:") || !/^\d+$/.test(key.slice("jersey:".length))) continue;
    const prev = importedUrls.get(key);
    if (prev) URL.revokeObjectURL(prev);
    importedUrls.delete(key);
  }
  for (const file of files) {
    const copy = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
    importedUrls.set(
      logoKey("jersey", file.kitNumber),
      URL.createObjectURL(new Blob([copy], { type: file.mime ?? "image/png" })),
    );
  }
}

function snapshotFiles(list: Iterable<File>): File[] {
  return Array.from(list);
}

function logFolderPick(kind: "center-ice" | "jersey", received: number, sorted: readonly { name: string }[], kept: number): void {
  const assignments = sorted.slice(0, kept).map((file, index) => `kit-${index + 1}=${file.name}`);
  console.info(
    `[hfb logos] ${kind}: received ${received}, accepted ${sorted.length}, sorted ${sorted.map((file) => file.name).join(", ") || "(none)"}, assigned ${assignments.join(", ") || "(none)"}`,
  );
}

async function readFolderImages(list: Iterable<File>): Promise<{ received: number; images: { name: string; bytes: Uint8Array; mime: string }[] }> {
  const files = snapshotFiles(list);
  const images: { name: string; bytes: Uint8Array; mime: string }[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = imageMime(bytes);
    if (!mime) continue;
    images.push({ name: folderFileName(file), bytes, mime });
  }
  const sorted = assignFolderImages(images, images.length);
  return { received: files.length, images: sorted };
}

/** Folder input. Images are sorted by filename and assigned to kits 1–10. */
export async function importLogoFileList(list: Iterable<File>): Promise<LogoImportResult> {
  const { received, images } = await readFolderImages(list);
  const assigned = images.slice(0, UNIFORMS.length);
  logFolderPick("center-ice", received, images, assigned.length);
  if (assigned.length === 0) return { ok: false, kept: 0, skipped: [], message: "No images found." };
  const files: LogoFile[] = assigned.map((img, index) => ({
    slot: "center-ice",
    kitNumber: index + 1,
    depth: 1,
    label: img.name,
    bytes: img.bytes,
    mime: img.mime,
  }));
  return replaceSlot("center-ice:", files, images.length - assigned.length, files.length === 1 ? "logo" : "logos");
}

/** One image for every player wearing that side's kit. */
export async function importJerseyCustom(side: "home" | "away", file: File): Promise<LogoImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageMime(bytes);
  if (!mime) return { ok: false, kept: 0, skipped: [], message: "That file is not a PNG, JPEG, or WebP." };
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, skipped: [], message: "Could not store those logos." };
  }
  const key = `jersey-custom:${side}`;
  const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  libraryEpoch += 1;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(new Blob([copy], { type: mime }), key);
    await txDone(tx);
  } finally {
    db.close();
  }
  const prev = importedUrls.get(key);
  if (prev) URL.revokeObjectURL(prev);
  importedUrls.set(key, URL.createObjectURL(new Blob([copy], { type: mime })));
  useGame.getState().bumpLogoLibrary();
  return { ok: true, kept: 1, skipped: [], message: side === "home" ? "Home crest saved." : "Away crest saved." };
}

/** Remove one side's custom crest. Folder files and the other side stay. */
export async function clearJerseyCustom(side: "home" | "away"): Promise<LogoImportResult> {
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, skipped: [], message: "Could not clear that crest." };
  }
  const key = `jersey-custom:${side}`;
  libraryEpoch += 1;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(key);
    await txDone(tx);
  } finally {
    db.close();
  }
  const prev = importedUrls.get(key);
  if (prev) URL.revokeObjectURL(prev);
  importedUrls.delete(key);
  useGame.getState().bumpLogoLibrary();
  return { ok: true, kept: 0, skipped: [], message: side === "home" ? "Home crest cleared." : "Away crest cleared." };
}

/** Jersey folder. Same sort and kit 1–10 assignment as center ice, stored separately. */
export async function importJerseyFileList(list: Iterable<File>): Promise<LogoImportResult> {
  const { received, images } = await readFolderImages(list);
  const assigned = images.slice(0, UNIFORMS.length);
  logFolderPick("jersey", received, images, assigned.length);
  if (assigned.length === 0) return { ok: false, kept: 0, skipped: [], message: "No images found." };
  const files: LogoFile[] = assigned.map((img, index) => ({
    slot: "jersey",
    kitNumber: index + 1,
    depth: 1,
    label: img.name,
    bytes: img.bytes,
    mime: img.mime,
  }));
  return replaceSlot("jersey:", files, images.length - assigned.length, files.length === 1 ? "crest" : "crests");
}

/** Drop imported blobs. The private folder and the bundled files stay. */
export async function clearImportedLogos(): Promise<LogoImportResult> {
  if (typeof indexedDB === "undefined") {
    return { ok: false, kept: 0, skipped: [], message: "Could not clear saved logos." };
  }
  libraryEpoch += 1;
  const db = await openDb();
  try {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").clear();
    await txDone(tx);
  } finally {
    db.close();
  }
  revokeImported();
  useGame.getState().bumpLogoLibrary();
  return { ok: true, kept: 0, skipped: [], message: "Using built-in logos." };
}

let started = false;

export function startLogoLibrary(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const epoch = libraryEpoch;
  void (async () => {
    try {
      await hydrateIdb();
    } catch {
      /* keep the public marks */
    }
    try {
      await probePrivate();
    } catch {
      /* public marks still resolve */
    }
    if (epoch === libraryEpoch) useGame.getState().bumpLogoLibrary();
  })();
}

startLogoLibrary();
