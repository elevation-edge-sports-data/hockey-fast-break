# Skill slider effects

What the six pause-menu skill sliders change in the current game. This note records the code as it is. No gameplay numbers were changed to produce it.

The pause menu labels them You / CPU, then Forwards, Defencemen, and Goalie. The store fields and the sim multipliers do not follow those labels one-to-one. Read the mapping below before reading a single slider.

Speeds below are the hard caps from `skateStats` and `goalieSkateCap` in `src/game/sim.ts`. They are formula results, in meters per second, with miles per hour from the sim constant `MPH = 2.23694`. Ice drag (`ICE_DRAG` 0.85, or 0.70 while bursting) means a skater approaches the cap. The cap is the ceiling.

Low / mid / high in the tables are the slider minimum, the stored default (also the middle of the 20-tick track), and the slider maximum.

## Pause menu and store

Defined in `src/game/store.ts`. Drawn by `SideSliders` in `src/game/Overlay.tsx`. `snapSlider` quantizes each range into 20 steps. These six values are not written to `localStorage`. A fresh load uses the defaults. The separate Game Speed slider is not one of these six.

| Menu | Store field | Range | Step | Default |
| --- | --- | --- | --- | --- |
| You / Forwards | `userOffense` | 0–1.2 | 0.06 | 0.6 |
| You / Defencemen | `userDefense` | 0–2 | 0.1 | 1 |
| You / Goalie | `userGoalie` | 0–1 | 0.05 | 0.5 |
| CPU / Forwards | `cpuOffense` | 0–2 | 0.1 | 1 |
| CPU / Defencemen | `cpuDefense` | 0–2 | 0.1 | 1 |
| CPU / Goalie | `cpuGoalie` | 0–1.6 | 0.08 | 0.8 |

Setters: `setUserOffense`, `setUserDefense`, `setUserGoalie`, `setCpuOffense`, `setCpuDefense`, `setCpuGoalie`.

Nothing else reads the six fields. `cpuMul` and `userMul` are the only consumers, and they live in `src/game/sim.ts`.

## The two multipliers

```javascript
function cpuMul(kind: "off" | "def" | "g"): number {
  const ui = useGame.getState();
  const raw = kind === "off" ? ui.cpuOffense : kind === "def" ? ui.cpuDefense : ui.cpuGoalie;
  // Offense slider 1.0 plays at the old 0.5. The thumb still sits on 1.0.
  const t = kind === "off" ? raw * 0.5 : raw;
  const cap = kind === "g" ? 1.6 : 2;
  return 0.55 + Math.max(0, Math.min(cap, t)) * 0.9;
}

function userMul(kind: "off" | "def" | "g"): number {
  const ui = useGame.getState();
  const t = kind === "off" ? ui.userOffense : kind === "def" ? ui.userDefense : ui.userGoalie;
  const cap = kind === "def" ? 2 : kind === "off" ? 1.2 : 1;
  return 0.55 + Math.max(0, Math.min(cap, t)) * 0.9;
}
```

Shared shape: `0.55 + clampedInput * 0.9`. The floor is 0.55 at slider 0. A slider at 0 still skates, pokes, and saves. It does not freeze the player.

CPU Forwards is the special case. Its raw value is halved before that map, and the code comment says slider 1.0 plays at the old 0.5. Defense and goalie inputs are used as stored. Each input is clamped to the slider's own max inside the function (goalie 1.6, user forwards 1.2, user goalie 1, the other three 2).

| Slider | Low (0) | Default | High (max) |
| --- | --- | --- | --- |
| CPU Forwards `cpuMul("off")` | 0.55 | 1.00 at 1.0 | 1.45 at 2 |
| CPU Defencemen `cpuMul("def")` | 0.55 | 1.45 at 1 | 2.35 at 2 |
| CPU Goalie `cpuMul("g")` | 0.55 | 1.27 at 0.8 | 1.99 at 1.6 |
| You Forwards `userMul("off")` | 0.55 | 1.09 at 0.6 | 1.63 at 1.2 |
| You Defencemen `userMul("def")` | 0.55 | 1.45 at 1 | 2.35 at 2 |
| You Goalie `userMul("g")` | 0.55 | 1.00 at 0.5 | 1.45 at 1 |

CPU Forwards reaches 1.00 exactly at the default thumb. The other five defaults sit above 1, except You Goalie, which is exactly 1.00.

