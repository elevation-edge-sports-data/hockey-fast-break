import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  closeFormGesture,
  formLocalOffset,
  formUndoDepth,
  formWorldOffset,
  formYawSnap,
  formYawToward,
  formationSideOf,
  freshFormHist,
  mountFormation,
  type FormationView,
  openFormGesture,
  redoFormEdit,
  syncFormGesture,
  undoFormEdit,
  writeAdjustedPositions,
  type FormEdit,
  type FormHist,
  bundledFormationEntries,
  partitionFormationLibrary,
  entriesFromFile,
  readFormationLibrary,
  writeFormationLibrary,
  type FormationEntry,
  type FormationFrame,
} from "./formationLibrary";
import { IceCross } from "./IceCross";
import { attachInput, gamepadFaceDown, readActions } from "./input";
import {
  MARK_STICK_GATE,
  iceBasisStep,
  orbitStick,
  nearestMark,
  shadowXZ,
  type IceMark,
  type MarkLock,
} from "./iceMark";
import { PlayerMesh, PuckMesh } from "./PlayerMesh";
import { setPoseInfer } from "./poseOverrides";
import { inferNamedPose } from "./poseOverrideInfer";
import { Rink } from "./Rink.tsx";
import { RinkOrbitCamera, seedFormationOrbit, type RinkPick } from "./RinkOrbitCamera";
import { stickBlade, world, type Skater } from "./sim";
import { useGame } from "./store";
import { kitWornColors, UNIFORMS } from "./uniforms";

setPoseInfer(inferNamedPose);

const RADIUS_MIN = 4.2;
const RADIUS_MAX = 120;

function editingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function lookOf(mark: IceMark): { x: number; y: number; z: number } {
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

function takeFormationPick(mark: IceMark, hit: RinkPick): void {
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

function applyFormEdit(frame: FormationFrame, view: FormationView, g: FormEdit, toEnd: boolean): void {
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

function FormationMarkDriver({
  mark,
  frameRef,
  hist,
  viewRef,
  onDepth,
  orbit,
  adjusted,
  viewRadius,
  basis,
}: {
  mark: MutableRefObject<IceMark>;
  frameRef: MutableRefObject<FormationFrame>;
  hist: MutableRefObject<FormHist>;
  viewRef: MutableRefObject<FormationView>;
  onDepth: (undo: number, redo: number) => void;
  orbit: MutableRefObject<{ theta: number; phi: number; radius: number }>;
  adjusted: MutableRefObject<boolean>;
  viewRadius: MutableRefObject<number>;
  basis: MutableRefObject<{ rx: number; rz: number; fx: number; fz: number }>;
}) {
  const shown = useRef({ undo: -1, redo: -1 });
  const yMoved = useRef(false);
  const puckDrag = useRef(false);
  useEffect(() => attachInput(window), []);
  const publish = () => {
    const undo = formUndoDepth(hist.current);
    const redo = hist.current.redo.length;
    if (shown.current.undo === undo && shown.current.redo === redo) return;
    shown.current = { undo, redo };
    onDepth(undo, redo);
  };
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const act = readActions();
    const typing = editingText();
    if (act.zoomIn || act.zoomOut) {
      seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
      const o = orbit.current;
      if (act.zoomIn) o.radius = Math.max(RADIUS_MIN, o.radius - 18 * dt);
      if (act.zoomOut) o.radius = Math.min(RADIUS_MAX, o.radius + 18 * dt);
    }
    const yDown = gamepadFaceDown("y");
    if (yDown) {
      if (Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE) yMoved.current = true;
      if (yMoved.current) {
        seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
        const turned = orbitStick(orbit.current.theta, orbit.current.phi, act.stickX, act.stickY, dt);
        orbit.current.theta = turned.theta;
        orbit.current.phi = turned.phi;
      }
    } else {
      yMoved.current = false;
    }
    const cursor = mark.current;
    const skater = cursor.lock?.kind === "skater" ? world.skaters[cursor.lock.index] : undefined;
    const live = !yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE;
    const stickTurn = !!skater && act.aDown && live;
    const arrowTurn = !!skater && !typing && act.keyA && !stickTurn && (act.arrowX !== 0 || act.arrowY !== 0);
    const step = iceBasisStep(
      dt,
      viewRadius.current,
      (typing || arrowTurn ? 0 : act.arrowX) + (!stickTurn && live ? act.stickX : 0),
      (typing || arrowTurn ? 0 : act.arrowY) + (!stickTurn && live ? act.stickY : 0),
      basis.current,
    );
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
        }
        else if (skater) {
          syncFormGesture(hist.current, {
            x: skater.x,
            z: skater.z,
            yaw: skater.yaw,
            px: world.puck.x,
            pz: world.puck.z,
          });
        }
        writeAdjustedPositions(frameRef.current, viewRef.current);
        publish();
      }
      return;
    }
    if (!step && !stickTurn && !arrowTurn && puckDrag.current) {
      settlePuckDrop();
      if (hist.current.gesture?.kind === "puck") {
        syncFormGesture(hist.current, { x: world.puck.x, z: world.puck.z, owner: world.puck.owner });
      }
      writeAdjustedPositions(frameRef.current, viewRef.current);
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

function FormationStage({
  frame,
  view,
  hist,
  onDepth,
  editRef,
}: {
  frame: FormationFrame;
  view: FormationView;
  hist: MutableRefObject<FormHist>;
  onDepth: (undo: number, redo: number) => void;
  editRef: MutableRefObject<{ undo: () => void; redo: () => void }>;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const [rev, setRev] = useState(0);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const viewRef = useRef(view);
  viewRef.current = view;
  const onDepthRef = useRef(onDepth);
  onDepthRef.current = onDepth;
  const shown = formationSideOf(frame, view);
  const mark = useRef<IceMark>({ x: shown.puck.x, z: shown.puck.z, lock: null, driven: false });
  const orbit = useRef({ theta: 0, phi: 0.97, radius: 16 });
  const adjusted = useRef(false);
  const viewRadius = useRef(16);
  const basis = useRef({ rx: 0, rz: 1, fx: 1, fz: 0 });
  editRef.current = {
    undo() {
      const g = undoFormEdit(hist.current);
      if (g) applyFormEdit(frameRef.current, viewRef.current, g, false);
      onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
    },
    redo() {
      const g = redoFormEdit(hist.current);
      if (g) applyFormEdit(frameRef.current, viewRef.current, g, true);
      onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
    },
  };

  useLayoutEffect(() => {
    const side = formationSideOf(frame, view);
    const release = mountFormation(side);
    mark.current = { x: side.puck.x, z: side.puck.z, lock: null, driven: false };
    hist.current = freshFormHist();
    onDepthRef.current(0, 0);
    setRev((n) => n + 1);
    return release;
  }, [frame, hist, view]);

  return (
    <>
      <color attach="background" args={["#0c121c"]} />
      <hemisphereLight args={["#d7e8f4", "#1a2838", 0.7]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[18, 32, 10]} intensity={1.5} />
      <Rink />
      <FormationMarkDriver
        mark={mark}
        frameRef={frameRef}
        hist={hist}
        viewRef={viewRef}
        onDepth={(undo, redo) => onDepthRef.current(undo, redo)}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
      />
      {world.skaters.map((s, i) => (
        <PlayerMesh
          key={`${rev}-${i}-${s.id}-${s.side === "home" ? homeKit : awayKit}`}
          index={i}
          kitId={s.side === "home" ? homeKit : awayKit}
        />
      ))}
      <PuckMesh />
      <RinkOrbitCamera
        getLook={() => {
          const cursor = mark.current;
          if (cursor.lock) {
            const anchor = anchorOf(cursor.lock);
            if (anchor) {
              cursor.x = anchor.x;
              cursor.z = anchor.z;
            }
          }
          return lookOf(cursor);
        }}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
        onPick={(hit) => {
          takeFormationPick(mark.current, hit);
          onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
        }}
      />
      <IceCross mark={mark} />
    </>
  );
}

function VersionSwitch({
  frame,
  view,
  onView,
  disabled = false,
}: {
  frame: FormationFrame | undefined;
  view: FormationView;
  onView: (next: FormationView) => void;
  disabled?: boolean;
}) {
  if (!frame?.original || !frame.adjusted) return null;
  return (
    <div className="formation-version" role="group" aria-label="Version">
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "original" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "original"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("original");
        }}
      >
        Original
      </button>
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "adjusted" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "adjusted"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("adjusted");
        }}
      >
        Adjusted
      </button>
    </div>
  );
}

