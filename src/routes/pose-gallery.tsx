import { createFileRoute } from "@tanstack/react-router";
import { PoseGalleryView } from "@/game/PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "@/game/poseGallery";

export const Route = createFileRoute("/pose-gallery")({ component: PoseGalleryPage });

const LABEL: Record<PublicPoseId, string> = {
  wrist: "Wrist shot",
  slap: "Slap shot",
  "shot-follow-through": "Shot follow-through",
  cheer: "Cheer",
};

function PoseGalleryPage() {
  return (
    <PoseGalleryView
      poses={PUBLIC_POSES}
      labels={LABEL}
      initial="wrist"
      applyPose={applyPose}
      releasePoseGallery={releasePoseGallery}
    />
  );
}
