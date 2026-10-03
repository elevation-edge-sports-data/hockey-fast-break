export type Actions = {
  moveX: number;
  moveY: number;
  burst: boolean;
  aEdge: boolean;
  aTap: boolean;
  aHoldRel: boolean;
  aHeld: boolean;
  aDown: boolean;
  xEdge: boolean;
  xTap: boolean;
  xHoldRel: boolean;
  xHeld: boolean;
  xDown: boolean;
  yEdge: boolean;
  yHeld: boolean;
  yDown: boolean;
  bEdge: boolean;
  bDown: boolean;
  r3Edge: boolean;
  pausePress: boolean;
  ltEdge: boolean;
  ltDown: boolean;
  rtEdge: boolean;
  rtDown: boolean;
  lbDown: boolean;
  rbDown: boolean;
  viewPress: boolean;
  viewDown: boolean;
  aimX: number;
  aimY: number;
  zoomIn: boolean;
  zoomOut: boolean;
  padKind: "Keyboard" | "Gamepad";
  padName: string | null;
};

const keys = new Set<string>();
const injected = new Set<string>();
let touchX = 0;
let touchY = 0;
const touchFace = { a: false, x: false, y: false, b: false };

const TAP = 0.28;

type Face = {
  down: boolean;
  t0: number;
  edge: boolean;
  tap: boolean;
  holdRel: boolean;
  held: boolean;
};

function freshFace(): Face {
  return { down: false, t0: 0, edge: false, tap: false, holdRel: false, held: false };
}

const faceA = freshFace();
const faceX = freshFace();
const faceY = freshFace();
const faceB = freshFace();
const faceR3 = freshFace();
const facePause = freshFace();
const faceLt = freshFace();
const faceRt = freshFace();
const faceView = freshFace();
let touchLt = false;
let touchView = false;

const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "KeyF",
  "KeyE",
  "KeyC",
  "KeyQ",
  "KeyJ",
  "KeyK",
  "KeyI",
  "KeyG",
  "KeyR",
  "KeyP",
  "KeyN",
  "KeyM",
  "Comma",
  "Period",
  "ShiftLeft",
  "Escape",
  "Minus",
  "Equal",
  "NumpadSubtract",
  "NumpadAdd",
  "BracketLeft",
  "BracketRight",
]);

function activeKeys(): Set<string> {
  return injected.size ? injected : keys;
}

export function setInjectedKeys(codes: string[]): void {
  injected.clear();
  for (const c of codes) injected.add(c);
}

export function setTouchMove(x: number, y: number): void {
  touchX = x;
  touchY = y;
}

export function setTouchBurst(v: boolean): void {
  touchFace.b = v;
}

export function setTouchLt(v: boolean): void {
  touchLt = v;
}

export function setTouchView(v: boolean): void {
  touchView = v;
}

export function setTouchFace(btn: "a" | "x" | "y" | "b", v: boolean): void {
  touchFace[btn] = v;
}

export function queueShoot(): void {
  faceX.tap = true;
}

export function queuePass(): void {
  faceA.tap = true;
}

function track(tr: Face, pressed: boolean, now: number): void {
  tr.edge = false;
  tr.tap = false;
  tr.holdRel = false;
  if (pressed && !tr.down) {
    tr.down = true;
    tr.t0 = now;
    tr.edge = true;
    tr.held = false;
  } else if (pressed && tr.down) {
    tr.held = now - tr.t0 >= TAP;
  } else if (!pressed && tr.down) {
    const heldFor = now - tr.t0;
    if (heldFor >= TAP) tr.holdRel = true;
    else tr.tap = true;
    tr.down = false;
    tr.held = false;
  }
}

export function attachInput(target: Window | HTMLElement): () => void {
  const onDown = (e: KeyboardEvent) => {
    keys.add(e.code);
    if (GAME_CODES.has(e.code)) e.preventDefault();
  };
  const onUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };
  const clear = () => keys.clear();
  const el = target as Window;
  el.addEventListener("keydown", onDown);
  el.addEventListener("keyup", onUp);
  el.addEventListener("blur", clear);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
  return () => {
    el.removeEventListener("keydown", onDown);
    el.removeEventListener("keyup", onUp);
    el.removeEventListener("blur", clear);
  };
}

