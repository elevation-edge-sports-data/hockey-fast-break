import { createRoot } from "react-dom/client";
import { PoseGalleryView } from "./PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "./poseGallery";
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
if (!el) throw new Error("pose gallery: missing #app");

createRoot(el).render(
  <PoseGalleryView
    poses={PUBLIC_POSES}
    labels={LABEL}
    initial="default"
    applyPose={applyPose}
    releasePoseGallery={releasePoseGallery}
  />,
);
