import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createFaceoffDotTexture, createIceTextures, createNetTexture } from "./iceTexture";
import { resolveIceLogoUrl } from "./logoLibrary";
import {
  BLUE_LINE_W,
  BLUE_X,
  BOARD_H,
  boardLineFaces,
  CENTER_LINE_W,
  CORNER_R,
  CREASE_R,
  DOT_R,
  FT,
  FACEOFF_EZ_X,
  FACEOFF_MARK_R,
  FACEOFF_NZ_X,
  FACEOFF_R,
  FACEOFF_SPOT_Z,
  HASH_MARK_INSIDE,
  HASH_MARK_L,
  L_ARM,
  L_GAP,
  L_INSET,
  L_STEM,
  MARK_W,
  glassWallLayout,
  type GlassWallSpan,
  RINK_GLASS_INSET,
  RINK_GLASS_SEAM,
  RINK_GLASS_THICK,
  cageOutlinePoint,
  GOAL_D,
  GOAL_D_TOP,
  GOAL_H,
  GOAL_RED_R,
  GOAL_WHITE_R,
  GOAL_LINE_W,
  GOAL_LINE_X,
  GOAL_W,
  iceWidthAtX,
  KICK_H,
  LINE_BLUE,
  LINE_RED,
  RIBBON_H,
  RINK_L,
  RINK_W,
} from "./rink";
import { roundedRectShape, rinkPerimeter } from "./rinkGeom";
import { kitById } from "./uniforms";
import { clampCenterIceLogoZoom, useGame, type DrillTargets } from "./store";
import { flushIceWear, iceWearTexture } from "./iceWear";
import { defendDir, drillFade, drillGrid, drillTargetList, targetBoard, world } from "./sim";

function extrudeRing(outerInset: number, innerInset: number, depth: number) {
  const outer = roundedRectShape(RINK_L, RINK_W, CORNER_R, outerInset);
  const inner = roundedRectShape(RINK_L, RINK_W, CORNER_R, innerInset, true);
  outer.holes.push(inner);
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/** Full-width extra so an ice stripe crosses the kick face. */
const ICE_LINE_PAST = 0.08;

function IceStripe({
  x,
  color,
  width,
  y = 0.024,
}: {
  x: number;
  color: string;
  width: number;
  y?: number;
}) {
  // Past the nominal edge so both sides of the stripe meet the kick, including the goal line on the arc.
  const span = Math.max(1, iceWidthAtX(x) + ICE_LINE_PAST);
  // The goal line shares the ice top. The offset keeps that coplanar stripe visible.
  const onIce = y <= 0.012;
  return (
    <mesh position={[x, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, span]} />
      <meshBasicMaterial
        color={color}
        toneMapped={false}
        polygonOffset={onIce}
        polygonOffsetFactor={onIce ? -2 : 0}
        polygonOffsetUnits={onIce ? -2 : 0}
      />
    </mesh>
  );
}

function FaceoffCircle({ x, z, r = FACEOFF_R }: { x: number; z: number; r?: number }) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r + GOAL_LINE_W, 128]} />
      <meshBasicMaterial
        color={LINE_RED}
        toneMapped={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

function MarkLine({
  x,
  z,
  alongX,
  alongZ,
  y = 0.027,
  offset = 0,
}: {
  x: number;
  z: number;
  alongX: number;
  alongZ: number;
  y?: number;
  offset?: number;
}) {
  return (
    <mesh position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[Math.max(alongX, MARK_W), Math.max(alongZ, MARK_W)]} />
      <meshBasicMaterial
        color={LINE_RED}
        toneMapped={false}
        polygonOffset={offset !== 0}
        polygonOffsetFactor={offset}
        polygonOffsetUnits={offset}
      />
    </mesh>
  );
}

function EndZoneMarks({ x, z }: { x: number; z: number }) {
  const inner = HASH_MARK_INSIDE / 2;
  const halfGap = L_GAP / 2;
  return (
    <group>
      <FaceoffCircle x={x} z={z} />
      {([-1, 1] as const).flatMap((szn) =>
        ([-1, 1] as const).map((sxn) => (
          <MarkLine
            key={`h${sxn}${szn}`}
            x={x + sxn * inner}
            z={z + szn * (Math.sqrt((FACEOFF_R + GOAL_LINE_W) ** 2 - inner ** 2) + HASH_MARK_L / 2)}
            alongX={MARK_W}
            alongZ={HASH_MARK_L}
            y={0.012}
            offset={-3}
          />
        )),
      )}
      {([-1, 1] as const).flatMap((sxn) =>
        ([-1, 1] as const).flatMap((szn) => {
          const xInner = x + sxn * L_INSET;
          const zStem = z + szn * halfGap;
          return [
            <MarkLine
              key={`ls${sxn}${szn}`}
              x={x + sxn * (L_INSET + L_STEM / 2)}
              z={zStem}
              alongX={L_STEM}
              alongZ={MARK_W}
              y={0.012}
              offset={-3}
            />,
            <MarkLine
              key={`la${sxn}${szn}`}
              x={xInner}
              z={z + szn * (halfGap + L_ARM / 2)}
              alongX={MARK_W}
              alongZ={L_ARM}
              y={0.012}
              offset={-3}
            />,
            <MarkLine
              key={`lc${sxn}${szn}`}
              x={xInner}
              z={zStem}
              alongX={MARK_W}
              alongZ={MARK_W}
              y={0.012}
              offset={-3}
            />,
          ];
        }),
      )}
    </group>
  );
}

