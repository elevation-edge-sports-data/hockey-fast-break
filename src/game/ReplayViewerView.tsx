import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { FormationKits } from "./FormationLibraryView";
import {
  applyReplayPose,
  controlledSkaterIndex,
  mountFormation,
  sampleReplay,
  type FormationFrame,
} from "./formationLibrary";
import { IceCross } from "./IceCross";
import { attachInput, gamepadFaceDown, readActions, windowHasInputFocus } from "./input";
import {
  MARK_STICK_GATE,
  cycleMarkLock,
  iceBasisStep,
  nearestMark,
  orbitStick,
  shadowXZ,
  type IceMark,
  type MarkLock,
} from "./iceMark";
import { PlayerMesh, PuckMesh } from "./PlayerMesh";
import { inferNamedPose } from "./poseOverrideInfer";
import { setPoseInfer } from "./poseOverrides";
import { Rink } from "./Rink.tsx";
import { RinkOrbitCamera, seedFormationOrbit, type RinkPick } from "./RinkOrbitCamera";
import {
  bundledReplayEntries,
  partitionReplayLibrary,
  readReplayLibrary,
  readRetiredReplays,
  replayClipFromFile,
  writeReplayLibrary,
  writeRetiredReplays,
  type ReplayClip,
} from "./replayLibrary";
import { world } from "./sim";
import { gameSpeedRate, useGame } from "./store";

setPoseInfer(inferNamedPose);

const RADIUS_MIN = 4.2;
const RADIUS_MAX = 120;

function editingText(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function sameLock(a: MarkLock | null, b: MarkLock | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind === "puck" && b.kind === "puck") return true;
  return a.kind === "skater" && b.kind === "skater" && a.index === b.index;
}

function viewerShadows(): { players: { x: number; z: number }[]; puck: { x: number; z: number } } {
  return {
    players: world.skaters.map((s) => shadowXZ(s.comX, s.comZ, s.x, s.z)),
    puck: { x: world.puck.x, z: world.puck.z },
  };
}

function snapMark(mark: IceMark): void {
  const lock = mark.lock;
  if (!lock) return;
  if (lock.kind === "puck") {
    mark.x = world.puck.x;
    mark.z = world.puck.z;
    return;
  }
  const s = world.skaters[lock.index];
  if (!s) {
    mark.lock = null;
    return;
  }
  const at = shadowXZ(s.comX, s.comZ, s.x, s.z);
  mark.x = at.x;
  mark.z = at.z;
}

/** Gamepad Y with the stick centered: puck, then each player, then the free X. */
function cycleViewerLock(mark: IceMark): void {
  mark.lock = cycleMarkLock(mark.lock, world.skaters.length);
  mark.driven = false;
  snapMark(mark);
}

function lookOf(mark: IceMark): { x: number; y: number; z: number } {
  if (mark.lock?.kind === "skater") return { x: mark.x, y: 1.05, z: mark.z };
  if (mark.lock?.kind === "puck") return { x: mark.x, y: Math.max(0.4, world.puck.y), z: mark.z };
  return { x: mark.x, y: 0.55, z: mark.z };
}

function paintBar(
  fill: HTMLElement | null,
  label: HTMLElement | null,
  slider: HTMLElement | null,
  cursor: number,
  frames: readonly FormationFrame[],
): void {
  const last = Math.max(0, frames.length - 1);
  const clamped = Math.max(0, Math.min(last, cursor));
  const pct = last === 0 ? 100 : (clamped / last) * 100;
  if (fill) fill.style.width = `${pct}%`;
  const shown = frames[Math.min(last, Math.max(0, Math.floor(clamped)))];
  if (label) label.textContent = shown ? String(shown.frame) : "0";
  if (slider) {
    slider.setAttribute("aria-valuenow", String(Math.round(pct)));
    slider.setAttribute("aria-valuetext", shown ? `frame ${shown.frame}` : "frame 0");
  }
}

function seekClient(clientX: number, el: HTMLDivElement, last: number): number {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  const padL = Number.parseFloat(style.paddingLeft) || 0;
  const padR = Number.parseFloat(style.paddingRight) || 0;
  const borderL = Number.parseFloat(style.borderLeftWidth) || 0;
  const width = Math.max(1, el.clientWidth - padL - padR);
  const x = clientX - (rect.left + borderL + padL);
  return Math.max(0, Math.min(1, x / width)) * last;
}

