import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import { FormationKits } from "./FormationLibraryView";
import {
  applyReplayPose,
  controlledSkaterIndex,
  mountFormation,
  parseFormationJson,
  sampleReplay,
  type FormationFrame,
} from "./formationLibrary";
import { IceCross } from "./IceCross";
import { attachInput, gamepadFaceDown, readActions } from "./input";
import { MARK_STICK_GATE, iceBasisStep, orbitStick, type IceMark } from "./iceMark";
import { PlayerMesh, PuckMesh } from "./PlayerMesh";
import { inferNamedPose } from "./poseOverrideInfer";
import { setPoseInfer } from "./poseOverrides";
import { Rink } from "./Rink.tsx";
import { RinkOrbitCamera, seedFormationOrbit, type RinkPick } from "./RinkOrbitCamera";
import { world } from "./sim";
import { useGame } from "./store";

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
  framesRef.current = frames;

  useEffect(() => attachInput(window), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const clip = framesRef.current;
    const last = Math.max(0, clip.length - 1);
    const act = readActions();
    const typing = editingText();
    if (!typing && (act.zoomIn || act.zoomOut)) {
      seedFormationOrbit(lookOf(mark.current), orbit.current, adjusted);
      const o = orbit.current;
      if (act.zoomIn) o.radius = Math.max(RADIUS_MIN, o.radius - 18 * dt);
      if (act.zoomOut) o.radius = Math.min(RADIUS_MAX, o.radius + 18 * dt);
    }

    const padPlay = act.aEdge && gamepadFaceDown("a");
    if (padPlay) togglePlayRef.current();

    let scrubbed = false;
    let rate = 0;
    if (act.ltDown) rate = -3.4;
    else if (act.rtDown) rate = 3.4;
    else if (act.lbDown) rate = -0.28;
    else if (act.rbDown) rate = 0.28;
    if (rate === 0) rate = shuttleRef.current;
    if (rate !== 0) {
      cursorRef.current += rate * 60 * dt;
      scrubbed = true;
    }

    if (scrubbed && playingRef.current && !padPlay) {
      playingRef.current = false;
      setPlaying(false);
    } else if (playingRef.current && !scrubbed) {
      cursorRef.current += dt * 60;
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
    const live = !yDown && Math.hypot(act.stickX, act.stickY) > MARK_STICK_GATE;
    const aimLive = Math.hypot(act.aimX, act.aimY) > MARK_STICK_GATE;
    const step = iceBasisStep(
      dt,
      viewRadius.current,
      (typing ? 0 : act.arrowX) + (live ? act.stickX : 0) + (aimLive ? act.aimX : 0),
      (typing ? 0 : act.arrowY) + (live ? act.stickY : 0) + (aimLive ? act.aimY : 0),
      basis.current,
    );
    if (step) {
      mark.current.lock = null;
      mark.current.x += step.dx;
      mark.current.z += step.dz;
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

export function ReplayViewerView() {
  const [clip, setClip] = useState<{ name: string; frames: FormationFrame[] } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
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
  playingRef.current = playing;

  const togglePlay = () => {
    shuttleRef.current = 0;
    setShuttle(0);
    if (!clip) return;
    const next = !playingRef.current;
    if (next && cursorRef.current >= clip.frames.length - 1) cursorRef.current = 0;
    playingRef.current = next;
    setPlaying(next);
  };
  togglePlayRef.current = togglePlay;

  const pressShuttle = (rate: number) => {
    if (!clip) return;
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
    const parsed = parseFormationJson(await file.text());
    if (typeof parsed === "string") {
      setNotice(parsed);
      return;
    }
    cursorRef.current = 0;
    playingRef.current = false;
    setPlaying(false);
    const puck = parsed[0]!.adjusted.puck;
    markRef.current = { x: puck.x, z: puck.z, lock: null, driven: false };
    setClip({ name: file.name, frames: parsed });
    setNotice(null);
  };

  const stopForSeek = () => {
    if (!playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
  };

  const last = clip ? Math.max(0, clip.frames.length - 1) : 0;

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
          <ShuttleButton label="Fast rewind" icon="fast-rewind" rate={-3.4} on={shuttle === -3.4} disabled={!clip} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Slow rewind" icon="slow-rewind" rate={-0.28} on={shuttle === -0.28} disabled={!clip} onPress={pressShuttle} onRelease={releaseShuttle} />
          <button
            type="button"
            className="btn-ghost"
            disabled={!clip}
            aria-pressed={playing}
            aria-label="Play/pause"
            onClick={togglePlay}
          >
            <TransportIcon name={playing && shuttle === 0 ? "pause" : "play"} />
          </button>
          <ShuttleButton label="Slow forward" icon="slow-forward" rate={0.28} on={shuttle === 0.28} disabled={!clip} onPress={pressShuttle} onRelease={releaseShuttle} />
          <ShuttleButton label="Fast forward" icon="fast-forward" rate={3.4} on={shuttle === 3.4} disabled={!clip} onPress={pressShuttle} onRelease={releaseShuttle} />
        </div>
      </header>
      <aside className="formation-side">
        <p className="eyebrow">Replay</p>
        <h1>Replay</h1>
        <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
          Open replay
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
          disabled={!clip}
          aria-pressed={playing}
          onClick={togglePlay}
        >
          {playing ? "Pause" : "Play"}
        </button>
        {clip ? <p className="formation-note">{clip.name}</p> : null}
        {notice ? <p className="formation-note">{notice}</p> : null}
      </aside>
      <div className="formation-stage">
        {clip ? (
          <>
            <Canvas
              key={`${clip.name}:${clip.frames.length}:${clip.frames[0]?.frame ?? 0}`}
              className="rink-canvas"
              shadows={false}
              dpr={[1, 1.25]}
              gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
              camera={{ position: [13.2, 9.4, 0], fov: 50, near: 0.15, far: 220 }}
            >
              <ReplayStage
                frames={clip.frames}
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
