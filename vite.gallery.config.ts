import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { poseOverridesDataPlugin } from "./scripts/pose-overrides-plugin.mjs";
import { mirrorPoseJoints } from "./src/game/poseMirror.ts";

const PUBLIC_POSE_IDS = new Set([
  "default",
  "ready",
  "backSkate",
  "strideLeft",
  "strideRight",
  "faceoff",
  "coast",
  "puckPossess1",
  "puckPossess2",
  "autoDeke1",
  "autoDeke2",
  "forehandDeke",
  "backhandDeke",
  "speedPuckLeft",
  "speedPuckRight",
  "wrist",
  "wristFollow",
  "backhandShot",
  "backhandFollow",
  "slap",
  "slapFollow",
  "snap",
  "snapFollow",
  "shoulderCheck1",
  "shoulderCheck2",
  "absorb",
  "poke",
  "dive",
  "divePoke",
  "knockout",
  "recover",
  "celebrate",
  "rage1",
  "rage2",
  "fight",
  "bench",
  "goalieUpright",
  "goalieRage1",
  "goalieRage2",
  "goalieButterfly",
  "goalieMid",
  "goaliePerimeter",
  "goalieCheer",
  "goalieBench",
  "goaliePlay",
  "goalieCover",
  "goalieGloveSave",
  "goalieBlockerSave",
  "goalieProtectLeft",
  "goalieProtectRight",
  "goalieDivingGloveSave",
  "goalieDivingStickSave",
  "goalieGetUp",
]);

