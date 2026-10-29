import assert from "node:assert/strict";
import test from "node:test";
import {
  FUNCTION_ARGS,
  FUNCTION_VIEWS,
  functionArgSpecs,
  functionViewGoalie,
  functionViewerArgValues,
  functionViewerPreview,
  primaryArg,
  resetFunctionViewerArgs,
  setFunctionViewerActive,
  setFunctionViewerArg,
  setFunctionViewerId,
  setFunctionViewerMesh,
} from "../src/game/functionViewer.ts";

const IDS = [
  "poseSkaterReady",
  "poseNeutralCarry",
  "poseBurstCarry",
  "posePoke",
  "posePuckDrop",
  "poseFaceoffDraw",
  "poseWristLeg",
  "poseSlapLeg",
  "poseCheer",
  "poseBrawl",
  "poseDefaultSkate",
  "poseCarrySkate",
  "poseDive",
  "poseTumble",
  "poseCheckDeliver",
  "poseCheckReceive",
  "poseWristSequence",
  "poseSlapSequence",
  "poseRefLeg",
  "poseRefChecked",
  "poseGoalieStance",
  "poseGoalieArms",
  "poseGoaliePads",
  "poseGoalieZLimbs",
  "poseGoalieZArms",
  "poseGoalieButterflyLimbs",
  "poseGoalieButterflyStanceLimbs",
  "poseGoalieButterflyArms",
  "poseGoaliePlay",
  "poseGoalieCheer",
  "poseGoalieCover",
  "poseGoalieGetUp",
];

test("the visualizer lists the live procedural functions", () => {
  assert.deepEqual(
    FUNCTION_VIEWS.map((row) => row.id),
    IDS,
  );
  assert.equal(functionViewGoalie("poseGoaliePads"), true);
  assert.equal(functionViewGoalie("poseSkaterReady"), false);
  assert.equal(functionViewGoalie("poseBrawl"), false);
  assert.equal(functionViewGoalie("poseRefChecked"), false);
});

const ARG_NAMES = {
  poseSkaterReady: ["weight"],
  poseNeutralCarry: ["weight", "shX", "armZ"],
  poseBurstCarry: ["weight", "stride"],
  posePoke: ["progress"],
  poseWristLeg: ["knee", "hip", "drop", "lift", "flat"],
  poseSlapLeg: ["knee", "hip", "abduct", "lift", "wide"],
  poseCheer: ["celebrate"],
  poseBrawl: ["kind", "swing"],
  poseDefaultSkate: ["stride"],
  poseCarrySkate: ["stride", "carry"],
  poseDive: ["diveU", "stride"],
  poseTumble: ["progress", "stride"],
  poseCheckDeliver: ["influence", "side"],
  poseCheckReceive: ["absorb"],
  poseWristSequence: ["progress", "backhand"],
  poseSlapSequence: ["progress"],
  posePuckDrop: ["keepStick"],
  poseFaceoffDraw: ["sweep"],
  poseRefLeg: ["x", "thigh", "knee", "bootX", "roll"],
  poseRefChecked: ["struck", "tumble", "tumbleSpin"],
  poseGoalieStance: ["cover"],
  poseGoalieArms: ["cover"],
  poseGoaliePads: ["cover", "lPad", "rPad", "bank"],
  poseGoalieZLimbs: ["torso", "thigh", "shin", "abduct", "shinOut", "bank"],
  poseGoalieZArms: ["kind"],
  poseGoalieButterflyLimbs: ["progress"],
  poseGoalieButterflyStanceLimbs: ["bank"],
  poseGoalieButterflyArms: ["progress"],
  poseGoaliePlay: ["puckX", "puckZ", "padFront"],
  poseGoalieCheer: ["pump"],
  poseGoalieCover: ["cover"],
  poseGoalieGetUp: ["p"],
};

test("each function lists its scalar arguments and a play target", () => {
  for (const id of IDS) {
    const specs = functionArgSpecs(id);
    assert.deepEqual(
      specs.map((arg) => arg.name),
      ARG_NAMES[id],
    );
    const primary = specs.find((arg) => arg.primary);
    if (specs.some((arg) => arg.kind === "number")) assert.ok(primary);
    assert.equal(primaryArg(id)?.name, primary?.name);
  }
  assert.equal(functionViewerArgValues("poseSkaterReady").weight, 1);
  assert.equal(functionViewerArgValues("poseNeutralCarry").shX, 0);
  assert.equal(functionViewerArgValues("poseBurstCarry").stride, 0);
  assert.equal(functionViewerArgValues("posePoke").progress, 1);
  assert.equal(functionViewerArgValues("poseWristLeg").flat, true);
  assert.equal(functionViewerArgValues("poseSlapLeg").wide, false);
  assert.equal(functionViewerArgValues("poseCheer").celebrate, 0);
  assert.equal(functionViewerArgValues("poseGoalieCheer").pump, 0.5);
  assert.equal(functionViewerArgValues("poseGoalieCover").cover, 1);
  assert.equal(functionViewerArgValues("poseGoalieGetUp").p, 0.42);
  assert.equal(functionViewerArgValues("poseBrawl").kind, 0);
  assert.equal(functionViewerArgValues("poseBrawl").swing, 0.5);
  assert.equal(FUNCTION_ARGS.poseGoaliePads.find((arg) => arg.name === "lPad")?.default, 0.18);
});

test("scrubbing an argument stores the live value and stays off in play", () => {
  resetFunctionViewerArgs("poseBurstCarry");
  setFunctionViewerArg("poseBurstCarry", "stride", 1.25);
  setFunctionViewerArg("poseBurstCarry", "weight", 0.4);
  assert.equal(functionViewerArgValues("poseBurstCarry").stride, 1.25);
  assert.equal(functionViewerArgValues("poseBurstCarry").weight, 0.4);
  setFunctionViewerArg("poseBrawl", "kind", 1);
  assert.equal(functionViewerArgValues("poseBrawl").kind, 1);
  setFunctionViewerArg("poseWristLeg", "flat", false);
  assert.equal(functionViewerArgValues("poseWristLeg").flat, false);
  setFunctionViewerActive(false);
  setFunctionViewerId("poseBurstCarry");
  setFunctionViewerMesh(2);
  assert.equal(functionViewerPreview(2), null);
  resetFunctionViewerArgs("poseBurstCarry");
  resetFunctionViewerArgs("poseBrawl");
  resetFunctionViewerArgs("poseWristLeg");
  setFunctionViewerId(null);
  setFunctionViewerMesh(null);
});

test("a selected function is hidden until the visualizer is active", () => {
  setFunctionViewerActive(false);
  setFunctionViewerId("poseCheer");
  setFunctionViewerMesh(3);
  assert.equal(functionViewerPreview(3), null);
  setFunctionViewerActive(true);
  assert.equal(functionViewerPreview(3), "poseCheer");
  assert.equal(functionViewerPreview(0), null);
  setFunctionViewerActive(false);
  setFunctionViewerId(null);
  setFunctionViewerMesh(null);
  assert.equal(functionViewerPreview(3), null);
});
