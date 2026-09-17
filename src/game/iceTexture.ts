import * as THREE from "three";
import {
  BLUE_X,
  CORNER_R,
  CREASE_FILL,
  CREASE_R,
  DOT_R,
  FACEOFF_EZ_X,
  FACEOFF_MARK_R,
  FACEOFF_SPOT_Z,
  FT,
  GOAL_LINE_X,
  GOAL_W,
  HASH_L,
  LINE_BLUE,
  LINE_RED,
  RINK_L,
  RINK_W,
} from "./rink";
import scoreboardLogoUrl from "../../logo-scoreboard.png";

const scoreboardLogo = new Image();
scoreboardLogo.src = scoreboardLogoUrl;

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

export function createIceCanvases(w = 2048, h = 872): {
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
  const goalW = mx(0.08);

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

  const faceoff = (x: number, z: number, withCircle: boolean) => {
    if (withCircle) {
      ctx.strokeStyle = LINE_RED;
      ctx.lineWidth = thinW;
      ctx.beginPath();
      ctx.ellipse(wx(x), wz(z), mx(FACEOFF_MARK_R), mz(FACEOFF_MARK_R), 0, 0, Math.PI * 2);
      ctx.stroke();
      const hash = HASH_L;
      const off = 0.9 * FT;
      ctx.beginPath();
      for (const sxn of [-1, 1]) {
        for (const szn of [-1, 1]) {
          const hx = x + sxn * (FT * 0.75);
          const hz = z + szn * (4 * FT);
          ctx.moveTo(wx(hx), wz(hz));
          ctx.lineTo(wx(hx + sxn * hash), wz(hz));
          ctx.moveTo(wx(x + sxn * (4 * FT)), wz(z + szn * off));
          ctx.lineTo(wx(x + sxn * (4 * FT)), wz(z + szn * (off + 2 * FT)));
        }
      }
      ctx.stroke();
    }
    ctx.fillStyle = LINE_RED;
    ctx.beginPath();
    ctx.ellipse(wx(x), wz(z), mx(DOT_R), mz(DOT_R), 0, 0, Math.PI * 2);
    ctx.fill();
  };

  fillCrease(1);
  fillCrease(-1);
  ctx.fillStyle = "rgba(200, 16, 46, 0.07)";
  ctx.beginPath();
  ctx.ellipse(wx(0), wz(0), mx(FACEOFF_MARK_R), mz(FACEOFF_MARK_R), 0, 0, Math.PI * 2);
  ctx.fill();
  strokeV(0, LINE_RED, goalW);
  strokeV(BLUE_X, LINE_BLUE, goalW);
  strokeV(-BLUE_X, LINE_BLUE, goalW);
  strokeV(GOAL_LINE_X, LINE_RED, goalW);
  strokeV(-GOAL_LINE_X, LINE_RED, goalW);
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
  faceoff(nzX, spotZ, false);
  faceoff(nzX, -spotZ, false);
  faceoff(-nzX, spotZ, false);
  faceoff(-nzX, -spotZ, false);

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

export function createIceTextures(): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const { albedo, roughness } = createIceCanvases();
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
  homeJersey: string;
  homeStripe: string;
  awayJersey: string;
  awayStripe: string;
  fill: string;
  homeScore: number;
  awayScore: number;
  ticker: number;
  goal: boolean;
  clock?: string | null;
};

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
    g.fillStyle = opts.homeJersey;
    g.fillRect(20, 20, 40, 88);
    g.fillStyle = opts.homeStripe;
    g.fillRect(20, 20, 10, 88);
    g.fillStyle = opts.awayJersey;
    g.fillRect(64, 20, 40, 88);
    g.fillStyle = opts.awayStripe;
    g.fillRect(94, 20, 10, 88);
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