## Who each multiplier is applied to

Home and away use different rules.

**Home (the You side), speed cap and acceleration.** Role decides the multiplier, for the controlled player and for home CPU teammates:

- Goalie in the crease uses `userMul("g")`.
- `kind === "defense"` uses `userMul("def")`.
- Any other skater (forwards are `kind === "winger"`) uses `userMul("off")`.

Possession does not pick the home speed multiplier.

**Away (the CPU side), speed cap and acceleration.** Possession decides the multiplier, and it covers every non-goalie, forwards and defensemen together:

- Away goalie in the crease uses `cpuMul("g")`.
- If the puck holder is away, every other away skater uses `cpuMul("off")`.
- Otherwise (home has the puck, or the puck is loose), every other away skater uses `cpuMul("def")`.

A defenseman still skates on the defense speed constants, and a forward still skates on the winger constants. The slider only picks the multiplier in front of those constants. CPU Forwards therefore speeds up CPU defensemen while the CPU has the puck. CPU Defencemen speeds up CPU forwards while the CPU does not.

**Out of the crease, both goalies use the Forwards multiplier** (`userMul("off")` at home, `cpuMul("off")` on the road), including a user goalie who is holding burst. The Goalie sliders do not set that cap.

**Steering effort** (the `mag` wish, 0 to 1) is a second, narrower use. It is clamped with `Math.min(1, multiplier)`, so once the multiplier is at least 1, a higher slider does not push harder. It still raises the speed cap. At the shipped defaults, every one of those clamps is already saturated. Moving a slider up from the default changes top speed and acceleration. Moving it down through the saturation point is what starts cutting steering effort.

Saturation (multiplier reaches 1):

| Multiplier | Slider value where it hits 1 |
| --- | --- |
| `cpuMul("off")` | 1.0 (the default) |
| `cpuMul("def")` | 0.5 |
| `cpuMul("g")` | 0.5 |
| `userMul("off")` | 0.5 |
| `userMul("def")` | 0.5 |
| `userMul("g")` | 0.5 (the default) |

## Every call site

All of these are in `src/game/sim.ts`.

| Site | Function | What the value does |
| --- | --- | --- |
| `cpuMul` / `userMul` | the two functions above | Read the store. |
| `skateStats` | away branch, then home branch | Speed cap and acceleration for every skater `integrateSkater` runs. Away non-goalies switch on possession. Home switches on role. |
| `skateStats` goalie burst | `user && burst` | Controlled goalie holding burst. Cap and accel use the Forwards multiplier (`userMul("off")` on home). |
| `goalieSkateCap` | called from `skateStats` and from `goaliePlayLoose` | Out-of-crease cap. Forwards multiplier, times 1.14 for the user and 0.9 otherwise, times `goaliePace`. `goaliePlayLoose` also divides distance by `max(8, cap * 0.82)` when it decides whether to leave the net. |
| `carrierPush` | away carrier only | Scales push magnitude by `min(1, 0.45 + cpuMul("off") * 0.55)`. |
| `thinkCarrier` shot roll | away carrier only | Shot attempt probability inside the shooting window. |
| `thinkCarrier` cruise | away carrier only | Same magnitude scale as `carrierPush`, and a burst flag gated on `cpuMul("off") > 0.42`. |
| `thinkWithoutPuck` | home teammates, then away teammates | Scales support `mag` by `min(1, off or def)` from possession. Later jobs replace `mag`. |
| `thinkWithoutPuck` `matePuckChase` | home teammates on a loose puck within 6 m | Replaces `mag` with `min(1, userMul("def"))`, or 0.15 of that when on top of the puck. |
| `thinkGoalie` | away crease track | Lead time and direction-change rate from `cpuMul("g")`, each clamped so values above 1 do nothing. Home uses fixed numbers. |
| `cpuDefend` dive | shot lane, loose puck | Away dive chance is `0.48 * cpuMul("def")`. Home defense uses a fixed idle check. |
| `cpuDefend` poke / hit | opponent carrying, in front | Away poke chance is `0.026 * cpuMul("def")` per step. The hit threshold under it is unreachable. Home defense uses a fixed factor. |
| `cpuSaveMiss` | away goalie only | Multiplies the miss chance by `1.55 - cpuMul("g")`. Home goalies return earlier on a different formula. |

