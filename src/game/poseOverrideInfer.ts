import {
  burstPoseWeight,
  goalieButterflyPose,
  goaliePlaysPuck,
  goalieZKind,
  rageDraw,
  shotFollowTime,
  world,
  type Skater,
} from "./sim";
import { setPoseInfer } from "./poseOverrides";

const TUMBLE_UP = 1.12 / 1.55;
const READY_COAST = 1.2;
const READY_SKATE = 2.6;

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

function rising(s: Skater): boolean {
  if (!tumbling(s)) return false;
  const u = Math.min(1, Math.max(0, 1 - s.struck / 1.68));
  return u >= TUMBLE_UP;
}

function forehandFollowHold(s: Skater): boolean {
  if (s.follow <= 0.02 || world.lastShooter !== s.id || world.lastShotBackhand) return false;
  const total = shotFollowTime(world.lastShotKind, world.lastShotSlap);
  const elapsed = Math.min(total, Math.max(0, total - s.follow));
  const blend = Math.min(0.1, total * 0.16);
  const rel = Math.min(0.08, Math.max(0.03, total * 0.1));
  const fol = Math.max(0.05, total - blend - rel);
  return elapsed >= rel && elapsed < rel + fol;
}

function faceoffOpen(s: Skater): boolean {
  return (
    s.kind !== "goalie" &&
    world.faceoff &&
    world.faceoffPhase !== "live" &&
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
  if (brawlLive(s.id)) return "brawl";
  if (!goalie && s.celebrate > 0.05 && s.hit <= 0 && !tumbling(s) && s.struck <= 0.2 && !brawlLive(s.id) && !rageDraw(s.id) && s.dive <= 0.04) {
    return "cheer";
  }
  if (goalie && !tumbling(s) && s.celebrate > 0.05) return "goalieCheer";
  if (faceoffOpen(s)) {
    const taker = s.id === world.homeDot || s.id === world.awayDot;
    return taker ? "puckDrop" : "puckDropSet";
  }
  if (!goalie && rageDraw(s.id)) return "rage";
  if (goalie && tumbling(s)) return "goalieGetUp";
  if (!goalie && s.dive > 0.04) return "dive";
  if (!goalie && rising(s)) return "getUp";
  if (!goalie && tumbling(s)) return "tumble";
  if (!goalie && s.struck > 0.2 && s.tumble === 0) return "checked";
  if (!goalie && forehandFollowHold(s)) return "shot-follow-through";
  if (!goalie && s.follow <= 0.02 && s.windup > 0.5) return "slap";
  if (!goalie && s.follow <= 0.02 && s.windup > 0.04 && s.windup <= 0.5 && world.lastShotBackhand) return "wristBackhand";
  if (!goalie && s.follow <= 0.02 && s.windup > 0.04 && s.windup <= 0.5 && world.puck.owner === index) return "wrist";
  if (!goalie && s.hit > 0 && s.dive <= 0.04 && !tumbling(s) && s.struck <= 0.2 && s.windup <= 0.04 && s.follow <= 0.02) return "check";
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
  if (carrying && s.deke > 0.02) return "deke";
  if (carrying && s.stickPull > 0.02) return "skillBackhand";
  if (carrying && s.stickPull < -0.02) return "skillCarry";
  if (carrying && s.burst > 0 && burstPoseWeight(s.id) >= 0.5 && s.deke <= 0.02 && Math.abs(s.stickPull) <= 0.02) return "burstCarry";
  if (carrying && s.burst <= 0 && s.deke <= 0.02 && Math.abs(s.stickPull) <= 0.02) return "neutralCarry";

  if (goalie && !tumbling(s) && s.celebrate <= 0.05 && s.dive <= 0.04) {
    if (goaliePlaysPuck(s)) return "goaliePlay";
    if (s.coverPose >= 0.35 || goalieButterflyPose(s)) return "goalieCover";
    const zone = goalieZKind(s);
    if (zone === "butterfly") return "goalieButterfly";
    if (zone === "upright") return "goalieUpright";
    if (zone === "perimeter") return "goaliePerimeter";
    if (zone === "mid") return "goalieMid";
  }

  const speed = Math.hypot(s.vx, s.vz);
  if (!goalie && !owns && speed >= READY_SKATE) return "stride";
  if (!goalie && !owns && speed <= READY_COAST && s.dive <= 0.04 && !tumbling(s) && s.hit <= 0 && s.struck <= 0.2 && s.poke <= 0.04 && s.celebrate <= 0.05) {
    return "ready";
  }
  return null;
}

setPoseInfer(inferNamedPose);
