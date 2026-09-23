import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { setTouchBurst, setTouchFace, setTouchLt, setTouchMove } from "./input";
import {
  resetWorld,
  world,
  attackCompass,
  cycleAimCompass,
  setPracticeDrop,
  beginPauseCam,
  beginPauseReplay,
  stopPauseReplay,
  replayHasFootage,
  drillMaxScore,
  previewPausedMode,
  previewPausedTargets,
  previewPausedMinutes,
  resumePausedGame,
  resetPausedGame,
} from "./sim";
import {
  lineupTotal,
  modeLineupCap,
  patchLineup,
  useGame,
  type CamMode,
  type Lineup,
} from "./store";
import { kitById, UNIFORMS, type UniformKit } from "./uniforms";

function Swatch({
  id,
  selected,
  disabled,
  onPick,
}: {
  id: number;
  selected: boolean;
  disabled: boolean;
  onPick: (id: number) => void;
}) {
  const u = UNIFORMS[id]!;
  return (
    <button
      type="button"
      aria-label={`Kit ${id + 1}`}
      disabled={disabled}
      onClick={() => onPick(id)}
      className={`uni-swatch${selected ? " is-on" : ""}`}
    >
      <span style={{ background: u.helmet }} />
      <span style={{ background: u.jersey }} />
      <span style={{ background: u.pants }} />
    </button>
  );
}

