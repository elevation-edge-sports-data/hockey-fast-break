/**
 * Kit logo filenames are 1-based. kit-1.png is UNIFORMS id 0.
 * A folder listing that omits a kit does not create a record.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import * as THREE from "three";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const server = await createServer({
  configFile: false,
  root: repo,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true },
});
after(() => server.close());

const zip = await server.ssrLoadModule("/src/game/zipLogos.ts");
const logos = await server.ssrLoadModule("/src/game/logoLibrary.ts");
const uniforms = await server.ssrLoadModule("/src/game/uniforms.ts");
const store = await server.ssrLoadModule("/src/game/store.ts");

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function png(mark) {
  const bytes = new Uint8Array(PNG.length + 1);
  bytes.set(PNG);
  bytes[PNG.length] = mark;
  return bytes;
}

function faceNormal(geo) {
  const pos = geo.attributes.position;
  const index = geo.index.array;
  const a = new THREE.Vector3().fromBufferAttribute(pos, index[0]);
  const b = new THREE.Vector3().fromBufferAttribute(pos, index[1]);
  const c = new THREE.Vector3().fromBufferAttribute(pos, index[2]);
  return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
}

test("kit-N.png is the 1-based UI kit and id N-1", () => {
  assert.equal(uniforms.UNIFORMS.length, 10);
  assert.equal(uniforms.COL_KIT, 0);
  assert.equal(zip.kitNumberFromFile("kit-1.png"), 1);
  assert.equal(zip.kitNumberFromFile("kit-1.png") - 1, uniforms.COL_KIT);
  assert.equal(uniforms.kitName(0), "Kit 1");
  assert.equal(zip.kitNumberFromFile("KIT-10.PNG"), 10);
  assert.equal(zip.kitNumberFromFile("kit-10.png") - 1, 9);
  assert.equal(uniforms.UNIFORMS[9].id, 9);
  assert.equal(zip.kitNumberFromFile("kit-01.png"), null);
  assert.equal(zip.kitNumberFromFile("kit-0.png"), null);
  assert.equal(zip.kitNumberFromFile("kit-11.png"), null);
  assert.equal(zip.kitNumberFromFile("kit-1.jpg"), null);
});

test("a missing mode is Default, and old ee and kit saves map forward", () => {
  assert.equal(store.normalizeCenterIceLogo(null), "default");
  assert.equal(store.normalizeCenterIceLogo("nope"), "default");
  assert.equal(store.normalizeCenterIceLogo("ee"), "default");
  assert.equal(store.normalizeCenterIceLogo("default"), "default");
  assert.equal(store.normalizeCenterIceLogo("kit"), "folder");
  assert.equal(store.normalizeCenterIceLogo("folder"), "folder");
  assert.equal(store.normalizeCenterIceLogo("off"), "off");
  assert.equal(store.normalizeCenterIceLogo("custom"), "custom");
});

test("logo paths accept the three folder depths and keep the slots apart", () => {
  assert.deepEqual(zip.classifyLogoPath("logos/center-ice/kit-1.png"), { slot: "center-ice", kitNumber: 1, depth: 3 });
  assert.deepEqual(zip.classifyLogoPath("Drop/Logos/Jersey/kit-3.PNG"), { slot: "jersey", kitNumber: 3, depth: 4 });
  assert.deepEqual(zip.classifyLogoPath("center-ice/kit-4.png"), { slot: "center-ice", kitNumber: 4, depth: 2 });
  assert.equal(zip.classifyLogoPath("a/b/logos/center-ice/kit-1.png"), null);
  assert.equal(zip.classifyLogoPath("logos/center-ice/kit-01.png"), null);
  assert.equal(zip.classifyLogoPath("logos/center-ice/kit-11.png"), null);
  assert.equal(zip.classifyLogoPath("logos/center-ice/readme.txt"), null);
  assert.equal(zip.classifyLogoPath("logos/notes/kit-1.png"), null);
  const ice = zip.classifyLogoPath("logos/center-ice/kit-1.png");
  const jersey = zip.classifyLogoPath("logos/jersey/kit-1.png");
  assert.notEqual(ice.slot, jersey.slot);
  assert.equal(ice.kitNumber, jersey.kitNumber);
});

test("private logo URLs only allow kit-N.png under the two slots", () => {
  assert.equal(zip.privateLogoRel("/__private-logos/center-ice/kit-1.png", 10), "center-ice/kit-1.png");
  assert.equal(zip.privateLogoRel("/__private-logos/Jersey/Kit-10.PNG", 10), "jersey/kit-10.png");
  assert.equal(zip.privateLogoRel("/__private-logos/center-ice/kit-01.png", 10), null);
  assert.equal(zip.privateLogoRel("/__private-logos/center-ice/kit-11.png", 10), null);
  assert.equal(zip.privateLogoRel("/__private-logos/../private-logos/logos/center-ice/kit-1.png", 10), null);
  assert.equal(zip.privateLogoRel("/__private-logos/center-ice/kit-1.jpg", 10), null);
  assert.equal(zip.privateLogoRel("/logos/center-ice/kit-1.png", 10), null);
});

test("resolution uses the import, then the private file, then the public file", () => {
  assert.equal(
    zip.pickLogoUrl({ imported: "blob:ice", privateUrl: "priv", publicUrl: "pub", eeUrl: "ee", slot: "center-ice" }),
    "blob:ice",
  );
  assert.equal(
    zip.pickLogoUrl({ imported: null, privateUrl: "priv", publicUrl: "pub", eeUrl: "ee", slot: "jersey" }),
    "priv",
  );
  assert.equal(
    zip.pickLogoUrl({ imported: null, privateUrl: null, publicUrl: "pub", eeUrl: "ee", slot: "jersey" }),
    "pub",
  );
  assert.equal(
    zip.pickLogoUrl({ imported: null, privateUrl: null, publicUrl: null, eeUrl: "ee", slot: "center-ice" }),
    "ee",
  );
  assert.equal(
    zip.pickLogoUrl({ imported: null, privateUrl: null, publicUrl: null, eeUrl: "ee", slot: "jersey" }),
    null,
  );
});

test("a folder listing keeps matching pngs and a missing kit is not a record", () => {
  const parsed = zip.collectLogoFiles([
    { path: "logos/center-ice/kit-1.png", bytes: png(1) },
    { path: "logos/jersey/kit-1.png", bytes: png(2) },
    { path: "logos/center-ice/kit-01.png", bytes: png(3) },
    { path: "logos/jersey/kit-11.png", bytes: png(4) },
    { path: "logos/center-ice/readme.txt", bytes: png(5) },
    { path: "notes.png", bytes: png(6) },
  ]);
  assert.deepEqual(
    parsed.records.map((r) => `${r.slot}:${r.kitNumber}:${r.bytes[8]}`),
    ["center-ice:1:1", "jersey:1:2"],
  );
  assert.equal(parsed.records.some((r) => r.kitNumber === 2), false);
  assert.ok(parsed.skipped.some((s) => s.includes("kit-01.png")));
  assert.ok(parsed.skipped.some((s) => s.includes("kit-11.png")));
});

test("webkitRelativePath layouts and a shallower duplicate win", () => {
  const parsed = zip.collectLogoFiles([
    { path: "logos/center-ice/kit-2.png", bytes: png(9) },
    { path: "center-ice/kit-2.png", bytes: png(8) },
    { path: "pack/logos/jersey/kit-5.png", bytes: png(5) },
    { path: "jersey/kit-10.png", bytes: png(10) },
  ]);
  const ice = parsed.records.find((r) => r.slot === "center-ice" && r.kitNumber === 2);
  const jersey = parsed.records.find((r) => r.slot === "jersey" && r.kitNumber === 5);
  const tenth = parsed.records.find((r) => r.kitNumber === 10);
  assert.equal(ice.bytes[8], 8);
  assert.equal(ice.depth, 2);
  assert.equal(jersey.bytes[8], 5);
  assert.equal(tenth.slot, "jersey");
});

test("folder names use the file name, not the webkitRelativePath folders", () => {
  assert.equal(zip.folderFileName({ name: "image.png", webkitRelativePath: "" }), "image.png");
  assert.equal(zip.folderFileName({ name: "kit-1.png", webkitRelativePath: "jersey/kit-1.png" }), "kit-1.png");
  assert.equal(zip.folderFileName({ name: "ignored.png", webkitRelativePath: "pack/center-ice/kit-2.png" }), "kit-2.png");
});

test("folder images sort numerically and extras past the kit count are dropped", () => {
  const pngBytes = png(1);
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0x00]);
  const webp = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  assert.equal(zip.imageMime(pngBytes), "image/png");
  assert.equal(zip.imageMime(jpeg), "image/jpeg");
  assert.equal(zip.imageMime(webp), "image/webp");
  assert.equal(zip.imageMime(Uint8Array.from([1, 2, 3, 4])), null);
  const assigned = zip.assignFolderImages(
    [{ name: "team10.png" }, { name: "team2.png" }, { name: "team1.png" }, { name: "extra.png" }],
    3,
  );
  assert.deepEqual(
    assigned.map((file) => file.name),
    ["extra.png", "team1.png", "team2.png"],
  );
  assert.equal(zip.assignFolderImages([{ name: "b.png" }, { name: "a.png" }], 10).length, 2);
});

test("folder mode drops kits without a file, and Default ignores the folder", () => {
  const blank = {
    eeUrl: "ee",
    customUrl: "data:image/png;base64,abc",
    assignedUrl: null,
    anyAssigned: true,
    privateUrl: "private",
  };
  assert.equal(zip.iceLogoForMode("default", blank), "ee");
  assert.equal(zip.iceLogoForMode("ee", blank), "ee");
  assert.equal(zip.iceLogoForMode("custom", blank), "data:image/png;base64,abc");
  assert.equal(zip.iceLogoForMode("custom", { ...blank, customUrl: null }), null);
  assert.equal(zip.iceLogoForMode("off", blank), null);
  assert.equal(zip.iceLogoForMode("folder", blank), null);
  assert.equal(
    zip.iceLogoForMode("folder", { ...blank, assignedUrl: "blob:kit2" }),
    "blob:kit2",
  );
  assert.equal(
    zip.iceLogoForMode("folder", { ...blank, anyAssigned: false, assignedUrl: null }),
    "private",
  );
});

test("jersey crests prefer a side image, then the folder kit, then the fallback", () => {
  const base = { off: false, customUrl: null, folderUrl: null, anyFolder: false, fallbackUrl: "public" };
  assert.equal(zip.jerseyCrestUrl({ ...base, off: true, customUrl: "home" }), null);
  assert.equal(zip.jerseyCrestUrl({ ...base, customUrl: "home", folderUrl: "kit" }), "home");
  assert.equal(zip.jerseyCrestUrl({ ...base, folderUrl: "kit", anyFolder: true }), "kit");
  assert.equal(zip.jerseyCrestUrl({ ...base, anyFolder: true }), null);
  assert.equal(zip.jerseyCrestUrl(base), "public");
  assert.equal(zip.jerseyCrestUrl({ ...base, fallbackUrl: null }), null);
});

test("a bad png signature is skipped and an empty folder does not replace the library", async () => {
  const parsed = zip.collectLogoFiles([
    { path: "logos/center-ice/kit-1.png", bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]) },
  ]);
  assert.equal(parsed.records.length, 0);
  assert.ok(parsed.skipped.some((s) => s.includes("not a png")));
  const empty = await logos.importLogoFiles([], parsed.skipped);
  assert.equal(empty.ok, false);
  assert.match(empty.message, /No kit logos found/);
});

test("the chest plane faces +Z and a half turn faces the back", () => {
  const geo = new THREE.PlaneGeometry(0.16, 0.16);
  const front = faceNormal(geo);
  assert.ok(front.z > 0.99, `crest normal z ${front.z}`);
  const mesh = new THREE.Mesh(geo);
  mesh.rotation.y = Math.PI;
  mesh.updateMatrixWorld(true);
  const back = front.clone().transformDirection(mesh.matrixWorld);
  assert.ok(back.z < -0.99, `back-number normal z ${back.z}`);
});
