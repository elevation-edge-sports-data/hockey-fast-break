import { setGateActive, setGateMesh, setGateSelected, setViewerArgReader } from "./functionViewerGate.ts";

/** Procedural functions the visualizer can show. Live play does not read this. */
export const FUNCTION_VIEWS = [
  { id: "poseSkaterReady", label: "poseSkaterReady", mesh: "skater" },
  { id: "poseNeutralCarry", label: "poseNeutralCarry", mesh: "skater" },
  { id: "poseBurstCarry", label: "poseBurstCarry", mesh: "skater" },
  { id: "posePoke", label: "posePoke", mesh: "skater" },
  { id: "posePuckDrop", label: "posePuckDrop", mesh: "skater" },
  { id: "poseFaceoffDraw", label: "poseFaceoffDraw", mesh: "skater" },
  { id: "poseWristLeg", label: "poseWristLeg", mesh: "skater" },
  { id: "poseSlapLeg", label: "poseSlapLeg", mesh: "skater" },
  { id: "poseCheer", label: "poseCheer", mesh: "skater" },
  { id: "poseBrawl", label: "poseBrawl", mesh: "skater" },
  { id: "poseDefaultSkate", label: "poseDefaultSkate", mesh: "skater" },
  { id: "poseCarrySkate", label: "poseCarrySkate", mesh: "skater" },
  { id: "poseDive", label: "poseDive", mesh: "skater" },
  { id: "poseTumble", label: "poseTumble", mesh: "skater" },
  { id: "poseCheckDeliver", label: "poseCheckDeliver", mesh: "skater" },
  { id: "poseCheckReceive", label: "poseCheckReceive", mesh: "skater" },
  { id: "poseWristSequence", label: "poseWristSequence", mesh: "skater" },
  { id: "poseSlapSequence", label: "poseSlapSequence", mesh: "skater" },
  { id: "poseRefLeg", label: "poseRefLeg", mesh: "ref" },
  { id: "poseRefChecked", label: "poseRefChecked", mesh: "ref" },
  { id: "poseGoalieStance", label: "poseGoalieStance", mesh: "goalie" },
  { id: "poseGoalieArms", label: "poseGoalieArms", mesh: "goalie" },
  { id: "poseGoaliePads", label: "poseGoaliePads", mesh: "goalie" },
  { id: "poseGoalieZLimbs", label: "poseGoalieZLimbs", mesh: "goalie" },
  { id: "poseGoalieZArms", label: "poseGoalieZArms", mesh: "goalie" },
  { id: "poseGoalieButterflyLimbs", label: "poseGoalieButterflyLimbs", mesh: "goalie" },
  { id: "poseGoalieButterflyStanceLimbs", label: "poseGoalieButterflyStanceLimbs", mesh: "goalie" },
  { id: "poseGoalieButterflyArms", label: "poseGoalieButterflyArms", mesh: "goalie" },
  { id: "poseGoaliePlay", label: "poseGoaliePlay", mesh: "goalie" },
  { id: "poseGoalieCheer", label: "poseGoalieCheer", mesh: "goalie" },
  { id: "poseGoalieCover", label: "poseGoalieCover", mesh: "goalie" },
  { id: "poseGoalieGetUp", label: "poseGoalieGetUp", mesh: "goalie" },
] as const;

export type FunctionMesh = (typeof FUNCTION_VIEWS)[number]["mesh"];

export type FunctionViewId = (typeof FUNCTION_VIEWS)[number]["id"];

export type ViewerValue = number | boolean;

/** A scalar the preview can scrub. Mesh groups and layout objects are not listed. */
export type FunctionArgSpec = {
  name: string;
  kind: "number" | "boolean";
  min: number;
  max: number;
  step: number;
  default: ViewerValue;
  /** Play loops this one. The others stay put. */
  primary?: boolean;
};

