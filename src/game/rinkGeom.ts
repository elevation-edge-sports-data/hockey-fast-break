import * as THREE from "three";
import { CORNER_R, RINK_L, RINK_W } from "./rink";

export function roundedRectShape(
  length: number,
  width: number,
  radius: number,
  inset = 0,
  reverse = false,
): THREE.Shape {
  const hl = length / 2 - inset;
  const hw = width / 2 - inset;
  const r = Math.max(0.01, Math.min(radius - inset, hl - 0.01, hw - 0.01));
  const s = new THREE.Shape();
  s.moveTo(-hl + r, -hw);
  s.lineTo(hl - r, -hw);
  s.absarc(hl - r, -hw + r, r, -Math.PI / 2, 0, false);
  s.lineTo(hl, hw - r);
  s.absarc(hl - r, hw - r, r, 0, Math.PI / 2, false);
  s.lineTo(-hl + r, hw);
  s.absarc(-hl + r, hw - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-hl, -hw + r);
  s.absarc(-hl + r, -hw + r, r, Math.PI, Math.PI * 1.5, false);
  if (!reverse) return s;
  const pts = s.getPoints(32);
  const hole = new THREE.Shape();
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    if (i === pts.length - 1) hole.moveTo(p.x, p.y);
    else hole.lineTo(p.x, p.y);
  }
  hole.closePath();
  return hole;
}

export function rinkPerimeter(inset: number, samples = 160): THREE.Vector3[] {
  const hl = RINK_L / 2 - inset;
  const hw = RINK_W / 2 - inset;
  const r = Math.max(0.05, CORNER_R - inset);
  const pts: THREE.Vector3[] = [];

  const pushArc = (cx: number, cz: number, a0: number, a1: number, n: number) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r));
    }
  };

  const nSide = Math.max(4, Math.round(samples / 8));
  const nArc = Math.max(6, Math.round(samples / 8));

  for (let i = 0; i <= nSide; i++) {
    const t = i / nSide;
    pts.push(new THREE.Vector3(-hl + r + (2 * (hl - r)) * t, 0, -hw));
  }
  pushArc(hl - r, -hw + r, -Math.PI / 2, 0, nArc);
  for (let i = 1; i <= nSide; i++) {
    const t = i / nSide;
    pts.push(new THREE.Vector3(hl, 0, -hw + r + (2 * (hw - r)) * t));
  }
  pushArc(hl - r, hw - r, 0, Math.PI / 2, nArc);
  for (let i = 1; i <= nSide; i++) {
    const t = i / nSide;
    pts.push(new THREE.Vector3(hl - r - (2 * (hl - r)) * t, 0, hw));
  }
  pushArc(-hl + r, hw - r, Math.PI / 2, Math.PI, nArc);
  for (let i = 1; i <= nSide; i++) {
    const t = i / nSide;
    pts.push(new THREE.Vector3(-hl, 0, hw - r - (2 * (hw - r)) * t));
  }
  pushArc(-hl + r, -hw + r, Math.PI, Math.PI * 1.5, nArc);

  return pts;
}
