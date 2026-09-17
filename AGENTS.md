# Hockey Fast Break — agent notes

You are working on a playable 3D hockey game. Prefer small, targeted edits
in `src/game/`. Do not scaffold a new app. Auth and database stay **off**.

## Stack

Vite + React 19 + TanStack Start/Router + Tailwind v4 + three.js via
`@react-three/fiber` / drei + zustand (`useGame`).

- Dev: `npm run dev` (must go through `scripts/with-app-env.mjs`, never raw `vite`)
- Port: `0.0.0.0:8080` in `vite.config.ts`
- Typecheck: `npx tsc --noEmit`
- Lint: `npx eslint src/game`

`verbatimModuleSyntax` is on — type-only imports must use `import type`.

## Where to edit

| Area | File |
|---|---|
| Physics, AI, shooting, passing, goalie saves, faceoffs | [`src/game/sim.ts`](src/game/sim.ts) |
| Skater / goalie meshes, pads, stick, hands, deke | [`src/game/PlayerMesh.tsx`](src/game/PlayerMesh.tsx) |
| Cameras, sim loop, puck mesh | [`src/game/World.tsx`](src/game/World.tsx) |
| HUD, pause, lineup, kits, hints | [`src/game/Overlay.tsx`](src/game/Overlay.tsx) |
| Gamepad / keyboard | [`src/game/input.ts`](src/game/input.ts) |
| NHL rink numbers, `resolveCage` | [`src/game/rink.ts`](src/game/rink.ts) |
| Ice / boards / nets | [`src/game/Rink.tsx`](src/game/Rink.tsx) |
| Arena bowl / lights | [`src/game/Arena.tsx`](src/game/Arena.tsx) |
| UI store, lineup, camera mode | [`src/game/store.ts`](src/game/store.ts) |
| Kit palettes | [`src/game/uniforms.ts`](src/game/uniforms.ts) |

Leave `src/lib/auth`, `src/lib/db.ts`, and `migrations/` alone unless the
user explicitly asks for accounts or persistence.

## Sim contract (`sim.ts`)

Fixed timestep **1/60**. Mutable `world` singleton.

Important fields / functions:

- **One-timers:** `lastPassTo`, `oneTimerUntil`, `oneTimerArmed`, `oneTimerMx/My`.
  User presses **A** (pass) then **X** before the puck arrives → `tryFireArmedOneTimer`
  / `fireOneTimer`. Do not let poke-check steal that X during a live user pass
  (`userPassInFlight`).
- **Shots:** `launchShotAtNet(s, mx, my, power, spray)`. Stick X = lateral aim
  across the *attacking* net (not own net). Stick Y: down = low, up = high.
  Gravity-correct `vy` so the puck arrives at `wantY`. Slight misses are OK;
  do not spray so wide that most shots miss. Post hits should often bounce
  **in** when the shot was going toward the opening.
- **Saves:** `equipmentCovers` (discrete glove / blocker / pads / 5-hole) then
  `trySave` / `applyGoalieSave`. CPU (away) goalie is intentionally **nerfed**.
  Rebounds should be juicy: lofted (`puck.y`, `puck.vy`) and land near the net
  with the goalie briefly stunned. Away goalie should not vacuum-catch.
- **Cage / roof:** `bouncePuckCage` + `resolveCage`. Puck must **never rest on
  top of the net** — kick it out toward center ice.
- **AI without puck:** `thinkWithoutPuck`. Home D must join the attack in NZ/OZ
  (not glued to the blue line or own crease) and step up in transition when
  the CPU has the puck. Forwards settle in high-danger spots and keep spacing
  (`repulsion`, offensive stations). Do not drift onto a live pass or into
  the corner when a slot is open.
- **Hits:** `applyHit`. After a cover whistle the user may still check the
  CPU goalie (`allowCoverGoalie`, `CHECK_WINDOW`).
- **Slap cancel:** `windupCancel` on B before X release.
- **A button:** skaters only for change-player. LT is the only way onto the
  home goalie. Goalie A = outlet pass.

World axes: +X is toward the CPU/away net for the home team. Classic camera
`up = (1,0,0)`. Do not roll the rink when the puck is near the boards.

## Goalie / skater posing (`PlayerMesh.tsx`)

- Goalie pads are **independent rectangular slabs** (not skater legs glued
  together). Stance spread: legs together, ~90° (45° each), butterfly 180°
  (`lPad` / `rPad` / `coverPose`). Athletic: knees bent, lean forward.
  RVH / one-knee when the puck is near the end line.
- Distinct catcher (glove, typically stick-left) and blocker. Stick blade
  must stay connected to the shaft. Protecting the 5-hole pulls the blocker
  down and leaves the top corner open — coverage is physically limited.
- Skater hands: right-handed grip, **not** both arms in a forward V with
  hands together. Deke (Y) must keep the stick in the hands (`poseStickHands`
  + `tickDeke`); the stick must not hover independently.

## Product defaults (do not change unless asked)

- Home COL (Avalanche blue `#236192`, not navy), away DAL or VGK
- Light rink is default; dark is an explicit mode
- Lineup UI label is **F (Forwards)** — the field is still `lineup.o`
- Shot-speed HUD shows **max speed of the current shot attempt only**
- Nets somewhat opaque; puck always visible
- No scope creep: this is a single-player 3v3-ish rink, not a full NHL sim

## Quality bar

- Keep it playable. After sim or mesh changes, typecheck at least `src/game`.
- Do not add comments, helpers, or configurability the user did not ask for.
- Do not introduce auth, a database, or new routes for game features.
- Prefer editing existing functions over new abstractions.


## Pack a playable HTML

When the user wants an updated double-click file, run `npm run play:build`.
Output: `dist-play/index.html` — one self-contained IIFE HTML (no `node_modules`,
no other source files required to play). Copy it out as `index.html` or
`HockeyFastBreak.html`. Do not hand-edit the packed file; edit `src/game/` then
rebuild.
