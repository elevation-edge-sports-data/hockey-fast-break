import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";

const FormationLibraryView = lazy(() =>
  import("@/game/FormationLibraryView").then((m) => ({ default: m.FormationLibraryView })),
);

export const Route = createFileRoute("/formations")({ component: FormationsPage });

function FormationsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div className="boot">Formations</div>;
  return (
    <Suspense fallback={<div className="boot">Formations</div>}>
      <FormationLibraryView />
    </Suspense>
  );
}
