import * as THREE from "three";
import {
  BLUE_X,
  CORNER_R,
  CREASE_FILL,
  CREASE_R,
  DOT_R,
  FACEOFF_EZ_X,
  FACEOFF_MARK_R,
  FACEOFF_R,
  FACEOFF_SPOT_Z,
  FT,
  BLUE_LINE_W,
  CENTER_LINE_W,
  GOAL_LINE_W,
  GOAL_LINE_X,
  GOAL_W,
  HASH_MARK_INSIDE,
  HASH_MARK_L,
  L_ARM,
  L_GAP,
  L_INSET,
  L_STEM,
  LINE_BLUE,
  LINE_RED,
  RINK_L,
  RINK_W,
} from "./rink";
import { JUMBO_HH, JUMBO_HL, JUMBO_HW } from "./crowd";
import centerIceUrl from "../../logo-center-ice.png";
import scoreboardLogoUrl from "../../logo-scoreboard.png";

const scoreboardLogo = new Image();
scoreboardLogo.src = scoreboardLogoUrl;
const centerIceLogo = new Image();
centerIceLogo.src = centerIceUrl;

function hash2(ix: number, iy: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0);
  const b = hash2(x0 + 1, y0);
  const c = hash2(x0, y0 + 1);
  const d = hash2(x0 + 1, y0 + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x: number, y: number): number {
  return (
    valueNoise(x, y) * 0.55 +
    valueNoise(x * 2.1, y * 2.1) * 0.28 +
    valueNoise(x * 4.3, y * 4.3) * 0.17
  );
}

