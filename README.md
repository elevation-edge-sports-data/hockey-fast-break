# Hockey Fast Break

A browser 3D hockey game: skate a fast break on a full-size 200 × 85 ft rink with
arena, ice, kits, and CPU opposition. Built with React 19, TanStack Start,
React Three Fiber, and a custom 60 Hz sim in [`src/game/sim.ts`](src/game/sim.ts).

The game is client-side only. World state lives in the sim; UI state lives in
zustand. Nothing is sent to a server.

**Play:** [https://elevation-edge-sports-data.github.io/hockey-fast-break/](https://elevation-edge-sports-data.github.io/hockey-fast-break/)

Not affiliated with, endorsed by, or licensed by any league or team.

## Requirements

- Node.js 22+
- npm 10+
- A gamepad is the intended control scheme (Xbox layout). Keyboard fallbacks work.

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080).

```bash
npm run typecheck
npm run lint
```

## Pack a double-click HTML

```bash
npm run play:build
```

That writes a self-contained `dist-play/index.html` (React + Three.js + the
game inlined). Copy or open that file — no other project files are needed to
play. Fonts load from Google if you are online; the game still runs offline.

## Layout

```
src/game/          ← the game
  sim.ts           world state, physics, AI, input consumption
  PlayerMesh.tsx   skater + goalie meshes and poses
  World.tsx        R3F scene, cameras, sim loop
  Overlay.tsx      HUD / pause / lineup / kits
  input.ts         keyboard + gamepad + touch
  rink.ts          rink dimensions and cage collision helpers
  Rink.tsx         ice, boards, nets
  Arena.tsx        bowl, lights, jumbo
  store.ts         zustand UI state
  uniforms.ts      kit colors
src/routes/        pages (index mounts the canvas)
```

## Controls (Xbox / DualSense)

| Input | Action |
|---|---|
| Left stick | Skate / aim pass / aim shot |
| A | Pass (hold = saucer). Goalie: outlet. During a live user pass, X = one-timer |
| X | Wrist. Hold X = slap (B before release cancels). Poke when you do not have the puck |
| Y | Deke with puck / body check without |
| B | Change player. Cancel slap windup |
| LT | Take the home goalie (only way A jumps to the goalie) |
| Start / Esc | Pause |
| Right stick click | Cycle camera: classic, chase, broadcast, high, freestyle |

Defaults: burgundy and blue at home against green and black or gold and black
on the road. Light rink. Lineup G / D / **F** (forwards — stored as `o` in
code).
