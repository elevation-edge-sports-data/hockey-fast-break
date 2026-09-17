# Hockey Fast Break

A browser 3D hockey game: skate a fast break on a full NHL-size rink with
arena, ice, kits, and CPU opposition. Built with React 19, TanStack Start,
React Three Fiber, and a custom 60 Hz sim in [`src/game/sim.ts`](src/game/sim.ts).

## Requirements

- Node.js 22+
- npm 10+
- A gamepad is the intended control scheme (Xbox layout). Keyboard fallbacks work.

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:8080](http://localhost:8080). The Vite config binds
`0.0.0.0:8080` (the original preview contract). Change `vite.config.ts` /
`package.json` `dev` if you want another port.

```bash
npm run typecheck
npm run lint
```

Auth and the database are **off**. The game is client-side only (zustand +
the sim). Keep `.grok/app-env.json` (`VITE_AUTH_ENABLED: "false"`) so
`scripts/with-app-env.mjs` does not flip auth on.

## Continue with Grok CLI

Unzip, `cd hockey-fast-break`, then:

```bash
npm install
grok
```

Read [`AGENTS.md`](AGENTS.md) first — it is the project map for the agent
(architecture, controls, where to edit, what not to touch).

## Layout

```
src/game/          ← the game (this is where almost all work happens)
  sim.ts           world state, physics, AI, input consumption
  PlayerMesh.tsx   skater + goalie meshes and poses
  World.tsx        R3F scene, cameras, sim loop
  Overlay.tsx      HUD / pause / lineup / kits
  input.ts         keyboard + gamepad + touch
  rink.ts          NHL dimensions and cage collision helpers
  Rink.tsx         ice, boards, nets
  Arena.tsx        bowl, lights, jumbo
  store.ts         zustand UI state
  uniforms.ts      kit colors (COL / DAL / VGK + extras)
src/routes/        TanStack Start pages (index mounts the canvas)
src/lib/           scaffold auth/db (unused by the game)
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

Defaults: Colorado (home) vs Dallas or Vegas (away). Light rink. Lineup
G / D / **F** (forwards — stored as `o` in code).

## License

Personal / source drop. NHL team colors are used as unlabeled kits for a
fan project; do not treat this as an official product.


## Pack a double-click HTML

After gameplay changes, ask Grok CLI to run:

```bash
npm run play:build
```

That writes a **self-contained** `dist-play/index.html` (React + Three.js + the
game inlined). Copy/open that file — no other project files are needed to play.
Fonts load from Google if you are online; the game still runs offline.
