import { createRoot } from "react-dom/client";
import { PoseGalleryView } from "./PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "./poseGallery";
import "../styles.css";

const LABEL: Record<PublicPoseId, string> = {
  default: "Default",
  ready: "Ready",
  stride: "Stride",
  faceoff: "Faceoff",
  coast: "Coast",
  puckPossess: "Puck possess",
  autoDeke: "Auto deke",
  forehandDeke: "Forehand deke",
  backhandDeke: "Backhand deke",
  speedPuckPossess: "Speed puck possess",
  wrist: "Wrist shot",
  backhandShot: "Backhand shot",
  slap: "Slap shot",
  "shot-follow-through": "Shot follow-through",
  poke: "Poke",
  shoulderCheck: "Shoulder check",
  absorb: "Absorb",
  dive: "Dive",
  knockout: "Knockout",
  recover: "Recover",
  celebrate: "Celebrate",
  fight: "Fight",
  goalieButterfly: "Goalie butterfly",
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
