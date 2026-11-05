import * as THREE from "three";

const DIGIT_URLS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"].map(
  (digit) => new URL(`./digits/${digit}.png`, import.meta.url).href,
);

let loadedDigits: HTMLImageElement[] | null = null;
let digitLoad: Promise<HTMLImageElement[]> | null = null;
const numberTextures = new Map<string, THREE.CanvasTexture>();
const paintedDigits = new Map<string, HTMLCanvasElement>();

function loadDigits() {
  if (loadedDigits) return Promise.resolve(loadedDigits);
  if (!digitLoad) {
    digitLoad = Promise.all(
      DIGIT_URLS.map(
        (src) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error(src));
            image.src = src;
          }),
      ),
    ).then((images) => {
      loadedDigits = images;
      return images;
    });
  }
  return digitLoad;
}

function colorChannels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Keep the main glyph and drop the extra outline rings baked into the mask. */
function mainGlyph(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h);
  let bestStart = -1;
  let bestCount = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] !== 1 || seen[i] === 1) continue;
    const stack = [i];
    seen[i] = 1;
    let count = 0;
    let start = i;
    while (stack.length > 0) {
      const cur = stack.pop() ?? 0;
      count++;
      const cx = cur % w;
      const cy = (cur - cx) / w;
      const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
      for (const next of neighbors) {
        if (next < 0 || next >= mask.length || seen[next] === 1 || mask[next] !== 1) continue;
        const nx = next % w;
        if (Math.abs(nx - cx) > 1) continue;
        if (cy < 0 || cy >= h) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestStart = start;
    }
  }
  const glyph = new Uint8Array(w * h);
  if (bestStart < 0) return glyph;
  const stack = [bestStart];
  glyph[bestStart] = 1;
  while (stack.length > 0) {
    const cur = stack.pop() ?? 0;
    const cx = cur % w;
    const neighbors = [cur - 1, cur + 1, cur - w, cur + w];
    for (const next of neighbors) {
      if (next < 0 || next >= mask.length || glyph[next] === 1 || mask[next] !== 1) continue;
      const nx = next % w;
      if (Math.abs(nx - cx) > 1) continue;
      glyph[next] = 1;
      stack.push(next);
    }
  }
  return glyph;
}

/** The reference glyph in the kit color, plus one trim and nothing outside it. */
function paintDigit(
  target: CanvasRenderingContext2D,
  image: HTMLImageElement,
  fill: string,
  outline: string,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  digit: number,
) {
  const w = Math.max(1, Math.ceil(dw));
  const h = Math.max(1, Math.ceil(dh));
  const key = `${digit}|${fill}|${outline}|${w}|${h}`;
  let scratch = paintedDigits.get(key);
  if (!scratch) {
    scratch = document.createElement("canvas");
    scratch.width = w;
    scratch.height = h;
    paintGlyph(scratch, image, fill, outline, w, h);
    paintedDigits.set(key, scratch);
  }
  target.drawImage(scratch, dx, dy);
}

function paintGlyph(
  scratch: HTMLCanvasElement,
  image: HTMLImageElement,
  fill: string,
  outline: string,
  w: number,
  h: number,
) {
  const g = scratch.getContext("2d");
  if (!g) return;
  g.drawImage(image, 0, 0, w, h);
  const src = g.getImageData(0, 0, w, h).data;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = (src[i * 4 + 3] ?? 0) > 160 ? 1 : 0;
  const glyph = mainGlyph(mask, w, h);
  const trim = Math.max(2, Math.round(h * 0.018));
  const out = g.createImageData(w, h);
  const [fr, fg, fb] = colorChannels(fill);
  const [or, og, ob] = colorChannels(outline);
  const t2 = trim * trim;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const here = glyph[y * w + x] === 1;
      let edge = false;
      if (!here) {
        for (let oy = -trim; oy <= trim && !edge; oy++) {
          const yy = y + oy;
          if (yy < 0 || yy >= h) continue;
          const row = yy * w;
          for (let ox = -trim; ox <= trim; ox++) {
            if (ox * ox + oy * oy > t2) continue;
            const xx = x + ox;
            if (xx < 0 || xx >= w) continue;
            if (glyph[row + xx] === 1) {
              edge = true;
              break;
            }
          }
        }
      }
      if (!here && !edge) continue;
      const i = (y * w + x) * 4;
      out.data[i] = here ? (fr ?? 0) : (or ?? 0);
      out.data[i + 1] = here ? (fg ?? 0) : (og ?? 0);
      out.data[i + 2] = here ? (fb ?? 0) : (ob ?? 0);
      out.data[i + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
}

function composeNumber(canvas: HTMLCanvasElement, digits: HTMLImageElement[], num: number, fill: string, outline: string) {
  const text = String(num);
  const targetH = 480;
  const gap = Math.round(targetH * 0.08);
  const pad = Math.round(targetH * 0.06);
  const cells = [...text].map((ch) => {
    const digit = Number(ch);
    const image = digits[digit];
    if (!image) return null;
    const w = Math.round(targetH * (image.width / image.height));
    return { image, w, digit };
  });
  if (cells.some((cell) => !cell)) return;
  const known = cells.filter((cell): cell is { image: HTMLImageElement; w: number; digit: number } => cell !== null);
  const totalW = known.reduce((sum, cell) => sum + cell.w, 0) + gap * Math.max(0, known.length - 1);
  canvas.width = totalW + pad * 2;
  canvas.height = targetH + pad * 2;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.clearRect(0, 0, canvas.width, canvas.height);
  let x = pad;
  for (const cell of known) {
    paintDigit(g, cell.image, fill, outline, x, pad, cell.w, targetH, cell.digit);
    x += cell.w + gap;
  }
}

/** Block-digit jersey number. Same glyph paint as the football pose editor. */
export function createNumberTexture(num: number, fill: string, outline: string): THREE.CanvasTexture {
  const key = `${num}|${fill}|${outline}`;
  const cached = numberTextures.get(key);
  if (cached) return cached;
  if (typeof document === "undefined" || typeof Image === "undefined") {
    const texture = new THREE.Texture() as THREE.CanvasTexture;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  numberTextures.set(key, texture);
  const paint = (digits: HTMLImageElement[]) => {
    composeNumber(canvas, digits, num, fill, outline);
    texture.needsUpdate = true;
    texture.dispatchEvent({ type: "update" });
  };
  if (loadedDigits) paint(loadedDigits);
  else void loadDigits().then(paint);
  return texture;
}

if (typeof Image !== "undefined") void loadDigits();
