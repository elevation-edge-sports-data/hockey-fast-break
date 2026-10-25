import { CREASE_R, GOAL_LINE_X, GOAL_W } from "./rink";
import {
  attackDir,
  burstPoseWeight,
  checkedCyclePose,
  defendDir,
  goalieButterflyPose,
  goaliePlaysPuck,
  goaliePlayPuckPose,
  goaliePokeCheckPose,
  goalieDiveSavePose,
  goalieShotSave,
  goalieZKind,
  autoDekePoseName,
  rageDraw,
  shotFollowTime,
  ironDefensePose,
  shotTopCornerHand,
  shoulderCheckPose,
  scoredOnGoalieRagePose,
  stridePair,
  world,
  type Skater,
} from "./sim";
import { setPoseInfer } from "./poseOverrides";

const READY_COAST = 1.2;
const READY_SKATE = 2.6;
/** Same pad goalieOutOfCrease adds to CREASE_R. */
const CREASE_OUT = CREASE_R + 0.12;
/** Skater dive reach in cpuDefend. The loose puck has to be this close. */
const LOOSE_SAVE_REACH = 4.4;
/** Same toward-net component tryGoalieCatch uses. */
const LOOSE_AT_NET = 1.2;

function brawlLive(id: number): boolean {
  const brawl = world.lineBrawl;
  if (!brawl) return false;
  for (const pair of brawl.pairs) {
    if (pair.home === id) return true;
    if (pair.away === id && !pair.ko) return true;
  }
  return false;
}

function tumbling(s: Skater): boolean {
  return s.tumble !== 0 && s.struck > 0.1;
}

function shotFollowPose(s: Skater): string | null {
  if (s.follow <= 0.02 || world.lastShooter !== s.id) return null;
  const total = shotFollowTime(world.lastShotKind, world.lastShotSlap);
  const elapsed = Math.min(total, Math.max(0, total - s.follow));
  const blend = Math.min(0.1, total * 0.16);
  const rel = Math.min(0.08, Math.max(0.03, total * 0.1));
  const fol = Math.max(0.05, total - blend - rel);
  if (!(elapsed >= rel && elapsed < rel + fol)) return null;
  if (world.lastShotSlap || world.lastShotKind === "slap") return "slapFollow";
  if (world.lastShotBackhand || world.lastShotKind === "backhand") return "backhandFollow";
  if (world.lastShotKind === "snap") return "snapFollow";
  return "wristFollow";
}

/**
 * Puck on the boards side of this goalie's goal line.
 * Glove is the opposite of the blocker post. Posts sit at ±GOAL_W/2.
 */
function behindNetPose(s: Skater): "goalieProtectLeft" | "goalieProtectRight" | "goalieButterfly" | null {
  const end = defendDir(s.side);
  const past = (world.puck.x - end * GOAL_LINE_X) * end;
  if (past <= 0) return null;
  const half = GOAL_W / 2;
  const blockerDir = attackDir(s.side) > 0 ? 1 : -1;
  if (world.puck.z * -blockerDir > half) return "goalieProtectLeft";
  if (world.puck.z * blockerDir > half) return "goalieProtectRight";
  return "goalieButterfly";
}

/**
 * Outside the crease circle on a shot at this net, or a close loose puck
 * moving toward it. Glove side uses the stick dive. Blocker side uses the glove dive.
 */
function desperateDivePose(s: Skater): "goalieDivingStickSave" | "goalieDivingGloveSave" | null {
  const end = defendDir(s.side);
  const fromCrease = Math.hypot(s.x - end * GOAL_LINE_X, s.z);
  if (fromCrease <= CREASE_OUT) return null;
  const puck = world.puck;
  const loose =
    puck.owner === null &&
    Math.hypot(puck.x - s.x, puck.z - s.z) < LOOSE_SAVE_REACH &&
    puck.vx * end > LOOSE_AT_NET;
  if (!goalieShotSave(s) && !loose) return null;
  const blockerDir = attackDir(s.side) > 0 ? 1 : -1;
  if (s.z * -blockerDir > 0) return "goalieDivingStickSave";
  if (s.z * blockerDir > 0) return "goalieDivingGloveSave";
  return null;
}

function faceoffDot(s: Skater): boolean {
  return s.id === world.homeDot || s.id === world.awayDot;
}

function faceoffStill(s: Skater): boolean {
  return (
    s.kind !== "goalie" &&
    world.faceoff &&
    !tumbling(s) &&
    s.dive <= 0.04 &&
    s.celebrate <= 0.05 &&
    s.struck <= 0.2 &&
    !brawlLive(s.id) &&
    !rageDraw(s.id)
  );
}

