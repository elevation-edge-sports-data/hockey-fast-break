import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  bundledFormationEntries,
  classicFormationEye,
  entriesFromFile,
  formationOrbitFromEye,
  mountFormation,
  readFormationLibrary,
  writeFormationLibrary,
  type FormationEntry,
  type FormationFrame,
} from "./formationLibrary";
import { PlayerMesh, PuckMesh } from "./PlayerMesh";
import { setPoseInfer } from "./poseOverrides";
import { inferNamedPose } from "./poseOverrideInfer";
import { Rink } from "./Rink.tsx";
import { world } from "./sim";
import { useGame } from "./store";
import { kitWornColors, UNIFORMS } from "./uniforms";

setPoseInfer(inferNamedPose);

type LookAt = { kind: "puck" } | { kind: "skater"; index: number };

function lookPoint(at: LookAt): { x: number; y: number; z: number } {
  if (at.kind === "skater") {
    const s = world.skaters[at.index];
    if (s) return { x: s.x, y: 1.05, z: s.z };
  }
  return { x: world.puck.x, y: Math.max(0.4, world.puck.y), z: world.puck.z };
}

function nearer(ray: THREE.Ray, sphere: THREE.Sphere, hit: THREE.Vector3, bestDist: number): number | null {
  const point = ray.intersectSphere(sphere, hit);
  if (!point) return null;
  const dist = ray.origin.distanceTo(point);
  return dist < bestDist ? dist : null;
}

function pickBody(ray: THREE.Ray): LookAt | null {
  const hit = new THREE.Vector3();
  let bestDist = Infinity;
  let best: LookAt | null = null;
  const puckDist = nearer(ray, new THREE.Sphere(new THREE.Vector3(world.puck.x, world.puck.y, world.puck.z), 0.35), hit, bestDist);
  if (puckDist !== null) {
    bestDist = puckDist;
    best = { kind: "puck" };
  }
  for (let i = 0; i < world.skaters.length; i++) {
    const s = world.skaters[i]!;
    const dist = nearer(ray, new THREE.Sphere(new THREE.Vector3(s.x, 1, s.z), 0.7), hit, bestDist);
    if (dist !== null) {
      bestDist = dist;
      best = { kind: "skater", index: i };
    }
  }
  return best;
}

