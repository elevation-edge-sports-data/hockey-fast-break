import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { Overlay } from "@/game/Overlay";

const GameCanvas = lazy(() =>
  import("@/game/HockeyApp").then((m) => ({ default: m.GameCanvas })),
);

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="shell">
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
