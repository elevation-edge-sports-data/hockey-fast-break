import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import {
  createAdTexture,
  createFaceoffDotTexture,
  createIceTextures,
  createNetTexture,
} from "./iceTexture";
import centerIceUrl from "../../logo-center-ice.png";
import {
  BLUE_LINE_W,
  BLUE_X,
  BOARD_H,
  boardLineFaces,
  CENTER_LINE_W,
  CORNER_R,
  CREASE_R,
  DOT_R,
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
  GLASS_H,
  benchGlassOpen,
  GOAL_D,
  GOAL_D_TOP,
  GOAL_PIPE_R,
  GOAL_H,
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
import { useGame } from "./store";
import { drillFade, drillGrid, drillTargetList, world } from "./sim";

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

function IceStripe({
  x,
  color,
  width,
}: {
  x: number;
  color: string;
  width: number;
}) {
  const span = Math.max(1, iceWidthAtX(x) - 0.18);
  return (
    <mesh position={[x, 0.024, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[width, span]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function FaceoffCircle({ x, z, r = FACEOFF_R }: { x: number; z: number; r?: number }) {
  return (
    <mesh position={[x, 0.026, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[r, r + 0.09, 72]} />
      <meshBasicMaterial color={LINE_RED} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

function MarkLine({
  x,
  z,
  alongX,
  alongZ,
}: {
  x: number;
  z: number;
  alongX: number;
  alongZ: number;
}) {
  return (
    <mesh position={[x, 0.027, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[Math.max(alongX, MARK_W), Math.max(alongZ, MARK_W)]} />
      <meshBasicMaterial color={LINE_RED} toneMapped={false} />
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
            z={z + szn * (FACEOFF_R + HASH_MARK_L / 2)}
            alongX={MARK_W}
            alongZ={HASH_MARK_L}
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
            />,
            <MarkLine
              key={`la${sxn}${szn}`}
              x={xInner}
              z={z + szn * (halfGap + L_ARM / 2)}
              alongX={MARK_W}
              alongZ={L_ARM}
            />,
          ];
        }),
      )}
    </group>
  );
}

function CenterIceLogo() {
  const mat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: "#e4edf4",
        toneMapped: false,
        depthWrite: false,
      }),
    [],
  );
  useLayoutEffect(() => {
    let alive = true;
    const tex = new THREE.TextureLoader().load(centerIceUrl, () => {
      if (!alive) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      mat.map = tex;
      mat.color.set("#ffffff");
      mat.needsUpdate = true;
    });
    return () => {
      alive = false;
      mat.map = null;
      mat.needsUpdate = true;
      tex.dispose();
    };
  }, [mat]);
  useLayoutEffect(() => () => mat.dispose(), [mat]);
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
    <mesh position={[x, 0.028, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[DOT_R, 48]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  );
}

function FaceoffCircles() {
  const map = useMemo(() => createFaceoffDotTexture(), []);
  useLayoutEffect(() => () => map.dispose(), [map]);
  const scrimmage = useGame((s) => s.clockMode) === "scrimmage";
  const dots: readonly (readonly [number, number])[] = scrimmage
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
      <CenterIceLogo />
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

function Crease({ side }: { side: 1 | -1 }) {
  const geo = useMemo(() => creaseGeo(side), [side]);
  const outline = useMemo(() => {
    const gx = GOAL_LINE_X * side;
    const dir = -side;
    const hw = Math.max(GOAL_W / 2, CREASE_R * 0.66);
    const r = CREASE_R;
    const pts: THREE.Vector3[] = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const z = -hw + (2 * hw * i) / steps;
      const xOff = Math.sqrt(Math.max(0, r * r - z * z));
      pts.push(new THREE.Vector3(gx + dir * xOff, 0.029, z));
    }
    pts.push(new THREE.Vector3(gx, 0.029, hw));
    pts.push(new THREE.Vector3(gx, 0.029, -hw));
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [side]);
  useLayoutEffect(
    () => () => {
      geo.dispose();
      outline.dispose();
    },
    [geo, outline],
  );
  return (
    <group>
      <mesh geometry={geo} position={[0, 0.02, 0]}>
        <meshBasicMaterial color="#5eb6ff" transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
      <lineLoop geometry={outline}>
        <lineBasicMaterial color={LINE_RED} toneMapped={false} />
      </lineLoop>
    </group>
  );
}

function IceLines({ blue }: { blue: boolean }) {
  return (
    <group>
      <Crease side={-1} />
      <Crease side={1} />
      <IceStripe x={-GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} />
      <IceStripe x={GOAL_LINE_X} color={LINE_RED} width={GOAL_LINE_W} />
      {blue ? (
        <>
          <IceStripe x={-BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
          <IceStripe x={BLUE_X} color={LINE_BLUE} width={BLUE_LINE_W} />
        </>
      ) : null}
      <IceStripe x={0} color={LINE_RED} width={CENTER_LINE_W} />
    </group>
  );
}

const STRIPE_T = 0.05;
const STRIPE_PROUD = 0.016;
const BOARD_FACE_IN = 0.02;
const KICK_FACE_IN = 0.01;

function BoardPaint({ x, color, width }: { x: number; color: string; width: number }) {
  const proud = STRIPE_PROUD + STRIPE_T / 2;
  const kick = boardLineFaces(x, KICK_FACE_IN, proud);
  const boards = boardLineFaces(x, BOARD_FACE_IN, proud);
  const kickH = Math.max(0.08, KICK_H - 0.012);
  const boardTop = BOARD_H - 0.006;
  const boardH = Math.max(0.2, boardTop - (KICK_H - 0.01));
  const band = (faces: { x: number; z: number; rot: number }[], y: number, h: number, key: string) =>
    faces.map((face, i) => (
      <group key={`${key}${i}`} position={[face.x, y, face.z]} rotation={[0, face.rot, 0]}>
        <mesh position={[0, 0, 0.01]}>
          <boxGeometry args={[width, h + 0.012, STRIPE_T * 0.62]} />
          <meshBasicMaterial color="#121212" toneMapped={false} />
        </mesh>
        <mesh>
          <boxGeometry args={[width, h, STRIPE_T]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      </group>
    ));
  return (
    <group>
      {band(kick, 0.006 + kickH / 2, kickH, "k")}
      {band(boards, KICK_H - 0.01 + boardH / 2, boardH, "b")}
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

function cagePoint(dir: 1 | -1, t: number, y: number, depth: number, hw: number) {
  return new THREE.Vector3(dir * depth * Math.sin(t), y, hw * Math.cos(t));
}

function goalMesh(dir: 1 | -1) {
  const h = GOAL_H;
  const hw = GOAL_W / 2;
  const r = GOAL_PIPE_R;
  const segs = 18;
  const ySegs = 5;
  const shell = new THREE.BufferGeometry();
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= ySegs; j++) {
    const yf = j / ySegs;
    const y = r + (h - r) * yf;
    const depth = GOAL_D * (1 - yf * (1 - GOAL_D_TOP / GOAL_D));
    for (let i = 0; i <= segs; i++) {
      const t = (i / segs) * Math.PI;
      const p = cagePoint(dir, t, y, depth, hw);
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
    const t = (i / segs) * Math.PI;
    const p = cagePoint(dir, t, h, GOAL_D_TOP, hw);
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

  const basePts: THREE.Vector3[] = [];
  const topPts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * Math.PI;
    basePts.push(cagePoint(dir, t, r, GOAL_D, hw));
    topPts.push(cagePoint(dir, t, h, GOAL_D_TOP, hw));
  }
  const baseTube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(basePts), segs, r, 8, false);
  const topTube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topPts), segs, r, 8, false);
  return { shell, top, baseTube, topTube, basePts, topPts };
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
      }),
    [],
  );
  const r = GOAL_PIPE_R;
  const hw = GOAL_W / 2;
  const h = GOAL_H;
  const join = r * 1.15;
  const mid = Math.floor(meshGeo.basePts.length / 2);
  const a = meshGeo.basePts[mid];
  const b = meshGeo.topPts[mid];
  const back = a && b ? a.clone().add(b).multiplyScalar(0.5) : null;
  const backLen = a && b ? a.distanceTo(b) : 0;
  const backQ =
    a && b
      ? new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          b.clone().sub(a).normalize(),
        )
      : null;

  return (
    <group position={[x, 0, 0]}>
      <mesh material={pipe} position={[0, h / 2, hw]} castShadow>
        <cylinderGeometry args={[r, r, h, 12]} />
      </mesh>
      <mesh material={pipe} position={[0, h / 2, -hw]} castShadow>
        <cylinderGeometry args={[r, r, h, 12]} />
      </mesh>
      <mesh material={pipe} position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[r, r, GOAL_W + r * 2, 12]} />
      </mesh>

      <mesh geometry={meshGeo.baseTube} material={white} />
      <mesh geometry={meshGeo.topTube} material={white} />
      {back && backQ ? (
        <mesh material={white} position={[back.x, back.y, back.z]} quaternion={backQ}>
          <cylinderGeometry args={[r * 0.85, r * 0.85, backLen, 8]} />
        </mesh>
      ) : null}

      <mesh material={pipe} position={[0, 0, hw]}>
        <sphereGeometry args={[join, 8, 8]} />
      </mesh>
      <mesh material={pipe} position={[0, 0, -hw]}>
        <sphereGeometry args={[join, 8, 8]} />
      </mesh>
      <mesh material={pipe} position={[0, h, hw]}>
        <sphereGeometry args={[join, 8, 8]} />
      </mesh>
      <mesh material={pipe} position={[0, h, -hw]}>
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
    const cards = mode === "drill" ? world.drillCards : [];
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

export function Rink() {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const clockMode = useGame((s) => s.clockMode);
  const home = kitById(homeKit);
  const away = kitById(awayKit);
  const showBlue = clockMode !== "scrimmage";
  const nzDots = clockMode !== "scrimmage";

  const ice = useMemo(() => createIceTextures(showBlue, nzDots), [showBlue, nzDots]);
  const adsHome = useMemo(() => createAdTexture(home.ribbon, home.yoke), [home]);
  const adsAway = useMemo(() => createAdTexture(away.ribbon, away.yoke), [away]);

  useLayoutEffect(
    () => () => {
      ice.map.dispose();
      ice.roughnessMap.dispose();
      adsHome.dispose();
      adsAway.dispose();
    },
    [ice, adsHome, adsAway],
  );

  const iceGeo = useMemo(() => {
    const s = roundedRectShape(RINK_L, RINK_W, CORNER_R, 0.02);
    const g = new THREE.ShapeGeometry(s, 24);
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
  const posts = useMemo(
    () => rinkPerimeter(0.06, 64).filter((p) => !benchGlassOpen(p.x, p.z)),
    [],
  );
  const glassWalls = useMemo(() => {
    const ring = rinkPerimeter(-0.06, 96);
    const out: { x: number; z: number; len: number; rot: number }[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      if (benchGlassOpen(mx, mz)) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.08) continue;
      out.push({ x: mx, z: mz, len, rot: Math.atan2(-dz, dx) });
    }
    return out;
  }, []);

  const iceMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: ice.map,
        color: "#ffffff",
        roughness: 0.26,
        metalness: 0.02,
        envMapIntensity: 0.55,
        side: THREE.DoubleSide,
      }),
    [ice],
  );

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
        <mesh key={`gw${i}`} position={[w.x, BOARD_H + GLASS_H / 2, w.z]} rotation={[0, w.rot, 0]}>
          <boxGeometry args={[w.len + 0.04, GLASS_H, 0.07]} />
          <meshPhysicalMaterial
            color="#cfe0ee"
            transparent
            opacity={0.07}
            roughness={0.08}
            metalness={0.08}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}

      {posts.map((p, i) => (
        <mesh key={i} position={[p.x, BOARD_H + GLASS_H / 2, p.z]}>
          <boxGeometry args={[0.05, GLASS_H, 0.05]} />
          <meshStandardMaterial color="#9aa7b4" metalness={0.65} roughness={0.28} />
        </mesh>
      ))}

      <mesh position={[0, BOARD_H * 0.55, RINK_W / 2 + 0.22]}>
        <boxGeometry args={[RINK_L * 0.42, 0.7, 0.06]} />
        <meshStandardMaterial map={adsHome} roughness={0.55} />
      </mesh>
      <mesh position={[0, BOARD_H * 0.55, -RINK_W / 2 - 0.22]} rotation={[0, Math.PI, 0]}>
        <boxGeometry args={[RINK_L * 0.42, 0.7, 0.06]} />
        <meshStandardMaterial map={adsAway} roughness={0.55} />
      </mesh>

      <Goal side={1} />
      <Goal side={-1} />
      <DrillTargets />
      <DrillCards />
    </group>
  );
}
