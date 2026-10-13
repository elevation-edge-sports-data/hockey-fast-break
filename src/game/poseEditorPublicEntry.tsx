import { createRoot } from "react-dom/client";
import { PoseEditor } from "./PoseEditor";
import { applyPose, PUBLIC_POSES, type PublicPoseId } from "./poseGallery";
import "../styles.css";

const LABEL: Record<PublicPoseId, string> = {
  default: "Default",
  ready: "Ready",
  stride: "Stride",
  faceoff: "Faceoff",
  coast: "Coast",
  autoDeke: "Auto deke",
  backhandDeke: "Backhand deke",
  speedPuckPossess: "Speed puck possess",
  wrist: "Wrist shot",
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
