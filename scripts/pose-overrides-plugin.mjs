/**
 * Dev-server writer for src/game/poseOverrides.json.
 * The pose editor POSTs one named pose. Pack builds read the same file.
 */
import { copyFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const POSE_JOINTS = [
  "body",
  "torso",
  "hips",
  "shoulders",
  "head",
  "lArm",
  "lFore",
  "lHand",
  "rArm",
  "rFore",
  "rHand",
  "lLeg",
  "lShin",
  "lBoot",
  "rLeg",
  "rShin",
  "rBoot",
  "stick",
  "shaftHold",
  "bladeGrp",
];

const POSE_NAME = /^[a-zA-Z][a-zA-Z0-9-]{0,40}$/;

export function poseOverridesPath(root) {
  return join(root, "src", "game", "poseOverrides.json");
}

export function poseOverridesExamplePath(root) {
  return join(root, "src", "game", "poseOverrides.example.json");
}

/** Local file when it exists. Otherwise the committed empty example. */
export function poseOverridesDataPath(root) {
  const local = poseOverridesPath(root);
  return existsSync(local) ? local : poseOverridesExamplePath(root);
}

export function readPoseOverrides(root) {
  const data = JSON.parse(readFileSync(poseOverridesDataPath(root), "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("poseOverrides.json must be an object");
  }
  return data;
}

export function formatPoseFile(data) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function mergePoseOverride(file, pose, joints) {
  return { ...file, [pose]: joints };
}

export function parsePoseSave(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("pose save must be an object");
  }
  const pose = body.pose;
  if (typeof pose !== "string" || !POSE_NAME.test(pose)) {
    throw new Error("pick a named pose");
  }
  const raw = body.joints;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("pose joints must be an object");
  }
  const joints = {};
  for (const id of POSE_JOINTS) {
    if (!(id in raw)) continue;
    const triple = raw[id];
    if (!Array.isArray(triple) || triple.length < 3) throw new Error(`bad joint ${id}`);
    const count = triple.length >= 6 ? 6 : 3;
    const nums = [];
    for (let i = 0; i < count; i++) {
      const n = Number(triple[i]);
      if (!Number.isFinite(n)) throw new Error(`bad joint ${id}`);
      nums.push(n);
    }
    joints[id] = nums;
  }
  if (Object.keys(joints).length === 0) throw new Error("pose has no joints");
  return { pose, joints };
}

export function writePoseOverride(root, pose, joints) {
  const path = poseOverridesPath(root);
  const next = mergePoseOverride(readPoseOverrides(root), pose, joints);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, formatPoseFile(next));
  copyFileSync(tmp, path);
  unlinkSync(tmp);
  return next;
}

export function poseOverrideSummary(root) {
  const data = readPoseOverrides(root);
  const names = Object.keys(data);
  return names.length ? names.join(", ") : "none";
}

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.end(body);
}

export function isPoseOverrideHotFile(file) {
  const norm = String(file).replaceAll("\\", "/");
  return norm.endsWith("/src/game/poseOverrides.json") || norm.endsWith("/src/game/poseOverrides.json.tmp");
}

/** Bundle src/game/poseOverrides.json when it exists, otherwise the committed example. */
export function poseOverridesDataPlugin() {
  return {
    name: "hfb-pose-overrides-data",
    enforce: "pre",
    resolveId(source) {
      const norm = String(source).replaceAll("\\", "/");
      if (!norm.endsWith("poseOverrides.example.json") && !norm.endsWith("poseOverrides.json")) return null;
      return poseOverridesDataPath(process.cwd());
    },
  };
}

export function poseOverridesPlugin() {
  return {
    name: "hfb-pose-overrides",
    apply: "serve",
    handleHotUpdate(ctx) {
      if (isPoseOverrideHotFile(ctx.file)) return [];
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?", 1)[0];
        if (pathOnly !== "/api/pose-overrides") {
          next();
          return;
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") {
          send(res, 204, "");
          return;
        }
        if (req.method === "GET") {
          try {
            send(res, 200, formatPoseFile(readPoseOverrides(server.config.root)), "application/json; charset=utf-8");
          } catch (err) {
            send(res, 500, err instanceof Error ? err.message : "pose overrides unreadable");
          }
          return;
        }
        if (req.method !== "POST") {
          next();
          return;
        }
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1_000_000) {
            send(res, 413, "pose save is too large");
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => {
          if (res.writableEnded) return;
          try {
            const parsed = parsePoseSave(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            writePoseOverride(server.config.root, parsed.pose, parsed.joints);
            send(res, 200, JSON.stringify({ ok: true, pose: parsed.pose }), "application/json; charset=utf-8");
          } catch (err) {
            send(res, 400, err instanceof Error ? err.message : "bad pose");
          }
        });
      });
    },
  };
}
