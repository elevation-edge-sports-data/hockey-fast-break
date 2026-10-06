import { createRoot } from "react-dom/client";
import { GameCanvas } from "./HockeyApp";
import { Overlay } from "./Overlay";
import { pauseGame } from "./sim";
import "../styles.css";

// docs/index.html calls this. Archived v0–v3 bundles do not.
window.__hfb = { pause: pauseGame };

const el = document.getElementById("app");
if (!el) throw new Error("Hockey Fast Break: missing #app");

createRoot(el).render(
  <div className="shell">
    <GameCanvas />
    <Overlay />
  </div>,
);