`integrateSkater` is where a cap becomes motion. `thinkAi` calls `thinkCarrier` or `thinkWithoutPuck` for non-goalies. Live play skips `world.userId`, so the controlled player is moved from the stick path (`integrateSkater` with the stick vector and the burst button). Practice and scrimmage `stepOpenIce` does call `thinkAi` for every skater, including the user. The user's own shot button is still `doShot`. The away shot roll below is the CPU carrier's decision.

Goalies skip the normal `integrateSkater` after `thinkAi`. Crease angle tracking writes position directly. `skateGoalieTo` (loose puck, skate back) and the user's stick path are what run a goalie through `skateStats`. A dive returns before `skateStats`. The dive slide is capped at 11 m/s for everyone.

## Shared speed constants

From the top of `src/game/sim.ts`:

| Constant | Value | Who |
| --- | --- | --- |
| `WINGER_SPEED` | 12.2 m/s | Forward cruise |
| `WINGER_BURST` | 15.4 m/s | Forward burst, and the out-of-crease goalie cap |
| `WINGER_ACCEL` | 22.4 m/s² | Forward acceleration |
| `DEFENSE_SPEED` | 8.4 m/s | Defense cruise |
| `DEFENSE_BURST` | 9.8 m/s | Defense burst |
| `DEFENSE_ACCEL` | 13.6 m/s² | Defense acceleration |

Hard-coded offsets stacked on those bases, in `skateStats`:

- Controlled skater, forward: cap × 1.14, acceleration × 1.16.
- Controlled skater, defense: cap × 1.12, acceleration × 1.16.
- Every non-user skater: cap × 0.9, acceleration × 0.88.
- Forward who is not carrying: cap × 0.9 more, acceleration × 0.92.
- Forward who is carrying: those two factors are 1.
- Goalie cap only: `goaliePace` is 0.75 with no puck and 0.5 while that goalie owns the puck. Acceleration is not paced.
- Burst flag inside `integrateSkater`: acceleration × 1.35, and ice drag drops by 0.15. Backskate multiplies the cap by 0.62. A shot plant multiplies the user's cap by the plant-keep fraction. None of these three are sliders. They sit on top of the scaled cap.

The controlled player is home. Away skaters always take the 0.9 / 0.88 branch, because they are not `world.userId`.

Forward carry cap, controlled:

`12.2 × 1.14 × userMul("off")` cruise, `15.4 × 1.14 × userMul("off")` burst.

Forward carry cap, any CPU or home teammate:

`12.2 × 0.9 × multiplier` cruise, `15.4 × 0.9 × multiplier` burst.

Defense cap, controlled:

`8.4 × 1.12 × userMul("def")` cruise, `9.8 × 1.12 × userMul("def")` burst.

Defense cap, teammate or away:

`8.4 × 0.9 × multiplier` cruise, `9.8 × 0.9 × multiplier` burst.

Loose-forward caps are 0.9 times the carry caps. Acceleration for a controlled forward is `22.4 × (carrying ? 1 : 0.92) × 1.16 × multiplier`, and × 1.35 again while the burst flag is on and stick magnitude is 1.

## You / Forwards (`userOffense`, 0–1.2, default 0.6)

Affects the home team. Multiplier 0.55 / 1.09 / 1.63.

**Controlled forward.** Cap and acceleration, cruise and burst, with and without the puck.

| | Low 0 | Default 0.6 | High 1.2 |
| --- | --- | --- | --- |
| Carry cruise | 7.65 m/s (17.1 mph) | 15.16 m/s (33.9 mph) | 22.67 m/s (50.7 mph) |
| Carry burst | 9.66 m/s (21.6 mph) | 19.14 m/s (42.8 mph) | 28.62 m/s (64.0 mph) |
| Loose cruise | 6.88 m/s (15.4 mph) | 13.64 m/s (30.5 mph) | 20.40 m/s (45.6 mph) |
| Loose burst | 8.69 m/s (19.4 mph) | 17.22 m/s (38.5 mph) | 25.75 m/s (57.6 mph) |
| Carry accel | 14.3 m/s² | 28.3 m/s² | 42.4 m/s² |
| Burst accel at full stick | 19.3 m/s² | 38.2 m/s² | 57.2 m/s² |

The stick magnitude itself is the controller. This slider does not scale it.