/** Public gallery bundle keeps only the public pose entries from poseOverrides.json. */
function publicPoseOverridesPlugin() {
  return {
    name: "hfb-public-pose-overrides",
    enforce: "post" as const,
    transform(_code: string, id: string) {
      const file = id.split("?", 1)[0]?.replaceAll("\\", "/") ?? "";
      if (!file.endsWith("/src/game/poseOverrides.json")) return null;
      const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      if (data.neutral && !data.default) data.default = data.neutral;
      delete data.neutral;
      if (data.puckDropSet && !data.idle && !data.coast) data.idle = data.puckDropSet;
      delete data.puckDropSet;
      if (data.idle && !data.coast) data.coast = data.idle;
      delete data.idle;
      if (data.puckDrop && !data.faceoff) data.faceoff = data.puckDrop;
      delete data.puckDrop;
      if (data.skillBackhand && !data.backhandCarry) data.backhandCarry = data.skillBackhand;
      delete data.skillBackhand;
      if (data.burstCarry && !data.speedCarry) data.speedCarry = data.burstCarry;
      delete data.burstCarry;
      if (data.backhandCarry && !data.backhandDeke) data.backhandDeke = data.backhandCarry;
      delete data.backhandCarry;
      if (data.speedCarry && !data.speedPuckPossess && !data.speedPuckLeft) data.speedPuckPossess = data.speedCarry;
      delete data.speedCarry;
      if (data.speedPuckPossess && !data.speedPuckLeft) data.speedPuckLeft = data.speedPuckPossess;
      delete data.speedPuckPossess;
      if (data.speedPuckLeft && !data.speedPuckRight) data.speedPuckRight = JSON.parse(JSON.stringify(data.speedPuckLeft));
      if (data.neutralCarry && !data.puckPossess) data.puckPossess = data.neutralCarry;
      delete data.neutralCarry;
      if (data.wristBackhand && !data.backhandShot) data.backhandShot = data.wristBackhand;
      delete data.wristBackhand;
      if (data.skillCarry && !data.forehandDeke) data.forehandDeke = data.skillCarry;
      delete data.skillCarry;
      if (data.deke && !data.autoDeke && !data.autoDeke1) data.autoDeke = data.deke;
      delete data.deke;
      if (data.autoDeke && !data.autoDeke1) data.autoDeke1 = data.autoDeke;
      delete data.autoDeke;
      if (data.autoDeke1 && !data.autoDeke2) data.autoDeke2 = JSON.parse(JSON.stringify(data.autoDeke1));
      if (data.getUp && !data.recover) data.recover = data.getUp;
      delete data.getUp;
      if (data.checked && !data.absorb) data.absorb = data.checked;
      delete data.checked;
      if (data.tumble && !data.knockout) data.knockout = data.tumble;
      delete data.tumble;
      if (data.brawl && !data.fight) data.fight = data.brawl;
      delete data.brawl;
      if (data.cheer && !data.celebrate) data.celebrate = data.cheer;
      delete data.cheer;
      if (data.check && !data.shoulderCheck && !data.shoulderCheck1) data.shoulderCheck = data.check;
      delete data.check;
      if (data.shoulderCheck && !data.shoulderCheck1) data.shoulderCheck1 = data.shoulderCheck;
      delete data.shoulderCheck;
      if (data.shoulderCheck1 && !data.shoulderCheck2) data.shoulderCheck2 = JSON.parse(JSON.stringify(data.shoulderCheck1));
      if (data.stride && !data.strideLeft) data.strideLeft = data.stride;
      delete data.stride;
      if (data.strideLeft && !data.strideRight) {
        data.strideRight = mirrorPoseJoints(data.strideLeft as Record<string, number[]>);
      }
      if (data["shot-follow-through"] && !data.wristFollow) data.wristFollow = data["shot-follow-through"];
      delete data["shot-follow-through"];
      if (data.wristFollow && !data.slapFollow) data.slapFollow = JSON.parse(JSON.stringify(data.wristFollow));
      if (data.wristFollow && !data.backhandFollow) data.backhandFollow = JSON.parse(JSON.stringify(data.wristFollow));
      if (data.wristFollow && !data.snapFollow) data.snapFollow = JSON.parse(JSON.stringify(data.wristFollow));
      if (data.snapFollow && !data.snap) data.snap = JSON.parse(JSON.stringify(data.snapFollow));
      if (data.ready && !data.backSkate) data.backSkate = JSON.parse(JSON.stringify(data.ready));
      if (data.dive && !data.divePoke) data.divePoke = JSON.parse(JSON.stringify(data.dive));
      if (data.rage && !data.rage1) data.rage1 = JSON.parse(JSON.stringify(data.rage));
      if (data.rage && !data.rage2) data.rage2 = JSON.parse(JSON.stringify(data.rage));
      if (data.goalieRage && !data.goalieRage1) data.goalieRage1 = JSON.parse(JSON.stringify(data.goalieRage));
      if (data.goalieRage && !data.goalieRage2) data.goalieRage2 = JSON.parse(JSON.stringify(data.goalieRage));
      if (data.puckPossess && !data.puckPossess1) data.puckPossess1 = JSON.parse(JSON.stringify(data.puckPossess));
      if (data.puckPossess && !data.puckPossess2) data.puckPossess2 = JSON.parse(JSON.stringify(data.puckPossess));
      const next: Record<string, unknown> = {};
      for (const key of Object.keys(data)) {
        if (PUBLIC_POSE_IDS.has(key)) next[key] = data[key];
      }
      return `export default ${JSON.stringify(next)};`;
    },
  };
}

/**
 * One classic-script bundle for a pose-gallery HTML file.
 * GALLERY_ENTRY and GALLERY_OUT select the public or private entry.
 * This does not use the play-pack config or write docs/index.html.
 */
export default defineConfig(() => {
  const entry = process.env.GALLERY_ENTRY || "src/game/poseGalleryPublicEntry.tsx";
  const outDir = process.env.GALLERY_OUT || "dist-gallery-public";
  const publicGallery = !entry.includes("poseGalleryFull");
  return {
    publicDir: false,
    resolve: { tsconfigPaths: true },
    plugins: [poseOverridesDataPlugin(), tailwindcss(), viteReact(), ...(publicGallery ? [publicPoseOverridesPlugin()] : [])],
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    build: {
      outDir,
      emptyOutDir: true,
      cssCodeSplit: false,
      assetsInlineLimit: 10_000_000,
      minify: true,
      target: "es2020",
      rollupOptions: {
        input: entry,
        output: {
          format: "iife" as const,
          name: "PoseGallery",
          inlineDynamicImports: true,
          entryFileNames: "gallery.js",
          assetFileNames: "[name][extname]",
        },
      },
    },
  };
});
