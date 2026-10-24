import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { setTouchBurst, setTouchFace, setTouchLt, setTouchMove, setTouchView } from "./input";
import {
  applyLiveLineup,
  resetWorld,
  world,
  attackCompass,
  cycleAimCompass,
  pauseGame,
  beginPauseReplay,
  stopPauseReplay,
  orbitReplayPointer,
  zoomReplayPointer,
  replayHasFootage,
  replayFootagePct,
  subscribeReplayPct,
  drillMaxScore,
  startCpuDrillWatchFromUrl,
  startCpuScrimmageWatchFromUrl,
  previewPausedMode,
  previewPausedTargets,
  previewPausedScrimmage,
  previewPausedMinutes,
  previewPausedRollerMinutes,
  resumePausedGame,
  resetPausedGame,
  startPausedNewGame,
  getPauseDraft,
  subscribePauseDraft,
} from "./sim";
import {
  GAME_MINUTES_MAX,
  GAME_MINUTES_MIN,
  stepPeriodMinutes,
  periodEndCopy,
  periodOrdinal,
  showsPeriodClock,
  lineupTotal,
  modeLineupCap,
  patchLineup,
  hudReleaseName,
  applyArmedCpuKitCycle,
  useGame,
  type CamMode,
  type DrillTargets,
  type Lineup,
  type PlayMode,
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
  const mode = useGame((s) => s.clockMode);
  const cap = modeLineupCap(mode);
  const goalieExtra = mode === "scrimmage";
  const skaters = lineup.d + lineup.o;
  const canInc =
    !disabled &&
    val < max &&
    (goalieExtra ? (slot === "g" ? true : skaters < cap) : total < cap);
  const canDec = !disabled && val > 0;
  return (
    <div className="stepper">
      <span>{label}</span>
      <div className="stepper-row">
        <button type="button" aria-label={`${label} down`} disabled={!canDec} onClick={() => onChange(patchLineup(lineup, slot, val - 1, cap, goalieExtra))}>
          −
        </button>
        <b>{val}</b>
        <button type="button" aria-label={`${label} up`} disabled={!canInc} onClick={() => onChange(patchLineup(lineup, slot, val + 1, cap, goalieExtra))}>
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

function drillNextLine(n: number): string | null {
  if (n === 4) return "next level: 8 targets";
  if (n === 8) return "next level: 12 targets";
  if (n === 12) return "next level: 16 targets";
  return null;
}

const drillEndStack = {
  position: "absolute" as const,
  left: "50%",
  top: "28%",
  transform: "translate(-50%, -50%)",
  zIndex: 4,
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  gap: 12,
  pointerEvents: "none" as const,
};

const drillEndCard = {
  position: "static" as const,
  left: "auto",
  top: "auto",
  transform: "none",
};

const periodEndBanner = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85em",
  width: "max-content",
  maxWidth: "94vw",
  textTransform: "uppercase" as const,
  whiteSpace: "nowrap" as const,
  fontSize: "clamp(1.2rem, 5vw, 2.2rem)",
};

function AbilitySliders() {
  const gameSpeed = useGame((s) => s.gameSpeed);
  const setGameSpeed = useGame((s) => s.setGameSpeed);
  return (
    <div className="ability-sliders">
      <label className="ability-row">
        <span>Game Speed</span>
        <input
          type="range"
          min={0.75}
          max={1.25}
          step={0.05}
          value={gameSpeed}
          aria-label="Game Speed"
          onChange={(e) => setGameSpeed(Number(e.target.value))}
        />
        <b>{gameSpeed.toFixed(2) + "x"}</b>
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
          { label: "Forwards", value: userOffense, min: 0, max: 1.2, set: setUserOffense },
          { label: "Defencemen", value: userDefense, min: 0, max: 2, set: setUserDefense },
          { label: "Goalie", value: userGoalie, min: 0, max: 1, set: setUserGoalie },
        ]
      : [
          { label: "Forwards", value: cpuOffense, min: 0, max: 2, set: setCpuOffense },
          { label: "Defencemen", value: cpuDefense, min: 0, max: 2, set: setCpuDefense },
          { label: "Goalie", value: cpuGoalie, min: 0, max: 1.6, set: setCpuGoalie },
        ];
  return (
    <div className="hud-sliders">
      <div className="hud-slider-row">
        <span>{who === "user" ? "You" : "CPU"}</span>
      </div>
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
          <b>{row.value.toFixed(2)}</b>
        </label>
      ))}
    </div>
  );
}