function ReplayDriver({
  frames,
  cursorRef,
  playingRef,
  setPlaying,
  mark,
  orbit,
  adjusted,
  viewRadius,
  basis,
  fillRef,
  labelRef,
  sliderRef,
  shuttleRef,
  togglePlayRef,
}: {
  frames: readonly FormationFrame[];
  cursorRef: MutableRefObject<number>;
  playingRef: MutableRefObject<boolean>;
  setPlaying: (on: boolean) => void;
  mark: MutableRefObject<IceMark>;
  orbit: MutableRefObject<{ theta: number; phi: number; radius: number }>;
  adjusted: MutableRefObject<boolean>;
  viewRadius: MutableRefObject<number>;
  basis: MutableRefObject<{ rx: number; rz: number; fx: number; fz: number }>;
  fillRef: MutableRefObject<HTMLElement | null>;
  labelRef: MutableRefObject<HTMLElement | null>;
  sliderRef: MutableRefObject<HTMLElement | null>;
  shuttleRef: MutableRefObject<number>;
  togglePlayRef: MutableRefObject<() => void>;
}) {
  const framesRef = useRef(frames);
  const yMoved = useRef(false);
  const yHeld = useRef(false);
  /** True while the gesture that drove the X onto a body is still held. */
  const approachLock = useRef(false);
  framesRef.current = frames;

  useEffect(() => attachInput(window), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const clip = framesRef.current;
    const last = Math.max(0, clip.length - 1);
    const act = readActions();
    const typing = editingText();

    const padPlay = act.aEdge && gamepadFaceDown("a");
    if (padPlay) togglePlayRef.current();

    let scrubbed = false;
    let rate = 0;
    if (act.ltDown) rate = -3.4;
    else if (act.rtDown) rate = 3.4;
    else if (act.lbDown) rate = -0.28;
    else if (act.rbDown) rate = 0.28;
    if (rate === 0) rate = shuttleRef.current;
    const indexStep = 60 * gameSpeedRate(useGame.getState().gameSpeed) * dt;
    if (rate !== 0) {
      cursorRef.current += rate * indexStep;
      scrubbed = true;
    }

    if (scrubbed && playingRef.current && !padPlay) {
      playingRef.current = false;
      setPlaying(false);
    } else if (playingRef.current && !scrubbed) {
      cursorRef.current += indexStep;
    }
    if (cursorRef.current < 0) cursorRef.current = 0;
    if (cursorRef.current > last) cursorRef.current = last;
    if (playingRef.current && cursorRef.current >= last) {
      playingRef.current = false;
      setPlaying(false);
    }

    const sample = sampleReplay(clip, cursorRef.current);
    applyReplayPose(sample.players, sample.puck);
    world.userId = controlledSkaterIndex(sample, sample.players);

    const yDown = gamepadFaceDown("y");
    const focused = windowHasInputFocus();
    if (!focused) {
      if (yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE) yMoved.current = true;
      if (!yDown) yMoved.current = false;
      yHeld.current = yDown;
    } else {
      if (!typing && (act.zoomIn || act.zoomOut)) {
        seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
        const o = orbit.current;
        if (act.zoomIn) o.radius = Math.max(RADIUS_MIN, o.radius - 18 * dt);
        if (act.zoomOut) o.radius = Math.min(RADIUS_MAX, o.radius + 18 * dt);
      }
      if (yDown) {
        if (Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE) yMoved.current = true;
        if (yMoved.current) {
          seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
          const turned = orbitStick(orbit.current.theta, orbit.current.phi, act.stickX, act.stickY, dt);
          orbit.current.theta = turned.theta;
          orbit.current.phi = turned.phi;
        }
      }
      const yTap = !yDown && yHeld.current && !yMoved.current;
      if (!yDown) yMoved.current = false;
      yHeld.current = yDown;
      const live = !yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE;
      const aimLive = Math.hypot(act.aimX, act.aimY) > MARK_STICK_GATE;
      const step = iceBasisStep(
        dt,
        viewRadius.current,
        (typing ? 0 : act.arrowX) + (live ? act.stickX : 0) + (aimLive ? act.aimX : 0),
        (typing ? 0 : act.arrowY) + (live ? act.stickY : 0) + (aimLive ? act.aimY : 0),
        basis.current,
      );
      const cursor = mark.current;
      if (yTap && !step) {
        cycleViewerLock(cursor);
        approachLock.current = false;
      } else if (!step) {
        if (cursor.driven && !cursor.lock) {
          const spots = viewerShadows();
          const hit = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
          if (hit) {
            cursor.lock = hit;
            snapMark(cursor);
          }
        }
        cursor.driven = false;
        approachLock.current = false;
      } else if (cursor.lock && approachLock.current) {
        // This gesture landed on the body. Playback keeps the pose, and the X stays with it.
      } else {
        if (cursor.lock) {
          cursor.lock = null;
          cursor.driven = false;
        }
        const spots = viewerShadows();
        const before = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
        cursor.x += step.dx;
        cursor.z += step.dz;
        const after = nearestMark(cursor.x, cursor.z, spots.players, spots.puck);
        if (!after) cursor.driven = true;
        if (after && cursor.driven && !sameLock(before, after)) {
          cursor.lock = after;
          cursor.driven = false;
          snapMark(cursor);
          approachLock.current = true;
        }
      }
    }
    paintBar(fillRef.current, labelRef.current, sliderRef.current, cursorRef.current, clip);
  });

  return null;
}

