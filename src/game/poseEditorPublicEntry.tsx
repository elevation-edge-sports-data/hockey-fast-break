import { createRoot } from "react-dom/client";
import { PoseEditor } from "./PoseEditor";
import { applyPose, PUBLIC_POSES, type PublicPoseId } from "./poseGallery";
import "../styles.css";

const LABEL: Record<PublicPoseId, string> = {
  default: "Default",
  ready: "Ready",
  stride: "Skating stride",
  idle: "Idle",
  deke: "Deke",
  wrist: "Wrist shot",
  slap: "Slap shot",
  "shot-follow-through": "Shot follow-through",
  poke: "Poke",
  cheer: "Cheer",
};

const el = document.getElementById("app");
if (!el) throw new Error("pose editor: missing #app");

createRoot(el).render(
  <PoseEditor
    poses={PUBLIC_POSES}
    labels={LABEL}
    applyNamedPose={(pose) => applyPose(pose as PublicPoseId)}
    showRest={false}
    publicOnly
  />,
);