const DEG = Math.PI / 180;
const KNEE_R = Math.PI / 2;
const HIP_PLANT = 38 * DEG;
const SLAP_KNEE = 60 * DEG;
const SLAP_HIP = 15 * DEG;
const SLAP_ABDUCT = 22 * DEG;
/** goalieStance.ts GOALIE_Z.mid. The Z-limb sliders start on that crouch. */
const Z_MID = { torso: 31.5 * DEG, thigh: 58 * DEG, shin: 54 * DEG, abduct: 30 * DEG, shinOut: 16 * DEG };

function num(name: string, min: number, max: number, step: number, value: number, primary = false): FunctionArgSpec {
  return { name, kind: "number", min, max, step, default: value, primary };
}

function flag(name: string, value: boolean): FunctionArgSpec {
  return { name, kind: "boolean", min: 0, max: 1, step: 1, default: value };
}

export const FUNCTION_ARGS: Record<FunctionViewId, readonly FunctionArgSpec[]> = {
  poseSkaterReady: [num("weight", 0, 1, 0.01, 1, true)],
  poseNeutralCarry: [num("weight", 0, 1, 0.01, 1, true), num("shX", -0.4, 0.4, 0.01, 0), num("armZ", -0.4, 0.4, 0.01, 0)],
  poseBurstCarry: [num("weight", 0, 1, 0.01, 1), num("stride", 0, Math.PI * 2, 0.01, 0, true)],
  posePoke: [num("progress", 0, 1, 0.01, 1, true)],
  poseWristLeg: [
    num("knee", 0, Math.PI, 0.01, KNEE_R),
    num("hip", -0.4, 1.4, 0.01, HIP_PLANT),
    num("drop", -0.35, 0.2, 0.01, -0.05),
    num("lift", 0, 1, 0.01, 0, true),
    flag("flat", true),
  ],
  poseSlapLeg: [
    num("knee", 0, Math.PI, 0.01, SLAP_KNEE),
    num("hip", -0.4, 1.4, 0.01, SLAP_HIP),
    num("abduct", 0, 1.2, 0.01, SLAP_ABDUCT),
    num("lift", 0, 1, 0.01, 0, true),
    flag("wide", false),
  ],
  poseCheer: [num("celebrate", 0, 2, 0.01, 0, true)],
  poseBrawl: [num("kind", 0, 1, 1, 0), num("swing", 0, 1, 0.01, 0.5, true)],
  poseDefaultSkate: [num("stride", 0, Math.PI * 2, 0.01, 0, true)],
  poseCarrySkate: [num("stride", 0, Math.PI * 2, 0.01, 0, true), num("carry", 0, 1, 0.01, 1)],
  poseDive: [num("diveU", 0, 1, 0.01, 1, true), num("stride", 0, Math.PI * 2, 0.01, 0)],
  poseTumble: [num("progress", 0, 1, 0.01, 0, true), num("stride", 0, Math.PI * 2, 0.01, 0)],
  poseCheckDeliver: [num("influence", 0, 1, 0.01, 1, true), num("side", -1, 1, 2, 1)],
  poseCheckReceive: [num("absorb", 0, 1, 0.01, 1, true)],
  poseWristSequence: [num("progress", 0, 1, 0.01, 0, true), flag("backhand", false)],
  poseSlapSequence: [num("progress", 0, 1, 0.01, 0, true)],
  posePuckDrop: [flag("keepStick", false)],
  poseFaceoffDraw: [num("sweep", 0, 1, 0.01, 0, true)],
  poseRefLeg: [
    num("x", 0.08, 0.28, 0.01, 0.13),
    num("thigh", -0.5, 1.5, 0.01, 0.4, true),
    num("knee", 0, 1.8, 0.01, 0.5),
    num("bootX", -1.2, 0.6, 0.01, -0.2),
    num("roll", -0.6, 0.6, 0.01, 0),
  ],
  poseRefChecked: [num("struck", 0, 1.68, 0.01, 1, true), num("tumble", -1.3, 1.3, 0.01, 1), num("tumbleSpin", -1.3, 1.3, 0.01, 0)],
  poseGoalieStance: [num("cover", 0, 1, 0.01, 0, true)],
  poseGoalieArms: [num("cover", 0, 1, 0.01, 0, true)],
  poseGoaliePads: [num("cover", 0, 1, 0.01, 0), num("lPad", 0, 1, 0.01, 0.18, true), num("rPad", 0, 1, 0.01, 0.18), num("bank", -1, 1, 0.01, 0)],
  poseGoalieZLimbs: [
    num("torso", -0.2, 1.2, 0.01, Z_MID.torso),
    num("thigh", -0.2, 1.6, 0.01, Z_MID.thigh, true),
    num("shin", -0.2, 1.8, 0.01, Z_MID.shin),
    num("abduct", -0.8, 1.2, 0.01, Z_MID.abduct),
    num("shinOut", -0.2, 1.6, 0.01, Z_MID.shinOut),
    num("bank", -0.6, 0.6, 0.01, 0),
  ],
  poseGoalieZArms: [num("kind", 0, 3, 1, 2, true)],
  poseGoalieButterflyLimbs: [num("progress", 0, 1, 0.01, 1, true)],
  poseGoalieButterflyStanceLimbs: [num("bank", -0.6, 0.6, 0.01, 0, true)],
  poseGoalieButterflyArms: [num("progress", 0, 1, 0.01, 1, true)],
  poseGoaliePlay: [num("puckX", -6, 6, 0.01, 0), num("puckZ", -6, 6, 0.01, -1.2, true), num("padFront", 0, 1.6, 0.01, 0.42)],
  poseGoalieCheer: [num("pump", 0, 1, 0.01, 0.5, true)],
  poseGoalieCover: [num("cover", 0, 1, 0.01, 1, true)],
  poseGoalieGetUp: [num("p", 0, 1, 0.01, 0.42, true)],
};