function ReplayStage({
  frames,
  cursorRef,
  playingRef,
  setPlaying,
  mark,
  fillRef,
  labelRef,
  sliderRef,
  shuttleRef,
  togglePlayRef,
}: {
  frames: readonly FormationFrame[];
  cursorRef: MutableRefObject<number>;
  playingRef: MutableRefObject<boolean>;
  setPlaying: (on: boolean) => void;
  mark: MutableRefObject<IceMark>;
  fillRef: MutableRefObject<HTMLElement | null>;
  labelRef: MutableRefObject<HTMLElement | null>;
  sliderRef: MutableRefObject<HTMLElement | null>;
  shuttleRef: MutableRefObject<number>;
  togglePlayRef: MutableRefObject<() => void>;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const [rev, setRev] = useState(0);
  const orbit = useRef({ theta: 0, phi: 0.97, radius: 16 });
  const adjusted = useRef(false);
  const viewRadius = useRef(16);
  const basis = useRef({ rx: 0, rz: 1, fx: 1, fz: 0 });
  useLayoutEffect(() => {
    const first = frames[0];
    if (!first) return;
    const prevUser = world.userId;
    const release = mountFormation(first.adjusted);
    const sample = sampleReplay(frames, cursorRef.current);
    applyReplayPose(sample.players, sample.puck);
    world.userId = controlledSkaterIndex(sample, sample.players);
    mark.current = { x: sample.puck.x, z: sample.puck.z, lock: null, driven: false };
    setRev((n) => n + 1);
    return () => {
      release();
      world.userId = prevUser;
    };
  }, [cursorRef, frames, mark]);

  const onPick = (hit: RinkPick) => {
    const cursor = mark.current;
    if (hit.kind === "ice") {
      cursor.lock = null;
      cursor.x = hit.x;
      cursor.z = hit.z;
      return;
    }
    cursor.lock = hit;
    if (hit.kind === "puck") {
      cursor.x = world.puck.x;
      cursor.z = world.puck.z;
      return;
    }
    const s = world.skaters[hit.index];
    if (!s) {
      cursor.lock = null;
      return;
    }
    cursor.x = Number.isFinite(s.comX) ? s.comX : s.x;
    cursor.z = Number.isFinite(s.comZ) ? s.comZ : s.z;
  };

  return (
    <>
      <color attach="background" args={["#0c121c"]} />
      <hemisphereLight args={["#d7e8f4", "#1a2838", 0.7]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[18, 32, 10]} intensity={1.5} />
      <Rink />
      <ReplayDriver
        frames={frames}
        cursorRef={cursorRef}
        playingRef={playingRef}
        setPlaying={setPlaying}
        mark={mark}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
        fillRef={fillRef}
        labelRef={labelRef}
        sliderRef={sliderRef}
        shuttleRef={shuttleRef}
        togglePlayRef={togglePlayRef}
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
          if (cursor.lock?.kind === "skater") {
            const s = world.skaters[cursor.lock.index];
            if (s) {
              cursor.x = Number.isFinite(s.comX) ? s.comX : s.x;
              cursor.z = Number.isFinite(s.comZ) ? s.comZ : s.z;
            }
          } else if (cursor.lock?.kind === "puck") {
            cursor.x = world.puck.x;
            cursor.z = world.puck.z;
          }
          return lookOf(cursor);
        }}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
        onPick={onPick}
      />
      <IceCross mark={mark} />
    </>
  );
}