function FormationCamera({
  at,
  onPick,
}: {
  at: LookAt;
  onPick: MutableRefObject<(hit: LookAt | null) => void>;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const orbit = useRef({ theta: 0, phi: 0.97, radius: 16 });
  const adjusted = useRef(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const atRef = useRef(at);
  atRef.current = at;

  const holdUserAngle = () => {
    if (adjusted.current) return;
    adjusted.current = true;
    const look = lookPoint(atRef.current);
    const seeded = formationOrbitFromEye(look, classicFormationEye(look));
    orbit.current.theta = seeded.theta;
    orbit.current.phi = seeded.phi;
    orbit.current.radius = seeded.radius;
  };

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, moved: false };
    };
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.moved && dx * dx + dy * dy < 16) return;
      d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      holdUserAngle();
      const o = orbit.current;
      o.theta += dx * 0.008;
      o.phi = Math.max(0.12, Math.min(1.45, o.phi - dy * 0.006));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d || d.moved) return;
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const caster = new THREE.Raycaster();
      caster.setFromCamera(ndc, camera);
      onPick.current(pickBody(caster.ray));
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      holdUserAngle();
      const o = orbit.current;
      o.radius = Math.max(4.2, Math.min(120, o.radius + e.deltaY * 0.02));
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      el.removeEventListener("wheel", wheel);
    };
  }, [camera, gl, onPick]);

  useFrame(() => {
    const look = lookPoint(atRef.current);
    if (!adjusted.current) {
      const eye = classicFormationEye(look);
      camera.up.set(eye.atk, 0, 0);
      camera.position.set(eye.x, eye.y, eye.z);
    } else {
      const o = orbit.current;
      const sp = Math.sin(o.phi);
      const cp = Math.cos(o.phi);
      camera.up.set(0, 1, 0);
      camera.position.set(
        look.x + o.radius * sp * Math.cos(o.theta),
        look.y + o.radius * cp,
        look.z + o.radius * sp * Math.sin(o.theta),
      );
    }
    camera.lookAt(look.x, look.y, look.z);
    if (camera instanceof THREE.PerspectiveCamera && Math.abs(camera.fov - 50) > 0.2) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}

function FormationStage({
  frame,
  at,
  onPick,
}: {
  frame: FormationFrame;
  at: LookAt;
  onPick: (hit: LookAt | null) => void;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const [rev, setRev] = useState(0);

  useEffect(() => {
    const release = mountFormation(frame.adjusted);
    setRev((n) => n + 1);
    return release;
  }, [frame]);

  const look = lookPoint(at);
  return (
    <>
      <color attach="background" args={["#0c121c"]} />
      <hemisphereLight args={["#d7e8f4", "#1a2838", 0.7]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[18, 32, 10]} intensity={1.5} />
      <Rink />
      {world.skaters.map((s, i) => (
        <PlayerMesh
          key={`${rev}-${i}-${s.id}-${s.side === "home" ? homeKit : awayKit}`}
          index={i}
          kitId={s.side === "home" ? homeKit : awayKit}
        />
      ))}
      <PuckMesh />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[look.x, 0.06, look.z]}>
        <ringGeometry args={[0.42, 0.56, 28]} />
        <meshBasicMaterial color="#f4f4f4" />
      </mesh>
      <FormationCamera at={at} onPick={pickRef} />
    </>
  );
}

function libraryEntries(saved: FormationEntry[] = [], retired: string[] = []): FormationEntry[] {
  const bundled = bundledFormationEntries().filter(
    (entry) => !retired.includes(entry.name) && !saved.some((item) => item.name === entry.name),
  );
  const local = readFormationLibrary().filter(
    (entry) =>
      !retired.includes(entry.name) &&
      !saved.some((item) => item.name === entry.name) &&
      !bundled.some((item) => item.name === entry.name),
  );
  return [...saved, ...bundled, ...local];
}

function KitSwatch({ id, selected, onPick }: { id: number; selected: boolean; onPick: (id: number) => void }) {
  const worn = kitWornColors(UNIFORMS[id]!);
  return (
    <button
      type="button"
      aria-label={`Kit ${id + 1}`}
      aria-pressed={selected}
      onClick={() => onPick(id)}
      className={`uni-swatch${selected ? " is-on" : ""}`}
    >
      <span style={{ background: worn.helmet }} />
      <span style={{ background: worn.jersey }} />
      <span style={{ background: worn.pants }} />
    </button>
  );
}

function FormationKits() {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const setHomeKit = useGame((s) => s.setHomeKit);
  const setAwayKit = useGame((s) => s.setAwayKit);
  const pickHome = (id: number) => {
    if (id === awayKit) {
      const prev = homeKit;
      setHomeKit(id);
      setAwayKit(prev);
      return;
    }
    setHomeKit(id);
  };
  const pickAway = (id: number) => {
    if (id === homeKit) {
      const prev = awayKit;
      setHomeKit(prev);
      setAwayKit(id);
      return;
    }
    setAwayKit(id);
  };
  return (
    <div className="formation-kits">
      <div className="uni-side">
        <div className="uni-side-head">
          <span>You</span>
        </div>
        <div className="uni-row">
          {UNIFORMS.map((u) => (
            <KitSwatch key={u.id} id={u.id} selected={homeKit === u.id} onPick={pickHome} />
          ))}
        </div>
      </div>
      <div className="uni-side">
        <div className="uni-side-head">
          <span>CPU</span>
        </div>
        <div className="uni-row">
          {UNIFORMS.map((u) => (
            <KitSwatch key={u.id} id={u.id} selected={awayKit === u.id} onPick={pickAway} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormationLibraryView() {
  const [saved, setSaved] = useState<FormationEntry[]>([]);
  const [retired, setRetired] = useState<string[]>([]);
  const [entries, setEntries] = useState<FormationEntry[]>(() => libraryEntries());
  const [selected, setSelected] = useState<string | null>(() => libraryEntries()[0]?.id ?? null);
  const [at, setAt] = useState<LookAt>({ kind: "puck" });
  const [notice, setNotice] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const chosen = entries.find((entry) => entry.id === selected) ?? null;

  useEffect(() => {
    const entry = entriesRef.current.find((item) => item.id === selected);
    setFileName(entry ? entry.name.replace(/\.json$/i, "") : "");
  }, [selected]);

  const choose = (id: string) => {
    setSelected(id);
    setAt({ kind: "puck" });
    setNotice(null);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: FormationEntry[] = [];
    let n = 0;
    let problem: string | null = null;
    for (const file of list) {
      const text = await file.text();
      const parsed = entriesFromFile(file.name, text, () => `${file.name}-${n++}-${crypto.randomUUID()}`);
      if (typeof parsed === "string") {
        problem = parsed;
        continue;
      }
      added.push(...parsed);
    }
    if (!added.length) {
      setNotice(problem);
      return;
    }
    const stored = [...readFormationLibrary(), ...added];
    setNotice(writeFormationLibrary(stored) ?? problem);
    const next = libraryEntries(saved, retired);
    setEntries(next);
    const first = next.find((entry) => entry.id === added[0]?.id);
    if (first) choose(first.id);
  };

  const remove = (id: string) => {
    const stored = readFormationLibrary().filter((entry) => entry.id !== id);
    const err = writeFormationLibrary(stored);
    setNotice(err);
    const next = libraryEntries(saved, retired);
    setEntries(next);
    if (selected === id) {
      setSelected(next[0]?.id ?? null);
      setAt({ kind: "puck" });
    }
  };

  const saveCurrent = async () => {
    if (!chosen || !fileName.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/formations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fileName,
          frame: chosen.frame,
          from: chosen.id.startsWith("bundled:") ? chosen.name : undefined,
        }),
      });
    } catch {
      setNotice("Could not save that formation.");
      return;
    }
    if (!res.ok) {
      setNotice("Could not save that formation.");
      return;
    }
    const body = (await res.json()) as { name?: string };
    if (!body.name) {
      setNotice("Could not save that formation.");
      return;
    }
    const entry: FormationEntry = {
      id: `bundled:formations/${body.name}:0`,
      name: body.name,
      frame: chosen.frame,
    };
    if (!chosen.id.startsWith("bundled:")) {
      writeFormationLibrary(readFormationLibrary().filter((item) => item.id !== chosen.id));
    }
    const previous = chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    const nextRetired = previous && !retired.includes(previous) ? [...retired, previous] : retired;
    if (nextRetired !== retired) setRetired(nextRetired);
    const nextSaved = [entry, ...saved.filter((item) => item.name !== entry.name && item.name !== previous)];
    setSaved(nextSaved);
    setEntries(libraryEntries(nextSaved, nextRetired));
    setSelected(entry.id);
    setFileName(body.name.replace(/\.json$/i, ""));
    setNotice(`Saved ${body.name}`);
  };

  return (
    <div className="formation-lib">
      <header className="formation-top">
        <FormationKits />
      </header>
      <aside className="formation-side">
        <p className="eyebrow">Library</p>
        <h1>Formations</h1>
        <button type="button" className="btn-primary" onClick={() => fileRef.current?.click()}>
          Import frame
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          multiple
          hidden
          onChange={(e) => {
            void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="formation-save">
          <input
            aria-label="Formation file name"
            value={fileName}
            placeholder="Name"
            disabled={!chosen}
            onChange={(e) => setFileName(e.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={!chosen || !fileName.trim()} onClick={() => void saveCurrent()}>
            Save
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || chosen.id.startsWith("bundled:")}
            onClick={() => chosen && remove(chosen.id)}
          >
            Remove
          </button>
        </div>
        {notice ? <p className="formation-note">{notice}</p> : null}
        {entries.length ? (
          <ul className="formation-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={entry.id === selected ? "is-on" : ""}
                  onClick={() => choose(entry.id)}
                >
                  <b>{entry.name}</b>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
      <div className="formation-stage">
      {chosen ? (
        <Canvas
          className="rink-canvas"
          shadows={false}
          dpr={[1, 1.25]}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.88 }}
          camera={{ position: [13.2, 9.4, 0], fov: 50, near: 0.15, far: 220 }}
        >
          <FormationStage frame={chosen.frame} at={at} onPick={(hit) => setAt(hit ?? { kind: "puck" })} />
        </Canvas>
      ) : (
        <div className="formation-empty">Import a frame to view it.</div>
      )}
      </div>
    </div>
  );
}
