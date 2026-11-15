import { useEffect, useRef, useState } from "react";
import { useGame } from "./store";
import { kitIconColors, UNIFORMS } from "./uniforms";

function KitSwatch({
  id,
  selected,
  tag,
  targeted,
  onPick,
  onSwap,
  onTarget,
}: {
  id: number;
  selected: boolean;
  tag?: "YOU" | "CPU";
  targeted?: boolean;
  onPick: (id: number) => void;
  onSwap: () => void;
  onTarget?: () => void;
}) {
  const icon = kitIconColors(UNIFORMS[id]!);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );
  // A double-click also emits a click. Hold the pick so the swap runs once.
  const armPick = () => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onPick(id);
    }, 280);
  };
  const swapIfWorn = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    if (selected) onSwap();
  };
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
        onClick={armPick}
        onDoubleClick={swapIfWorn}
        className={`uni-swatch${selected ? " is-on" : ""}`}
        style={selected ? { outlineColor: icon.mid } : undefined}
      >
        <span style={{ background: icon.top }} />
        <span style={{ background: icon.mid }} />
        <span style={{ background: icon.bot }} />
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
  const swapKits = () => {
    const home = homeKit;
    const away = awayKit;
    setHomeKit(away);
    setAwayKit(home);
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
                onSwap={swapKits}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
