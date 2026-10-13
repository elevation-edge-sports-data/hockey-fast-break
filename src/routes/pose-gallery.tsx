import { createFileRoute } from "@tanstack/react-router";
import { PoseGalleryView } from "@/game/PoseGalleryView";
import { applyPose, PUBLIC_POSES, releasePoseGallery, type PublicPoseId } from "@/game/poseGallery";

export const Route = createFileRoute("/pose-gallery")({ component: PoseGalleryPage });

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