/** Photo gap is 3px of white beside a 36px red band. DOT_R is wider than the red. */
const CENTER_LOGO_GAP_W = CENTER_LINE_W / 12;

function CenterLogoGaps() {
  const gap = CENTER_LOGO_GAP_W;
  const half = CENTER_LINE_W / 2;
  const span = 2 * Math.sqrt(FACEOFF_MARK_R * FACEOFF_MARK_R - half * half);
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <mesh
          key={side}
          position={[side * (half + gap / 2), 0.022, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={2}
        >
          <planeGeometry args={[gap, span]} />
          <meshBasicMaterial color="#ffffff" toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

function CenterIceDot() {
  return (
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
      <circleGeometry args={[CENTER_LINE_W / 2, 64]} />
      <meshBasicMaterial color={LINE_BLUE} toneMapped={false} />
    </mesh>
  );
}

/** Ice albedo. Letterboxed and transparent logo pixels stay this color. */
const CENTER_LOGO_ICE = "#e4edf4";
const CENTER_LOGO_TEX = 512;

function centerLogoTexture(img: HTMLImageElement, zoom: number): THREE.CanvasTexture {
  const size = CENTER_LOGO_TEX;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("center logo canvas");
  ctx.fillStyle = CENTER_LOGO_ICE;
  ctx.fillRect(0, 0, size, size);
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (iw > 0 && ih > 0) {
    const fit = Math.min(size / iw, size / ih);
    const scale = fit * clampCenterIceLogoZoom(zoom);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function useIceLogoUrl(): string | null {
  const mode = useGame((s) => s.centerIceLogo);
  const homeKit = useGame((s) => s.homeKit);
  const customLogoDataUrl = useGame((s) => s.customLogoDataUrl);
  useGame((s) => s.logoLibraryRev);
  return resolveIceLogoUrl(mode, homeKit, customLogoDataUrl);
}

function CenterIceLogo() {
  const centerIceLogoZoom = useGame((s) => s.centerIceLogoZoom);
  const logoLibraryRev = useGame((s) => s.logoLibraryRev);
  const src = useIceLogoUrl();
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: CENTER_LOGO_ICE,
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    if (!src) {
      mat.map?.dispose();
      mat.map = null;
      mat.color.set(CENTER_LOGO_ICE);
      mat.needsUpdate = true;
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      const next = centerLogoTexture(img, centerIceLogoZoom);
      const prev = mat.map;
      mat.map = next;
      mat.color.set("#ffffff");
      mat.needsUpdate = true;
      if (prev && prev !== next) prev.dispose();
    };
    img.onerror = () => {
      if (!alive) return;
      mat.map?.dispose();
      mat.map = null;
      mat.color.set(CENTER_LOGO_ICE);
      mat.needsUpdate = true;
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [mat, src, centerIceLogoZoom, logoLibraryRev]);
  useLayoutEffect(
    () => () => {
      mat.map?.dispose();
      mat.map = null;
      mat.dispose();
    },
    [mat],
  );
  if (!src) return null;
  return (
    <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <circleGeometry args={[FACEOFF_MARK_R, 64]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function FaceoffDot({
  x,
  z,
  map,
}: {
  x: number;
  z: number;
  map: THREE.CanvasTexture;
}) {
  return (
    <mesh position={[x, 0.012, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[DOT_R, 64]} />
      <meshBasicMaterial
        map={map}
        toneMapped={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  );
}

function FaceoffCircles() {
  const map = useMemo(() => createFaceoffDotTexture(), []);
  useLayoutEffect(() => () => map.dispose(), [map]);
  const roller = useGame((s) => s.clockMode) === "roller";
  const iceLogo = useIceLogoUrl();
  const dots: readonly (readonly [number, number])[] = roller
    ? [
        [FACEOFF_EZ_X, FACEOFF_SPOT_Z],
        [FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
        [-FACEOFF_EZ_X, FACEOFF_SPOT_Z],
        [-FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
      ]
    : [
        [FACEOFF_EZ_X, FACEOFF_SPOT_Z],
        [FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
        [-FACEOFF_EZ_X, FACEOFF_SPOT_Z],
        [-FACEOFF_EZ_X, -FACEOFF_SPOT_Z],
        [FACEOFF_NZ_X, FACEOFF_SPOT_Z],
        [FACEOFF_NZ_X, -FACEOFF_SPOT_Z],
        [-FACEOFF_NZ_X, FACEOFF_SPOT_Z],
        [-FACEOFF_NZ_X, -FACEOFF_SPOT_Z],
      ];
  return (
    <group>
      {iceLogo ? <CenterIceLogo /> : null}
      <CenterLogoGaps />
      <CenterIceDot />
      <FaceoffCircle x={0} z={0} r={FACEOFF_MARK_R} />
      <EndZoneMarks x={FACEOFF_EZ_X} z={FACEOFF_SPOT_Z} />
      <EndZoneMarks x={FACEOFF_EZ_X} z={-FACEOFF_SPOT_Z} />
      <EndZoneMarks x={-FACEOFF_EZ_X} z={FACEOFF_SPOT_Z} />
      <EndZoneMarks x={-FACEOFF_EZ_X} z={-FACEOFF_SPOT_Z} />
      {dots.map(([x, z]) => (
        <FaceoffDot key={`${x}:${z}`} x={x} z={z} map={map} />
      ))}
    </group>
  );
}

function creaseGeo(side: 1 | -1) {
  const gx = GOAL_LINE_X * side;
  const dir = -side;
  const hw = Math.max(GOAL_W / 2, CREASE_R * 0.66);
  const r = CREASE_R;
  const sh = new THREE.Shape();
  sh.moveTo(gx, -hw);
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const z = -hw + (2 * hw * i) / steps;
    const xOff = Math.sqrt(Math.max(0, r * r - z * z));
    sh.lineTo(gx + dir * xOff, z);
  }
  sh.lineTo(gx, hw);
  sh.closePath();
  const g = new THREE.ShapeGeometry(sh, 1);
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Same centerline as the old crease loop, drawn as wide as the goal line. */
function creaseOutlineGeo(side: 1 | -1) {
  const gx = GOAL_LINE_X * side;
  const dir = -side;
  const hw = Math.max(GOAL_W / 2, CREASE_R * 0.66);
  const r = CREASE_R;
  const path: { x: number; z: number }[] = [];
  const steps = 22;
  for (let i = 0; i <= steps; i++) {
    const z = -hw + (2 * hw * i) / steps;
    const xOff = Math.sqrt(Math.max(0, r * r - z * z));
    path.push({ x: gx + dir * xOff, z });
  }
  path.push({ x: gx, z: hw });
  path.push({ x: gx, z: -hw });

  const n = path.length;
  const half = GOAL_LINE_W / 2;
  const y = 0.012;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = path[(i + n - 1) % n]!;
    const curr = path[i]!;
    const next = path[(i + 1) % n]!;
    let t1x = curr.x - prev.x;
    let t1z = curr.z - prev.z;
    let t2x = next.x - curr.x;
    let t2z = next.z - curr.z;
    const l1 = Math.hypot(t1x, t1z) || 1;
    const l2 = Math.hypot(t2x, t2z) || 1;
    t1x /= l1;
    t1z /= l1;
    t2x /= l2;
    t2z /= l2;
    const n1x = -t1z;
    const n1z = t1x;
    const n2x = -t2z;
    const n2z = t2x;
    let mx = n1x + n2x;
    let mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    if (ml < 1e-6) {
      mx = n2x;
      mz = n2z;
    } else {
      mx /= ml;
      mz /= ml;
    }
    const denom = mx * n2x + mz * n2z;
    const scale = half / Math.max(0.35, Math.abs(denom));
    let ox = mx * scale;
    let oz = mz * scale;
    // The goal-line corners are square joints on the stripe edge, not a long bisector.
    if (Math.abs(curr.x - gx) < 1e-4) {
      ox = Math.sign(ox) * half;
      oz = Math.sign(oz) * half;
    }
    pos.push(curr.x + ox, y, curr.z + oz);
    pos.push(curr.x - ox, y, curr.z - oz);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = ((i + 1) % n) * 2;
    const d = c + 1;
    idx.push(a, c, d, a, d, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function Crease({ side }: { side: 1 | -1 }) {
  const geo = useMemo(() => creaseGeo(side), [side]);
  const outline = useMemo(() => creaseOutlineGeo(side), [side]);
  useLayoutEffect(
    () => () => {
      geo.dispose();
      outline.dispose();
    },
    [geo, outline],
  );
  return (
    <group>
      <mesh geometry={geo} position={[0, 0.012, 0]}>
        <meshBasicMaterial
          color="#5eb6ff"
          transparent
          opacity={0.55}
          toneMapped={false}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh geometry={outline}>
        <meshBasicMaterial
          color={LINE_RED}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
}

function CenterRedLine() {
  const gap = useIceLogoUrl() !== null;
  if (!gap) return <IceStripe x={0} color={LINE_RED} width={CENTER_LINE_W} />;
  const halfW = CENTER_LINE_W / 2;
  const crest = Math.sqrt(Math.max(0, FACEOFF_MARK_R * FACEOFF_MARK_R - halfW * halfW));
  const halfIce = Math.max(1, iceWidthAtX(0) + ICE_LINE_PAST) / 2;
  const seg = Math.max(0.2, halfIce - crest);
  const z = (halfIce + crest) / 2;
  return (
    <>
      {([-1, 1] as const).map((side) => (
        <mesh key={side} position={[0, 0.024, side * z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[CENTER_LINE_W, seg]} />
          <meshBasicMaterial color={LINE_RED} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** Canvas leg is 0.055 m (thinW). The extra 0.02 m covers the albedo antialias. */
const TRAP_W = 0.075;

function goalTrapezoidGeo(side: 1 | -1): THREE.BufferGeometry {
  const gx = GOAL_LINE_X * side;
  const back = (RINK_L / 2) * side;
  const goal = 8.5 * FT;
  const end = 14 * FT;
  const y = 0.012;
  const half = TRAP_W / 2;
  const legs: [number, number, number, number][] = [
    [gx, -goal, back, -end],
    [gx, goal, back, end],
  ];
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [x0, z0, x1, z1] of legs) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const ox = (dz / len) * half;
    const oz = (-dx / len) * half;
    const base = pos.length / 3;
    pos.push(
      x0 + ox, y, z0 + oz,
      x0 - ox, y, z0 - oz,
      x1 + ox, y, z1 + oz,
      x1 - ox, y, z1 - oz,
    );
    idx.push(base, base + 2, base + 3, base, base + 3, base + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function GoalTrapezoid({ side }: { side: 1 | -1 }) {
  const geo = useMemo(() => goalTrapezoidGeo(side), [side]);
  useLayoutEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color={LINE_RED}
        toneMapped={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-3}
        polygonOffsetUnits={-3}
      />
    </mesh>
  );
}

function IceLines({ blue }: { blue: boolean }) {
  return (
    <group>
      <Crease side={-1} />
      <Crease side={1} />
      <GoalTrapezoid side={-1} />
      <GoalTrapezoid side={1} />
      <IceStripe x={-GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} y={0.012} />
      <IceStripe x={GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} y={0.012} />
      {blue ? (
        <>
          <IceStripe x={-BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
          <IceStripe x={BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
        </>
      ) : null}
      <CenterRedLine />
    </group>
  );
}

/** Just off the board face. The stripe has no thickness of its own. */
const PAINT_OFF = 0.001;
/** Past the ice, and past the top of the boards into the glass. */
const PAINT_PAST = 0.012;
const BOARD_FACE_IN = 0.02;
const KICK_FACE_IN = 0.01;

function BoardPaint({ x, color, width }: { x: number; color: string; width: number }) {
  const kick = boardLineFaces(x, KICK_FACE_IN, PAINT_OFF);
  const boards = boardLineFaces(x, BOARD_FACE_IN, PAINT_OFF);
  const seam = 0.004;
  const band = (
    faces: { x: number; z: number; rot: number }[],
    bottom: number,
    top: number,
    key: string,
  ) => {
    const h = top - bottom;
    const y = (bottom + top) / 2;
    return faces.map((face, i) => (
      <mesh key={`${key}${i}`} position={[face.x, y, face.z]} rotation={[0, face.rot, 0]}>
        <planeGeometry args={[width, h]} />
        <meshBasicMaterial
          color={color}
          toneMapped={false}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    ));
  };
  return (
    <group>
      {band(kick, -PAINT_PAST, KICK_H + seam, "k")}
      {band(boards, KICK_H - seam, BOARD_H + PAINT_PAST, "b")}
    </group>
  );
}

function BoardLines({ blue }: { blue: boolean }) {
  return (
    <group>
      <BoardPaint x={-GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} />
      <BoardPaint x={GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} />
      {blue ? (
        <>
          <BoardPaint x={-BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
          <BoardPaint x={BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
        </>
      ) : null}
      <BoardPaint x={0} color={LINE_RED} width={CENTER_LINE_W} />
    </group>
  );
}

function cagePoint(dir: 1 | -1, t: number, y: number, depth: number) {
  const p = cageOutlinePoint(t, depth);
  return new THREE.Vector3(dir * p.a, y, p.z);
}

class CageOutlineCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly dir: 1 | -1,
    private readonly y: number,
    private readonly depth: number,
  ) {
    super();
  }

  getPoint(t: number, optionalTarget?: THREE.Vector3) {
    const target = optionalTarget ?? new THREE.Vector3();
    return target.copy(cagePoint(this.dir, t, this.y, this.depth));
  }
}

/**
 * White top iron: quarter-ellipse sides and a straight back at GOAL_D_TOP,
 * the same family as the top outline. The straight back keeps the outline's
 * rear bar. Each ellipse starts at the joint, not after a straight side.
 * The end disk is head-on to the back of the elbow, so the centerline stops
 * on the red surface (one red radius behind the elbow axis). Stopping a full
 * white radius farther out would leave a gap the size of the white pipe.
 */
function shelfIronLayout() {
  const hw = GOAL_W / 2;
  const topInset = (hw * 6) / 36;
  const zJoin = hw - topInset;
  const zButt = hw - GOAL_RED_R * 2;
  const aButt = GOAL_RED_R;
  const aSpan = GOAL_D_TOP - aButt;
  const zSpan = zButt - zJoin;
  let sideLen = 0;
  let prevA = aButt;
  let prevZ = zButt;
  for (let i = 1; i <= 48; i++) {
    const phi = (i / 48) * (Math.PI / 2);
    const a = aButt + aSpan * Math.sin(phi);
    const z = zJoin + zSpan * Math.cos(phi);
    sideLen += Math.hypot(a - prevA, z - prevZ);
    prevA = a;
    prevZ = z;
  }
  return { zJoin, aButt, aSpan, zSpan, sideLen, backLen: zJoin * 2 };
}

const SHELF_IRON = shelfIronLayout();

class TopShelfIronCurve extends THREE.Curve<THREE.Vector3> {
  readonly cap0: THREE.Vector3;
  readonly cap1: THREE.Vector3;
  readonly out0: THREE.Vector3;
  readonly out1: THREE.Vector3;
  private readonly total: number;

  constructor(private readonly dir: 1 | -1) {
    super();
    this.total = SHELF_IRON.sideLen * 2 + SHELF_IRON.backLen;
    this.cap0 = this.getPoint(0);
    this.cap1 = this.getPoint(1);
    const eps = 1e-4;
    this.out0 = this.getPoint(0).sub(this.getPoint(eps)).normalize();
    this.out1 = this.getPoint(1).sub(this.getPoint(1 - eps)).normalize();
  }

  private atDist(dist: number): { a: number; z: number } {
    const { zJoin, aButt, aSpan, zSpan, sideLen, backLen } = SHELF_IRON;
    if (dist <= sideLen) {
      const phi = (dist / sideLen) * (Math.PI / 2);
      return { a: aButt + aSpan * Math.sin(phi), z: zJoin + zSpan * Math.cos(phi) };
    }
    dist -= sideLen;
    if (dist <= backLen) return { a: GOAL_D_TOP, z: zJoin - dist };
    dist -= backLen;
    const phi = (Math.min(sideLen, dist) / sideLen) * (Math.PI / 2);
    return {
      a: GOAL_D_TOP - aSpan * (1 - Math.cos(phi)),
      z: -(zJoin + zSpan * Math.sin(phi)),
    };
  }

  getPoint(u: number, optionalTarget?: THREE.Vector3) {
    const target = optionalTarget ?? new THREE.Vector3();
    const p = this.atDist(Math.min(1, Math.max(0, u)) * this.total);
    return target.set(this.dir * p.a, GOAL_H, p.z);
  }
}

function ironCap(at: THREE.Vector3, outward: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const geo = new THREE.CircleGeometry(radius, 24);
  geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), outward));
  geo.translate(at.x, at.y, at.z);
  return geo;
}

function goalMesh(dir: 1 | -1) {
  const h = GOAL_H;
  // Existing shell lift. The plan outline stays on cageOutlinePoint.
  const netLift = 0.042;
  const whiteR = GOAL_WHITE_R;
  const segs = 36;
  const ySegs = 5;
  const shell = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= ySegs; j++) {
    const yf = j / ySegs;
    const y = netLift + (h - netLift) * yf;
    const depth = GOAL_D * (1 - yf * (1 - GOAL_D_TOP / GOAL_D));
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const p = cagePoint(dir, t, y, depth);
      pos.push(p.x, p.y, p.z);
      uv.push(i / segs, yf);
    }
  }
  const cols = segs + 1;
  for (let j = 0; j < ySegs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c0 = a + cols;
      const d = c0 + 1;
      if (dir > 0) idx.push(a, c0, b, b, c0, d);
      else idx.push(a, b, c0, b, d, c0);
    }
  }
  shell.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  shell.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  shell.setIndex(idx);
  shell.computeVertexNormals();

  const top = new THREE.BufferGeometry();
  const tPos = [0, h, 0];
  const tUv = [0.5, 0];
  const tIdx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = cagePoint(dir, t, h, GOAL_D_TOP);
    tPos.push(p.x, p.y, p.z);
    tUv.push(i / segs, 1);
    if (i > 0) {
      if (dir > 0) tIdx.push(0, i, i + 1);
      else tIdx.push(0, i + 1, i);
    }
  }
  top.setAttribute("position", new THREE.Float32BufferAttribute(tPos, 3));
  top.setAttribute("uv", new THREE.Float32BufferAttribute(tUv, 2));
  top.setIndex(tIdx);
  top.computeVertexNormals();

  const baseTube = new THREE.TubeGeometry(new CageOutlineCurve(dir, whiteR, GOAL_D), 64, whiteR, 8, false);
  const iron = new TopShelfIronCurve(dir);
  const topTube = new THREE.TubeGeometry(iron, 128, GOAL_WHITE_R, 12, false);
  const cap0 = ironCap(iron.cap0, iron.out0, GOAL_WHITE_R);
  const cap1 = ironCap(iron.cap1, iron.out1, GOAL_WHITE_R);
  return { shell, top, baseTube, topTube, cap0, cap1 };
}

function Goal({ side }: { side: 1 | -1 }) {
  const netTex = useMemo(() => createNetTexture(), []);
  const meshGeo = useMemo(() => goalMesh(side), [side]);
  useLayoutEffect(
    () => () => {
      netTex.dispose();
      meshGeo.shell.dispose();
      meshGeo.top.dispose();
      meshGeo.baseTube.dispose();
      meshGeo.topTube.dispose();
      meshGeo.cap0?.dispose();
      meshGeo.cap1?.dispose();
    },
    [netTex, meshGeo],
  );
  const x = GOAL_LINE_X * side;
  const meshMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#e8eef4",
        map: netTex,
        transparent: true,
        opacity: 0.7,
        alphaTest: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [netTex],
  );
  const pipe = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#c8102e",
        roughness: 0.28,
        metalness: 0.35,
      }),
    [],
  );
  const white = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f6f8",
        roughness: 0.38,
        metalness: 0.22,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const r = GOAL_RED_R;
  const hw = GOAL_W / 2;
  const h = GOAL_H;
  const join = r * 1.15;
  // Centerline radius of the top elbow. Larger than the tube so the inside of the bend stays open.
  const bend = r * 2;
  const postH = h - bend;

  return (
    <group position={[x, 0, 0]}>
      <mesh material={pipe} position={[0, postH / 2, hw]} castShadow>
        <cylinderGeometry args={[r, r, postH, 12]} />
      </mesh>
      <mesh material={pipe} position={[0, postH / 2, -hw]} castShadow>
        <cylinderGeometry args={[r, r, postH, 12]} />
      </mesh>
      <mesh material={pipe} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r, GOAL_W - bend * 2, 12]} />
      </mesh>
      <mesh material={pipe} position={[0, h - bend, hw - bend]} rotation={[0, -Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[bend, r, 12, 16, Math.PI / 2]} />
      </mesh>
      <mesh material={pipe} position={[0, h - bend, -hw + bend]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[bend, r, 12, 16, Math.PI / 2]} />
      </mesh>

      <mesh geometry={meshGeo.baseTube} material={white} />
      <mesh geometry={meshGeo.topTube} material={white} />
      {meshGeo.cap0 ? <mesh geometry={meshGeo.cap0} material={white} /> : null}
      {meshGeo.cap1 ? <mesh geometry={meshGeo.cap1} material={white} /> : null}

      <mesh material={pipe} position={[0, 0, hw]}>
        <sphereGeometry args={[join, 8, 8]} />
      </mesh>
      <mesh material={pipe} position={[0, 0, -hw]}>
        <sphereGeometry args={[join, 8, 8]} />
      </mesh>

      <mesh geometry={meshGeo.shell} material={meshMat} />
      <mesh geometry={meshGeo.top} material={meshMat} />
    </group>
  );
}

const drillCardGeo = new THREE.BoxGeometry(1, 0.012, 1);

function DrillCards() {
  const mode = useGame((s) => s.clockMode);
  const root = useRef<THREE.Group>(null);
  const pool = useRef<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[]>([]);
  useLayoutEffect(
    () => () => {
      for (const slot of pool.current) slot.mat.dispose();
    },
    [],
  );
  useFrame(() => {
    const parent = root.current;
    if (!parent) return;
    const cards = mode === "drill" || mode === "scrimmage" ? world.drillCards : [];
    while (pool.current.length < cards.length) {
      const mat = new THREE.MeshBasicMaterial({
        color: "#236192",
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
      const mesh = new THREE.Mesh(drillCardGeo, mat);
      parent.add(mesh);
      pool.current.push({ mesh, mat });
    }
    for (let i = 0; i < pool.current.length; i++) {
      const slot = pool.current[i]!;
      const c = cards[i];
      if (!c) {
        slot.mesh.visible = false;
        continue;
      }
      const fade = drillFade(c.age);
      slot.mesh.visible = fade > 0.02;
      slot.mesh.position.set(c.x, c.y, c.z);
      slot.mesh.rotation.set(c.rx, c.ry, c.rz);
      slot.mesh.scale.set(c.w, 1, c.h);
      slot.mat.color.set(c.pts === 20 ? "#5a1021" : "#236192");
      slot.mat.opacity = fade;
      slot.mat.depthWrite = fade > 0.92;
    }
  });
  return <group ref={root} />;
}

function DrillTargets() {
  const mode = useGame((s) => s.clockMode);
  const count = useGame((s) => s.drillTargets);
  const mesh = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    if (mode !== "drill") return;
    const targets = drillTargetList();
    for (let i = 0; i < targets.length; i++) {
      const g = mesh.current[i];
      if (!g) continue;
      g.visible = !world.drillGone[i];
    }
  });
  if (mode !== "drill") return null;
  const targets = drillTargetList();
  const { cols, rows } = drillGrid();
  const hw = GOAL_W / 2;
  const colW = GOAL_W / cols;
  const rowH = GOAL_H / rows;
  return (
    <group key={count} position={[GOAL_LINE_X, 0, 0]}>
      {targets.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            mesh.current[i] = el;
          }}
          position={[-0.05, (t.row + 0.5) * rowH, -hw + (t.col + 0.5) * colW]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[colW * 0.88, rowH * 0.88]} />
          <meshBasicMaterial
            color={t.pts === 20 ? "#5a1021" : "#236192"}
            transparent
            opacity={0.85}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function ScrimmageBoard({
  team,
  count,
  meshes,
}: {
  team: "home" | "away";
  count: DrillTargets;
  meshes: { current: (THREE.Mesh | null)[] };
}) {
  const { cols, rows, list } = targetBoard(count);
  const hw = GOAL_W / 2;
  const colW = GOAL_W / cols;
  const rowH = GOAL_H / rows;
  const netX = defendDir(team) * GOAL_LINE_X;
  const towardCenter = -Math.sign(netX) * 0.05;
  return (
    <group position={[netX, 0, 0]}>
      {list.map((t, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          position={[towardCenter, (t.row + 0.5) * rowH, -hw + (t.col + 0.5) * colW]}
          rotation={[0, -Math.PI / 2, 0]}
        >
          <planeGeometry args={[colW * 0.88, rowH * 0.88]} />
          <meshBasicMaterial
            color="#236192"
            transparent
            opacity={0.85}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

function ScrimmageTargets() {
  const mode = useGame((s) => s.clockMode);
  const homeCount = useGame((s) => s.scrimmageHomeTargets);
  const awayCount = useGame((s) => s.scrimmageAwayTargets);
  const homeMesh = useRef<(THREE.Mesh | null)[]>([]);
  const awayMesh = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    if (mode !== "scrimmage") return;
    const home = targetBoard(homeCount).list;
    for (let i = 0; i < home.length; i++) {
      const g = homeMesh.current[i];
      if (g) g.visible = !world.scrimmageHomeGone[i];
    }
    const away = targetBoard(awayCount).list;
    for (let i = 0; i < away.length; i++) {
      const g = awayMesh.current[i];
      if (g) g.visible = !world.scrimmageAwayGone[i];
    }
  });
  if (mode !== "scrimmage") return null;
  return (
    <group>
      <ScrimmageBoard key={`home-${homeCount}`} team="home" count={homeCount} meshes={homeMesh} />
      <ScrimmageBoard key={`away-${awayCount}`} team="away" count={awayCount} meshes={awayMesh} />
    </group>
  );
}

/** Bottom sits on y = 0. Local +x runs from the start height `h0` to the end height `h1`. */
function taperedGlassGeometry(len: number, h0: number, h1: number): THREE.BufferGeometry {
  const hx = len / 2;
  const tz = RINK_GLASS_THICK / 2;
  const position = new Float32Array([
    -hx, 0, -tz,
    hx, 0, -tz,
    hx, 0, tz,
    -hx, 0, tz,
    -hx, h0, -tz,
    hx, h1, -tz,
    hx, h1, tz,
    -hx, h0, tz,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geo.setIndex([
    3, 2, 6, 3, 6, 7, 0, 4, 5, 0, 5, 1, 0, 3, 7, 0, 7, 4, 1, 5, 6, 1, 6, 2, 0, 1, 2, 0, 2, 3, 4, 7, 6,
    4, 6, 5,
  ]);
  geo.computeVertexNormals();
  return geo;
}

function GlassPanel({ wall }: { wall: GlassWallSpan }) {
  const flat = Math.abs(wall.h0 - wall.h1) < 1e-4;
  const geo = useMemo(
    () => (flat ? null : taperedGlassGeometry(wall.len, wall.h0, wall.h1)),
    [flat, wall.len, wall.h0, wall.h1],
  );
  useLayoutEffect(() => () => geo?.dispose(), [geo]);
  const material = (
    <meshPhysicalMaterial
      color="#cfe0ee"
      transparent
      opacity={0.07}
      roughness={0.08}
      metalness={0.08}
      depthWrite={false}
      side={THREE.DoubleSide}
    />
  );
  if (flat) {
    return (
      <mesh position={[wall.x, BOARD_H + wall.h0 / 2, wall.z]} rotation={[0, wall.rot, 0]}>
        <boxGeometry args={[wall.len + RINK_GLASS_SEAM, wall.h0, RINK_GLASS_THICK]} />
        {material}
      </mesh>
    );
  }
  return (
    <mesh geometry={geo ?? undefined} position={[wall.x, BOARD_H, wall.z]} rotation={[0, wall.rot, 0]}>
      {material}
    </mesh>
  );
}

export function Rink() {
  const homeKit = useGame((s) => s.homeKit);
  const clockMode = useGame((s) => s.clockMode);
  const home = kitById(homeKit);
  const showBlue = clockMode !== "roller";
  const nzDots = clockMode !== "roller";
  const gapCenterLine = useIceLogoUrl() !== null;

  const ice = useMemo(
    () => createIceTextures(showBlue, nzDots, gapCenterLine),
    [showBlue, nzDots, gapCenterLine],
  );
  useLayoutEffect(
    () => () => {
      ice.map.dispose();
      ice.roughnessMap.dispose();
    },
    [ice],
  );

  const iceGeo = useMemo(() => {
    const s = roundedRectShape(RINK_L, RINK_W, CORNER_R, 0.02);
    const g = new THREE.ShapeGeometry(s, 24);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(
        i,
        (uv.getX(i) + RINK_L / 2) / RINK_L,
        (uv.getY(i) + RINK_W / 2) / RINK_W,
      );
    }
    uv.needsUpdate = true;
    g.rotateX(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, []);

  const kickGeo = useMemo(() => extrudeRing(-0.22, 0.01, KICK_H), []);
  const boardGeo = useMemo(() => extrudeRing(-0.2, 0.02, BOARD_H - KICK_H), []);
  const ribbonGeo = useMemo(() => extrudeRing(-0.21, 0.0, RIBBON_H), []);
  const homeRibbon = home.ribbon || kitById(0).ribbon;
  const capMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: homeRibbon,
        roughness: 0.55,
        metalness: 0,
        emissive: 0x000000,
        emissiveIntensity: 0,
      }),
    [homeRibbon],
  );
  useLayoutEffect(() => {
    capMat.color.set(homeRibbon);
    capMat.emissive.setHex(0x000000);
    capMat.emissiveIntensity = 0;
    capMat.needsUpdate = true;
    return () => capMat.dispose();
  }, [capMat, homeRibbon]);
  const glassWalls = useMemo(() => glassWallLayout(rinkPerimeter(RINK_GLASS_INSET, 96)), []);

  const iceMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: ice.map,
      color: "#ffffff",
      roughness: 0.26,
      metalness: 0.02,
      envMapIntensity: 0.55,
      side: THREE.DoubleSide,
    });
    const wearMap = iceWearTexture();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.wearMap = { value: wearMap };
      if (!shader.fragmentShader.includes("#include <common>")) return;
      if (!shader.fragmentShader.includes("#include <map_fragment>")) return;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform sampler2D wearMap;")
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
      float hfbWear = texture2D(wearMap, vMapUv).a;
      float hfbIceMin = min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
      float hfbIce = smoothstep(0.62, 0.78, hfbIceMin);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.403, 0.552, 0.671), hfbWear * hfbIce);`,
        );
    };
    mat.customProgramCacheKey = () => "ice-wear-v1";
    return mat;
  }, [ice]);
  useFrame(() => {
    flushIceWear();
  });

  return (
    <group>
      <mesh geometry={iceGeo} material={iceMat} position={[0, 0.012, 0]} />
      <IceLines blue={showBlue} />
      <FaceoffCircles />
      <mesh geometry={kickGeo}>
        <meshStandardMaterial color="#e7b416" roughness={0.45} metalness={0.08} />
      </mesh>
      <mesh geometry={boardGeo} position={[0, KICK_H, 0]}>
        <meshStandardMaterial color="#f2f4f6" roughness={0.55} />
      </mesh>
      <mesh geometry={ribbonGeo} position={[0, BOARD_H - RIBBON_H + 0.008, 0]} material={capMat} />
      <BoardLines blue={showBlue} />
      {glassWalls.map((w, i) => (
        <GlassPanel key={`gw${i}`} wall={w} />
      ))}

      <Goal side={1} />
      <Goal side={-1} />
      <DrillTargets />
      <ScrimmageTargets />
      <DrillCards />
    </group>
  );
}