**Home CPU forwards.** Same winger bases, with the 0.9 / 0.88 teammate factors. Carry cruise 6.04 / 11.97 / 17.90 m/s. Carry burst 7.62 / 15.11 / 22.59 m/s. Their speed cap uses this slider even while the home team is defending. Their steering effort uses it only while the home team has the puck, and only until a later job replaces `mag` (corner, rush join, net crash, retrieval, pass meet, loose chase). At the default 0.6 the effort clamp is already 1.

**Home goalie, outside the crease, and any user-goalie burst.** `goalieSkateCap` and the burst branch use this multiplier, not You Goalie.

| User goalie | Low 0 | Default 0.6 | High 1.2 |
| --- | --- | --- | --- |
| Loose, out of crease | 7.24 m/s (16.2 mph) | 14.35 m/s (32.1 mph) | 21.46 m/s (48.0 mph) |
| Carrying, out of crease | 4.83 m/s (10.8 mph) | 9.57 m/s (21.4 mph) | 14.31 m/s (32.0 mph) |

Out-of-crease acceleration from `skateStats` stays 22.4 m/s² unless the user is bursting and the burst accel exceeds 22.4. That crossover is about 0.43 when loose and about 0.35 when carrying. At the default, loose burst accel inside `skateStats` is 26.1 m/s², which is 35.2 m/s² after the shared ×1.35 at full stick. At max those figures are 39.0 and 52.6. In the crease the 22.4 floor is absent, so slider 0 while loose is 13.1 m/s² inside `skateStats` and 17.8 m/s² after ×1.35.

`goaliePlayLoose` estimates time-to-puck from this same cap. Below about 0.21 the estimate is pinned (the divisor floors at 8 m/s). Above that, a higher Forwards slider makes the home goalie more willing to leave the net for a loose puck. The Goalie slider is not in that estimate.

**Home teammate steering while the home team has the puck.** `mag *= min(1, userMul("off"))`. Saturated at 0.5, so the default does not cut it. Wing-claim teammates copy the user's stick and skip this scale. Their cap still uses their role slider.

This slider does not change shot power, shot spray, pass speed, poke chance, or hit chance.

## You / Defencemen (`userDefense`, 0–2, default 1)

Affects home defensemen's caps, and home teammates' steering effort while the home team does not have the puck. Multiplier 0.55 / 1.45 / 2.35. Effort saturates at slider 0.5, so the default already asks for a full push. Top speed keeps climbing up to 2.

**Controlled defenseman.**

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Cruise | 5.17 m/s (11.6 mph) | 13.64 m/s (30.5 mph) | 22.11 m/s (49.5 mph) |
| Burst | 6.04 m/s (13.5 mph) | 15.92 m/s (35.6 mph) | 25.79 m/s (57.7 mph) |
| Accel | 8.7 m/s² | 22.9 m/s² | 37.1 m/s² |
| Burst accel at full stick | 11.7 m/s² | 30.9 m/s² | 50.0 m/s² |

**Home CPU defensemen.** Cruise 4.16 / 10.96 / 17.77 m/s. Burst 4.85 / 12.79 / 20.73 m/s. A home defenseman more than 2.4 m from his spot has `mag` raised back to at least 0.97 after the slider scale, so a low slider barely slows his decision to skate. It still lowers his cap.

**Home teammates without the puck.** Support `mag` uses `userMul("def")` for forwards and defensemen. The loose-puck chase inside 6 m (`matePuckChase`) replaces `mag` with that same clamped multiplier (0.15 when the puck is under the skates). Forwards on that chase still take their speed cap from You Forwards.

Home poke, dive, and body-check rates in `cpuDefend` use a fixed factor (`0.7`, or `0.32` when the user has been idle for 1.6 s). They do not read this slider. A home shot-lane dive is 0.20, or 0.05 when the user is idle.

## You / Goalie (`userGoalie`, 0–1, default 0.5)

Affects the home goalie only, and only while `integrateSkater` is using the in-crease branch with burst off. Multiplier 0.55 / 1.00 / 1.45.

That branch is the user's stick inside the crease (`fromLine` within `CREASE_R + 0.12`, and not behind the goal line), and `skateGoalieTo` once the goalie has come back inside. Cap is `6.2 × multiplier × goaliePace`. Acceleration is `12.4 × multiplier`. There is no 1.14 user boost on this branch.