function usePauseDraft() {
  return useSyncExternalStore(subscribePauseDraft, getPauseDraft, getPauseDraft);
}

function useReplayPct() {
  return useSyncExternalStore(subscribeReplayPct, replayFootagePct, replayFootagePct);
}

function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const paused = useGame((s) => s.paused);
  const pct = useReplayPct();
  if (!replay || !paused) return null;
  const shown = Math.round(Math.max(0, Math.min(1, pct)) * 100);
  return (
    <div
      className="madden-replay"
      role="meter"
      aria-label="Replay position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={shown}
    >
      <div className="madden-replay-track">
        <div className="madden-replay-fill" style={{ width: `${shown}%` }} />
      </div>
      <span className="madden-replay-pct">{shown}%</span>
    </div>
  );
}

function chooseMode(m: PlayMode): void {
  previewPausedMode(m);
}

function PeriodMinutes({ kind }: { kind: "game" | "roller" }) {
  const storeMinutes = useGame((s) => (kind === "roller" ? s.rollerMinutes : s.gameMinutes));
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const draft = usePauseDraft();
  const minutes =
    playing && paused && draft ? (kind === "roller" ? draft.rollerMinutes : draft.gameMinutes) : storeMinutes;
  const setMin = (n: number) => (kind === "roller" ? previewPausedRollerMinutes(n) : previewPausedMinutes(n));
  return (
    <div className="clock-mins">
      <button type="button" aria-label="Fewer minutes" disabled={minutes <= GAME_MINUTES_MIN} onClick={() => setMin(stepPeriodMinutes(minutes, -1))}>
        −
      </button>
      <b>{Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}</b>
      <button type="button" aria-label="More minutes" disabled={minutes >= GAME_MINUTES_MAX} onClick={() => setMin(stepPeriodMinutes(minutes, 1))}>
        +
      </button>
      <span>minutes</span>
    </div>
  );
}

function ClockSetup() {
  const storeMode = useGame((s) => s.clockMode);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const draft = usePauseDraft();
  const clockMode = playing && paused && draft ? draft.clockMode : storeMode;
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
        {clockMode === "practice" ? <p className="clock-untimed">Untimed</p> : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "scrimmage" ? "is-on" : ""}
          title="Knock down the other team's targets. Goalies are optional."
          onClick={() => chooseMode("scrimmage")}
        >
          Scrimmage
        </button>
        {clockMode === "scrimmage" ? (
          <>
            <p className="clock-untimed">Untimed</p>
            <p className="clock-untimed">targets</p>
            <ScrimmageTargetPick />
          </>
        ) : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "roller" ? "is-on" : ""}
          onClick={() => chooseMode("roller")}
        >
          Roller
        </button>
        {clockMode === "roller" ? (
          <>
            <p className="clock-untimed">2 X 18</p>
            <p className="clock-untimed">period length</p>
            <PeriodMinutes kind="roller" />
          </>
        ) : null}
      </div>
      <div className="clock-col">
        <button
          type="button"
          className={clockMode === "game" ? "is-on" : ""}
          onClick={() => chooseMode("game")}
        >
          Game
        </button>
        {clockMode === "game" ? (
          <>
            <p className="clock-untimed">3 X 20</p>
            <p className="clock-untimed">period length</p>
            <PeriodMinutes kind="game" />
          </>
        ) : null}
      </div>
    </div>
  );
}

type MenuId = "controller" | "gameplay" | "camera";

function TargetCountRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: DrillTargets;
  onPick: (n: DrillTargets) => void;
}) {
  return (
    <div className="clock-mins">
      <span>{label}</span>
      {([4, 8, 12, 16] as const).map((n) => (
        <button key={n} type="button" className={value === n ? "is-on" : ""} onClick={() => onPick(n)}>
          {n}
        </button>
      ))}
    </div>
  );
}

function ScrimmageTargetPick() {
  const storeHome = useGame((s) => s.scrimmageHomeTargets);
  const storeAway = useGame((s) => s.scrimmageAwayTargets);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const draft = usePauseDraft();
  const youTotal = playing && paused && draft ? draft.scrimmageAway : storeAway;
  const cpuTotal = playing && paused && draft ? draft.scrimmageHome : storeHome;
  return (
    <div className="scrimmage-targets">
      <TargetCountRow label="Home" value={youTotal} onPick={(n) => previewPausedScrimmage("away", n)} />
      <TargetCountRow label="Away" value={cpuTotal} onPick={(n) => previewPausedScrimmage("home", n)} />
    </div>
  );
}