/** Live play only. Galleries pass the pose name in and do not use this. */
export function inferNamedPose(s: Skater, index: number): string | null {
  const goalie = s.kind === "goalie";
  if (brawlLive(s.id)) return "fight";
  if (goalie && !tumbling(s) && s.dive <= 0.04 && !checkedCyclePose(s.struck, s.tumble)) {
    if (s.smashKind > 0) return "goalieRage1";
    const ragePose = scoredOnGoalieRagePose(s);
    if (ragePose) return ragePose;
  }
  if (!goalie && s.celebrate > 0.05 && s.hit <= 0 && !tumbling(s) && s.struck <= 0.2 && !brawlLive(s.id) && !rageDraw(s.id) && s.dive <= 0.04) {
    return "celebrate";
  }
  if (goalie && !tumbling(s) && s.celebrate > 0.05) return "goalieCheer";
  // The live draw keeps the centers on the crouch spots. Ready would stand
  // them up inside each other. Wings leave that set once the puck is down.
  if (faceoffStill(s) && (faceoffDot(s) || world.faceoffPhase !== "live")) {
    return faceoffDot(s) ? "faceoff" : "coast";
  }
  if (!goalie) {
    const checked = checkedCyclePose(s.struck, s.tumble);
    if (checked) return checked;
  }
  if (goalie && tumbling(s)) return "goalieGetUp";
  if (!goalie && s.dive > 0.04) return stridePair(s.stride, "dive", "divePoke");
  if (!goalie && rageDraw(s.id)) return "rage1";
  if (goalie && s.dive > 0.04) return goalieDiveSavePose(s);
  if (!goalie) {
    const followPose = shotFollowPose(s);
    if (followPose) return followPose;
  }
  if (!goalie && s.follow <= 0.02 && s.windup > 0.5) return "slap";
  if (!goalie && s.follow <= 0.02 && s.windup > 0.04 && s.windup <= 0.5 && world.lastShotBackhand) return "backhandShot";
  if (!goalie && s.follow <= 0.02 && s.windup > 0.04 && s.windup <= 0.5 && world.puck.owner === index) return "wrist";
  if (!goalie && s.hit > 0 && s.dive <= 0.04 && !tumbling(s) && s.struck <= 0.2 && s.windup <= 0.04 && s.follow <= 0.02) return shoulderCheckPose(s);
  if (!goalie && s.poke > 0.04) return "poke";

  const owns = world.puck.owner === index;
  const carrying =
    owns &&
    !goalie &&
    s.follow <= 0.02 &&
    s.windup <= 0.04 &&
    s.dive <= 0.04 &&
    !tumbling(s) &&
    s.celebrate <= 0.05 &&
    !rageDraw(s.id) &&
    s.struck <= 0.2 &&
    !brawlLive(s.id) &&
    s.hit <= 0 &&
    s.poke <= 0.04 &&
    !(world.faceoff && world.faceoffPhase !== "live");
  if (carrying && s.deke > 0.02) return autoDekePoseName(s.deke);
  if (carrying && s.stickPull > 0.02) return "backhandDeke";
  if (carrying && s.stickPull < -0.02) return "forehandDeke";
  if (!goalie && s.backskate) return "backSkate";
  if (carrying && s.burst > 0 && burstPoseWeight(s.id) >= 0.5 && s.deke <= 0.02 && Math.abs(s.stickPull) <= 0.02) {
    return stridePair(s.stride, "speedPuckLeft", "speedPuckRight");
  }
  if (carrying && s.burst <= 0 && s.deke <= 0.02 && Math.abs(s.stickPull) <= 0.02) return "puckPossess1";

  if (goalie && !tumbling(s) && s.celebrate <= 0.05 && s.dive <= 0.04) {
    const iron = ironDefensePose(s);
    if (iron) return iron;
    const hand = shotTopCornerHand(s);
    if (hand === "blocker") return "goalieBlockerSave";
    if (hand === "glove") return "goalieGloveSave";
    const behind = behindNetPose(s);
    if (behind) return behind;
    const dive = desperateDivePose(s);
    if (dive) return dive;
    const playPose = goaliePlayPuckPose(s);
    if (playPose) return playPose;
    if (goaliePokeCheckPose(s)) return "goaliePokeCheck";
    // Cover between 0.08 and 0.35 used to miss every named stance. The mesh
    // then splayed both pads and kinked the goalie blade. That is not a saved pose.
    if (s.coverPose > 0.08 || goalieButterflyPose(s)) return "goalieCover";
    const zone = goalieZKind(s);
    if (zone === "butterfly") return "goalieButterfly";
    if (zone === "upright") return "goalieUpright";
    if (zone === "perimeter") return "goaliePerimeter";
    if (zone === "mid") return "goalieMid";
  }

  const speed = Math.hypot(s.vx, s.vz);
  // s.stride grows with distance. sin(s.stride) holds each foot for one stride.
  if (!goalie && !owns && speed >= READY_SKATE) return stridePair(s.stride, "strideLeft", "strideRight");
  if (!goalie && !owns && speed <= READY_COAST && s.dive <= 0.04 && !tumbling(s) && s.hit <= 0 && s.struck <= 0.2 && s.poke <= 0.04 && s.celebrate <= 0.05) {
    return "ready";
  }
  return null;
}

setPoseInfer(inferNamedPose);