function radialDeadzone(x: number, y: number, dz = 0.1): { x: number; y: number } {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

const T9_ID = /1949.*0402|Vendor:\s*1949\s*Product:\s*0402|\bT-?9\b|Terios/i;
const T9_BTN = [0, 1, 3, 4, 6, 7, 8, 9, 10, 11, 13, 14];
const T9_HAT = [-1, 1, -0.71, 0.71, 0.43, 0.14, -0.14, -0.43];

type PadRead = {
  mx: number;
  my: number;
  ax: number;
  ay: number;
  a: boolean;
  b: boolean;
  x: boolean;
  y: boolean;
  r3: boolean;
  lt: boolean;
  rt: boolean;
  lb: boolean;
  rb: boolean;
  view: boolean;
  connected: boolean;
  name: string | null;
};

function isT9Pad(pad: Gamepad): boolean {
  return T9_ID.test(pad.id || "");
}

function t9Raw(pad: Gamepad): boolean {
  return isT9Pad(pad) && pad.mapping !== "standard";
}

function t9HatDown(pad: Gamepad): boolean {
  const hat = pad.axes[9] ?? 3.29;
  if (hat >= 2.5) return false;
  let best = 0.35;
  for (const v of T9_HAT) {
    const dist = Math.abs(hat - v);
    if (dist < best) best = dist;
  }
  return best < 0.35;
}

function padLive(pad: Gamepad): boolean {
  for (const b of pad.buttons) {
    if (b && (b.pressed || b.value > 0.2)) return true;
  }
  const raw = t9Raw(pad);
  for (let i = 0; i < pad.axes.length; i++) {
    if (raw && i === 9) continue;
    if (Math.abs(pad.axes[i] ?? 0) > 0.2) return true;
  }
  return raw && t9HatDown(pad);
}

function t9Button(pad: Gamepad, standardIndex: number): boolean {
  const idx = T9_BTN[standardIndex];
  if (idx === undefined) return false;
  const b = pad.buttons[idx];
  return !!b && (b.pressed || b.value > 0.4);
}

function readStandardPad(pad: Gamepad): PadRead {
  const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const aim = radialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0);
  return {
    mx: stick.x,
    my: -stick.y,
    ax: aim.x,
    ay: -aim.y,
    a: Boolean(pad.buttons[0]?.pressed),
    b: Boolean(pad.buttons[1]?.pressed),
    x: Boolean(pad.buttons[2]?.pressed),
    y: Boolean(pad.buttons[3]?.pressed),
    r3: Boolean(pad.buttons[11]?.pressed),
    lt: Boolean(pad.buttons[6]?.pressed) || (pad.buttons[6]?.value ?? 0) > 0.42,
    rt: Boolean(pad.buttons[7]?.pressed) || (pad.buttons[7]?.value ?? 0) > 0.42,
    lb: Boolean(pad.buttons[4]?.pressed),
    rb: Boolean(pad.buttons[5]?.pressed),
    view: Boolean(pad.buttons[8]?.pressed),
    connected: true,
    name: pad.id,
  };
}

function readT9Pad(pad: Gamepad): PadRead {
  const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const aim = radialDeadzone(pad.axes[2] ?? 0, pad.axes[5] ?? 0);
  const lt = pad.buttons[8];
  const rt = pad.buttons[9];
  return {
    mx: stick.x,
    my: -stick.y,
    ax: aim.x,
    ay: -aim.y,
    a: t9Button(pad, 0),
    b: t9Button(pad, 1),
    x: t9Button(pad, 2),
    y: t9Button(pad, 3),
    r3: t9Button(pad, 11),
    lt: !!lt && (lt.pressed || lt.value > 0.42),
    rt: !!rt && (rt.pressed || rt.value > 0.42),
    lb: t9Button(pad, 4),
    rb: t9Button(pad, 5),
    view: t9Button(pad, 8),
    connected: true,
    name: pad.id,
  };
}

