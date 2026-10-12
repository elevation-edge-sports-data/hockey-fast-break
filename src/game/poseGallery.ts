import { resetWorld, world, type Skater } from "./sim";
import { useGame, type ControlProfile } from "./store";

/** Curated stills for /pose-gallery. The full set lives in the private gallery module. */
export const PUBLIC_POSES = ["wrist", "cheer"] as const;

export type PublicPoseId = (typeof PUBLIC_POSES)[number];

const PUCK_Y = 0.042;

type HeldUi = { playing: boolean; paused: boolean; camAdjust: boolean };

let heldUi: HeldUi | null = null;
let heldProfile: ControlProfile | null = null;

function quiet(s: Skater): void {
  s.vx = 0;
  s.vz = 0;
  s.lean = 0;
  s.bank = 0;
  s.burst = 0;
  s.deke = 0;
  s.hit = 0;
  s.stun = 0;
  s.poke = 0;
  s.struck = 0;
  s.tumble = 0;
  s.windup = 0;
  s.follow = 0;
  s.celebrate = 0;
  s.smash = 0;
  s.smashKind = 0;
  s.smashHit = 0;
  s.coverPose = 0;
  s.lPad = 0.18;
  s.rPad = 0.18;
  s.dive = 0;
  s.gloveFlash = 0;
  s.backskate = false;
  s.stickPull = 0;
  s.stride = 0;
}

function parkOff(s: Skater, slot: number): void {
  quiet(s);
  s.x = 80;
  s.z = (slot - 4) * 4;
  s.yaw = 0;
}

function clearPlay(): void {
  world.faceoff = false;
  world.faceoffPhase = "live";
  world.faceoffT = 0;
  world.stoppage = false;
  world.whistle = null;
  world.goalieShot = null;
  world.windupCancel = false;
  world.lastShotSlap = false;
  world.lastShotBackhand = false;
  world.lastShooter = null;
  world.lastShoot = -10;
  world.replay = false;
  world.lineBrawl = null;
  world.benchDump = null;
  world.time = 0;
  const puck = world.puck;
  puck.owner = null;
  puck.x = 40;
  puck.z = 40;
  puck.y = 2;
  puck.vx = 0;
  puck.vz = 0;
  puck.vy = 0;
}

function holdPaused(): void {
  const ui = useGame.getState();
  if (!heldUi) heldUi = { playing: ui.playing, paused: ui.paused, camAdjust: ui.camAdjust };
  ui.setPlaying(true);
  ui.setPaused(true);
}

function useStickProfile(on: boolean): void {
  const current = useGame.getState().controlProfile;
  if (on) {
    if (heldProfile === null) heldProfile = current;
    if (current !== "stick") useGame.setState({ controlProfile: "stick" });
    return;
  }
  if (heldProfile !== null) {
    useGame.setState({ controlProfile: heldProfile });
    heldProfile = null;
  }
}

function homeSkater(): Skater {
  const user = world.skaters.find((s) => s.id === world.userId && s.kind !== "goalie");
  if (user) return user;
  const home = world.skaters.find((s) => s.side === "home" && s.kind !== "goalie");
  const any = home ?? world.skaters.find((s) => s.kind !== "goalie");
  if (!any) throw new Error("pose gallery: no skater");
  world.userId = any.id;
  return any;
}

function goalieSkater(): Skater {
  const found =
    world.skaters.find((s) => s.kind === "goalie" && s.side === "home") ??
    world.skaters.find((s) => s.kind === "goalie");
  if (found) return found;
  const id = world.skaters.length;
  const g: Skater = {
    id,
    side: "home",
    kind: "goalie",
    number: 41,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    stride: 0,
    lean: 0,
    bank: 0,
    radius: 0.58,
    burst: 0,
    deke: 0,
    hit: 0,
    stun: 0,
    poke: 0,
    struck: 0,
    tumble: 0,
    windup: 0,
    follow: 0,
    trackZ: 0,
    trackVz: 0,
    celebrate: 0,
    smash: 0,
    smashKind: 0,
    smashHit: 0,
    coverPose: 0,
    lPad: 0.18,
    rPad: 0.18,
    dive: 0,
    gloveFlash: 0,
    backskate: false,
    stickPull: 0,
  };
  world.skaters.push(g);
  return g;
}

function place(s: Skater): void {
  s.x = 0;
  s.z = 0;
  s.yaw = 0;
  s.vx = 0;
  s.vz = 0;
  s.backskate = false;
}

export function ownPuck(index: number, x: number, z: number): void {
  world.puck.owner = index;
  world.puck.x = x;
  world.puck.z = z;
  world.puck.y = PUCK_Y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

export function loosePuck(x: number, z: number, y = PUCK_Y): void {
  world.puck.owner = null;
  world.puck.x = x;
  world.puck.z = z;
  world.puck.y = y;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

/** Shared reset used by the public stills and, when present, the private gallery. */
export function prepareGalleryPose(goalie: boolean, stick: boolean): { s: Skater; index: number } {
  resetWorld({ keepScore: true, keepReplay: true });
  holdPaused();
  useStickProfile(stick);
  for (let i = 0; i < world.skaters.length; i++) parkOff(world.skaters[i]!, i);
  clearPlay();

  const s = goalie ? goalieSkater() : homeSkater();
  const index = world.skaters.indexOf(s);
  if (index < 0) throw new Error("pose gallery: missing skater");
  quiet(s);
  place(s);
  s.side = "home";
  if (!goalie) world.userId = s.id;
  return { s, index };
}

export function releasePoseGallery(): void {
  useStickProfile(false);
  const held = heldUi;
  heldUi = null;
  resetWorld({ keepScore: true, keepReplay: true });
  if (held) useGame.setState({ playing: held.playing, paused: held.paused, camAdjust: held.camAdjust });
}

export function applyPose(pose: PublicPoseId): number {
  const { s, index } = prepareGalleryPose(false, false);
  switch (pose) {
    case "wrist":
      s.windup = 0.28;
      ownPuck(index, 0, -1.05);
      break;
    case "cheer":
      s.celebrate = 2;
      world.time = 0.7;
      break;
    default: {
      const never: never = pose;
      return never;
    }
  }
  return index;
}