function FormationList({
  rows,
  selected,
  onChoose,
}: {
  rows: FormationEntry[];
  selected: string | null;
  onChoose: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <ul className="formation-list">
      {rows.map((entry) => (
        <li key={entry.id}>
          <button type="button" className={entry.id === selected ? "is-on" : ""} onClick={() => onChoose(entry.id)}>
            <b>{entry.name}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}

function libraryEntries(saved: FormationEntry[] = [], retired: string[] = []): FormationEntry[] {
  const { imported, repo } = partitionFormationLibrary(readFormationLibrary(), bundledFormationEntries(), saved, retired);
  return [...repo, ...imported];
}

function KitSwatch({
  id,
  selected,
  tag,
  targeted,
  onPick,
  onTarget,
}: {
  id: number;
  selected: boolean;
  tag?: "YOU" | "CPU";
  targeted?: boolean;
  onPick: (id: number) => void;
  onTarget?: () => void;
}) {
  const worn = kitWornColors(UNIFORMS[id]!);
  return (
    <div className="formation-kit">
      {tag ? (
        <button
          type="button"
          className={`formation-kit-tag${targeted ? " is-target" : ""}`}
          aria-pressed={targeted}
          onClick={onTarget}
        >
          {tag}
        </button>
      ) : (
        <span className="formation-kit-tag" />
      )}
      <button
        type="button"
        aria-label={`Kit ${id + 1}`}
        aria-pressed={selected}
        onClick={() => onPick(id)}
        className={`uni-swatch${selected ? " is-on" : ""}`}
        style={selected ? { outlineColor: worn.jersey } : undefined}
      >
        <span style={{ background: worn.helmet }} />
        <span style={{ background: worn.jersey }} />
        <span style={{ background: worn.pants }} />
      </button>
    </div>
  );
}

export function FormationKits() {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const setHomeKit = useGame((s) => s.setHomeKit);
  const setAwayKit = useGame((s) => s.setAwayKit);
  const [side, setSide] = useState<"home" | "away">("home");
  const pick = (id: number) => {
    if (side === "home") {
      if (id === homeKit) return;
      if (id === awayKit) {
        const prev = homeKit;
        setHomeKit(id);
        setAwayKit(prev);
        return;
      }
      setHomeKit(id);
      return;
    }
    if (id === awayKit) return;
    if (id === homeKit) {
      const prev = awayKit;
      setHomeKit(prev);
      setAwayKit(id);
      return;
    }
    setAwayKit(id);
  };
  return (
    <div className="formation-kits">
      <div className="uni-side">
        <div className="uni-row">
          {UNIFORMS.map((u) => {
            const you = homeKit === u.id;
            const cpu = awayKit === u.id;
            const tag = you ? "YOU" : cpu ? "CPU" : undefined;
            return (
              <KitSwatch
                key={u.id}
                id={u.id}
                selected={you || cpu}
                tag={tag}
                targeted={tag === "YOU" ? side === "home" : tag === "CPU" ? side === "away" : false}
                onTarget={() => setSide(tag === "CPU" ? "away" : "home")}
                onPick={pick}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function FormationLibraryView() {
  const [saved, setSaved] = useState<FormationEntry[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [entries, setEntries] = useState<FormationEntry[]>(() => libraryEntries());
  const [selected, setSelected] = useState<string | null>(() => libraryEntries()[0]?.id ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [repoName, setRepoName] = useState("");
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [view, setView] = useState<FormationView>("adjusted");
  const fileRef = useRef<HTMLInputElement>(null);
  const hist = useRef(freshFormHist());
  const editRef = useRef({ undo: () => {}, redo: () => {} });
  const onDepth = (undo: number, redo: number) => {
    setDepth((prev) => (prev.undo === undo && prev.redo === redo ? prev : { undo, redo }));
  };
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const chosen = entries.find((entry) => entry.id === selected) ?? null;
  const imported = entries.filter((entry) => !entry.id.startsWith("bundled:"));
  const repo = entries.filter((entry) => entry.id.startsWith("bundled:"));

  useEffect(() => {
    const entry = entriesRef.current.find((item) => item.id === selected);
    const name = entry ? entry.name.replace(/\.json$/i, "") : "";
    if (entry?.id.startsWith("bundled:")) {
      setRepoName(name);
      setImportName("");
      return;
    }
    setImportName(entry ? name : "");
    setRepoName("");
  }, [selected]);

  const choose = (id: string) => {
    setSelected(id);
    setView("adjusted");
    setNotice(null);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: FormationEntry[] = [];
    let n = 0;
    let problem: string | null = null;
    for (const file of list) {
      const text = await file.text();
      const parsed = entriesFromFile(file.name, text, () => `${file.name}-${n++}-${crypto.randomUUID()}`);
      if (typeof parsed === "string") {
        problem = parsed;
        continue;
      }
      added.push(...parsed);
    }
    if (!added.length) {
      setNotice(problem);
      return;
    }
    const stored = [...readFormationLibrary(), ...added];
    setNotice(writeFormationLibrary(stored) ?? problem);
    const next = libraryEntries(saved, retired);
    setEntries(next);
    const first = next.find((entry) => entry.id === added[0]?.id);
    if (first) choose(first.id);
  };

  const remove = (id: string) => {
    if (id.startsWith("bundled:")) return;
    const stored = readFormationLibrary().filter((entry) => entry.id !== id);
    const err = writeFormationLibrary(stored);
    setNotice(err);
    const next = libraryEntries(saved, retired);
    setEntries(next);
    if (selected === id) {
      setSelected(next[0]?.id ?? null);
      setView("adjusted");
    }
  };

  const saveCurrent = async (name: string) => {
    if (!chosen || !name.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/formations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          frame: chosen.frame,
          from: chosen.id.startsWith("bundled:") ? chosen.name : undefined,
        }),
      });
    } catch {
      setNotice("Could not save that formation.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not save that formation.");
      return;
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) {
      setNotice("Could not save that formation.");
      return;
    }
    const entry: FormationEntry = {
      id: `bundled:formations/${body.name}:0`,
      name: body.name,
      frame: chosen.frame,
    };
    if (!chosen.id.startsWith("bundled:")) {
      writeFormationLibrary(readFormationLibrary().filter((item) => item.id !== chosen.id));
    }
    const previous = chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    const nextRetired = previous && !retired.includes(previous) ? [...retired, previous] : retired;
    if (nextRetired !== retired) setRetired(nextRetired);
    const nextSaved = [entry, ...saved.filter((item) => item.name !== entry.name && item.name !== previous)];
    setSaved(nextSaved);
    setEntries(libraryEntries(nextSaved, nextRetired));
    setSelected(entry.id);
    setRepoName(body.name.replace(/\.json$/i, ""));
    setImportName("");
    setNotice(`Saved ${body.name}`);
  };

  return (
    <div className="formation-lib">
      <header className="formation-top">
        <div className="formation-banner-title">
          <p className="eyebrow">Library</p>
          <h1>Formations</h1>
        </div>
        <FormationKits />
        <div className="formation-history">
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.undo === 0}
            onKeyDown={(e) => {
              if (e.code === "Space") e.preventDefault();
            }}
            onClick={() => editRef.current.undo()}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.redo === 0}
            onKeyDown={(e) => {
              if (e.code === "Space") e.preventDefault();
            }}
            onClick={() => editRef.current.redo()}
          >
            Redo
          </button>
        </div>
      </header>
      <aside className="formation-side">
        <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
          Import frame
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <VersionSwitch frame={chosen?.frame} view={view} onView={setView} />
        <div className="formation-save">
          <input
            aria-label="Imported formation name"
            value={importName}
            placeholder="Name"
            disabled={!chosen || chosen.id.startsWith("bundled:")}
            onChange={(e) => setImportName(e.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={!chosen || chosen.id.startsWith("bundled:") || !importName.trim()} onClick={() => void saveCurrent(importName)}>
            Save
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || chosen.id.startsWith("bundled:")}
            onClick={() => chosen && remove(chosen.id)}
          >
            Remove
          </button>
        </div>
        {notice ? <p className="formation-note">{notice}</p> : null}
        <FormationList rows={imported} selected={selected} onChoose={choose} />
      </aside>
      <aside className="formation-side formation-repo">
        <VersionSwitch frame={chosen?.frame} view={view} onView={setView} disabled={!chosen?.id.startsWith("bundled:")} />
        <div className="formation-save">
          <input
            aria-label="Formation file name"
            value={repoName}
            placeholder="Name"
            disabled={!chosen || !chosen.id.startsWith("bundled:")}
            onChange={(e) => setRepoName(e.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={!chosen || !chosen.id.startsWith("bundled:") || !repoName.trim()} onClick={() => void saveCurrent(repoName)}>
            Rename
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || chosen.id.startsWith("bundled:")}
            onClick={() => chosen && remove(chosen.id)}
          >
            Remove
          </button>
        </div>
        <FormationList rows={repo} selected={selected} onChoose={choose} />
      </aside>
      <div className="formation-stage">
      {chosen ? (
        <Canvas
          className="rink-canvas"
          shadows={false}
          dpr={[1, 1.25]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
          camera={{ position: [13.2, 9.4, 0], fov: 50, near: 0.15, far: 220 }}
        >
          <FormationStage frame={chosen.frame} view={view} hist={hist} onDepth={onDepth} editRef={editRef} />
        </Canvas>
      ) : (
        <div className="formation-empty">Import a frame to view it.</div>
      )}
      </div>
    </div>
  );
}