function readPad(): PadRead {
  const pads = navigator.getGamepads?.() ?? [];
  let fallback: Gamepad | null = null;
  let live: Gamepad | null = null;
  for (const pad of pads) {
    if (!pad || pad.connected === false) continue;
    if (!isT9Pad(pad) && pad.mapping !== "standard") continue;
    if (!fallback) fallback = pad;
    if (padLive(pad)) {
      live = pad;
      break;
    }
  }
  const pad = live ?? fallback;
  if (!pad) {
    return {
      mx: 0,
      my: 0,
      ax: 0,
      ay: 0,
      a: false,
      b: false,
      x: false,
      y: false,
      r3: false,
      lt: false,
      rt: false,
      lb: false,
      rb: false,
      view: false,
      connected: false,
      name: null,
    };
  }
  return t9Raw(pad) ? readT9Pad(pad) : readStandardPad(pad);
}

export function readActions(): Actions {
  const k = activeKeys();
  let mx = 0;
  let my = 0;
  if (k.has("KeyW") || k.has("ArrowUp")) my += 1;
  if (k.has("KeyS") || k.has("ArrowDown")) my -= 1;
  if (k.has("KeyD") || k.has("ArrowRight")) mx += 1;
  if (k.has("KeyA") || k.has("ArrowLeft")) mx -= 1;
  mx += touchX;
  my += touchY;

  const pad = readPad();
  mx += pad.mx;
  my += pad.my;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }

  const now = performance.now() / 1000;
  const aDown = k.has("KeyE") || k.has("KeyJ") || pad.a || touchFace.a;
  const xDown = k.has("KeyF") || k.has("KeyC") || k.has("KeyK") || pad.x || touchFace.x;
  const yDown = k.has("KeyQ") || k.has("KeyI") || pad.y || touchFace.y;
  const bDown = k.has("Space") || pad.b || touchFace.b;
  const r3Down = pad.r3;
  const pauseDown = k.has("KeyP") || k.has("Escape") || pad.r3;
  const ltDown = k.has("KeyG") || pad.lt || touchLt;
  const rtDown = k.has("ShiftLeft") || pad.rt;
  const lbDown = k.has("Comma") || k.has("KeyN") || pad.lb;
  const rbDown = k.has("Period") || k.has("KeyM") || pad.rb;
  const viewDown = k.has("KeyR") || pad.view || touchView;

  track(faceA, aDown, now);
  track(faceX, xDown, now);
  track(faceY, yDown, now);
  track(faceB, bDown, now);
  track(faceR3, r3Down, now);
  track(facePause, pauseDown, now);
  track(faceLt, ltDown, now);
  track(faceRt, rtDown, now);
  track(faceView, viewDown, now);

  const zoomIn =
    faceX.down || k.has("Equal") || k.has("NumpadAdd") || k.has("BracketRight");
  const zoomOut =
    faceB.down || k.has("Minus") || k.has("NumpadSubtract") || k.has("BracketLeft");

  return {
    moveX: mx,
    moveY: my,
    burst: bDown,
    aEdge: faceA.edge,
    aTap: faceA.tap,
    aHoldRel: faceA.holdRel,
    aHeld: faceA.held,
    aDown: faceA.down,
    xEdge: faceX.edge,
    xTap: faceX.tap,
    xHoldRel: faceX.holdRel,
    xHeld: faceX.held,
    xDown: faceX.down,
    yEdge: faceY.edge,
    yHeld: faceY.held,
    yDown: faceY.down,
    bEdge: faceB.edge,
    bDown: faceB.down,
    r3Edge: faceR3.edge,
    pausePress: facePause.edge,
    ltEdge: faceLt.edge,
    ltDown: faceLt.down,
    rtEdge: faceRt.edge,
    rtDown: faceRt.down,
    lbDown,
    rbDown,
    viewPress: faceView.edge,
    viewDown,
    aimX: pad.ax,
    aimY: pad.ay,
    zoomIn,
    zoomOut,
    padKind: pad.connected ? "Gamepad" : "Keyboard",
    padName: pad.name,
  };
}