export function createIceCanvases(w = 2048, h = 872, blueLines = true, nzDots = true): {
  albedo: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
} {
  const albedo = document.createElement("canvas");
  albedo.width = w;
  albedo.height = h;
  const roughness = document.createElement("canvas");
  roughness.width = w;
  roughness.height = h;
  const ctx = albedo.getContext("2d")!;
  const rctx = roughness.getContext("2d")!;

  const sx = w / RINK_L;
  const sz = h / RINK_W;
  const ox = RINK_L / 2;
  const oz = RINK_W / 2;

  const wx = (x: number) => (x + ox) * sx;
  const wz = (z: number) => (z + oz) * sz;
  const mx = (m: number) => m * sx;
  const mz = (m: number) => m * sz;

  const clipRink = (c: CanvasRenderingContext2D) => {
    const r = CORNER_R;
    c.beginPath();
    c.moveTo(wx(-RINK_L / 2 + r), wz(-RINK_W / 2));
    c.lineTo(wx(RINK_L / 2 - r), wz(-RINK_W / 2));
    c.arcTo(wx(RINK_L / 2), wz(-RINK_W / 2), wx(RINK_L / 2), wz(-RINK_W / 2 + r), mx(r));
    c.lineTo(wx(RINK_L / 2), wz(RINK_W / 2 - r));
    c.arcTo(wx(RINK_L / 2), wz(RINK_W / 2), wx(RINK_L / 2 - r), wz(RINK_W / 2), mx(r));
    c.lineTo(wx(-RINK_L / 2 + r), wz(RINK_W / 2));
    c.arcTo(wx(-RINK_L / 2), wz(RINK_W / 2), wx(-RINK_L / 2), wz(RINK_W / 2 - r), mx(r));
    c.lineTo(wx(-RINK_L / 2), wz(-RINK_W / 2 + r));
    c.arcTo(wx(-RINK_L / 2), wz(-RINK_W / 2), wx(-RINK_L / 2 + r), wz(-RINK_W / 2), mx(r));
    c.closePath();
    c.clip();
  };

  ctx.fillStyle = "#e4edf4";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  clipRink(ctx);

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x * 0.018, y * 0.028);
      const n2 = fbm(x * 0.07 + 12, y * 0.09 + 4);
      const zamboni = Math.sin((x / w) * Math.PI * 18) * 0.01;
      const base = 0.97 + n * 0.035 + zamboni;
      const i = (y * w + x) * 4;
      data[i] = Math.round(248 * base + n2 * 4);
      data[i + 1] = Math.round(250 * base + n2 * 3);
      data[i + 2] = Math.round(252 * base + 2);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = "rgba(170, 196, 214, 0.28)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const len = 18 + Math.random() * 90;
    const ang = (Math.random() - 0.5) * 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }

  const thinW = mx(0.055);

  const strokeV = (x: number, color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(wx(x), wz(-RINK_W / 2));
    ctx.lineTo(wx(x), wz(RINK_W / 2));
    ctx.stroke();
  };

  const fillCrease = (side: 1 | -1) => {
    const gx = GOAL_LINE_X * side;
    const dir = -side;
    ctx.fillStyle = CREASE_FILL;
    ctx.strokeStyle = LINE_RED;
    ctx.lineWidth = Math.max(2.2, thinW * 1.6);
    ctx.beginPath();
    const hw = Math.max(GOAL_W / 2, CREASE_R * 0.66);
    ctx.moveTo(wx(gx), wz(-hw));
    const steps = 28;
    for (let i = 0; i <= steps; i++) {
      const z = -hw + (2 * hw * i) / steps;
      const xOff = Math.sqrt(Math.max(0, CREASE_R * CREASE_R - z * z));
      ctx.lineTo(wx(gx + dir * xOff), wz(z));
    }
    ctx.lineTo(wx(gx), wz(hw));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(wx(gx), wz(-hw));
    ctx.lineTo(wx(gx + dir * CREASE_R * 0.12), wz(-hw));
    ctx.moveTo(wx(gx), wz(hw));
    ctx.lineTo(wx(gx + dir * CREASE_R * 0.12), wz(hw));
    ctx.stroke();
    ctx.strokeStyle = LINE_RED;
    ctx.lineWidth = thinW;
    const trapBack = (RINK_L / 2) * side;
    const trapGoal = 8.5 * FT;
    const trapEnd = 14 * FT;
    ctx.beginPath();
    ctx.moveTo(wx(gx), wz(-trapGoal));
    ctx.lineTo(wx(trapBack), wz(-trapEnd));
    ctx.moveTo(wx(gx), wz(trapGoal));
    ctx.lineTo(wx(trapBack), wz(trapEnd));
    ctx.stroke();
  };

  const markW = Math.max(2, mx((2 / 12) * FT));
  const strokeSeg = (x0: number, z0: number, x1: number, z1: number) => {
    ctx.beginPath();
    ctx.moveTo(wx(x0), wz(z0));
    ctx.lineTo(wx(x1), wz(z1));
    ctx.stroke();
  };
  const paintStripedDot = (x: number, z: number) => {
    const r = DOT_R;
    const cap = (3 / 12) * FT;
    ctx.fillStyle = "#f7f7f5";
    ctx.beginPath();
    ctx.ellipse(wx(x), wz(z), mx(r), mz(r), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(wx(x), wz(z), mx(r), mz(r), 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = LINE_RED;
    ctx.fillRect(wx(x - r + cap), wz(z - r), mx(2 * r - 2 * cap), mz(2 * r));
    ctx.restore();
    ctx.strokeStyle = LINE_RED;
    ctx.lineWidth = Math.max(1.6, mx((2 / 12) * FT));
    ctx.beginPath();
    ctx.ellipse(wx(x), wz(z), mx(r), mz(r), 0, 0, Math.PI * 2);
    ctx.stroke();
  };
  const faceoff = (x: number, z: number, withCircle: boolean) => {
    if (withCircle) {
      ctx.strokeStyle = LINE_RED;
      ctx.lineWidth = thinW;
      ctx.beginPath();
      ctx.ellipse(wx(x), wz(z), mx(FACEOFF_R), mz(FACEOFF_R), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = markW;
      ctx.lineCap = "butt";
      const inner = HASH_MARK_INSIDE / 2;
      for (const szn of [-1, 1]) {
        for (const sxn of [-1, 1]) {
          const xx = x + sxn * inner;
          const z0 = z + szn * FACEOFF_R;
          strokeSeg(xx, z0, xx, z + szn * (FACEOFF_R + HASH_MARK_L));
        }
      }
      const halfGap = L_GAP / 2;
      for (const sxn of [-1, 1]) {
        for (const szn of [-1, 1]) {
          const xInner = x + sxn * L_INSET;
          const zStem = z + szn * halfGap;
          strokeSeg(xInner, zStem, x + sxn * (L_INSET + L_STEM), zStem);
          strokeSeg(xInner, zStem, xInner, z + szn * (halfGap + L_ARM));
        }
      }
    }
    paintStripedDot(x, z);
  };

  fillCrease(1);
  fillCrease(-1);
  ctx.fillStyle = "rgba(200, 16, 46, 0.07)";
  ctx.beginPath();
  ctx.ellipse(wx(0), wz(0), mx(FACEOFF_MARK_R), mz(FACEOFF_MARK_R), 0, 0, Math.PI * 2);
  ctx.fill();
  const crestZ = Math.sqrt(Math.max(0, FACEOFF_MARK_R * FACEOFF_MARK_R - (CENTER_LINE_W / 2) ** 2));
  ctx.strokeStyle = LINE_RED;
  ctx.lineWidth = mx(CENTER_LINE_W);
  ctx.beginPath();
  ctx.moveTo(wx(0), wz(-RINK_W / 2));
  ctx.lineTo(wx(0), wz(-crestZ));
  ctx.moveTo(wx(0), wz(crestZ));
  ctx.lineTo(wx(0), wz(RINK_W / 2));
  ctx.stroke();
  if (blueLines) {
    strokeV(BLUE_X, LINE_BLUE, mx(BLUE_LINE_W));
    strokeV(-BLUE_X, LINE_BLUE, mx(BLUE_LINE_W));
  }
  strokeV(GOAL_LINE_X, LINE_RED, mx(GOAL_LINE_W));
  strokeV(-GOAL_LINE_X, LINE_RED, mx(GOAL_LINE_W));
  ctx.strokeStyle = LINE_RED;
  ctx.lineWidth = thinW;
  ctx.beginPath();
  ctx.ellipse(wx(0), wz(0), mx(FACEOFF_MARK_R), mz(FACEOFF_MARK_R), 0, 0, Math.PI * 2);
  ctx.stroke();

  const ezX = GOAL_LINE_X - 20 * FT;
  const nzX = BLUE_X - 5 * FT;
  const spotZ = 22 * FT;
  faceoff(ezX, spotZ, true);
  faceoff(ezX, -spotZ, true);
  faceoff(-ezX, spotZ, true);
  faceoff(-ezX, -spotZ, true);
  if (nzDots) {
    faceoff(nzX, spotZ, false);
    faceoff(nzX, -spotZ, false);
    faceoff(-nzX, spotZ, false);
    faceoff(-nzX, -spotZ, false);
  }

  ctx.restore();

  rctx.fillStyle = "#242424";
  rctx.fillRect(0, 0, w, h);
  rctx.save();
  clipRink(rctx);
  rctx.fillStyle = "#1a1a1a";
  rctx.fillRect(0, 0, w, h);
  rctx.restore();

  return { albedo, roughness };
}

export function createIceTextures(blueLines = true, nzDots = true): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const { albedo, roughness } = createIceCanvases(2048, 872, blueLines, nzDots);
  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const roughnessMap = new THREE.CanvasTexture(roughness);
  roughnessMap.anisotropy = 4;
  return { map, roughnessMap };
}

export function createNetTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = "rgba(196, 206, 216, 0.16)";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(236, 242, 246, 0.92)";
  g.lineWidth = 2.1;
  const cells = 14;
  const step = 256 / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i * step);
    g.lineTo(256, i * step);
    g.stroke();
  }
  g.strokeStyle = "rgba(168, 180, 192, 0.55)";
  g.lineWidth = 0.9;
  for (let i = 0; i < cells; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo((i + 1) * step, 256);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 1.5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createAdTexture(pri: string, sec: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0d1218";
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = pri;
  g.fillRect(0, 0, 1024, 8);
  g.fillRect(0, 120, 1024, 8);
  g.font = "700 52px 'Barlow Condensed', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const labels = ["FAST BREAK", "ELEVATION EDGE", "v0", "FAST BREAK"];
  for (let i = 0; i < 4; i++) {
    g.fillStyle = i % 2 === 0 ? "#e8ece6" : pri;
    g.fillText(labels[i] ?? "", 128 + i * 256, 64);
  }
  void sec;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function createJumboTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#070b12";
  g.fillRect(0, 0, 1024, 512);
  const grd = g.createLinearGradient(0, 0, 1024, 512);
  grd.addColorStop(0, "rgba(126, 184, 212, 0.18)");
  grd.addColorStop(1, "rgba(200, 16, 46, 0.12)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = "#7eb8d4";
  g.fillRect(0, 0, 1024, 10);
  g.fillRect(0, 502, 1024, 10);
  g.fillStyle = "#e8ece6";
  g.font = "700 96px 'Barlow Condensed', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("FAST BREAK", 512, 150);
  g.fillStyle = "#8b97a4";
  g.font = "600 36px 'Barlow Condensed', sans-serif";
  g.fillText("ELEVATION EDGE  ·  v0", 512, 230);
  g.fillStyle = "#e8ece6";
  g.font = "700 128px 'Barlow Condensed', sans-serif";
  g.fillText("0    0", 512, 360);
  g.fillStyle = "#7eb8d4";
  g.font = "600 32px 'IBM Plex Sans', sans-serif";
  g.fillText("1ST  ·  20:00", 512, 450);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createFaceoffDotTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  const cap = s * (3 / 24);
  g.clearRect(0, 0, s, s);
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2);
  g.fillStyle = "#f7f7f5";
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = LINE_RED;
  g.fillRect(cap, 0, s - 2 * cap, s);
  g.restore();
  g.beginPath();
  g.arc(s / 2, s / 2, s / 2 - 5, 0, Math.PI * 2);
  g.strokeStyle = LINE_RED;
  g.lineWidth = 8;
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createNumberTexture(
  num: number,
  fill: string,
  outline: string,
): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  g.font = "700 170px 'Barlow Condensed', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 14;
  g.strokeStyle = outline;
  g.fillStyle = fill;
  const t = String(num);
  g.strokeText(t, 128, 140);
  g.fillText(t, 128, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function createArenaEnv(look: "light" | "dark" = "light"): THREE.CubeTexture {
  const size = 96;
  const dark = look === "dark";
  const faces = ["px", "nx", "py", "ny", "pz", "nz"].map((face) => {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d")!;
    if (face === "py") {
      g.fillStyle = dark ? "#0a0e14" : "#10161e";
      g.fillRect(0, 0, size, size);
      g.fillStyle = dark ? "#1c2430" : "#2a3440";
      for (let i = 0; i < 18; i++) {
        g.fillRect(6 + (i % 6) * 15, 8 + Math.floor(i / 6) * 28, 8, 4);
      }
    } else if (face === "ny") {
      const grd = g.createRadialGradient(48, 48, 4, 48, 48, 60);
      if (dark) {
        grd.addColorStop(0, "#3a4552");
        grd.addColorStop(1, "#1a222c");
      } else {
        grd.addColorStop(0, "#d5e6f4");
        grd.addColorStop(1, "#6d8296");
      }
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
    } else {
      const grd = g.createLinearGradient(0, 0, 0, size);
      if (dark) {
        grd.addColorStop(0, "#121820");
        grd.addColorStop(0.45, "#1a222c");
        grd.addColorStop(1, "#0c1016");
      } else {
        grd.addColorStop(0, "#1a2430");
        grd.addColorStop(0.45, "#243040");
        grd.addColorStop(1, "#121820");
      }
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      g.fillStyle = dark ? "rgba(180, 90, 70, 0.18)" : "rgba(180, 90, 70, 0.22)";
      for (let row = 0; row < 5; row++) {
        g.fillRect(0, 28 + row * 10, size, 6);
      }
    }
    return c;
  });
  const tex = new THREE.CubeTexture(faces);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = Number.parseInt(a.replace("#", ""), 16);
  const pb = Number.parseInt(b.replace("#", ""), 16);
  const ra = (pa >> 16) & 255;
  const ga = (pa >> 8) & 255;
  const ba = pa & 255;
  const rb = (pb >> 16) & 255;
  const gb = (pb >> 8) & 255;
  const bb = pb & 255;
  const r = Math.round(ra + (rb - ra) * t);
  const g = Math.round(ga + (gb - ga) * t);
  const bl = Math.round(ba + (bb - ba) * t);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

export type RibbonPaint = {
  homeHelmet: string;
  homeJersey: string;
  homePants: string;
  homeStripe: string;
  awayHelmet: string;
  awayJersey: string;
  awayPants: string;
  awayStripe: string;
  fill: string;
  homeScore: number;
  awayScore: number;
  ticker: number;
  goal: boolean;
  clock?: string | null;
};

function paintKitChip(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  helmet: string,
  jersey: string,
  pants: string,
): void {
  const band = h / 3;
  g.fillStyle = helmet;
  g.fillRect(x, y, w, band);
  g.fillStyle = jersey;
  g.fillRect(x, y + band, w, band);
  g.fillStyle = pants;
  g.fillRect(x, y + band * 2, w, h - band * 2);
}

export function createRibbonCanvas(): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  paint: (opts: RibbonPaint) => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;

  const paint = (opts: RibbonPaint) => {
    const g = canvas.getContext("2d");
    if (!g) return;
    const w = canvas.width;
    const h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = opts.fill;
    g.fillRect(0, 0, w, h);
    g.fillStyle = mixHex(opts.fill, "#000000", 0.3);
    g.fillRect(0, 0, w, 7);
    g.fillRect(0, h - 7, w, 7);
    g.fillStyle = mixHex(opts.fill, "#ffffff", 0.08);
    g.fillRect(0, 10, w, 3);
    g.fillRect(0, h - 13, w, 3);

    g.fillStyle = "rgba(255,255,255,0.78)";
    g.font = "700 34px 'Barlow Condensed', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (opts.goal) {
      g.fillText("GOAL!", w * 0.28, h / 2);
      g.fillText("GOAL!", w * 0.72, h / 2);
    } else {
      g.fillText("FAST BREAK", w * 0.25, h / 2);
      g.fillText("ELEVATION EDGE", w * 0.75, h / 2);
    }

    g.fillStyle = opts.homeJersey;
    g.fillRect(0, 18, 10, h - 36);
    g.fillStyle = opts.awayJersey;
    g.fillRect(w - 10, 18, 10, h - 36);
    texture.needsUpdate = true;
  };

  return { canvas, texture, paint };
}

export function createScoreboardCanvas(): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  paint: (opts: RibbonPaint) => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const paint = (opts: RibbonPaint) => {
    const g = canvas.getContext("2d");
    if (!g) return;
    const w = canvas.width;
    const h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = opts.fill;
    g.fillRect(0, 0, w, h);
    g.fillStyle = mixHex(opts.fill, "#000000", 0.28);
    g.fillRect(0, 0, w, 6);
    g.fillRect(0, h - 6, w, 6);
    g.fillStyle = "#0c1014";
    g.fillRect(16, 16, 92, 96);
    paintKitChip(g, 20, 20, 40, 88, opts.homeHelmet, opts.homeJersey, opts.homePants);
    paintKitChip(g, 64, 20, 40, 88, opts.awayHelmet, opts.awayJersey, opts.awayPants);
    g.strokeStyle = "rgba(255,255,255,0.78)";
    g.lineWidth = 1.5;
    g.strokeRect(20, 20, 84, 88);

    g.fillStyle = "rgba(0,0,0,0.38)";
    g.fillRect(124, 16, w - 140, 96);
    g.fillStyle = "rgba(255,255,255,0.72)";
    g.font = "600 18px 'IBM Plex Sans', sans-serif";
    g.textAlign = "left";
    g.textBaseline = "middle";
    g.fillText("YOU", 140, 38);
    g.fillText("CPU", 250, 38);
    if (opts.clock) g.fillText("TIME", 360, 38);
    g.fillStyle = "#ffffff";
    g.font = "700 44px 'Barlow Condensed', sans-serif";
    g.fillText(String(opts.homeScore), 140, 82);
    g.fillText(String(opts.awayScore), 250, 82);
    if (opts.clock) g.fillText(opts.clock, 360, 82);
    texture.needsUpdate = true;
  };

  return { canvas, texture, paint };
}

export type JumboPaint = RibbonPaint & {
  puckX: number;
  puckZ: number;
  players: { x: number; z: number; home: boolean }[];
};

/** Overhead token: head, striped torso, legs, and a short stick. Centered on the ice point. */
function paintJumboSkater(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  helmet: string,
  jersey: string,
  pants: string,
  stripe: string,
): void {
  const torsoW = 6.2;
  const torsoH = 5;
  const legW = 1.7;
  const legH = 4.2;
  const headR = 2.15;
  const top = y - 6.2;
  const torsoY = top + headR * 2 - 0.4;
  const hip = torsoY + torsoH - 0.5;
  g.fillStyle = helmet;
  g.beginPath();
  g.arc(x, top + headR, headR, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = jersey;
  g.fillRect(x - torsoW / 2, torsoY, torsoW, torsoH);
  g.fillStyle = stripe;
  g.fillRect(x - torsoW / 2, torsoY + 1.35, torsoW, 1.35);
  g.fillStyle = pants;
  g.fillRect(x - 2.8, hip, legW, legH);
  g.fillRect(x + 1.1, hip, legW, legH);
  g.strokeStyle = "#1a120c";
  g.lineWidth = 1.15;
  g.beginPath();
  g.moveTo(x + torsoW / 2 - 0.5, torsoY + torsoH * 0.55);
  g.lineTo(x + torsoW / 2 + 3.1, hip + legH - 0.3);
  g.stroke();
}

function traceRoundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rw: number,
  rh: number,
  rad: number,
): void {
  const r = Math.max(0, Math.min(rad, rw / 2, rh / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + rw - r, y);
  g.quadraticCurveTo(x + rw, y, x + rw, y + r);
  g.lineTo(x + rw, y + rh - r);
  g.quadraticCurveTo(x + rw, y + rh, x + rw - r, y + rh);
  g.lineTo(x + r, y + rh);
  g.quadraticCurveTo(x, y + rh, x, y + rh - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

function paintJumboScore(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  bw: number,
  bh: number,
  opts: JumboPaint,
  stacked: boolean,
): void {
  g.fillStyle = "#1a2228";
  g.fillRect(x, y, bw, bh);
  g.strokeStyle = opts.fill;
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = opts.fill;
  g.font = `700 ${Math.max(11, Math.round(bh * (stacked ? 0.1 : 0.14)))}px 'Barlow Condensed', sans-serif`;
  g.fillText("HOCKEY FAST BREAK", x + bw / 2, y + bh * (stacked ? 0.1 : 0.18));
  const small = `600 ${Math.max(9, Math.round(bh * (stacked ? 0.08 : 0.1)))}px 'IBM Plex Sans', sans-serif`;
  const big = `700 ${Math.max(14, Math.round(bh * (stacked ? 0.16 : 0.26)))}px 'Barlow Condensed', sans-serif`;
  const clock = opts.clock ?? "—";
  const score = `${opts.homeScore}  –  ${opts.awayScore}`;
  if (stacked) {
    g.fillStyle = "#8b9688";
    g.font = small;
    g.fillText("GAME TIME", x + bw / 2, y + bh * 0.28);
    g.fillStyle = "#e8ece6";
    g.font = big;
    g.fillText(clock, x + bw / 2, y + bh * 0.46);
    g.fillStyle = "#8b9688";
    g.font = small;
    g.fillText("SCORE", x + bw / 2, y + bh * 0.66);
    g.fillStyle = "#e8ece6";
    g.font = big;
    g.fillText(score, x + bw / 2, y + bh * 0.84);
    return;
  }
  g.fillStyle = "#8b9688";
  g.font = small;
  g.fillText("GAME TIME", x + bw * 0.28, y + bh * 0.42);
  g.fillText("SCORE", x + bw * 0.72, y + bh * 0.42);
  g.fillStyle = "#e8ece6";
  g.font = big;
  g.fillText(clock, x + bw * 0.28, y + bh * 0.72);
  g.fillText(score, x + bw * 0.72, y + bh * 0.72);
}

function paintJumboLogoAd(g: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number): void {
  g.fillStyle = "#fef8ec";
  g.fillRect(x, y, bw, bh);
  if (scoreboardLogo.complete && scoreboardLogo.naturalWidth > 0) {
    const ir = scoreboardLogo.naturalWidth / scoreboardLogo.naturalHeight;
    const rr = bw / bh;
    const dw = ir > rr ? bh * ir : bw;
    const dh = ir > rr ? bh : bw / ir;
    g.save();
    g.beginPath();
    g.rect(x, y, bw, bh);
    g.clip();
    g.drawImage(scoreboardLogo, x + (bw - dw) / 2, y + (bh - dh) / 2, dw, dh);
    g.restore();
  }
  g.strokeStyle = "#1b3a6b";
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
}

function paintJumboWaterAd(g: CanvasRenderingContext2D, x: number, y: number, bw: number, bh: number): void {
  g.fillStyle = "#d7eef7";
  g.fillRect(x, y, bw, bh);
  g.strokeStyle = "#6aa3b8";
  g.lineWidth = 2;
  g.strokeRect(x + 1, y + 1, bw - 2, bh - 2);
  g.fillStyle = "#14556c";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `italic ${Math.max(14, Math.round(bh * 0.22))}px 'Segoe Script', 'Brush Script MT', cursive`;
  g.fillText("Drink More", x + bw / 2, y + bh * 0.4);
  g.fillText("Water!", x + bw / 2, y + bh * 0.68);
}

/**
 * `wide` is a side-line face: rink length left-right, video along the bottom, score and ads across the top.
 * `tall` is an end-line face: rink length vertical, video along the left, score and ads stacked on the right.
 * `flip` is the opposite face of that pair. Only the vertical rink axis reverses, so the near end stays
 * at the bottom without mirroring left and right.
 */
export function createJumboFace(kind: "wide" | "tall" = "wide", flip = false): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  paint: (opts: JumboPaint) => void;
} {
  const canvas = document.createElement("canvas");
  const tall = kind === "tall";
  if (tall) {
    canvas.width = 900;
    canvas.height = Math.max(1, Math.round(canvas.width * (JUMBO_HH / JUMBO_HW)));
  } else {
    canvas.width = 1280;
    canvas.height = Math.max(1, Math.round(canvas.width * (JUMBO_HH / JUMBO_HL)));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const axis = flip ? -1 : 1;
  const paint = (opts: JumboPaint) => {
    const g = canvas.getContext("2d");
    if (!g) return;
    const w = canvas.width;
    const h = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = "#0d1216";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = opts.fill;
    g.lineWidth = 8;
    g.strokeRect(4, 4, w - 8, h - 8);

    const pad = Math.max(8, Math.round(Math.min(w, h) * 0.02));
    let vidX: number;
    let vidY: number;
    let vidW: number;
    let vidH: number;
    if (tall) {
      const rightW = Math.round(w * 0.34);
      vidX = pad;
      vidY = pad;
      vidW = w - rightW - pad * 3;
      vidH = h - pad * 2;
      const rx = vidX + vidW + pad;
      const gap = pad;
      const slot = (vidH - gap * 2) / 3;
      paintJumboScore(g, rx, vidY, rightW, slot, opts, true);
      paintJumboLogoAd(g, rx, vidY + slot + gap, rightW, slot);
      paintJumboWaterAd(g, rx, vidY + (slot + gap) * 2, rightW, slot);
    } else {
      const topH = Math.round(h * 0.32);
      const scoreW = Math.round(w * 0.4);
      const adW = Math.round((w - pad * 4 - scoreW) / 2);
      paintJumboScore(g, pad, pad, scoreW, topH, opts, false);
      paintJumboLogoAd(g, pad * 2 + scoreW, pad, adW, topH);
      paintJumboWaterAd(g, pad * 3 + scoreW + adW, pad, adW, topH);
      vidX = pad;
      vidY = pad * 2 + topH;
      vidW = w - pad * 2;
      vidH = h - vidY - pad;
    }
    g.fillStyle = "#05080a";
    g.fillRect(vidX, vidY, vidW, vidH);
    g.strokeStyle = "#2a3d32";
    g.lineWidth = 2;
    g.strokeRect(vidX + 1, vidY + 1, vidW - 2, vidH - 2);
    const inset = 8;
    const fitW = vidW - inset * 2;
    const fitH = vidH - inset * 2;
    const margin = 3.4;
    const viewL = RINK_L + margin * 2;
    const viewW = RINK_W + margin * 2;
    const viewAspect = tall ? viewW / viewL : viewL / viewW;
    let viewPixW = fitW;
    let viewPixH = viewPixW / viewAspect;
    if (viewPixH > fitH) {
      viewPixH = fitH;
      viewPixW = viewPixH * viewAspect;
    }
    const viewX = vidX + (vidW - viewPixW) / 2;
    const viewY = vidY + (vidH - viewPixH) / 2;
    const iceW = tall ? viewPixW * (RINK_W / viewW) : viewPixW * (RINK_L / viewL);
    const iceH = tall ? viewPixH * (RINK_L / viewL) : viewPixH * (RINK_W / viewW);
    const iceX = viewX + (viewPixW - iceW) / 2;
    const iceY = viewY + (viewPixH - iceH) / 2;
    const pxPerM = viewPixW / (tall ? viewW : viewL);
    const corner = CORNER_R * pxPerM;
    // Wide: length left-right. Flip only moves the near side boards to the bottom.
    // Tall: length vertical. Flip only moves the near goal line to the bottom.
    const toIce = tall
      ? (x: number, z: number) => ({
          x: viewX + viewPixW / 2 + (-z / (viewW / 2)) * (viewPixW / 2),
          y: viewY + viewPixH / 2 + axis * (x / (viewL / 2)) * (viewPixH / 2),
        })
      : (x: number, z: number) => ({
          x: viewX + viewPixW / 2 + (x / (viewL / 2)) * (viewPixW / 2),
          y: viewY + viewPixH / 2 + axis * (z / (viewW / 2)) * (viewPixH / 2),
        });
    const fillWorldRect = (x0: number, z0: number, x1: number, z1: number, color: string) => {
      const a = toIce(x0, z0);
      const b = toIce(x1, z0);
      const c = toIce(x1, z1);
      const d = toIce(x0, z1);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(c.x, c.y);
      g.lineTo(d.x, d.y);
      g.closePath();
      g.fillStyle = color;
      g.fill();
    };
    const crowdStep = 1.45;
    for (let ring = 0; ring < 3; ring++) {
      const out = 1.05 + ring * 0.78;
      for (let x = -RINK_L / 2 - out; x <= RINK_L / 2 + out; x += crowdStep) {
        for (const side of [-1, 1]) {
          const z = side * (RINK_W / 2 + out);
          const away = z < 0 && x > -12 && x < -0.5;
          g.fillStyle = away ? "#9a1c2f" : "#1a3f72";
          const p = toIce(x, z);
          g.fillRect(p.x - 1.3, p.y - 1.3, 2.6, 2.6);
        }
      }
      for (let z = -RINK_W / 2 + crowdStep; z <= RINK_W / 2 - crowdStep; z += crowdStep) {
        for (const side of [-1, 1]) {
          const x = side * (RINK_L / 2 + out);
          g.fillStyle = "#1a3f72";
          const p = toIce(x, z);
          g.fillRect(p.x - 1.3, p.y - 1.3, 2.6, 2.6);
        }
      }
    }
    const zBench = -RINK_W / 2 - 1.58;
    fillWorldRect(0.52, zBench - 0.55, 9.8, zBench + 0.35, "#d8dde3");
    fillWorldRect(-9.8, zBench - 0.55, -0.52, zBench + 0.35, "#d8dde3");
    const zBox = RINK_W / 2 + 1.55;
    const boxW = 2.6;
    fillWorldRect(-(boxW / 2 + 0.05) - boxW / 2, zBox - 0.2, -(boxW / 2 + 0.05) + boxW / 2, zBox + 1.05, "#c8d8e8");
    fillWorldRect(boxW / 2 + 0.05 - boxW / 2, zBox - 0.2, boxW / 2 + 0.05 + boxW / 2, zBox + 1.05, "#c8d8e8");
    g.fillStyle = "#d7e8f4";
    traceRoundRect(g, iceX, iceY, iceW, iceH, corner);
    g.fill();
    const rule = (x: number) => {
      const p = toIce(x, 0);
      if (tall) {
        g.moveTo(iceX, p.y);
        g.lineTo(iceX + iceW, p.y);
      } else {
        g.moveTo(p.x, iceY);
        g.lineTo(p.x, iceY + iceH);
      }
    };
    g.save();
    traceRoundRect(g, iceX, iceY, iceW, iceH, corner);
    g.clip();
    g.fillStyle = CREASE_FILL;
    for (const side of [1, -1] as const) {
      const gx = GOAL_LINE_X * side;
      const dir = -side;
      const creaseHw = Math.max(GOAL_W / 2, CREASE_R * 0.66);
      const mouth = toIce(gx, -creaseHw);
      g.beginPath();
      g.moveTo(mouth.x, mouth.y);
      const steps = 14;
      for (let i = 0; i <= steps; i++) {
        const z = -creaseHw + (2 * creaseHw * i) / steps;
        const xOff = Math.sqrt(Math.max(0, CREASE_R * CREASE_R - z * z));
        const p = toIce(gx + dir * xOff, z);
        g.lineTo(p.x, p.y);
      }
      g.closePath();
      g.fill();
      g.strokeStyle = LINE_RED;
      g.lineWidth = 1.2;
      g.stroke();
    }
    const logoAt = toIce(0, 0);
    const logoR = FACEOFF_MARK_R * pxPerM;
    if (centerIceLogo.complete && centerIceLogo.naturalWidth > 0) {
      g.save();
      g.beginPath();
      g.arc(logoAt.x, logoAt.y, logoR, 0, Math.PI * 2);
      g.clip();
      g.drawImage(centerIceLogo, logoAt.x - logoR, logoAt.y - logoR, logoR * 2, logoR * 2);
      g.restore();
    } else {
      g.fillStyle = LINE_BLUE;
      g.beginPath();
      g.arc(logoAt.x, logoAt.y, Math.max(2, logoR * 0.28), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = LINE_RED;
    g.lineWidth = 2;
    g.beginPath();
    rule(0);
    g.stroke();
    g.strokeStyle = LINE_BLUE;
    g.beginPath();
    rule(-BLUE_X);
    rule(BLUE_X);
    g.stroke();
    g.strokeStyle = LINE_RED;
    g.beginPath();
    rule(-GOAL_LINE_X);
    rule(GOAL_LINE_X);
    g.stroke();
    const circR = FACEOFF_MARK_R * pxPerM;
    const dotR = Math.max(1.6, DOT_R * pxPerM);
    const spots: [number, number][] = [
      [0, 0],
      [FACEOFF_EZ_X, FACEOFF_SPOT_Z],
      [FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
      [-FACEOFF_EZ_X, FACEOFF_SPOT_Z],
      [-FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
    ];
    g.strokeStyle = LINE_RED;
    g.lineWidth = 1.4;
    for (const [sx, sz] of spots) {
      const c = toIce(sx, sz);
      g.beginPath();
      g.arc(c.x, c.y, circR, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = LINE_RED;
      g.beginPath();
      g.arc(c.x, c.y, dotR, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of opts.players) {
      const pt = toIce(p.x, p.z);
      paintJumboSkater(
        g,
        pt.x,
        pt.y,
        p.home ? opts.homeHelmet : opts.awayHelmet,
        p.home ? opts.homeJersey : opts.awayJersey,
        p.home ? opts.homePants : opts.awayPants,
        p.home ? opts.homeStripe : opts.awayStripe,
      );
    }
    const puck = toIce(opts.puckX, opts.puckZ);
    g.fillStyle = "#111111";
    g.beginPath();
    g.arc(puck.x, puck.y, 5, 0, Math.PI * 2);
    g.fill();
    if (opts.goal) {
      g.fillStyle = "rgba(20,24,28,0.72)";
      g.fillRect(iceX, iceY, iceW, 28);
      g.fillStyle = "#ffffff";
      g.font = "700 22px 'Barlow Condensed', sans-serif";
      g.textAlign = "center";
      g.fillText("GOAL", iceX + iceW / 2, iceY + 14);
    }
    g.restore();
    g.strokeStyle = "#e8eef4";
    g.lineWidth = 3;
    traceRoundRect(g, iceX, iceY, iceW, iceH, corner);
    g.stroke();
    texture.needsUpdate = true;
  };

  return { canvas, texture, paint };
}
