import { createRoot } from "react-dom/client";
import { PoseEditor } from "./PoseEditor";
import { applyPose, PUBLIC_POSES, type PublicPoseId } from "./poseGallery";
import "../styles.css";

const LABEL: Record<PublicPoseId, string> = {
  default: "Default",
  ready: "Ready",
  strideLeft: "Stride left",
  strideRight: "Stride right",
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
  rage: "Rage",
  fight: "Fight",
  bench: "Bench",
  goalieUpright: "Goalie upright",
  goalieRage: "Goalie rage",
  goalieButterfly: "Goalie butterfly",
  goalieMid: "Goalie mid",
  goaliePerimeter: "Goalie perimeter",
  goalieCheer: "Goalie celebrate",
  goalieBench: "Goalie bench",
  goaliePlay: "Goalie play puck",
  goalieCover: "Goalie cover",
  goalieGloveSave: "Goalie glove save",
  goalieBlockerSave: "Goalie blocker save",
  goalieProtectLeft: "Goalie protect left",
  goalieProtectRight: "Goalie protect right",
  goalieDivingGloveSave: "Goalie diving glove save",
  goalieDivingStickSave: "Goalie diving stick save",
  goalieGetUp: "Goalie recover",
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
    seated={(pose) => (pose === "goalieBench" ? "goalie" : pose === "bench" ? "skater" : null)}
  />,
);
