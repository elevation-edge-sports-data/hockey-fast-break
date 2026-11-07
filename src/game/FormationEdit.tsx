import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import {
  LOCK_SLIDE_MPS,
  closeFormGesture,
  formLocalOffset,
  formUndoDepth,
  formWorldOffset,
  formYawSnap,
  formYawToward,
  openFormGesture,
  syncFormGesture,
  writeAdjustedPositions,
  type FormEdit,
  type FormHist,
  type FormationFrame,
  type FormationView,
} from "./formationLibrary";
import { attachInput, gamepadFaceDown, readActions, windowHasInputFocus } from "./input";
import {
  MARK_STICK_GATE,
  cycleMarkLock,
  iceBasisMove,
  iceBasisStep,
  nearestMark,
  orbitStick,
  shadowXZ,
  type IceMark,
  type MarkLock,
} from "./iceMark";
import { seedFormationOrbit, type RinkPick } from "./RinkOrbitCamera";
import { stickBlade, world, type Skater } from "./sim";

const RADIUS_MIN = 4.2;
const RADIUS_MAX = 120;

function editingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export function lookOf(mark: IceMark): { x: number; y: number; z: number } {
  if (mark.lock?.kind === "skater") return { x: mark.x, y: 1.05, z: mark.z };
  if (mark.lock?.kind === "puck") return { x: mark.x, y: Math.max(0.4, world.puck.y), z: mark.z };
  return { x: mark.x, y: 0.55, z: mark.z };
}

function anchorOf(lock: MarkLock): { x: number; z: number } | null {
  if (lock.kind === "puck") return { x: world.puck.x, z: world.puck.z };
  const s = world.skaters[lock.index];
  if (!s) return null;
  return shadowXZ(s.comX, s.comZ, s.x, s.z);
}

function sameLock(a: MarkLock | null, b: MarkLock | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind === "puck" && b.kind === "puck") return true;
  return a.kind === "skater" && b.kind === "skater" && a.index === b.index;
}

function liveShadows(): { players: { x: number; z: number }[]; puck: { x: number; z: number } } {
  return {
    players: world.skaters.map((s) => shadowXZ(s.comX, s.comZ, s.x, s.z)),
    puck: { x: world.puck.x, z: world.puck.z },
  };
}

function shiftSkater(s: Skater, dx: number, dz: number): void {
  s.x += dx;
  s.z += dz;
  if (Number.isFinite(s.comX)) s.comX += dx;
  if (Number.isFinite(s.comZ)) s.comZ += dz;
}

function carryPuck(id: number, dx: number, dz: number): boolean {
  if (world.puck.owner !== id || (dx === 0 && dz === 0)) return world.puck.owner === id;
  world.puck.x += dx;
  world.puck.z += dz;
  return true;
}

/** Puck must sit on the shadow center, not merely near the player, to be picked up. */
const POSSESS_CENTER_R = 0.35;

function spinCarriedPuck(s: Skater, oldYaw: number): void {
  if (world.puck.owner !== s.id || oldYaw === s.yaw) return;
  const local = formLocalOffset(oldYaw, world.puck.x - s.x, world.puck.z - s.z);
  const at = formWorldOffset(s.yaw, s.x, s.z, local.lx, local.lz);
  world.puck.x = at.x;
  world.puck.z = at.z;
}

function possessSpot(s: Skater): { x: number; z: number } {
  if (s.kind === "goalie") {
    const fx = -Math.sin(s.yaw);
    const fz = -Math.cos(s.yaw);
    return { x: s.x + fx * 1.05, z: s.z + fz * 1.05 };
  }
  return stickBlade(s);
}

function settlePuckDrop(): void {
  let best: Skater | null = null;
  let bestD = POSSESS_CENTER_R;
  for (const s of world.skaters) {
    const center = shadowXZ(s.comX, s.comZ, s.x, s.z);
    const d = Math.hypot(world.puck.x - center.x, world.puck.z - center.z);
    if (d <= bestD) {
      best = s;
      bestD = d;
    }
  }
  if (!best) {
    world.puck.owner = null;
    return;
  }
  const spot = possessSpot(best);
  world.puck.owner = best.id;
  world.puck.x = spot.x;
  world.puck.z = spot.z;
  world.puck.vx = 0;
  world.puck.vz = 0;
  world.puck.vy = 0;
}

/** Gamepad Y with the stick centered: puck, then each player, then the free X. */
function cycleFormationLock(mark: IceMark): void {
  mark.lock = cycleMarkLock(mark.lock, world.skaters.length);
  mark.driven = false;
  if (!mark.lock) return;
  const anchor = anchorOf(mark.lock);
  if (!anchor) {
    mark.lock = null;
    return;
  }
  mark.x = anchor.x;
  mark.z = anchor.z;
}

/** Keep the ice X on the selected shadow or puck while the camera looks at it. */
export function followFormationMark(mark: IceMark): void {
  if (!mark.lock) return;
  const anchor = anchorOf(mark.lock);
  if (!anchor) return;
  mark.x = anchor.x;
  mark.z = anchor.z;
}