function DrillTargetPick() {
  const storeTargets = useGame((s) => s.drillTargets);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const draft = usePauseDraft();
  const drillTargets = playing && paused && draft ? draft.drillTargets : storeTargets;
  const pick = (n: DrillTargets) => {
    if (drillTargets === n) return;
    previewPausedTargets(n);
  };
  return (
    <div className="clock-mins">
      <button type="button" className={drillTargets === 4 ? "is-on" : ""} onClick={() => pick(4)}>
        4
      </button>
      <button type="button" className={drillTargets === 8 ? "is-on" : ""} onClick={() => pick(8)}>
        8
      </button>
      <button type="button" className={drillTargets === 12 ? "is-on" : ""} onClick={() => pick(12)}>
        12
      </button>
      <button type="button" className={drillTargets === 16 ? "is-on" : ""} onClick={() => pick(16)}>
        16
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
  const chaos = useGame((s) => s.chaos);
  const setChaos = useGame((s) => s.setChaos);
  const offsides = useGame((s) => s.offsides);
  const setOffsides = useGame((s) => s.setOffsides);
  const checkRefs = useGame((s) => s.checkRefs);
  const setCheckRefs = useGame((s) => s.setCheckRefs);
  const checkGoalies = useGame((s) => s.checkGoalies);
  const setCheckGoalies = useGame((s) => s.setCheckGoalies);
  const lineBrawl = useGame((s) => s.lineBrawl);
  const setLineBrawl = useGame((s) => s.setLineBrawl);
  const ignoreAutoFind = useGame((s) => s.ignoreAutoFind);
  const setIgnoreAutoFind = useGame((s) => s.setIgnoreAutoFind);
  const passLock = useGame((s) => s.passLock);
  const setPassLock = useGame((s) => s.setPassLock);
  const camMode = useGame((s) => s.camMode);
  const setCamMode = useGame((s) => s.setCamMode);
  const arenaLook = useGame((s) => s.arenaLook);
  const setArenaLook = useGame((s) => s.setArenaLook);
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const replay = useGame((s) => s.replay);
  const toggle = (id: MenuId) => setMenu((cur) => (cur === id ? null : id));
  const blurb =
    controlProfile === "wings"
      ? "LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB defensive skate; hold Select or R for the goalie; RB dives."
      : controlProfile === "stick"
        ? "Right stick shoots: up snap, right then up wrist, left then up backhand, pull back slap. Left stick aims. X tap wrist, hold slap. LB defensive skate. Hold Select or R for the goalie."
        : "LB defensive skate. Hold Select or R for the goalie.";
  const startReplay = () => {
    if (replay) {
      stopPauseReplay();
      return;
    }
    if (!playing || !replayHasFootage()) return;
    if (!paused) pauseGame();
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
      {menu === "gameplay" ? (
        <div className="settings-panel" aria-label="Settings">
          <SideSliders who="user" />
          <SideSliders who="cpu" />
        </div>
      ) : null}
      {menu ? (
        <div className="cam-row menu-sub">
          {menu === "controller" ? (
            <>
              <button
                type="button"
                className={controlProfile === "classic" ? "is-on" : ""}
                title="LB defensive skate. Hold Select or R for the goalie."
                onClick={() => setControlProfile("classic")}
              >
                Classic
              </button>
              <button
                type="button"
                className={controlProfile === "wings" ? "is-on" : ""}
                title="LT/RT claim nearest teammate left/right of you; left stick steers you and them; LB defensive skate; hold Select or R for the goalie; RB dives."
                onClick={() => setControlProfile("wings")}
              >
                Wings
              </button>
              <button
                type="button"
                className={controlProfile === "stick" ? "is-on" : ""}
                title="Right stick shoots. Left stick aims. X tap wrist, hold slap. LB defensive skate. Hold Select or R for the goalie."
                onClick={() => setControlProfile("stick")}
              >
                Skill Stick
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
                className={chaos ? "is-on" : ""}
                title="Scored-on team keeps gaining a skater each goal, up to 11"
                aria-pressed={chaos}
                onClick={() => setChaos(!chaos)}
              >
                Chaos
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
              <button
                type="button"
                className={lineBrawl ? "is-on" : ""}
                aria-pressed={lineBrawl}
                onClick={() => setLineBrawl(!lineBrawl)}
              >
                Line Brawl
              </button>
              <button
                type="button"
                className={!ignoreAutoFind ? "is-on" : ""}
                title="On sends the pass toward a teammate. Off aims where you point and does not pick one."
                aria-pressed={!ignoreAutoFind}
                onClick={() => setIgnoreAutoFind(!ignoreAutoFind)}
              >
                Pass Lock
              </button>
              <button
                type="button"
                className={passLock ? "is-on" : ""}
                title="Snap a pass onto a teammate near your aim. Off keeps that exact angle."
                aria-pressed={passLock}
                onClick={() => setPassLock(!passLock)}
              >
                Pass Snap
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
                onClick={() => {
                  setCamMode(c.id);
                  const ui = useGame.getState();
                  if (!ui.playing || ui.paused) world.camPick = true;
                }}
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
          className={menu === "gameplay" ? "is-on" : ""}
          aria-expanded={menu === "gameplay"}
          onClick={() => toggle("gameplay")}
        >
          Settings
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
        <button
          type="button"
          className={menu === "controller" ? "is-on" : ""}
          aria-expanded={menu === "controller"}
          onClick={() => toggle("controller")}
        >
          Controller
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
  const controlProfile = useGame((s) => s.controlProfile);
  const wings = controlProfile === "wings";
  const stick = controlProfile === "stick";
  return (
    <div className="help-tip">
      <p className="hint">
        {wings
          ? "A / E start · WASD skate · F shot · Q deke/hit · Space burst · G left · Shift right · LB / N skate · Select / R goalie · M / RB dive · P pause"
          : stick
            ? "A / E start · WASD skate · right stick shots · F shot · Q deke/hit · Space burst · Shift / RT dive · LB / N skate · Select / R goalie · P pause"
            : "A / E start · WASD skate · F shot · Q deke/hit · Space burst · Shift / RT dive · LB / N skate · Select / R goalie · P pause"}
      </p>
      <dl className="legend">
        <div>
          <dt>With puck</dt>
          <dd>
            {stick
              ? "A tap 55 mph, hold 1.5s 95 mph, Select saucer · right stick snap, wrist, backhand, slap · X tap wrist / hold slap · B cancel · Y deke · left stick aims"
              : "A tap 55 mph, hold 1.5s 95 mph, Select saucer · X wrist / hold slap · B cancel slap · Y deke"}
          </dd>
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
          <dt>Skate</dt>
          <dd>Hold LB, comma, or N — hips to the puck, slower, better hit and intercept</dd>
        </div>
        <div>
          <dt>Net</dt>
          <dd>Hold Select or R — take your goalie (only if you don't have the puck)</dd>
        </div>
        {wings ? (
          <div>
            <dt>Wings</dt>
            <dd>LT/RT claim nearest teammate left/right of you; left stick steers you and them; RB dives.</dd>
          </div>
        ) : null}
        {stick ? (
          <div>
            <dt>Skill Stick</dt>
            <dd>Right stick up snaps, hold right or left keeps the puck on that side and protects it from a poke on the other side, right then up is a wrist, left then up is a backhand, pull back then up is a slap. Without the puck, stick up checks and a sideways push pokes along the blade. Left stick aims. X is tap wrist or hold slap.</dd>
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
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  if (!paused) return null;
  return (
    <div
      className="pause-orbit"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragging.current = true;
        last.current = { x: e.clientX, y: e.clientY };
        e.stopPropagation();
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        if ((e.buttons & 1) === 0) {
          dragging.current = false;
          return;
        }
        e.stopPropagation();
        const dx = e.clientX - last.current.x;
        const dy = e.clientY - last.current.y;
        last.current = { x: e.clientX, y: e.clientY };
        if (dx === 0 && dy === 0) return;
        if (world.replay && world.replayKind === "pause") {
          orbitReplayPointer(dx, dy);
          return;
        }
        const fc = world.freeCam;
        fc.theta -= dx * 0.008;
        fc.phi = Math.max(0.12, Math.min(1.45, fc.phi - dy * 0.006));
        world.pauseDirty = true;
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.stopPropagation();
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onLostPointerCapture={() => {
        dragging.current = false;
      }}
      onWheel={(e) => {
        if (world.replay && world.replayKind === "pause") {
          zoomReplayPointer(e.deltaY);
          return;
        }
        world.freeCam.radius = Math.max(4.2, Math.min(120, world.freeCam.radius + e.deltaY * 0.02));
        world.pauseDirty = true;
      }}
    />
  );
}

export function Overlay() {
  const playing = useGame((s) => s.playing);
  const paused = useGame((s) => s.paused);
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const homeLineup = useGame((s) => s.homeLineup);
  const awayLineup = useGame((s) => s.awayLineup);
  const liveHome = useGame((s) => s.liveHome);
  const liveAway = useGame((s) => s.liveAway);
  const speed = useGame((s) => s.speed);
  const shotKind = useGame((s) => s.shotKind);
  const shotName = hudReleaseName(shotKind);
  const hasPuck = useGame((s) => s.hasPuck);
  const charge = useGame((s) => s.charge);
  const chargeKind = useGame((s) => s.chargeKind);
  const sauce = useGame((s) => s.sauce);
  const chargeWind = useGame((s) => s.chargeWind);
  const chargeMark = useGame((s) => s.chargeMark);
  const homeScore = useGame((s) => s.homeScore);
  const awayScore = useGame((s) => s.awayScore);
  const whistle = useGame((s) => s.whistle);
  const delayedOffside = useGame((s) => s.delayedOffside);
  const replay = useGame((s) => s.replay);
  const clockMode = useGame((s) => s.clockMode);
  const controlProfile = useGame((s) => s.controlProfile);
  const periodClock = useGame((s) => s.periodClock);
  const period = useGame((s) => s.period);
  const drillScore = useGame((s) => s.drillScore);
  const drillTargets = useGame((s) => s.drillTargets);
  const scrimmageHomeTargets = useGame((s) => s.scrimmageHomeTargets);
  const scrimmageAwayTargets = useGame((s) => s.scrimmageAwayTargets);
  const scrimmageHomeDown = useGame((s) => s.scrimmageHomeDown);
  const scrimmageAwayDown = useGame((s) => s.scrimmageAwayDown);
  const goalSide = useGame((s) => s.goalSide);
  const gameMinutes = useGame((s) => s.gameMinutes);
  const rollerMinutes = useGame((s) => s.rollerMinutes);
  const pauseDraft = usePauseDraft();
  const periodOver = useGame((s) => s.periodOver);
  const periodBreak = useGame((s) => s.periodBreak);
  const periodEnd =
    periodBreak > 0 && (clockMode === "game" || clockMode === "roller")
      ? periodEndCopy(periodBreak, homeScore, awayScore)
      : null;
  const setPlaying = useGame((s) => s.setPlaying);
  const [cpuDrillNote, setCpuDrillNote] = useState<string | null>(null);
  useEffect(() => {
    const note = startCpuDrillWatchFromUrl() ?? startCpuScrimmageWatchFromUrl();
    if (note) setCpuDrillNote(note);
  }, []);
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
      if (useGame.getState().playing) applyLiveLineup("home");
      else resetWorld();
    },
    [setHomeLineup],
  );
  const applyAway = useCallback(
    (l: Lineup) => {
      setAwayLineup(l);
      if (useGame.getState().playing) applyLiveLineup("away");
      else resetWorld();
    },
    [setAwayLineup],
  );

  const skate = useCallback(() => {
    const ui = useGame.getState();
    if (ui.playing && (ui.periodOver || world.periodOver)) applyArmedCpuKitCycle();
    resetWorld();
    setPlaying(true);
  }, [setPlaying]);

  const homeUni = kitById(homeKit);
  const awayUni = kitById(awayKit);
  const drillNext = clockMode === "drill" && world.drillWon ? drillNextLine(drillTargets) : null;
  const pauseModeChanged = !!pauseDraft && pauseDraft.clockMode !== clockMode;
  const newGameDraft =
    pauseModeChanged ||
    (!!pauseDraft &&
      (pauseDraft.drillTargets !== drillTargets ||
        pauseDraft.scrimmageHome !== scrimmageHomeTargets ||
        pauseDraft.scrimmageAway !== scrimmageAwayTargets ||
        pauseDraft.gameMinutes !== gameMinutes ||
        pauseDraft.rollerMinutes !== rollerMinutes));

  return (
    <div className={playing ? "hud" : "hud is-title"}>
      <div className="hud-top-stack">
        {(playing && !paused) || replay ? null : (
        <div className="uni-banner">
          <div className="uni-cluster">
            <div className="uni-side">
              <div className="uni-side-head">
                <span>
                  You
                  <AimCompass />
                </span>
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
            <LineupStrip lineup={playing ? liveHome : homeLineup} onChange={applyHome} disabled={false} />
          </div>
          <div className="uni-cluster is-cpu">
            <div className="uni-side">
              <div className="uni-side-head">
                <span>
                  CPU
                  <AimCompass flip />
                </span>
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
            <LineupStrip lineup={playing ? liveAway : awayLineup} onChange={applyAway} disabled={false} />
          </div>
        </div>
        )}

        <header className="hud-top">
          <div>
            <p className="eyebrow">Elevation Edge · v4</p>
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
                  {cpuDrillNote ? <span className="period-clock">{cpuDrillNote}</span> : null}
                </>
              ) : clockMode === "scrimmage" ? (
                <>
                  <span className="who">
                    <UniStripe kit={homeUni} />
                    YOU
                  </span>
                  <b>
                    {scrimmageHomeDown}/{scrimmageAwayTargets}
                  </b>
                  <span>—</span>
                  <b>
                    {scrimmageAwayDown}/{scrimmageHomeTargets}
                  </b>
                  <span className="who">
                    CPU
                    <UniStripe kit={awayUni} />
                  </span>
                  {cpuDrillNote ? <span className="period-clock">{cpuDrillNote}</span> : null}
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
                  {showsPeriodClock(clockMode) ? (
                    <span className="period-clock">
                      {periodOrdinal(period)} {fmtClock(periodClock)}
                    </span>
                  ) : null}
                </>
              )}
            </span>
            {/*
              Speed line is the previous release. Under it this column used to add
              "Puck on stick" / "Loose puck" from hasPuck, then pad ("Keyboard" or "Gamepad").
              The pass bar label was chargeWind, so a sauce hold read Saucer.
              Those two status lines are gone. The pass bar always reads Pass.
              Sauce stays on its own meter. chargeWind "Saucer" still means that meter is
              live while the pass bar is hidden. Shot labels stay Wrist, Slap, or Backhand.
            */}
            <span className="hud-release">
              {shotName.toUpperCase()} <b>{speed.toFixed(0)}</b>
              <small> MPH</small>
            </span>
            {/*
              hud-stats is a right-aligned column. This row is flex-end: sauce, then the
              pass bar (min-width 92px). Dropping the pass bar used to shrink the row, so
              the sauce meter slid right to where the pass bar sits. The hidden slot keeps
              that pass box, so sauce stays to its left with the bottoms aligned.
            */}
            {chargeKind || chargeWind === "Saucer" || chargeWind === "Clear" ? (
              <span className="charge-row">
                {chargeKind === "saucer" || chargeWind === "Saucer" || chargeWind === "Clear" ? (
                  <span className="sauce" aria-label="Sauce height">
                    {chargeWind === "Clear" ? "Clear" : "Sauce"}
                    <b>
                      <i style={{ height: `${Math.round(sauce * 100)}%` }} />
                    </b>
                  </span>
                ) : null}
                {chargeKind ? (
                  <span className="charge">
                    {chargeKind === "shot" ? (chargeWind ?? "Wrist") : "Pass"}
                    {chargeKind === "shot" ? (
                      <b className="charge-track">
                        <i style={{ width: `${Math.round(charge * 100)}%` }} />
                        {chargeMark !== null ? (
                          <em style={{ left: `${chargeMark * 100}%` }} />
                        ) : null}
                      </b>
                    ) : (
                      <i style={{ width: `${Math.round(charge * 100)}%` }} />
                    )}
                  </span>
                ) : (
                  <span className="charge is-slot" aria-hidden="true">
                    Pass
                    <i />
                  </span>
                )}
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
                Drag to look · wheel zooms · A pause/play · tap Y lock · stick pan · hold Y+stick orbit ·
                X/B zoom · LB/RB slow · LT/RT fast · R3 or Select exits
              </span>
            </p>
            <ReplayBar />
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
            </p>
            <div className="btn-row cam-adjust-btns">
              <button type="button" className="btn-primary" onClick={() => resumePausedGame()}>
                {newGameDraft ? "Cancel" : "Resume"}
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
            <section className="pause-new" aria-label="Skate">
              <p>
                <b>Skate</b>
                <span>Pick a setup to start</span>
              </p>
              <ClockSetup />
              <div className="btn-row cam-adjust-btns">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!newGameDraft}
                  tabIndex={-1}
                  onKeyDown={(e) => {
                    if (e.code === "Space") e.preventDefault();
                  }}
                  onClick={() => startPausedNewGame()}
                >
                  Skate
                </button>
              </div>
            </section>
          </div>
        ) : null}
        <MainMenus />
        <div className="hud-actions">
          {playing ? (
            <button
              type="button"
              aria-label={paused ? "Resume" : "Pause"}
              onClick={() => {
                if (paused) resumePausedGame();
                else pauseGame();
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
      </footer>

      {replay ? (
        <div className="whistle replay-hint">
          {paused
            ? "Drag · wheel · A pause · Y lock · stick pan · LB/RB slow · LT/RT fast · R3 exits"
            : "A/B/X/Y skip"}
        </div>
      ) : periodEnd ? (
        <div className="whistle" style={periodEndBanner}>
          <span>{periodEnd.title}</span>
          <span>{periodEnd.score}</span>
        </div>
      ) : periodOver || world.drillWon ? (
        clockMode === "drill" ? (
          <div style={drillEndStack}>
            <div className="whistle" style={drillEndCard}>
              {world.drillWon ? (
                <>
                  <span style={{ display: "block" }}>drill complete</span>
                  <span style={{ display: "block" }}>{`score ${drillScore}/${drillMaxScore()}`}</span>
                  <small>{fmtClock(world.drillElapsed)}</small>
                </>
              ) : (
                `score ${drillScore}/${drillMaxScore()}`
              )}
            </div>
            {drillNext ? (
              <div className="whistle" style={drillEndCard}>
                {drillNext}
              </div>
            ) : null}
          </div>
        ) : clockMode === "scrimmage" ? (
          <div className="whistle">
            {goalSide === "home" ? "YOU WIN" : goalSide === "away" ? "CPU WINS" : "Final"}
          </div>
        ) : (
          <div className="whistle">
            {homeScore === awayScore ? "Final" : homeScore > awayScore ? "YOU WIN" : "CPU WINS"}
          </div>
        )
      ) : whistle ? (
        <div className={`whistle ${whistle}`}>
          {whistle === "goal"
            ? "GOAL"
            : whistle === "offside"
              ? "Offsides"
              : whistle === "brawl"
                ? "Line Brawl"
                : whistle === "crowd"
                  ? "Puck in the crowd"
                  : "Goalie Covered"}
        </div>
      ) : playing && delayedOffside && !replay ? (
        <div
          className="whistle"
          style={{
            top: "20%",
            minWidth: 0,
            padding: "7px 14px",
            fontSize: "1rem",
            letterSpacing: "0.16em",
            color: "var(--color-accent)",
            borderColor: "var(--color-accent)",
          }}
        >
          Delayed offsides
        </div>
      ) : null}

      {playing && periodOver && !paused ? (
        <div className="start-card">
          <p className="hint">
            {clockMode === "drill"
              ? world.drillWon
                ? `${drillScore} / ${drillMaxScore()} · ${fmtClock(world.drillElapsed)}`
                : `Score ${drillScore} / ${drillMaxScore()}`
              : clockMode === "scrimmage"
                ? `${goalSide === "home" ? "YOU WIN" : goalSide === "away" ? "CPU WINS" : "Final"} ${scrimmageHomeDown}/${scrimmageAwayTargets}–${scrimmageAwayDown}/${scrimmageHomeTargets}`
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
              <FaceBtn face="y" className="face-y" label="Lock" />
              <FaceBtn face="a" className="pass" label="Pause" />
              <FaceBtn face="x" className="dump" label="Zoom+" />
              <FaceBtn face="b" className="burst" label="Zoom−" />
            </div>
          ) : paused ? (
            <div className="face-pad">
              {pauseModeChanged ? <FaceBtn face="y" className="face-y" label="Cancel" /> : null}
              <FaceBtn face="a" className="pass" label={pauseModeChanged ? "Skate" : "Resume"} />
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
                onPointerDown={() => {
                  if (controlProfile === "wings") setTouchLt(true);
                  else setTouchView(true);
                }}
                onPointerUp={() => {
                  setTouchLt(false);
                  setTouchView(false);
                }}
                onPointerCancel={() => {
                  setTouchLt(false);
                  setTouchView(false);
                }}
              >
                <small>{controlProfile === "wings" ? "LT" : "R"}</small>
                {controlProfile === "wings" ? "Left" : "Goalie"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
