import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Overlay } from "@/game/Overlay";
import { useGame } from "@/game/store";

const GameCanvas = lazy(() =>
  import("@/game/HockeyApp").then((m) => ({ default: m.GameCanvas })),
);

export const Route = createFileRoute("/")({ component: Home });

const CURSOR_IDLE_MS = 2500;

function Home() {
  const [mounted, setMounted] = useState(false);
  const playing = useGame((s) => s.playing);
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!playing || !shell) {
      shell?.classList.remove("is-cursor-idle");
      return;
    }

    const arm = () => window.setTimeout(() => {
      shell.classList.add("is-cursor-idle");
    }, CURSOR_IDLE_MS);

    let timer = arm();
    const onPointerMove = () => {
      shell.classList.remove("is-cursor-idle");
      window.clearTimeout(timer);
      timer = arm();
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.clearTimeout(timer);
      shell.classList.remove("is-cursor-idle");
    };
  }, [playing]);

  return (
    <div ref={shellRef} className="shell">
      {mounted ? (
        <Suspense fallback={<div className="boot">Hockey Fast Break</div>}>
          <GameCanvas />
        </Suspense>
      ) : (
        <div className="boot">Hockey Fast Break</div>
      )}
      <Overlay />
    </div>
  );
}