function StickPad() {
  const wrap = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);

  const apply = (clientX: number, clientY: number) => {
    const el = wrap.current;
    const k = knob.current;
    if (!el || !k) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let x = (clientX - cx) / (r.width / 2);
    let y = (clientY - cy) / (r.height / 2);
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    k.style.transform = `translate(${x * 28}px, ${y * 28}px)`;
    setTouchMove(x, -y);
  };

  const end = () => {
    pid.current = null;
    setTouchMove(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0,0)";
  };

  return (
    <div
      ref={wrap}
      className="stick"
      onPointerDown={(e) => {
        pid.current = e.pointerId;
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
        apply(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (pid.current === e.pointerId) apply(e.clientX, e.clientY);
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div ref={knob} className="stick-knob" />
    </div>
  );
}

function FaceBtn({
  face,
  label,
  hold,
  className,
}: {
  face: "a" | "x" | "y" | "b";
  label: string;
  hold?: boolean;
  className: string;
}) {
  const down = (v: boolean) => {
    if (face === "b") setTouchBurst(v);
    setTouchFace(face, v);
  };
  return (
    <button
      type="button"
      className={className}
      onPointerDown={() => down(true)}
      onPointerUp={() => down(false)}
      onPointerCancel={() => down(false)}
    >
      <small>{face.toUpperCase()}</small>
      {label}
      {hold ? <em>hold</em> : null}
    </button>
  );
}

function Stepper({
  label,
  slot,
  lineup,
  onChange,
  disabled,
}: {
  label: string;
  slot: keyof Lineup;
  lineup: Lineup;
  onChange: (l: Lineup) => void;
  disabled: boolean;
}) {
  const max = slot === "g" ? 1 : slot === "d" ? 2 : 4;
  const val = lineup[slot];
  const total = lineupTotal(lineup);
  const cap = modeLineupCap(useGame.getState().clockMode);
  const canInc = !disabled && val < max && total < cap;
  const canDec = !disabled && val > 0;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper-row">
        <button type="button" aria-label={`${label} down`} disabled={!canDec} onClick={() => onChange(patchLineup(lineup, slot, val - 1, cap))}>
          −
        </button>
        <b>{val}</b>
        <button type="button" aria-label={`${label} up`} disabled={!canInc} onClick={() => onChange(patchLineup(lineup, slot, val + 1, cap))}>
          +
        </button>
      </div>
    </div>
  );
}

function AimCompass({ flip = false }: { flip?: boolean }) {
  const [dir, setDir] = useState<"up" | "down" | "left" | "right">("up");
  useEffect(() => {
    let id = 0;
    const tick = () => {
      const d = attackCompass();
      setDir((prev) => (prev === d ? prev : d));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const shown =
    !flip
      ? dir
      : dir === "up"
        ? "down"
        : dir === "down"
          ? "up"
          : dir === "left"
            ? "right"
            : "left";
  const ch = shown === "up" ? "↑" : shown === "down" ? "↓" : shown === "left" ? "←" : "→";
  return (
    <button
      type="button"
      className="aim-compass"
      title={`Attack ${shown} — click to rotate`}
      aria-label={`Attack ${shown}, click to rotate aim`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        cycleAimCompass();
      }}
    >
      {ch}
    </button>
  );
}

function UniStripe({ kit }: { kit: UniformKit }) {
  return (
    <span className="uni-stripe" aria-hidden="true">
      <i style={{ background: kit.helmet }} />
      <i style={{ background: kit.jersey }} />
      <i style={{ background: kit.pants }} />
    </span>
  );
}

function LineupStrip({
  lineup,
  onChange,
  disabled,
}: {
  lineup: Lineup;
  onChange: (l: Lineup) => void;
  disabled: boolean;
}) {
  return (
    <div className="lineup-strip is-vert">
      <Stepper label="F" slot="o" lineup={lineup} onChange={onChange} disabled={disabled} />
      <Stepper label="D" slot="d" lineup={lineup} onChange={onChange} disabled={disabled} />
      <Stepper label="G" slot="g" lineup={lineup} onChange={onChange} disabled={disabled} />
    </div>
  );
}

const CAMS: { id: CamMode; label: string; blurb: string }[] = [
  { id: "classic", label: "Classic", blurb: "Angled up-ice — CPU net at the top, camera follows the puck" },
  { id: "chase", label: "Chase", blurb: "Third-person behind the puck" },
  { id: "broadcast", label: "Broadcast", blurb: "Sideline TV angle, always on the puck" },
  { id: "high", label: "High", blurb: "Straight-down from the rafters, puck at center" },
  { id: "freestyle", label: "Freestyle", blurb: "Free orbit around the puck — pause to look around" },
];

function fmtClock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  const m = Math.floor(t / 60);
  const r = t % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function AbilitySliders() {
  const gameSpeed = useGame((s) => s.gameSpeed);
  const setGameSpeed = useGame((s) => s.setGameSpeed);
  return (
    <div className="ability-sliders">
      <label className="ability-row">
        <span>Game Speed</span>
        <input
          type="range"
          min={0.5}
          max={1.5}
          step={0.05}
          value={gameSpeed}
          aria-label="Game Speed"
          onChange={(e) => setGameSpeed(Number(e.target.value))}
        />
        <b>{Math.round(((gameSpeed - 0.5) / 1) * 20) * 5}</b>
      </label>
    </div>
  );
}

function SideSliders({ who }: { who: "user" | "cpu" }) {
  const userOffense = useGame((s) => s.userOffense);
  const userDefense = useGame((s) => s.userDefense);
  const userGoalie = useGame((s) => s.userGoalie);
  const cpuOffense = useGame((s) => s.cpuOffense);
  const cpuDefense = useGame((s) => s.cpuDefense);
  const cpuGoalie = useGame((s) => s.cpuGoalie);
  const setUserOffense = useGame((s) => s.setUserOffense);
  const setUserDefense = useGame((s) => s.setUserDefense);
  const setUserGoalie = useGame((s) => s.setUserGoalie);
  const setCpuOffense = useGame((s) => s.setCpuOffense);
  const setCpuDefense = useGame((s) => s.setCpuDefense);
  const setCpuGoalie = useGame((s) => s.setCpuGoalie);
  const rows =
    who === "user"
      ? [
          { label: "Offense", value: userOffense, min: 0, max: 1.2, set: setUserOffense },
          { label: "Defense", value: userDefense, min: 0, max: 2, set: setUserDefense },
          { label: "Goalie", value: userGoalie, min: 0, max: 1, set: setUserGoalie },
        ]
      : [
          { label: "Offense", value: cpuOffense, min: 0, max: 2, set: setCpuOffense },
          { label: "Defense", value: cpuDefense, min: 0, max: 2, set: setCpuDefense },
          { label: "Goalie", value: cpuGoalie, min: 0, max: 1.6, set: setCpuGoalie },
        ];
  return (
    <div className="hud-sliders">
      {rows.map((row) => (
        <label key={row.label} className="hud-slider-row">
          <span>{row.label}</span>
          <input
            type="range"
            min={row.min}
            max={row.max}
            step={(row.max - row.min) / 20}
            value={row.value}
            aria-label={`${who} ${row.label}`}
            onChange={(e) => row.set(Number(e.target.value))}
          />
        </label>
      ))}
    </div>
  );
}

function chooseMode(m: "drill" | "practice" | "scrimmage" | "game"): void {
  const ui = useGame.getState();
  if (ui.playing && ui.paused) {
    previewPausedMode(m);
    return;
  }
  ui.setClockMode(m);
  resetWorld();
}

function GameMinutes() {
  const gameMinutes = useGame((s) => s.gameMinutes);
  const setGameMinutes = useGame((s) => s.setGameMinutes);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const setMin = (n: number) => {
    if (playing && paused) previewPausedMinutes(n);
    else setGameMinutes(n);
  };
  return (
    <div className="clock-mins">
      <button type="button" aria-label="Fewer minutes" disabled={gameMinutes <= 1} onClick={() => setMin(gameMinutes - 1)}>
        −
      </button>
      <b>{gameMinutes}</b>
      <button type="button" aria-label="More minutes" disabled={gameMinutes >= 5} onClick={() => setMin(gameMinutes + 1)}>
        +
      </button>
      <span>minutes</span>
    </div>
  );
}

function ClockSetup() {
  const clockMode = useGame((s) => s.clockMode);
  return (
    <div className="clock-setup">
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "drill" ? "is-on" : ""}
          onClick={() => chooseMode("drill")}
        >
          Drill
        </button>
        {clockMode === "drill" ? (
          <>
            <p className="clock-untimed">1:00</p>
            <DrillTargetPick />
          </>
        ) : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "practice" ? "is-on" : ""}
          onClick={() => chooseMode("practice")}
        >
          Practice
        </button>
        {clockMode === "practice" ? (
          <>
            <p className="clock-untimed">Untimed</p>
            <p className="clock-untimed drop-hint">Click ice to set drop</p>
          </>
        ) : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "scrimmage" ? "is-on" : ""}
          onClick={() => chooseMode("scrimmage")}
        >
          Scrimmage
        </button>
        {clockMode === "scrimmage" ? <p className="clock-untimed">Untimed</p> : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "game" ? "is-on" : ""}
          onClick={() => chooseMode("game")}
        >
          Game
        </button>
        {clockMode === "game" ? <GameMinutes /> : null}
      </div>
    </div>
  );
}

type MenuId = "mode" | "controller" | "gameplay" | "camera";

const MODES: { id: "drill" | "practice" | "scrimmage" | "game"; label: string }[] = [
  { id: "drill", label: "Drill" },
  { id: "practice", label: "Practice" },
  { id: "scrimmage", label: "Scrimmage" },
  { id: "game", label: "Game" },
];

function DrillTargetPick() {
  const drillTargets = useGame((s) => s.drillTargets);
  const pick = (n: 8 | 12) => {
    if (drillTargets === n) return;
    previewPausedTargets(n);
  };
  return (
    <div className="clock-mins">
      <button type="button" className={drillTargets === 8 ? "is-on" : ""} onClick={() => pick(8)}>
        8
      </button>
      <button type="button" className={drillTargets === 12 ? "is-on" : ""} onClick={() => pick(12)}>
        12
      </button>
    </div>
  );
}

function MainMenus() {
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [help, setHelp] = useState(false);
  const controlProfile = useGame((s) => s.controlProfile);
  const setControlProfile = useGame((s) => s.setControlProfile);
  const powerPlay = useGame((s) => s.powerPlay);
  const setPowerPlay = useGame((s) => s.setPowerPlay);
  const offsides = useGame((s) => s.offsides);
  const setOffsides = useGame((s) => s.setOffsides);
  const checkRefs = useGame((s) => s.checkRefs);
  const setCheckRefs = useGame((s) => s.setCheckRefs);
  const checkGoalies = useGame((s) => s.checkGoalies);
  const setCheckGoalies = useGame((s) => s.setCheckGoalies);
  const camMode = useGame((s) => s.camMode);
  const setCamMode = useGame((s) => s.setCamMode);
  const arenaLook = useGame((s) => s.arenaLook);
  const setArenaLook = useGame((s) => s.setArenaLook);
  const clockMode = useGame((s) => s.clockMode);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const setPaused = useGame((s) => s.setPaused);
  const replay = useGame((s) => s.replay);
  const toggle = (id: MenuId) => setMenu((cur) => (cur === id ? null : id));
  const blurb =
    controlProfile === "wings"
      ? "LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB takes goalie; RB dives."
      : "Current map, LT goalie.";
  const startReplay = () => {
    if (replay) {
      stopPauseReplay();
      return;
    }
    if (!playing || !replayHasFootage()) return;
    if (!paused) {
      beginPauseCam(camMode);
      setPaused(true);
    }
    beginPauseReplay();
  };
  return (
    <div className="menu-stack">
      {menu === "camera" ? (
        <div className="cam-row menu-sub">
          <button
            type="button"
            className={arenaLook === "light" ? "is-on" : ""}
            onClick={() => setArenaLook("light")}
          >
            Rink Light
          </button>
          <button
            type="button"
            className={arenaLook === "dark" ? "is-on" : ""}
            onClick={() => setArenaLook("dark")}
          >
            Rink Dark
          </button>
        </div>
      ) : null}
      {menu === "mode" ? (
        <div className="mode-grid">
          {clockMode === "drill" || clockMode === "game" ? (
            <>
              <div>{clockMode === "drill" ? <DrillTargetPick /> : null}</div>
              <div />
              <div />
              <div>{clockMode === "game" ? <GameMinutes /> : null}</div>
            </>
          ) : null}
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={clockMode === m.id ? "is-on" : ""}
              onClick={() => chooseMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : null}
      {menu && menu !== "mode" ? (
        <div className="cam-row menu-sub">
          {menu === "controller" ? (
            <>
              <button
                type="button"
                className={controlProfile === "classic" ? "is-on" : ""}
                title="Current map, LT goalie."
                onClick={() => setControlProfile("classic")}
              >
                Classic
              </button>
              <button
                type="button"
                className={controlProfile === "wings" ? "is-on" : ""}
                title="LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB takes goalie; RB dives."
                onClick={() => setControlProfile("wings")}
              >
                Wings
              </button>
              <p className="hint menu-blurb">{blurb}</p>
            </>
          ) : null}
          {menu === "gameplay" ? (
            <>
              <button
                type="button"
                className={offsides ? "is-on" : ""}
                aria-pressed={offsides}
                onClick={() => setOffsides(!offsides)}
              >
                Offsides
              </button>
              <button
                type="button"
                className={powerPlay ? "is-on" : ""}
                title="Scored-on team gets a player out of the box on the next faceoff"
                aria-pressed={powerPlay}
                onClick={() => setPowerPlay(!powerPlay)}
              >
                Power Play
              </button>
              <button
                type="button"
                className={checkRefs ? "is-on" : ""}
                aria-pressed={checkRefs}
                onClick={() => setCheckRefs(!checkRefs)}
              >
                Check Refs
              </button>
              <button
                type="button"
                className={checkGoalies ? "is-on" : ""}
                aria-pressed={checkGoalies}
                onClick={() => setCheckGoalies(!checkGoalies)}
              >
                Check Goalies
              </button>
            </>
          ) : null}
          {menu === "camera" ? (
            CAMS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={camMode === c.id ? "is-on" : ""}
                title={c.blurb}
                onClick={() => setCamMode(c.id)}
              >
                {c.label}
              </button>
            ))
          ) : null}
        </div>
      ) : null}
      <div className="cam-row">
        <button
          type="button"
          className={menu === "mode" ? "is-on" : ""}
          aria-expanded={menu === "mode"}
          onClick={() => toggle("mode")}
        >
          Mode
        </button>
        <button
          type="button"
          className={menu === "controller" ? "is-on" : ""}
          aria-expanded={menu === "controller"}
          onClick={() => toggle("controller")}
        >
          Controller
        </button>
        <button
          type="button"
          className={menu === "gameplay" ? "is-on" : ""}
          aria-expanded={menu === "gameplay"}
          onClick={() => toggle("gameplay")}
        >
          Gameplay
        </button>
        <button
          type="button"
          className={menu === "camera" ? "is-on" : ""}
          aria-expanded={menu === "camera"}
          onClick={() => toggle("camera")}
        >
          Camera
        </button>
        <button
          type="button"
          className={replay ? "is-on" : ""}
          disabled={!replay && (!playing || !replayHasFootage())}
          onClick={startReplay}
        >
          Replay
        </button>
        <div className="cam-pop">
          {help ? <ControlsHelp /> : null}
          <button
            type="button"
            className={help ? "is-on" : ""}
            aria-expanded={help}
            onClick={() => setHelp((v) => !v)}
          >
            Info
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlsHelp() {
  const wings = useGame((s) => s.controlProfile) === "wings";
  return (
    <div className="help-tip">
      <p className="hint">
        {wings
          ? "A / E start · WASD skate · F shot · Q deke/hit · Space burst · G left · Shift right · LB / N goalie · M / RB dive · P pause"
          : "A / E start · WASD skate · F shot · Q deke/hit · Space burst · Shift / RT dive · G / LT net · P pause"}
      </p>
      <dl className="legend">
        <div>
          <dt>With puck</dt>
          <dd>A pass / hold saucer · X wrist / hold slap · B cancel slap · Y deke</dd>
        </div>
        <div>
          <dt>No puck</dt>
          <dd>
            {wings
              ? "A switch · X poke / one-timer / hold slap one-timer · Y hit · B burst · G / LT left · Shift / RT right · RB / M dive · frozen puck: Y check"
              : "A switch · X poke / one-timer / hold slap one-timer · Y hit · B burst · RT / Shift dive · frozen puck: Y check"}
          </dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>
            {wings
              ? "Hold LB, comma, or N — take your goalie (only if you don't have the puck)"
              : "Hold LT or G — take your goalie (only if you don't have the puck)"}
          </dd>
        </div>
        {wings ? (
          <div>
            <dt>Wings</dt>
            <dd>LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB takes goalie; RB dives.</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function placeOffscreenArrow(el: HTMLDivElement, x: number, y: number, onScreen: boolean) {
  let ex: number;
  let ey: number;
  if (onScreen) {
    ex = Math.max(-0.92, Math.min(0.92, x));
    ey = Math.max(-0.82, Math.min(0.82, y));
  } else {
    const ax = Math.abs(x) / 0.9;
    const ay = Math.abs(y) / 0.8;
    if (ax > ay) {
      ex = Math.sign(x || 1) * 0.9;
      ey = Math.max(-0.8, Math.min(0.8, (y / (Math.abs(x) || 1)) * 0.9));
    } else {
      ey = Math.sign(y || 1) * 0.8;
      ex = Math.max(-0.9, Math.min(0.9, (x / (Math.abs(y) || 1)) * 0.8));
    }
  }
  el.style.opacity = "1";
  el.style.left = `${50 + ex * 50}%`;
  el.style.top = `${50 - ey * 50}%`;
  el.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(x, y)}rad)`;
}

function OffscreenArrow({ kind }: { kind: "user" | "puck" }) {
  const ref = useRef<HTMLDivElement>(null);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const homeKit = useGame((s) => s.homeKit);
  const teamColor = kitById(homeKit).ribbon;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = ref.current;
      if (el) {
        const visible = kind === "user" ? world.userVisible : world.puckVisible;
        const on = playing && !paused && !visible;
        if (!on) {
          el.style.opacity = "0";
        } else {
          const x = kind === "user" ? world.userSx : world.puckSx;
          const y = kind === "user" ? world.userSy : world.puckSy;
          const onScreen = Math.abs(x) <= 0.94 && Math.abs(y) <= 0.86;
          placeOffscreenArrow(el, x, y, onScreen);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, paused, kind]);

  return (
    <div
      ref={ref}
      className={`offscreen-arrow${kind === "puck" ? " is-puck" : ""}`}
      style={kind === "user" ? { color: teamColor } : undefined}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" width="32" height="32">
        <path d="M12 2 L22 20 L12 15 L2 20 Z" />
      </svg>
    </div>
  );
}

function PauseOrbit() {
  const paused = useGame((s) => s.paused);
  const replay = useGame((s) => s.replay);
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  if (!paused || replay) return null;
  return (
    <div
      className="pause-orbit"
      onPointerDown={(e) => {
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        const fc = world.freeCam;
        fc.theta -= dx * 0.008;
        fc.phi = Math.max(0.12, Math.min(1.45, fc.phi + dy * 0.006));
        world.pauseDirty = true;
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onWheel={(e) => {
        world.freeCam.radius = Math.max(4.2, Math.min(120, world.freeCam.radius + e.deltaY * 0.02));
        world.pauseDirty = true;
      }}
    />
  );
}

export function Overlay() {
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const camMode = useGame((s) => s.camMode);
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const homeLineup = useGame((s) => s.homeLineup);
  const awayLineup = useGame((s) => s.awayLineup);
  const liveHome = useGame((s) => s.liveHome);
  const liveAway = useGame((s) => s.liveAway);
  const speed = useGame((s) => s.speed);
  const pad = useGame((s) => s.pad);
  const hasPuck = useGame((s) => s.hasPuck);
  const charge = useGame((s) => s.charge);
  const chargeKind = useGame((s) => s.chargeKind);
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const whistle = useGame((s) => s.whistle);
  const replay = useGame((s) => s.replay);
  const clockMode = useGame((s) => s.clockMode);
  const controlProfile = useGame((s) => s.controlProfile);
  const periodClock = useGame((s) => s.periodClock);
  const drillScore = useGame((s) => s.drillScore);
  const drillTargets = useGame((s) => s.drillTargets);
  const periodOver = useGame((s) => s.periodOver);
  const setPlaying = useGame((s) => s.setPlaying);
  const setPaused = useGame((s) => s.setPaused);
  const setHomeKit = useGame((s) => s.setHomeKit);
  const setAwayKit = useGame((s) => s.setAwayKit);
  const setHomeLineup = useGame((s) => s.setHomeLineup);
  const setAwayLineup = useGame((s) => s.setAwayLineup);

  useEffect(() => {
    if (!paused) return;
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  }, [paused]);

  const applyHome = useCallback(
    (l: Lineup) => {
      setHomeLineup(l);
      resetWorld();
    },
    [setHomeLineup],
  );
  const applyAway = useCallback(
    (l: Lineup) => {
      setAwayLineup(l);
      resetWorld();
    },
    [setAwayLineup],
  );

  const skate = useCallback(() => {
    resetWorld();
    setPlaying(true);
  }, [setPlaying]);

  const homeUni = kitById(homeKit);
  const awayUni = kitById(awayKit);

  return (
    <div className="hud">
      <div className="hud-top-stack">
        <div className="uni-banner">
          <div className="uni-cluster">
            <div className="uni-side">
              <div className="uni-side-head">
                <span>
                  You
                  <AimCompass />
                </span>
                {playing && !paused ? (
                  <small>
                    {lineupTotal(liveHome)} / {modeLineupCap(clockMode)}
                  </small>
                ) : null}
              </div>
              <div className="uni-row">
                {UNIFORMS.map((u) => (
                  <Swatch
                    key={u.id}
                    id={u.id}
                    selected={homeKit === u.id}
                    disabled={awayKit === u.id}
                    onPick={setHomeKit}
                  />
                ))}
              </div>
            </div>
            {!playing || paused ? (
              <LineupStrip lineup={playing ? liveHome : homeLineup} onChange={applyHome} disabled={false} />
            ) : null}
            {!playing || paused ? <SideSliders who="user" /> : null}
          </div>
          <div className="uni-cluster">
            <div className="uni-side">
              <div className="uni-side-head">
                <span>
                  CPU
                  <AimCompass flip />
                </span>
                {playing && !paused ? (
                  <small>
                    {lineupTotal(liveAway)} / {modeLineupCap(clockMode)}
                  </small>
                ) : null}
              </div>
              <div className="uni-row">
                {UNIFORMS.map((u) => (
                  <Swatch
                    key={u.id}
                    id={u.id}
                    selected={awayKit === u.id}
                    disabled={homeKit === u.id}
                    onPick={setAwayKit}
                  />
                ))}
              </div>
            </div>
            {!playing || paused ? (
              <LineupStrip lineup={playing ? liveAway : awayLineup} onChange={applyAway} disabled={false} />
            ) : null}
            {!playing || paused ? <SideSliders who="cpu" /> : null}
          </div>
        </div>

        <header className="hud-top">
          <div>
            <p className="eyebrow">Elevation Edge · v1</p>
            <h1>Hockey Fast Break</h1>
            <AbilitySliders />
          </div>
          <div className="hud-stats">
            <span className="scoreline">
              {clockMode === "drill" ? (
                <>
                  <span className="who">DRILL</span>
                  <b>{drillScore}</b>
                  <span key={drillTargets}>/ {drillMaxScore()}</span>
                  <span className="period-clock">{fmtClock(periodClock)}</span>
                </>
              ) : (
                <>
                  <span className="who">
                    <UniStripe kit={homeUni} />
                    YOU
                  </span>
                  <b>{homeScore}</b>
                  <span>—</span>
                  <b>{awayScore}</b>
                  <span className="who">
                    CPU
                    <UniStripe kit={awayUni} />
                  </span>
                  {clockMode === "game" ? <span className="period-clock">{fmtClock(periodClock)}</span> : null}
                </>
              )}
            </span>
            <span>
              Shot <b>{speed.toFixed(0)}</b>
              <small> mph</small>
            </span>
            <span className={hasPuck ? "puck-chip" : "muted"}>
              {hasPuck ? "Puck on stick" : "Loose puck"}
            </span>
            <span className="muted">{pad}</span>
            {chargeKind ? (
              <span className="charge">
                {chargeKind === "shot" ? "Slap" : "Saucer"}
                <i style={{ width: `${Math.round(charge * 100)}%` }} />
              </span>
            ) : null}
          </div>
        </header>
      </div>

      {!playing ? (
        <div className="start-card">
          <ClockSetup />
          <button type="button" className="btn-primary" onClick={skate}>
            Skate
          </button>
        </div>
      ) : null}

      <footer className="hud-bot">
        {playing && paused && replay ? (
          <div className="cam-adjust">
            <p>
              <b>Replay</b>
              <span>
                A pause/play · X / B zoom · N/M or LB/RB slow · G / Shift or LT/RT fast · stick pan · hold Y +
                stick orbit · R exit
              </span>
            </p>
            <div className="btn-row cam-adjust-btns">
              <button type="button" className="btn-primary" onClick={() => stopPauseReplay()}>
                Exit
              </button>
            </div>
          </div>
        ) : null}
        {playing && paused && !replay ? (
          <div className="cam-adjust">
            <p>
              <b>Paused</b>
              <span>Drag to look · X zoom in · B zoom out · A resume</span>
            </p>
            <ClockSetup />
            <p className="hint">
              {controlProfile === "wings"
                ? "Wings: LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB takes goalie; RB dives."
                : "Classic: current map, LT goalie."}
            </p>
            <div className="btn-row cam-adjust-btns">
              <button
                type="button"
                className="btn-primary"
                onClick={() => resumePausedGame()}
              >
                Resume
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => beginPauseReplay()}
                disabled={!replayHasFootage()}
              >
                Replay
              </button>
              <button
                type="button"
                className="btn-ghost"
                tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.code === "Space") e.preventDefault();
                }}
                onClick={() => resetPausedGame()}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
        <MainMenus />
        <div className="hud-actions">
          {playing ? (
            <button
              type="button"
              aria-label={paused ? "Resume" : "Pause"}
              onClick={() => {
                if (paused) {
                  resumePausedGame();
                } else {
                  beginPauseCam(camMode);
                  setPaused(true);
                }
              }}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Reset"
            tabIndex={paused ? -1 : 0}
            onKeyDown={(e) => {
              if (paused && e.code === "Space") e.preventDefault();
            }}
            onClick={() => {
              useGame.getState().rerollAwayKit();
              useGame.getState().rerollClockMode();
              if (playing && paused) {
                resetPausedGame();
                return;
              }
              resetWorld();
              if (!playing) setPlaying(true);
            }}
          >
            <RotateCcw size={16} />
          </button>
        </div>
        <p className="hint hide-sm">
          {replay
            ? paused
              ? "Replay · A pause/play · X/B zoom · LB/RB slow · LT/RT fast · stick pan · Y+stick orbit · R exit"
              : "Replay · A / B / X / Y skip"
            : CAMS.find((c) => c.id === camMode)?.blurb}
          {replay
            ? ""
            : paused
              ? " · Drag or stick to look · X / B zoom · A resume"
              : whistle === "goal"
                ? " · A switch · B skip celebration · stick skates · Y hit"
                : hasPuck
                ? world.skaters[world.userId]?.kind === "goalie"
                  ? controlProfile === "wings"
                    ? " · A outlet pass · X dump · stick aims · hold LB / N goalie"
                    : " · A outlet pass · X dump · stick aims · hold G / LT net"
                  : controlProfile === "wings"
                    ? " · Stick aims · A pass · X shot · Y deke · B burst · G/LT left · Shift/RT right · LB goalie"
                    : " · Stick aims · A pass · X shot · Y deke · B burst · hold G / LT net"
                : controlProfile === "wings"
                  ? " · Stick skates · A switch · X poke · Y hit · B burst · G/LT left · Shift/RT right · LB goalie · RB/M dive"
                  : " · Stick skates · A switch · X poke · Y hit · B burst · RT / Shift dive · hold G / LT net"}
        </p>
      </footer>

      {replay ? (
        <div className="whistle replay-hint">
          {paused
            ? "A pause · X/B zoom · LB/RB slow · LT/RT fast · Y+stick orbit · R exit"
            : "A/B/X/Y skip"}
        </div>
      ) : periodOver || world.drillWon ? (
        <div className="whistle">
          {clockMode === "drill"
            ? world.drillWon
              ? (
                  <>
                    {drillScore}
                    <small>{fmtClock(world.drillElapsed)}</small>
                  </>
                )
              : `DRILL ${drillScore}`
            : homeScore === awayScore
              ? "Final"
              : homeScore > awayScore
                ? "YOU WIN"
                : "CPU WINS"}
        </div>
      ) : whistle ? (
        <div className={`whistle ${whistle}`}>
          {whistle === "goal" ? "GOAL" : whistle === "offside" ? "Offsides" : "Goalie Covered"}
        </div>
      ) : null}

      {playing && periodOver && !paused ? (
        <div className="start-card">
          <p className="hint">
            {clockMode === "drill"
              ? world.drillWon
                ? `${drillScore} / ${drillMaxScore()} · ${fmtClock(world.drillElapsed)}`
                : `Score ${drillScore} / ${drillMaxScore()}`
              : `Final ${homeScore}–${awayScore}`}
          </p>
          <button type="button" className="btn-primary" onClick={skate}>
            Skate
          </button>
        </div>
      ) : null}

      <OffscreenArrow kind="user" />
      <OffscreenArrow kind="puck" />
      <PauseOrbit />

      {playing ? (
        <div className="touch">
          <StickPad />
          {paused && replay ? (
            <div className="face-pad">
              <FaceBtn face="y" className="face-y" label="Orbit" hold />
              <FaceBtn face="a" className="pass" label="Pause" />
              <FaceBtn face="x" className="dump" label="Zoom+" />
              <FaceBtn face="b" className="burst" label="Zoom−" />
            </div>
          ) : paused ? (
            <div className="face-pad">
              <FaceBtn face="a" className="pass" label="Resume" />
              <FaceBtn face="x" className="dump" label="Zoom+" />
              <FaceBtn face="b" className="burst" label="Zoom−" />
            </div>
          ) : (
            <div className="face-pad">
              <FaceBtn face="y" className="face-y" label={hasPuck ? "Deke" : "Hit"} />
              <FaceBtn face="b" className="burst" label="Burst" hold />
              <FaceBtn
                face="x"
                className="dump"
                label={hasPuck ? (world.skaters[world.userId]?.kind === "goalie" ? "Dump" : "Shot") : "Poke"}
                hold={hasPuck}
              />
              <FaceBtn
                face="a"
                className="pass"
                label={
                  whistle === "goal"
                    ? "Skip"
                    : hasPuck
                      ? world.skaters[world.userId]?.kind === "goalie"
                        ? "Outlet"
                        : "Pass"
                      : "Switch"
                }
                hold={hasPuck}
              />
              <button
                type="button"
                className="net"
                onPointerDown={() => setTouchLt(true)}
                onPointerUp={() => setTouchLt(false)}
                onPointerCancel={() => setTouchLt(false)}
              >
                <small>LT</small>
                {controlProfile === "wings" ? "Left" : "Net"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
