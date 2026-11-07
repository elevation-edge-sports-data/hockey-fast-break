import { useState } from "react";
import { useGame } from "./store";
import { kitWornColors, UNIFORMS } from "./uniforms";

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
