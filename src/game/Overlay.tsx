import { useCallback, useEffect, useRef, useState } from "react";
import { CircleHelp, Pause, Play, RotateCcw, Settings } from "lucide-react";
import { setTouchBurst, setTouchFace, setTouchLt, setTouchMove } from "./input";
import {
  resetWorld,
  world,
  beginPauseCam,
  finishPauseCam,
  beginPauseReplay,
  stopPauseReplay,
  replayHasFootage,
} from "./sim";
import {
  LINEUP_CAP,
  lineupTotal,
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
  const canInc = !disabled && val < max && total < LINEUP_CAP;
  const canDec = !disabled && val > 0 && total > 1;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper-row">
        <button type="button" aria-label={`${label} down`} disabled={!canDec} onClick={() => onChange(patchLineup(lineup, slot, val - 1))}>
          −
        </button>
        <b>{val}</b>
        <button type="button" aria-label={`${label} up`} disabled={!canInc} onClick={() => onChange(patchLineup(lineup, slot, val + 1))}>
          +
        </button>
      </div>
    </div>
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
    <div className="lineup-strip">
      <Stepper label="G" slot="g" lineup={lineup} onChange={onChange} disabled={disabled} />
      <Stepper label="D" slot="d" lineup={lineup} onChange={onChange} disabled={disabled} />
      <Stepper label="F" slot="o" lineup={lineup} onChange={onChange} disabled={disabled} />
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
  const cpuOffense = useGame((s) => s.cpuOffense);
  const cpuDefense = useGame((s) => s.cpuDefense);
  const cpuGoalie = useGame((s) => s.cpuGoalie);
  const userOffense = useGame((s) => s.userOffense);
  const userDefense = useGame((s) => s.userDefense);
  const userGoalie = useGame((s) => s.userGoalie);
  const setGameSpeed = useGame((s) => s.setGameSpeed);
  const setCpuOffense = useGame((s) => s.setCpuOffense);
  const setCpuDefense = useGame((s) => s.setCpuDefense);
  const setCpuGoalie = useGame((s) => s.setCpuGoalie);
  const setUserOffense = useGame((s) => s.setUserOffense);
  const setUserDefense = useGame((s) => s.setUserDefense);
  const setUserGoalie = useGame((s) => s.setUserGoalie);
  const rows: { label: string; value: number; min: number; max: number; set: (n: number) => void }[] = [
    { label: "Game Speed", value: gameSpeed, min: 0.5, max: 1.5, set: setGameSpeed },
    { label: "CPU Offense", value: cpuOffense, min: 0, max: 2, set: setCpuOffense },
    { label: "CPU Defense", value: cpuDefense, min: 0, max: 2, set: setCpuDefense },
    { label: "CPU Goalie", value: cpuGoalie, min: 0, max: 1.6, set: setCpuGoalie },
    { label: "User Offense", value: userOffense, min: 0, max: 1.2, set: setUserOffense },
    { label: "User Defense", value: userDefense, min: 0, max: 2, set: setUserDefense },
    { label: "User Goalie", value: userGoalie, min: 0, max: 1, set: setUserGoalie },
  ];
  return (
    <div className="ability-sliders">
      {rows.map((row) => (
        <label key={row.label} className="ability-row">
          <span>{row.label}</span>
          <input
            type="range"
            min={row.min}
            max={row.max}
            step={(row.max - row.min) / 20}
            value={row.value}
            aria-label={row.label}
            onChange={(e) => row.set(Number(e.target.value))}
          />
          <b>{Math.round(((row.value - row.min) / (row.max - row.min)) * 20) * 5}</b>
        </label>
      ))}
    </div>
  );
}

