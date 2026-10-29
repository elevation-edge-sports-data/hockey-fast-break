/**
 * The function visualizer must list every full-body pose function, and nothing else.
 *
 * node scripts/function-viewer-check.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Pure helpers. They are not full-body poses and stay out of the viewer. */
const HELPERS = new Set([
  "poseArmIk",
  "poseGloveAt",
  "poseWristBlade",
  "posePokeLeg",
  "posePokeReachArms",
  "poseCheerReach",
  "poseCheerStick",
  "poseStickOneHand",
  "poseGoalieHand",
  "poseZShin",
  "poseZLeg",
  "poseButterflyLeg",
  "poseButterflyStanceLeg",
  "posePlayBlocker",
  "poseGoalieIk",
  "poseCheckArms",
]);

/**
 * One bone or one prop. Not a full-body pose.
 * poseGoalieArms is not here: it poses both arms and is listed.
 */
const SINGLE_PART = new Set([
  "posePokeStraightArm",
  "posePokeBlade",
  "poseGoalieStick",
  "poseGoalieShin",
  "poseGoalieBoot",
]);

/** Inline live-frame poses. They have to stay registered even if a later filter would drop them. */
const REQUIRED = [
  "poseDefaultSkate",
  "poseCarrySkate",
  "poseDive",
  "poseTumble",
  "poseCheckDeliver",
  "poseCheckReceive",
  "poseWristSequence",
  "poseSlapSequence",
];

const SOURCES = ["src/game/PlayerMesh.tsx", "src/game/goalieStance.ts"];

function poseFunctions(text) {
  const names = new Set();
  const re = /^(?:export )?function (pose[A-Z]\w*)\b/gm;
  for (const match of text.matchAll(re)) names.add(match[1]);
  return names;
}

function viewerFunctions(text) {
  const names = new Set();
  const re = /id: "(pose[A-Z]\w*)"/g;
  for (const match of text.matchAll(re)) names.add(match[1]);
  return names;
}

const source = new Set();
for (const file of SOURCES) {
  for (const name of poseFunctions(readFileSync(join(root, file), "utf8"))) source.add(name);
}

const fullBody = [...source].filter((name) => !HELPERS.has(name) && !SINGLE_PART.has(name)).sort();
const viewer = [...viewerFunctions(readFileSync(join(root, "src/game/functionViewer.ts"), "utf8"))].sort();
const viewerSet = new Set(viewer);
const fullSet = new Set(fullBody);
const missing = fullBody.filter((name) => !viewerSet.has(name));
for (const name of REQUIRED) {
  if (!source.has(name) || !viewerSet.has(name)) missing.push(name);
}
const extra = viewer.filter((name) => !fullSet.has(name));

console.log(`full-body pose functions: ${fullBody.length}`);
console.log(`visualizer entries: ${viewer.length}`);
if (missing.length) console.log(`missing from the visualizer:\n${missing.map((name) => `  ${name}`).join("\n")}`);
else console.log("missing from the visualizer: none");
if (extra.length) console.log(`in the visualizer but not a full-body pose:\n${extra.map((name) => `  ${name}`).join("\n")}`);
else console.log("in the visualizer but not a full-body pose: none");

if (missing.length || extra.length) process.exit(1);