| | Low 0 | Default 0.5 | High 1 |
| --- | --- | --- | --- |
| Loose cap | 2.56 m/s (5.7 mph) | 4.65 m/s (10.4 mph) | 6.74 m/s (15.1 mph) |
| Carrying cap | 1.71 m/s (3.8 mph) | 3.10 m/s (6.9 mph) | 4.50 m/s (10.1 mph) |
| Accel | 6.8 m/s² | 12.4 m/s² | 18.0 m/s² |

Outside the crease, and whenever the user goalie is bursting, speed comes from You Forwards. Crease angle, post slide (7.2 m/s), bar slide, save chance, glove size, and the dive slide are independent of this slider. Home crease tracking uses fixed lead 0.18 s, reverse rate 14, and lateral limit 0.84 m. The home miss test in `cpuSaveMiss` uses idle time, rebound count, odd-man rushes, whiff heat, height, and distance from the body. It returns before `cpuMul("g")`.

## CPU / Forwards (`cpuOffense`, 0–2, default 1)

Affects the away team. Because of the half-scale, the multiplier is 0.55 / 1.00 / 1.45. That is a smaller swing than CPU Defencemen on the same 0–2 track.

**Away skaters while an away player has the puck.** Every away forward and every away defenseman. Carry caps:

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Forward cruise | 6.04 m/s (13.5 mph) | 10.98 m/s (24.6 mph) | 15.92 m/s (35.6 mph) |
| Forward burst | 7.62 m/s (17.1 mph) | 13.86 m/s (31.0 mph) | 20.10 m/s (45.0 mph) |
| Defense cruise | 4.16 m/s (9.3 mph) | 7.56 m/s (16.9 mph) | 10.96 m/s (24.5 mph) |
| Defense burst | 4.85 m/s (10.9 mph) | 8.82 m/s (19.7 mph) | 12.79 m/s (28.6 mph) |

Loose forward caps are 0.9 times the forward row. Acceleration is `WINGER_ACCEL` or `DEFENSE_ACCEL`, times 0.88, times this multiplier, times 0.92 for a forward who is not carrying, times 1.35 while their burst flag is on.

**Away carrier push.** `carrierPush` and the normal `thinkCarrier` cruise multiply magnitude by `min(1, 0.45 + cpuMul("off") * 0.55)`. That scale is 0.75 at 0, 0.88 at 0.5, and 1.00 at the default and at 2. Past the default, the carrier does not push harder. His cap still rises. Breakaway and odd-man paths call `carrierPush`, so they inherit this scale. Their deke timing and pass choice do not read the slider.

**Away carrier burst flag.** The code requires `cpuMul("off") > 0.42` along with being more than 16 m from the goal mouth and more than 4 m from the nearest checker. The multiplier never goes below 0.55, so on the legal slider range this comparison is always true. Away carriers burst in that window at every thumb position.

**Away shot frequency, inside the existing window only.** The window is unchanged: more than 0.55 s since the last shot, 1.15–11.5 m from the goal line, `|z| < 6.2`, and a closer-range / pressure / slot test. Home CPU teammates are excluded. The away roll is:

- User recently active: `0.28 + cpuMul("off") × 0.72`
- User idle more than 1.6 s: `0.52 + cpuMul("off") × 0.5`
- `whiffHot()` adds 0.42

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Active | 67.6% | 100% (exactly 1.00) | 100% |
| Idle | 79.5% | 100% (1.02 before the coin flip) | 100% |
| Whiff hot | 100% | 100% | 100% |

The active roll drops below certain only under slider 1.0. The idle roll drops below certain under about 0.91. During a whiff the addend alone makes slider 0 certain. Raising the slider above the default does not add shots. The aim and the power of `shootAtNet` do not read it (open side 0.55 m, or 0.78 m on a whiff, power `17 + speed × 0.7 + min(9, distance × 0.35)`, plus 5.2 on a whiff).

**Away goalie outside the crease.** Loose cap 5.72 / 10.40 / 15.07 m/s. Carrying cap 3.81 / 6.93 / 10.05 m/s. Acceleration on that path is 22.4 m/s² at every thumb position. The loose-puck leave-the-net estimate uses this cap and floors at 8 m/s, which this slider stops changing below about 0.86.

**Away teammate steering while the away team has the puck.** `mag *= min(1, cpuMul("off"))`, saturated at the default. Retrievals, rush joins, corners, depth match, and board cuts that assign `mag` afterward ignore the scale.