const stored: Partial<Record<FunctionViewId, Record<string, ViewerValue>>> = {};

export function setFunctionViewerActive(on: boolean): void {
  setGateActive(on);
}

export function setFunctionViewerMesh(index: number | null): void {
  setGateMesh(index);
}

export function setFunctionViewerId(id: FunctionViewId | null): void {
  setGateSelected(id, id != null && functionViewGoalie(id));
}

export {
  functionViewerPreview,
  functionViewerRef,
  viewerFlag,
  viewerNum,
} from "./functionViewerGate.ts";

export function functionViewMesh(id: FunctionViewId): FunctionMesh {
  return FUNCTION_VIEWS.find((row) => row.id === id)?.mesh ?? "skater";
}

export function functionViewGoalie(id: FunctionViewId): boolean {
  return functionViewMesh(id) === "goalie";
}

export function functionArgSpecs(id: FunctionViewId): readonly FunctionArgSpec[] {
  return FUNCTION_ARGS[id];
}

export function primaryArg(id: FunctionViewId): FunctionArgSpec | null {
  return FUNCTION_ARGS[id].find((arg) => arg.primary) ?? null;
}

/** Current values, falling back to each argument's default. */
export function functionViewerArgValues(id: FunctionViewId): Record<string, ViewerValue> {
  const saved = stored[id];
  const out: Record<string, ViewerValue> = {};
  for (const arg of FUNCTION_ARGS[id]) {
    const value = saved?.[arg.name];
    out[arg.name] = value === undefined ? arg.default : value;
  }
  return out;
}

export function setFunctionViewerArg(id: FunctionViewId, name: string, value: ViewerValue): void {
  const spec = FUNCTION_ARGS[id].find((arg) => arg.name === name);
  if (!spec) return;
  const next = functionViewerArgValues(id);
  if (spec.kind === "boolean") next[name] = Boolean(value);
  else if (typeof value === "number") {
    const clamped = Math.min(spec.max, Math.max(spec.min, value));
    next[name] = spec.step >= 1 ? Math.round(clamped) : clamped;
  }
  stored[id] = next;
}

export function resetFunctionViewerArgs(id: FunctionViewId): void {
  delete stored[id];
}

setViewerArgReader((id) => functionViewerArgValues(id as FunctionViewId));
