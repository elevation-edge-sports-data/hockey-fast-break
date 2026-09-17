import { createRoot } from "react-dom/client";
import { GameCanvas } from "./HockeyApp";
import { Overlay } from "./Overlay";
import "../styles.css";

const el = document.getElementById("app");
if (!el) throw new Error("Hockey Fast Break: missing #app");

createRoot(el).render(
  <div className="shell">
    <GameCanvas />
    <Overlay />
  </div>,
);
