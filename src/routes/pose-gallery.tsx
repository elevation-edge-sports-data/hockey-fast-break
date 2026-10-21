import { createFileRoute } from "@tanstack/react-router";
import { PoseGalleryView } from "@/game/PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "@/game/poseGallery";

export const Route = createFileRoute("/pose-gallery")({ component: PoseGalleryPage });

const LABEL: Record<PublicPoseId, string> = {
  default: "Default",
  ready: "Ready",
  backSkate: "Back skate",
  strideLeft: "Stride left",
  strideRight: "Stride right",
  faceoff: "Faceoff",
  coast: "Coast",
  puckPossess1: "Puck possess 1",
  puckPossess2: "Puck possess 2",
  autoDeke1: "Auto deke 1",
  autoDeke2: "Auto deke 2",
  forehandDeke: "Forehand deke",
  backhandDeke: "Backhand deke",
  speedPuckLeft: "Speed puck left",
  speedPuckRight: "Speed puck right",
  wrist: "Wrist shot",
  wristFollow: "Wrist follow",
  backhandShot: "Backhand shot",
  backhandFollow: "Backhand follow",
  slap: "Slap shot",
  slapFollow: "Slap follow",
  snap: "Snap",
  snapFollow: "Snap follow",
  shoulderCheck1: "Shoulder check 1",
  shoulderCheck2: "Shoulder check 2",
  absorb: "Absorb",
  poke: "Poke",
  dive: "Dive",
  divePoke: "Dive poke",
  knockout: "Knockout",
  recover: "Recover",
  celebrate: "Celebrate",
  rage1: "Rage 1",
  rage2: "Rage 2",
  fight: "Fight",
  bench: "Bench",
  goalieUpright: "Goalie upright",
  goalieRage1: "Goalie rage 1",
  goalieRage2: "Goalie rage 2",
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

function PoseGalleryPage() {
  return (
    <PoseGalleryView
      poses={PUBLIC_POSES}
      labels={LABEL}
      initial="default"
      applyPose={applyPose}
      releasePoseGallery={releasePoseGallery}
      seated={(pose) => (pose === "goalieBench" ? "goalie" : pose === "bench" ? "skater" : null)}
    />
  );
}