export function createJumboFace(): {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  paint: (opts: JumboPaint) => void;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

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

    g.fillStyle = opts.fill;
    g.font = "700 36px 'Barlow Condensed', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("HOCKEY FAST BREAK", w * 0.39, h * 0.11);

    const adX = w * 0.78;
    const adW = w * 0.18;
    const adY = h * 0.05;
    const adH = h * 0.28;
    g.fillStyle = "#fef8ec";
    g.fillRect(adX, adY, adW, adH);
    if (scoreboardLogo.complete && scoreboardLogo.naturalWidth > 0) {
      const ir = scoreboardLogo.naturalWidth / scoreboardLogo.naturalHeight;
      const rr = adW / adH;
      let dw: number;
      let dh: number;
      if (ir > rr) {
        dh = adH;
        dw = dh * ir;
      } else {
        dw = adW;
        dh = dw / ir;
      }
      g.save();
      g.beginPath();
      g.rect(adX, adY, adW, adH);
      g.clip();
      g.drawImage(scoreboardLogo, adX + (adW - dw) / 2, adY + (adH - dh) / 2, dw, dh);
      g.restore();
    }
    g.strokeStyle = "#1b3a6b";
    g.lineWidth = 2;
    g.strokeRect(adX, adY, adW, adH);

    g.fillStyle = "#d7eef7";
    g.fillRect(adX, h * 0.36, adW, h * 0.26);
    g.strokeStyle = "#6aa3b8";
    g.strokeRect(adX, h * 0.36, adW, h * 0.26);
    g.fillStyle = "#14556c";
    g.font = "italic 22px 'Segoe Script', 'Brush Script MT', cursive";
    g.fillText("Drink More", adX + adW / 2, h * 0.45);
    g.fillText("Water!", adX + adW / 2, h * 0.56);

    g.fillStyle = "#1a2228";
    g.fillRect(14, h * 0.2, w * 0.72, h * 0.3);
    g.fillStyle = "#8b9688";
    g.font = "600 18px 'IBM Plex Sans', sans-serif";
    g.textAlign = "left";
    g.fillText("GAME TIME", 28, h * 0.3);
    g.fillText("SCORE", w * 0.4, h * 0.3);
    g.fillStyle = "#e8ece6";
    g.font = "700 52px 'Barlow Condensed', sans-serif";
    g.fillText(opts.clock ?? "—", 28, h * 0.43);
    g.fillText(`${opts.homeScore}  –  ${opts.awayScore}`, w * 0.4, h * 0.43);

    const vx = 14;
    const vy = h * 0.54;
    const vw = w * 0.72;
    const vh = h * 0.4;
    g.fillStyle = "#05080a";
    g.fillRect(vx, vy, vw, vh);
    g.strokeStyle = "#2a3d32";
    g.lineWidth = 2;
    g.strokeRect(vx, vy, vw, vh);
    const iceX = vx + 18;
    const iceY = vy + 16;
    const iceW = vw - 36;
    const iceH = vh - 32;
    g.fillStyle = "#d7e8f4";
    g.fillRect(iceX, iceY, iceW, iceH);
    g.strokeStyle = LINE_RED;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(iceX + iceW / 2, iceY);
    g.lineTo(iceX + iceW / 2, iceY + iceH);
    g.stroke();
    g.strokeStyle = LINE_BLUE;
    const bx = (BLUE_X / (RINK_L / 2)) * (iceW / 2);
    g.beginPath();
    g.moveTo(iceX + iceW / 2 - bx, iceY);
    g.lineTo(iceX + iceW / 2 - bx, iceY + iceH);
    g.moveTo(iceX + iceW / 2 + bx, iceY);
    g.lineTo(iceX + iceW / 2 + bx, iceY + iceH);
    g.stroke();
    const gx = (GOAL_LINE_X / (RINK_L / 2)) * (iceW / 2);
    g.strokeStyle = LINE_RED;
    g.beginPath();
    g.moveTo(iceX + iceW / 2 - gx, iceY);
    g.lineTo(iceX + iceW / 2 - gx, iceY + iceH);
    g.moveTo(iceX + iceW / 2 + gx, iceY);
    g.lineTo(iceX + iceW / 2 + gx, iceY + iceH);
    g.stroke();
    const toIce = (x: number, z: number) => ({
      x: Math.max(iceX + 4, Math.min(iceX + iceW - 4, iceX + iceW / 2 + (x / (RINK_L / 2)) * (iceW / 2))),
      y: Math.max(iceY + 4, Math.min(iceY + iceH - 4, iceY + iceH / 2 + (z / (RINK_W / 2)) * (iceH / 2))),
    });
    const circR = (FACEOFF_MARK_R / (RINK_L / 2)) * (iceW / 2);
    const dotR = Math.max(1.6, (DOT_R / (RINK_L / 2)) * (iceW / 2));
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
      g.fillStyle = p.home ? opts.homeJersey : opts.awayJersey;
      g.beginPath();
      g.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = p.home ? opts.homeStripe : opts.awayStripe;
      g.lineWidth = 1.5;
      g.stroke();
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
    texture.needsUpdate = true;
  };

  return { canvas, texture, paint };
}
