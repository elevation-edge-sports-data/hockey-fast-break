import { createRoot } from "react-dom/client";
import { FunctionViewer } from "./functionViewerView";
import "../styles.css";

/**
 * Standalone procedural-function visualizer. No router and no saves.
 * Build: npx vite build --config vite.function-viewer.config.ts
 * Pack:  node scripts/pack-function-viewer.mjs
 */

const el = document.getElementById("app");
if (!el) throw new Error("function viewer: missing #app");

createRoot(el).render(<FunctionViewer />);