function ClockSetup() {
  const clockMode = useGame((s) => s.clockMode);
  const setClockMode = useGame((s) => s.setClockMode);
  const gameMinutes = useGame((s) => s.gameMinutes);
  const setGameMinutes = useGame((s) => s.setGameMinutes);
  return (
    <div className="clock-setup">
      <div className="btn-row">
        <button
          type="button"
          className={clockMode === "practice" ? "is-on" : ""}
          onClick={() => setClockMode("practice")}
        >
          Scrimmage
        </button>
        <button
          type="button"
          className={clockMode === "game" ? "is-on" : ""}
          onClick={() => setClockMode("game")}
        >
          Game
        </button>
      </div>
      {clockMode === "practice" ? <p className="clock-untimed">Untimed</p> : <span />}
      {clockMode === "game" ? (
        <div className="clock-mins">
          <button
            type="button"
            aria-label="Fewer minutes"
            disabled={gameMinutes <= 1}
            onClick={() => setGameMinutes(gameMinutes - 1)}
          >
            −
          </button>
          <b>{gameMinutes}</b>
          <button
            type="button"
            aria-label="More minutes"
            disabled={gameMinutes >= 5}
            onClick={() => setGameMinutes(gameMinutes + 1)}
          >
            +
          </button>
          <span>minutes</span>
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}

function ControlsHelp() {
  return (
    <div className="help-tip">
      <p className="hint">A / E start · WASD skate · F shot · Q deke/hit · Space burst · Shift / RT dive · G / LT net · P pause</p>
      <dl className="legend">
        <div>
          <dt>With puck</dt>
          <dd>A pass / hold saucer · X wrist / hold slap · B cancel slap · Y deke</dd>
        </div>
        <div>
          <dt>No puck</dt>
          <dd>A switch · X poke / one-timer · Y hit · B burst · RT / Shift dive · frozen puck: Y check</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>Hold LT or G — take your goalie (only if you don't have the puck)</dd>
        </div>
      </dl>
    </div>
  );
}

function CamTools() {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const checkRefs = useGame((s) => s.checkRefs);
  const setCheckRefs = useGame((s) => s.setCheckRefs);
  const checkGoalies = useGame((s) => s.checkGoalies);
  const setCheckGoalies = useGame((s) => s.setCheckGoalies);
  const setGameSpeed = useGame((s) => s.setGameSpeed);
  const setCpuOffense = useGame((s) => s.setCpuOffense);
  const setCpuDefense = useGame((s) => s.setCpuDefense);
  const setCpuGoalie = useGame((s) => s.setCpuGoalie);
  const setUserOffense = useGame((s) => s.setUserOffense);
  const setUserDefense = useGame((s) => s.setUserDefense);
  const setUserGoalie = useGame((s) => s.setUserGoalie);
  const resetSliders = () => {
    setGameSpeed(1);
    setCpuOffense(1);
    setCpuDefense(1);
    setCpuGoalie(0.8);
    setUserOffense(0.6);
    setUserDefense(1);
    setUserGoalie(0.5);
  };
  return (
    <>
      <div className="cam-pop">
        {open ? (
          <div className="settings-panel">
            <AbilitySliders />
            <button
              type="button"
              className={`settings-toggle${checkRefs ? " is-on" : ""}`}
              aria-pressed={checkRefs}
              onClick={() => setCheckRefs(!checkRefs)}
            >
              Check Refs
            </button>
            <button
              type="button"
              className={`settings-toggle${checkGoalies ? " is-on" : ""}`}
              aria-pressed={checkGoalies}
              onClick={() => setCheckGoalies(!checkGoalies)}
            >
              Check Goalies
            </button>
            <button type="button" className="settings-toggle" onClick={resetSliders}>
              Reset
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className={open ? "is-on" : ""}
          aria-expanded={open}
          aria-label="Settings"
          onClick={() => {
            setOpen((v) => !v);
            setHelp(false);
          }}
        >
          <Settings size={16} />
          Settings
        </button>
      </div>
      <div className="cam-pop">
        {help ? <ControlsHelp /> : null}
        <button
          type="button"
          className={`settings-help-btn${help ? " is-on" : ""}`}
          aria-expanded={help}
          aria-label="Controls help"
          onClick={() => {
            setHelp((v) => !v);
            setOpen(false);
          }}
        >
          <CircleHelp size={16} />
        </button>
      </div>
    </>
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
    <div ref={ref} className={`offscreen-arrow${kind === "puck" ? " is-puck" : ""}`} aria-hidden="true">
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
  const powerPlay = useGame((s) => s.powerPlay);
  const speed = useGame((s) => s.speed);
  const pad = useGame((s) => s.pad);
  const arenaLook = useGame((s) => s.arenaLook);
  const hasPuck = useGame((s) => s.hasPuck);
  const charge = useGame((s) => s.charge);
  const chargeKind = useGame((s) => s.chargeKind);
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const whistle = useGame((s) => s.whistle);
  const replay = useGame((s) => s.replay);
  const clockMode = useGame((s) => s.clockMode);
  const periodClock = useGame((s) => s.periodClock);
  const periodOver = useGame((s) => s.periodOver);
  const setPlaying = useGame((s) => s.setPlaying);
  const setPaused = useGame((s) => s.setPaused);
  const setCamMode = useGame((s) => s.setCamMode);
  const setHomeKit = useGame((s) => s.setHomeKit);
  const setAwayKit = useGame((s) => s.setAwayKit);
  const setHomeLineup = useGame((s) => s.setHomeLineup);
  const setAwayLineup = useGame((s) => s.setAwayLineup);
  const setArenaLook = useGame((s) => s.setArenaLook);
  const setPowerPlay = useGame((s) => s.setPowerPlay);

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
          <div className="uni-side">
            <div className="uni-side-head">
              <span>Home</span>
              {!playing || paused ? (
                <LineupStrip lineup={playing ? liveHome : homeLineup} onChange={applyHome} disabled={false} />
              ) : (
                <small>
                  {lineupTotal(liveHome)} / {LINEUP_CAP}
                </small>
              )}
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
          <div className="uni-side">
            <div className="uni-side-head">
              <span>Away</span>
              {!playing || paused ? (
                <LineupStrip lineup={playing ? liveAway : awayLineup} onChange={applyAway} disabled={false} />
              ) : (
                <small>
                  {lineupTotal(liveAway)} / {LINEUP_CAP}
                </small>
              )}
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
        </div>

        <header className="hud-top">
          <div>
            <p className="eyebrow">Elevation Edge · v0</p>
            <h1>Hockey Fast Break</h1>
          </div>
          <div className="hud-stats">
            <span className="scoreline">
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
            <div className="btn-row cam-adjust-btns">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  finishPauseCam();
                  setPaused(false);
                }}
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
                onClick={() => {
                  resetWorld();
                  setPaused(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
        <div className="cam-row">
          <button
            type="button"
            className={powerPlay ? "is-on" : ""}
            title="Scored-on team gets a player out of the box on the next faceoff"
            onClick={() => setPowerPlay(!powerPlay)}
          >
            Power Play
          </button>
          {CAMS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={camMode === c.id ? "is-on" : ""}
              title={c.blurb}
              onClick={() => setCamMode(c.id)}
            >
              {c.label}
            </button>
          ))}
          <button
            type="button"
            className={arenaLook === "dark" ? "is-on" : ""}
            onClick={() => setArenaLook(arenaLook === "dark" ? "light" : "dark")}
          >
            {arenaLook === "dark" ? "Rink Dark" : "Rink Light"}
          </button>
          <CamTools />
        </div>
        <div className="hud-actions">
          {playing ? (
            <button
              type="button"
              aria-label={paused ? "Resume" : "Pause"}
              onClick={() => {
                if (paused) {
                  finishPauseCam();
                  setPaused(false);
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
                  ? " · A outlet pass · X dump · stick aims · hold G / LT net"
                  : " · Stick aims · A pass · X shot · Y deke · B burst · hold G / LT net"
                : " · Stick skates · A switch · X poke · Y hit · B burst · RT / Shift dive · hold G / LT net"}
        </p>
      </footer>

      {replay ? (
        <div className="whistle replay-hint">
          {paused
            ? "A pause · X/B zoom · LB/RB slow · LT/RT fast · Y+stick orbit · R exit"
            : "A/B/X/Y skip"}
        </div>
      ) : periodOver ? (
        <div className="whistle">
          {homeScore === awayScore ? "Final" : homeScore > awayScore ? "YOU WIN" : "CPU WINS"}
        </div>
      ) : whistle ? (
        <div className={`whistle ${whistle}`}>
          {whistle === "goal" ? "GOAL" : "Goalie Covered"}
        </div>
      ) : null}

      {playing && periodOver && !paused ? (
        <div className="start-card">
          <p className="hint">
            Final {homeScore}–{awayScore}
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
                Net
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