export function takeFormationPick(mark: IceMark, hit: RinkPick): void {
  if (hit.kind === "ice") {
    mark.x = hit.x;
    mark.z = hit.z;
    mark.lock = null;
    mark.driven = false;
    return;
  }
  mark.lock = hit;
  mark.driven = false;
  const anchor = anchorOf(hit);
  if (!anchor) {
    mark.lock = null;
    return;
  }
  mark.x = anchor.x;
  mark.z = anchor.z;
}

export function applyFormEdit(frame: FormationFrame, view: FormationView, g: FormEdit, toEnd: boolean): void {
  const x = toEnd ? g.x1 : g.x0;
  const z = toEnd ? g.z1 : g.z0;
  if (g.kind === "puck") {
    world.puck.x = x;
    world.puck.z = z;
    world.puck.owner = toEnd ? g.owner1 : g.owner0;
    writeAdjustedPositions(frame, view);
    return;
  }
  const s = world.skaters.find((sk) => sk.id === g.id);
  if (s) {
    const ox = (Number.isFinite(s.comX) ? s.comX : s.x) - s.x;
    const oz = (Number.isFinite(s.comZ) ? s.comZ : s.z) - s.z;
    s.x = x;
    s.z = z;
    s.comX = x + ox;
    s.comZ = z + oz;
    s.yaw = toEnd ? g.yaw1 : g.yaw0;
  }
  if (g.puck) {
    world.puck.x = toEnd ? g.px1 : g.px0;
    world.puck.z = toEnd ? g.pz1 : g.pz0;
  }
  writeAdjustedPositions(frame, view);
}

function beginBody(hist: FormHist, lock: MarkLock): void {
  if (lock.kind === "puck") {
    openFormGesture(hist, {
      kind: "puck",
      x0: world.puck.x,
      z0: world.puck.z,
      x1: world.puck.x,
      z1: world.puck.z,
      owner0: world.puck.owner,
      owner1: world.puck.owner,
    });
    return;
  }
  const s = world.skaters[lock.index];
  if (!s) return;
  const carried = world.puck.owner === s.id;
  openFormGesture(hist, {
    kind: "skater",
    id: s.id,
    x0: s.x,
    z0: s.z,
    x1: s.x,
    z1: s.z,
    yaw0: s.yaw,
    yaw1: s.yaw,
    puck: carried,
    px0: world.puck.x,
    pz0: world.puck.z,
    px1: world.puck.x,
    pz1: world.puck.z,
  });
}

/**
 * Locked-frame editor shared by the formation library and the replay viewer.
 * A selected body slides at LOCK_SLIDE_MPS. The free X keeps the camera-radius pan.
 * Edits write the side in viewRef. The other side stays put.
 */