## CPU / Defencemen (`cpuDefense`, 0–2, default 1)

Affects the away team while the away team does not have the puck, plus away stick dives and pokes. Multiplier 0.55 / 1.45 / 2.35.

**Away skaters on defense or on a loose puck.** Same role bases as the Forwards table, with this larger multiplier. Carry caps:

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Forward cruise | 6.04 m/s (13.5 mph) | 15.92 m/s (35.6 mph) | 25.80 m/s (57.7 mph) |
| Forward burst | 7.62 m/s (17.1 mph) | 20.10 m/s (45.0 mph) | 32.57 m/s (72.9 mph) |
| Defense cruise | 4.16 m/s (9.3 mph) | 10.96 m/s (24.5 mph) | 17.77 m/s (39.7 mph) |
| Defense burst | 4.85 m/s (10.9 mph) | 12.79 m/s (28.6 mph) | 20.73 m/s (46.4 mph) |

At equal thumb positions, CPU defense skating is faster than CPU offense skating, because offense is halved before the map and defense is not. The default defense multiplier is 1.45 against the default offense multiplier of 1.00.

Steering effort while defending is `min(1, cpuMul("def"))`, saturated from 0.5 upward. The default does not cut it. Press, peel, and hold each assign a magnitude earlier in the same function, and this scale then multiplies that assignment. Retrieval, rush join, corner, depth, and board-cut assignments that run later replace the product.

**Shot-lane dive.** After an opponent's shot, loose puck, in the lane, within 4.4 m, within 0.12 s of the shot: chance `0.48 × multiplier` per step.

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Dive roll | 26.4% | 69.6% | 100% (crosses certain near 1.70) |

Forwards and defensemen both roll this. Home defense does not.

**Poke on an opponent who is carrying.** In front, within 2.4 m. Per step, while not already poking, diving, or hitting: `0.026 × multiplier`.

| | Low 0 | Default 1 | High 2 |
| --- | --- | --- | --- |
| Poke roll | 1.43% | 3.77% | 6.11% |

A successful poke sets `poke` to 0.36 and holds the next roll until that timer falls off. The poke reach and the launched puck speed are fixed.

The body-check branch under that roll (`0.0032 × multiplier`, away defense only, user idle at least 2.5 s, closer than 2.12 m) uses a smaller threshold and is tested second. Any roll that would hit has already taken the poke. On the current numbers that check never starts. The press that actually hits the user carrier is `defendUserCarrier`, and its chances (`0.36` idle, `0.11` otherwise, times 0.4 for a forward) do not read this slider.

## CPU / Goalie (`cpuGoalie`, 0–1.6, default 0.8)

Affects the away goalie. Multiplier 0.55 / 1.27 / 1.99.

**In-crease speed, when `integrateSkater` runs there.** Cap `5.2 × multiplier × goaliePace`. Acceleration `9 × multiplier`. Crease angle tracking itself does not use this cap. It writes `x` and `z` directly. Post and bar slides are 6.4 m/s.

| | Low 0 | Default 0.8 | High 1.6 |
| --- | --- | --- | --- |
| Loose cap | 2.15 m/s (4.8 mph) | 4.95 m/s (11.1 mph) | 7.76 m/s (17.4 mph) |
| Carrying cap | 1.43 m/s (3.2 mph) | 3.30 m/s (7.4 mph) | 5.17 m/s (11.6 mph) |
| Accel | 5.0 m/s² | 11.4 m/s² | 17.9 m/s² |

**Crease lead and reverse.** `lead = 0.04 + 0.08 × min(1, multiplier)` seconds of puck lead. `reverse = 5 + 6 × min(1, multiplier)`. Both saturate once the multiplier hits 1, which is slider 0.5. The default 0.8 is already on that ceiling (lead 0.12 s, reverse 11). From 0.5 to 1.6 the thumb does not make the away goalie square up faster or reverse harder. Below 0.5, lead goes from 0.084 s at 0 up to 0.12 s, and reverse goes from 8.3 to 11. Lateral range stays 0.70 m. A shot already in flight uses fixed tracking rates (the 2.1 and 2.6 lerps) and does not read the slider. Home tracking stays at lead 0.18, reverse 14, lateral 0.84.