function TransportIcon({ name }: { name: "fast-rewind" | "slow-rewind" | "play" | "pause" | "slow-forward" | "fast-forward" }) {
  return (
    <svg className="replay-transport-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      {name === "fast-rewind" ? (
        <>
          <polygon points="11 4 3 12 11 20" />
          <polygon points="21 4 13 12 21 20" />
        </>
      ) : null}
      {name === "fast-forward" ? (
        <>
          <polygon points="3 4 11 12 3 20" />
          <polygon points="13 4 21 12 13 20" />
        </>
      ) : null}
      {name === "slow-rewind" ? (
        <>
          <rect x="3" y="4" width="2.4" height="16" />
          <polygon points="20 4 9 12 20 20" />
        </>
      ) : null}
      {name === "slow-forward" ? (
        <>
          <polygon points="4 4 15 12 4 20" />
          <rect x="18.6" y="4" width="2.4" height="16" />
        </>
      ) : null}
      {name === "play" ? <polygon points="7 4 19 12 7 20" /> : null}
      {name === "pause" ? (
        <>
          <rect x="6" y="4" width="3.4" height="16" />
          <rect x="14.6" y="4" width="3.4" height="16" />
        </>
      ) : null}
    </svg>
  );
}

function ShuttleButton({
  label,
  icon,
  rate,
  on,
  disabled,
  onPress,
  onRelease,
}: {
  label: string;
  icon: "fast-rewind" | "slow-rewind" | "slow-forward" | "fast-forward";
  rate: number;
  on: boolean;
  disabled: boolean;
  onPress: (rate: number) => void;
  onRelease: (rate: number) => void;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost${on ? " is-on" : ""}`}
      disabled={disabled}
      aria-label={label}
      aria-pressed={on}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onPress(rate);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerUp={() => onRelease(rate)}
      onPointerCancel={() => onRelease(rate)}
      onLostPointerCapture={() => onRelease(rate)}
      onKeyDown={(e) => {
        if (e.repeat || (e.key !== " " && e.key !== "Enter")) return;
        e.preventDefault();
        onPress(rate);
      }}
      onKeyUp={(e) => {
        if (e.key !== " " && e.key !== "Enter") return;
        onRelease(rate);
      }}
    >
      <TransportIcon name={icon} />
    </button>
  );
}

function libraryEntries(saved: ReplayClip[] = [], retired: string[] = [], memory: ReplayClip[] = []): ReplayClip[] {
  const { imported, repo } = partitionReplayLibrary(memory, bundledReplayEntries(), saved, retired);
  return [...repo, ...imported];
}

function ReplayList({
  rows,
  selected,
  onChoose,
}: {
  rows: ReplayClip[];
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

export function ReplayViewerView() {
  const [memory, setMemory] = useState<ReplayClip[]>(() => readReplayLibrary());
  const [saved, setSaved] = useState<ReplayClip[]>([]);
  const [retired, setRetired] = useState<string[]>(() => readRetiredReplays());
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [repoName, setRepoName] = useState("");
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    () => libraryEntries([], readRetiredReplays(), readReplayLibrary())[0]?.id ?? null,
  );
  const playingRef = useRef(false);
  const cursorRef = useRef(0);
  const markRef = useRef<IceMark>({ x: 0, z: 0, lock: null, driven: false });
  const fileRef = useRef<HTMLInputElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const shuttleRef = useRef(0);
  const [shuttle, setShuttle] = useState(0);
  const togglePlayRef = useRef<() => void>(() => {});
  const entries = useMemo(() => libraryEntries(saved, retired, memory), [saved, retired, memory]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const chosen = entries.find((entry) => entry.id === selected) ?? null;
  const imported = entries.filter((entry) => !entry.id.startsWith("bundled:"));
  const repo = entries.filter((entry) => entry.id.startsWith("bundled:"));
  playingRef.current = playing;

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

  const armClip = (frames: readonly FormationFrame[]) => {
    cursorRef.current = 0;
    playingRef.current = false;
    setPlaying(false);
    shuttleRef.current = 0;
    setShuttle(0);
    const puck = frames[0]?.adjusted.puck;
    if (puck) markRef.current = { x: puck.x, z: puck.z, lock: null, driven: false };
  };

  const choose = (id: string) => {
    if (id === selected) return;
    const entry = entriesRef.current.find((item) => item.id === id);
    if (!entry) return;
    armClip(entry.frames);
    setSelected(id);
    setNotice(null);
  };

  const togglePlay = () => {
    shuttleRef.current = 0;
    setShuttle(0);
    if (!chosen) return;
    const next = !playingRef.current;
    if (next && cursorRef.current >= chosen.frames.length - 1) cursorRef.current = 0;
    playingRef.current = next;
    setPlaying(next);
  };
  togglePlayRef.current = togglePlay;

  const pressShuttle = (rate: number) => {
    if (!chosen) return;
    shuttleRef.current = rate;
    setShuttle(rate);
    if (playingRef.current) {
      playingRef.current = false;
      setPlaying(false);
    }
  };
  const releaseShuttle = (rate: number) => {
    if (shuttleRef.current !== rate) return;
    shuttleRef.current = 0;
    setShuttle(0);
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const parsed = replayClipFromFile(file.name, text, `${file.name}-${crypto.randomUUID()}`);
    if (typeof parsed === "string") {
      setNotice(parsed);
      return;
    }
    const nextMemory = [...memory, parsed];
    setMemory(nextMemory);
    setNotice(writeReplayLibrary(nextMemory));
    armClip(parsed.frames);
    setSelected(parsed.id);
  };

  const keepRetired = (names: string[]) => {
    setRetired(names);
    writeRetiredReplays(names);
  };

  const remove = (id: string) => {
    if (id.startsWith("bundled:")) return;
    const nextMemory = memory.filter((clip) => clip.id !== id);
    setMemory(nextMemory);
    setNotice(writeReplayLibrary(nextMemory));
    if (selected !== id) return;
    const next = libraryEntries(saved, retired, nextMemory);
    const fallback = next[0];
    if (!fallback) {
      playingRef.current = false;
      setPlaying(false);
      shuttleRef.current = 0;
      setShuttle(0);
      setSelected(null);
      return;
    }
    armClip(fallback.frames);
    setSelected(fallback.id);
  };

  const removeRepo = async (id: string) => {
    const clip = entriesRef.current.find((item) => item.id === id);
    if (!clip || !clip.id.startsWith("bundled:")) return;
    let res: Response;
    try {
      res = await fetch("/api/replays", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: clip.name }),
      });
    } catch {
      setNotice("Could not remove that replay.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not remove that replay.");
      return;
    }
    const nextSaved = saved.filter((item) => item.name !== clip.name);
    const nextRetired = retired.includes(clip.name) ? retired : [...retired, clip.name];
    setSaved(nextSaved);
    keepRetired(nextRetired);
    const removedName = clip.name;
    setNotice(`Removed ${removedName}`);
    if (selected !== id) return;
    const next = libraryEntries(nextSaved, nextRetired, memory);
    const fallback = next[0];
    if (!fallback) {
      playingRef.current = false;
      setPlaying(false);
      shuttleRef.current = 0;
      setShuttle(0);
      setSelected(null);
      setRepoName("");
      return;
    }
    armClip(fallback.frames);
    setSelected(fallback.id);
  };

  const saveCurrent = async (name: string) => {
    if (!chosen || !name.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/replays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          frames: chosen.frames,
          from: chosen.id.startsWith("bundled:") ? chosen.name : undefined,
        }),
      });
    } catch {
      setNotice("Could not save that replay.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not save that replay.");
      return;
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) {
      setNotice("Could not save that replay.");
      return;
    }
    const entry: ReplayClip = {
      id: `bundled:replays/${body.name}:0`,
      name: body.name,
      frames: chosen.frames,
    };
    if (!chosen.id.startsWith("bundled:")) {
      const nextMemory = memory.filter((item) => item.id !== chosen.id);
      setMemory(nextMemory);
      writeReplayLibrary(nextMemory);
    }
    const previous = chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    let nextRetired = retired.filter((name) => name !== entry.name);
    if (previous && previous !== entry.name && !nextRetired.includes(previous)) nextRetired = [...nextRetired, previous];
    if (nextRetired.join("\0") !== retired.join("\0")) keepRetired(nextRetired);
    const nextSaved = [entry, ...saved.filter((item) => item.name !== entry.name && item.name !== previous)];
    setSaved(nextSaved);
    setSelected(entry.id);
    setRepoName(body.name.replace(/\.json$/i, ""));
    setImportName("");
    setNotice(`Saved ${body.name}`);
  };

  const stopForSeek = () => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
  };

  const last = chosen ? Math.max(0, chosen.frames.length - 1) : 0;

  return (
    <div
      className="formation-lib replay-view"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        void loadFile(file);
      }}
    >
      <header className="formation-top">
        <FormationKits />
        <div className="replay-transport" role="group" aria-label="Playback">
          <ShuttleButton label="Fast rewind" icon="fast-rewind" rate={-3.4} on={shuttle === -3.4} disabled={!chosen} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Slow rewind" icon="slow-rewind" rate={-0.28} on={shuttle === -0.28} disabled={!chosen} onPress={pressShuttle} onRelease={releaseShuttle} />
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen}
            aria-pressed={playing}
            aria-label="Play/pause"
            onClick={togglePlay}
          >
            <TransportIcon name={playing && shuttle === 0 ? "pause" : "play"} />
          </button>
          <ShuttleButton label="Slow forward" icon="slow-forward" rate={0.28} on={shuttle === 0.28} disabled={!chosen} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Fast forward" icon="fast-forward" rate={3.4} on={shuttle === 3.4} disabled={!chosen} onPress={pressShuttle} onRelease={releaseShuttle} />
        </div>
      </header>
      <aside className="formation-side">
        <p className="eyebrow">Replay</p>
        <h1>Replay</h1>
        <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
          Load replay
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void loadFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn-ghost"
          disabled={!chosen}
          aria-pressed={playing}
          onClick={togglePlay}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div className="formation-save">
          <input
            aria-label="Loaded replay name"
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
        <ReplayList rows={imported} selected={selected} onChoose={choose} />
      </aside>
      <aside className="formation-side formation-repo">
        <div className="formation-save">
          <input
            aria-label="Replay file name"
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
            disabled={!chosen || !repo.some((entry) => entry.id === chosen.id)}
            onClick={() => chosen && void removeRepo(chosen.id)}
          >
            Remove
          </button>
        </div>
        <ReplayList rows={repo} selected={selected} onChoose={choose} />
      </aside>
      <div className="formation-stage">
        {chosen ? (
          <>
            <Canvas
              key={chosen.id}
              className="rink-canvas"
              shadows={false}
              dpr={[1, 1.25]}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
              camera={{ position: [13.2, 9.4, 0], fov: 50, near: 0.15, far: 220 }}
            >
              <ReplayStage
                frames={chosen.frames}
                cursorRef={cursorRef}
                playingRef={playingRef}
                setPlaying={setPlaying}
                mark={markRef}
                fillRef={fillRef}
                labelRef={labelRef}
                sliderRef={sliderRef}
                shuttleRef={shuttleRef}
                togglePlayRef={togglePlayRef}
              />
            </Canvas>
            <div
              ref={sliderRef}
              className="replay-bar madden-replay"
              role="slider"
              aria-label="Replay position"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={0}
            >
              <div
                ref={trackRef}
                className="madden-replay-track"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  stopForSeek();
                  (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
                  cursorRef.current = seekClient(e.clientX, e.currentTarget, last);
                }}
                onPointerMove={(e) => {
                  if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
                  cursorRef.current = seekClient(e.clientX, e.currentTarget, last);
                }}
              >
                <div className="madden-replay-lane">
                  <div ref={fillRef} className="madden-replay-fill" />
                </div>
              </div>
              <span ref={labelRef} className="madden-replay-pct">
                0
              </span>
            </div>
          </>
        ) : (
          <div className="formation-empty">Drop a replay JSON file.</div>
        )}
      </div>
    </div>
  );
}
