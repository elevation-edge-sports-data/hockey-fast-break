import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const ReplayViewerView = lazy(() =>
  import("@/game/ReplayViewerView").then((m) => ({ default: m.ReplayViewerView })),
);

export const Route = createFileRoute("/replay")({ component: ReplayPage });

function ReplayPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div className="boot">Replay</div>;
  return (
    <Suspense fallback={<div className="boot">Replay</div>}>
      <ReplayViewerView />
    </Suspense>
  );
}
