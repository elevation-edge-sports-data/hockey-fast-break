/**
 * Save one pose and rebuild the galleries, the pose editor, and the game.
 *
 *   node scripts/pose-save-server.mjs
 *
 * The standalone editor POSTs to http://localhost:8081/save
 * with { poseName, joints }. This writes src/game/poseOverrides.json, then
 * runs pack-galleries, pack-pose-editor, and pack-play, in that order.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parsePoseSave, writePoseOverride } from "./pose-overrides-plugin.mjs";

export const PORT = 8081;
export const PUBLIC_POSE_IDS = [
  "default",
  "ready",
  "backSkate",
  "strideLeft",
  "strideRight",
  "faceoff",
  "coast",
  "puckPossess1",
  "puckPossess2",
  "autoDeke1",
  "autoDeke2",
  "forehandDeke",
  "backhandDeke",
  "speedPuckLeft",
  "speedPuckRight",
  "wrist",
  "wristFollow",
  "backhandShot",
  "backhandFollow",
  "slap",
  "slapFollow",
  "snap",
  "snapFollow",
  "shoulderCheck1",
  "shoulderCheck2",
  "absorb",
  "poke",
  "dive",
  "divePoke",
  "knockout",
  "recover",
  "celebrate",
  "rage1",
  "rage2",
  "fight",
  "bench",
  "goalieUpright",
  "goalieRage1",
  "goalieRage2",
  "goalieButterfly",
  "goalieMid",
  "goaliePerimeter",
  "goalieCheer",
  "goalieBench",
  "goaliePlay",
  "goalieCover",
  "goalieGloveSave",
  "goalieBlockerSave",
  "goalieProtectLeft",
  "goalieProtectRight",
  "goalieDivingGloveSave",
  "goalieDivingStickSave",
  "goalieGetUp",
];
export const PACK_SCRIPTS = [
  "scripts/pack-galleries.mjs",
  "scripts/pack-pose-editor.mjs",
  "scripts/pack-pose-editor-public.mjs",
  "scripts/pack-play.mjs",
];

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export function poseSaveBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  if (body.pose) return body;
  if (typeof body.poseName === "string") return { ...body, pose: body.poseName };
  return body;
}

function runPack(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, script)], {
      cwd: root,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
      err = (err + chunk.toString()).slice(-1500);
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited ${code}${err ? `: ${err.trim()}` : ""}`));
    });
  });
}

export async function saveAndRebuild(body, run = runPack, writeRoot = root) {
  const parsed = parsePoseSave(poseSaveBody(body));
  if (body?.publicOnly && !PUBLIC_POSE_IDS.includes(parsed.pose)) {
    throw new Error("That pose cannot be saved from the public editor.");
  }
  writePoseOverride(writeRoot, parsed.pose, parsed.joints);
  for (const script of PACK_SCRIPTS) await run(script);
  return { ok: true, pose: parsed.pose };
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

let busy = false;

export function createPoseSaveServer() {
  return createServer((req, res) => {
    const pathOnly = (req.url ?? "").split("?", 1)[0];
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Allow-Private-Network", "true");
      res.end();
      return;
    }
    if (req.method !== "POST" || pathOnly !== "/save") {
      send(res, 404, { ok: false, error: "POST /save" });
      return;
    }
    if (busy) {
      send(res, 409, { ok: false, error: "A rebuild is already running." });
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        send(res, 413, { ok: false, error: "pose save is too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (res.writableEnded) return;
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        send(res, 400, { ok: false, error: "pose save must be JSON" });
        return;
      }
      busy = true;
      const pose = poseSaveBody(body)?.pose ?? "?";
      console.log(`saving ${pose}, then rebuilding galleries, editor, and game`);
      saveAndRebuild(body)
        .then((result) => {
          console.log(`saved and rebuilt ${result.pose}`);
          send(res, 200, { ok: true });
        })
        .catch((err) => {
          const error = err instanceof Error ? err.message : "save failed";
          const status = /exited \d/.test(error) ? 500 : 400;
          console.error(error);
          send(res, status, { ok: false, error });
        })
        .finally(() => {
          busy = false;
        });
    });
  });
}

function listen(server, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(PORT, host);
  });
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const server = createPoseSaveServer();
  await listen(server, "127.0.0.1");
  console.log(`pose save server on http://127.0.0.1:${PORT}/save`);
  const v6 = createPoseSaveServer();
  try {
    await listen(v6, "::1");
    console.log(`pose save server on http://localhost:${PORT}/save`);
  } catch {
    v6.close();
  }
}
