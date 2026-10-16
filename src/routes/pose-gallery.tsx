import { createFileRoute } from "@tanstack/react-router";
import { PoseGalleryView } from "@/game/PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "@/game/poseGallery";

export const Route = createFileRoute("/pose-gallery")({ component: PoseGalleryPage });

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

function PoseGalleryPage() {
  return (
    <PoseGalleryView
      poses={PUBLIC_POSES}
      labels={LABEL}
      initial="default"
      applyPose={applyPose}
      releasePoseGallery={releasePoseGallery}
    />
  );
}