**Away save miss.** After slap, one-timer, redirect, height, width, wrap, and rebound bonuses are summed, `cpuSaveMiss` multiplies by `1.55 - cpuMul("g")`. Pass-chain is added after that (`0.12 / 0.24 / 0.38` for a chain of 1 / 2 / 3+), then the chance is capped at 0.70. A first shot into the body (`|z| < 0.4` and `y < 0.75`, rebound count 0) is an automatic save and returns before the multiplier.

| | Low 0 | Default 0.8 | High 1.6 |
| --- | --- | --- | --- |
| Miss factor | 1.00 | 0.28 | −0.44 |

The factor reaches 0 between the stored ticks 1.04 and 1.12 (raw 1.111…). Above that, the product is negative. A negative product becomes a save unless the flat pass-chain addend pulls it back above 0. The 0.70 cap still applies after that add. A plain first shot with no bonuses starts at 0.08, so the default factor makes it about 2.2% before chain. The same shot at slider 0 stays 8%. Height, a wide miss, a rebound, and an odd-man one-timer add their own terms first, and this factor scales that sum.

Out-of-crease speed, the leave-the-net estimate, post slides, and equipment size (away scale 0.88 against home 1.22) do not read this slider.

## Shooting accuracy, spray, and target randomness

No slider scales shot spray, stick-to-net aim, or the random target of a CPU one-timer.

User and receiver shots take spray from `shotSpray`, then `launchShotAtNet` may add `0.045 × distance` (capped at 1.5) or shrink it on a sharp angle. Drill mode forces spray to 0. The base amounts are slap 0.016, snap 0.014, one-timer 0.012, wrist 0.01, and a backhand that grows with distance (`0.003` inside 9 m, otherwise `0.012 + 0.05 × (distance − 9)`). Sharp geometry, post and bar capture, and iron fate use the shot's angle and release point.

`shootAtNet` (the away carrier's finish, and the breakaway finish) aims at a fixed open-side offset and a fixed power formula. The only randomness is the no-goalie fallback, `(Math.random() - 0.5) × 1.35` meters. Whiff heat widens the offset and adds power. The Forwards slider changes how often that function is called, inside the window above. It does not change where the puck is aimed once the shot starts.

`cpuOneTimerShot` picks its own random height and width, then a wide miss or a miss over the bar from how many lines the pass crossed. That roll does not read a slider.

Shot power bands stay on the hold clock and skate speed: skater shots 73–105 mph, backhands 58–68, goalie clears 55–87, skater passes 55–95, goalie passes 45–85. `tapePower` takes a boolean named `cpuGoalie` for "this passer is an away goalie." That boolean is not the goalie slider.

The one accuracy-shaped number a slider touches is the away goalie's miss chance, under CPU Goalie above. It scales the chance that a puck which already reached the pads is let through. It does not move the shooter's aim.

## Independent of all six sliders

These stay put at every thumb position:

- Shot and pass power, saucer height, and the spray and aim paths above.
- User stick aim, user poke, user check, user deke, and user burst availability. Burst changes which cap is used. The slider changes the size of that cap.
- Turn rate (`TURN` 8, times 1.22 for the user and 0.55 for everyone else).
- Ice drag, puck drag, dive timing, and the 11 m/s dive-slide cap.
- Pickup reach, stick reach, and pass-lane tests.
- Where support spots, rush joins, corners, and depth matches are placed. Sliders can change the effort and the cap on the way there when a job does not overwrite `mag`.
- Breakaway deke timing, odd-man pass choice, and one-timer windows.
- `defendUserCarrier` hit and poke chances against the user.
- Home goalie save chance, home crease lead, post and bar slide speeds (7.2 home, 6.4 away), and both goalies' equipment scale.
- Faceoffs, offsides, whistles, period clock, and the Game Speed slider (`gameSpeed` 0.75–1.25, applied as `gameSpeedRate`).
- Pose selection, kits, and arena geometry.

## Call-site index

Store defaults and setters: `src/game/store.ts`. Menu: `SideSliders` in `src/game/Overlay.tsx`.

Sim, in order: `cpuMul`, `userMul`, `skateStats`, `carrierPush`, `thinkCarrier`, `thinkWithoutPuck` (home scale, away scale, `matePuckChase`), `goalieSkateCap`, `goaliePlayLoose` (ETA), `thinkGoalie` (away lead and reverse), `cpuDefend`, `cpuSaveMiss`.