export function FormationMarkDriver({
  mark,
  frameRef,
  hist,
  viewRef,
  onDepth,
  orbit,
  adjusted,
  viewRadius,
  basis,
  armOrbit,
  activeRef,
}: {
  mark: MutableRefObject<IceMark>;
  frameRef: { readonly current: FormationFrame | null };
  hist: MutableRefObject<FormHist>;
  viewRef: { readonly current: FormationView };
  onDepth: (undo: number, redo: number) => void;
  orbit: MutableRefObject<{ theta: number; phi: number; radius: number }>;
  adjusted: MutableRefObject<boolean>;
  viewRadius: MutableRefObject<number>;
  basis: MutableRefObject<{ rx: number; rz: number; fx: number; fz: number }>;
  /** Replay cameras claim freestyle. The formation library seeds the classic orbit. */
  armOrbit?: () => void;
  /** When this is false the driver leaves input to playback. */
  activeRef?: MutableRefObject<boolean>;
}) {
  const shown = useRef({ undo: -1, redo: -1 });
  const yMoved = useRef(false);
  const yHeld = useRef(false);
  const puckDrag = useRef(false);
  const armOrbitRef = useRef(armOrbit);
  armOrbitRef.current = armOrbit;
  useEffect(() => attachInput(window), []);
  const publish = () => {
    const undo = formUndoDepth(hist.current);
    const redo = hist.current.redo.length;
    if (shown.current.undo === undo && shown.current.redo === redo) return;
    shown.current = { undo, redo };
    onDepth(undo, redo);
  };
  useFrame((_, rawDt) => {
    if (activeRef && !activeRef.current) return;
    const frame = frameRef.current;
    if (!frame) return;
    const dt = Math.min(rawDt, 0.1);
    const act = readActions();
    const typing = editingText();
    const yDown = gamepadFaceDown("y");
    const aimCamera = () => {
      const claim = armOrbitRef.current;
      if (claim) claim();
      else seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
    };
    if (!windowHasInputFocus()) {
      if (yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE) yMoved.current = true;
      if (!yDown) yMoved.current = false;
      yHeld.current = yDown;
      return;
    }
    if (act.zoomIn || act.zoomOut) {
      aimCamera();
      const o = orbit.current;
      if (act.zoomIn) o.radius = Math.max(RADIUS_MIN, o.radius - 18 * dt);
      if (act.zoomOut) o.radius = Math.min(RADIUS_MAX, o.radius + 18 * dt);
    }
    if (yDown) {
      if (Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE) yMoved.current = true;
      if (yMoved.current) {
        aimCamera();
        const turned = orbitStick(orbit.current.theta, orbit.current.phi, act.stickX, act.stickY, dt);
        orbit.current.theta = turned.theta;
        orbit.current.phi = turned.phi;
      }
    } else if (yHeld.current && !yMoved.current) {
      closeFormGesture(hist.current);
      cycleFormationLock(mark.current);
      publish();
      yMoved.current = false;
    } else {
      yMoved.current = false;
    }
    yHeld.current = yDown;
    const cursor = mark.current;
    const skater = cursor.lock?.kind === "skater" ? world.skaters[cursor.lock.index] : undefined;
    const live = !yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE;
    const stickTurn = !!skater && act.aDown && live;
    const arrowTurn = !!skater && !typing && act.keyA && !stickTurn && (act.arrowX !== 0 || act.arrowY !== 0);
    const ix = (typing || arrowTurn ? 0 : act.arrowX) + (!stickTurn && live ? act.stickX : 0);
    const iy = (typing || arrowTurn ? 0 : act.arrowY) + (!stickTurn && live ? act.stickY : 0);
    const step = cursor.lock
      ? iceBasisMove(dt, LOCK_SLIDE_MPS, ix, iy, basis.current)
      : iceBasisStep(dt, viewRadius.current, ix, iy, basis.current);
    if ((step || stickTurn || arrowTurn) && cursor.lock) {
      const anchor = anchorOf(cursor.lock);
      if (!anchor) {
        cursor.lock = null;
      } else {
        beginBody(hist.current, cursor.lock);
        const oldYaw = skater?.yaw;
        if (skater && stickTurn) {
          const dx = basis.current.rx * act.stickX + basis.current.fx * act.stickY;
          const dz = basis.current.rz * act.stickX + basis.current.fz * act.stickY;
          skater.yaw = formYawSnap(dx, dz);
        } else if (skater && arrowTurn) {
          const dx = basis.current.rx * act.arrowX + basis.current.fx * act.arrowY;
          const dz = basis.current.rz * act.arrowX + basis.current.fz * act.arrowY;
          skater.yaw = formYawToward(skater.yaw, dx, dz, dt);
        }
        if (step) {
          cursor.x = anchor.x + step.dx;
          cursor.z = anchor.z + step.dz;
          if (cursor.lock.kind === "puck") {
            world.puck.owner = null;
            world.puck.x += step.dx;
            world.puck.z += step.dz;
            puckDrag.current = true;
          } else if (skater) {
            shiftSkater(skater, step.dx, step.dz);
            carryPuck(skater.id, step.dx, step.dz);
          }
        }
        if (skater && oldYaw !== undefined) spinCarriedPuck(skater, oldYaw);
        cursor.driven = false;
        if (cursor.lock.kind === "puck") {
          syncFormGesture(hist.current, { x: world.puck.x, z: world.puck.z, owner: world.puck.owner });
        } else if (skater) {
          syncFormGesture(hist.current, {
            x: skater.x,
            z: skater.z,
            yaw: skater.yaw,
            px: world.puck.x,
            pz: world.puck.z,
          });
        }
        writeAdjustedPositions(frame, viewRef.current);
        publish();
      }
      return;
    }
    if (!step && !stickTurn && !arrowTurn && puckDrag.current) {
      settlePuckDrop();
      if (hist.current.gesture?.kind === "puck") {
        syncFormGesture(hist.current, { x: world.puck.x, z: world.puck.z, owner: world.puck.owner });
      }
      writeAdjustedPositions(frame, viewRef.current);
      puckDrag.current = false;
    }
    if (!step) closeFormGesture(hist.current);
    publish();
    if (step) {
      const spots = liveShadows();
      const before = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
      cursor.x += step.dx;
      cursor.z += step.dz;
      const after = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
      if (!after) cursor.driven = true;
      if (after && cursor.driven && !sameLock(before, after)) {
        cursor.lock = after;
        cursor.driven = false;
        const anchor = anchorOf(after);
        if (anchor) {
          cursor.x = anchor.x;
          cursor.z = anchor.z;
        }
      }
      return;
    }
    if (cursor.driven && !cursor.lock) {
      const spots = liveShadows();
      const hit = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
      if (hit) {
        cursor.lock = hit;
        const anchor = anchorOf(hit);
        if (anchor) {
          cursor.x = anchor.x;
          cursor.z = anchor.z;
        }
      }
    }
    cursor.driven = false;
    if (!cursor.lock) return;
    const anchor = anchorOf(cursor.lock);
    if (!anchor) {
      cursor.lock = null;
      return;
    }
    cursor.x = anchor.x;
    cursor.z = anchor.z;
  });
  return null;
}
