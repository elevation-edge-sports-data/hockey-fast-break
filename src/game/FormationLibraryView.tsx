import { Canvas } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from "react";
import * as THREE from "three";
import {
  applyFormEdit,
  followFormationMark,
  FormationMarkDriver,
  lookOf,
  takeFormationPick,
} from "./FormationEdit";
import {
  copiesForRightRemove,
  editedFormationName,
  formUndoDepth,
  formationSaveName,
  formationSideOf,
  freshFormHist,
  isEditedFormationName,
  mountFormation,
  type FormationView,
  redoFormEdit,
  undoFormEdit,
  type FormHist,
  bundledFormationEntries,
  deleteRepoJson,
  partitionFormationLibrary,
  entriesFromFile,
  libraryRemoveFile,
  libraryStateAfterDelete,
  retiredRepoFiles,
  nextAfterLeftRemove,
  readFormationLibrary,
  readRetiredFormations,
  writeFormationLibrary,
  writeRetiredFormations,
  type FormationEntry,
  type FormationFrame,
} from "./formationLibrary";
import { IceCross } from "./IceCross";
import { iceMarkAt, type IceMark } from "./iceMark";
import { PlayerMesh, PuckMesh } from "./PlayerMesh";
import { setPoseInfer } from "./poseOverrides";
import { inferNamedPose } from "./poseOverrideInfer";
import { Rink } from "./Rink.tsx";
import { RinkOrbitCamera } from "./RinkOrbitCamera";
import { world } from "./sim";
import { FormationKits } from "./FormationKits";
import { IceGrid } from "./FormationIceGrid";
import { readFormationGrid, writeFormationGrid } from "./iceGrid";
import { useGame } from "./store";

setPoseInfer(inferNamedPose);

function FormationStage({
  frame,
  view,
  hist,
  onDepth,
  editRef,
  grid,
}: {
  frame: FormationFrame;
  view: FormationView;
  hist: MutableRefObject<FormHist>;
  onDepth: (undo: number, redo: number) => void;
  editRef: MutableRefObject<{ undo: () => void; redo: () => void }>;
  grid: boolean;
}) {
  const homeKit = useGame((s) => s.homeKit);
  const awayKit = useGame((s) => s.awayKit);
  const [rev, setRev] = useState(0);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const viewRef = useRef(view);
  viewRef.current = view;
  const onDepthRef = useRef(onDepth);
  onDepthRef.current = onDepth;
  const shown = formationSideOf(frame, view);
  const mark = useRef<IceMark>(iceMarkAt(shown.puck.x, shown.puck.z));
  const orbit = useRef({ theta: 0, phi: 0.97, radius: 16 });
  const adjusted = useRef(false);
  const viewRadius = useRef(16);
  const basis = useRef({ rx: 0, rz: 1, fx: 1, fz: 0 });
  editRef.current = {
    undo() {
      const g = undoFormEdit(hist.current);
      if (g) applyFormEdit(frameRef.current, viewRef.current, g, false);
      onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
    },
    redo() {
      const g = redoFormEdit(hist.current);
      if (g) applyFormEdit(frameRef.current, viewRef.current, g, true);
      onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
    },
  };

  useLayoutEffect(() => {
    const side = formationSideOf(frame, view);
    const release = mountFormation(side);
    mark.current = iceMarkAt(side.puck.x, side.puck.z);
    hist.current = freshFormHist();
    onDepthRef.current(0, 0);
    setRev((n) => n + 1);
    return release;
  }, [frame, hist, view]);

  return (
    <>
      <color attach="background" args={["#0c121c"]} />
      <hemisphereLight args={["#d7e8f4", "#1a2838", 0.7]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[18, 32, 10]} intensity={1.5} />
      <Rink />
      {grid ? <IceGrid /> : null}
      <FormationMarkDriver
        mark={mark}
        frameRef={frameRef}
        hist={hist}
        viewRef={viewRef}
        onDepth={(undo, redo) => onDepthRef.current(undo, redo)}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
      />
      {world.skaters.map((s, i) => (
        <PlayerMesh
          key={`${rev}-${i}-${s.id}-${s.side === "home" ? homeKit : awayKit}`}
          index={i}
          kitId={s.side === "home" ? homeKit : awayKit}
        />
      ))}
      <PuckMesh />
      <RinkOrbitCamera
        getLook={() => {
          const cursor = mark.current;
          followFormationMark(cursor);
          return lookOf(cursor);
        }}
        orbit={orbit}
        adjusted={adjusted}
        viewRadius={viewRadius}
        basis={basis}
        onPick={(hit) => {
          takeFormationPick(mark.current, hit);
          onDepthRef.current(formUndoDepth(hist.current), hist.current.redo.length);
        }}
      />
      <IceCross mark={mark} />
    </>
  );
}

function VersionSwitch({
  frame,
  view,
  onView,
  disabled = false,
}: {
  frame: FormationFrame | undefined;
  view: FormationView;
  onView: (next: FormationView) => void;
  disabled?: boolean;
}) {
  if (!frame?.original || !frame.adjusted) return null;
  return (
    <div className="formation-version" role="group" aria-label="Version">
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "original" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "original"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("original");
        }}
      >
        Original
      </button>
      <button
        type="button"
        className={`btn-ghost${!disabled && view === "adjusted" ? " is-on" : ""}`}
        aria-pressed={!disabled && view === "adjusted"}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onView("adjusted");
        }}
      >
        Adjusted
      </button>
    </div>
  );
}

function FormationList({
  rows,
  selected,
  onChoose,
}: {
  rows: FormationEntry[];
  selected: string | null;
  onChoose: (id: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <ul className="formation-list">
      {rows.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className={entry.id === selected ? "is-on" : ""}
            onClick={() => onChoose(entry.id)}
          >
            <b>{entry.name}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}

function libraryEntries(saved: FormationEntry[] = [], retired: string[] = []): FormationEntry[] {
  const { imported, repo } = partitionFormationLibrary(
    readFormationLibrary(),
    bundledFormationEntries(),
    saved,
    retired,
  );
  return [...repo, ...imported];
}

export function FormationLibraryView() {
  const [saved, setSaved] = useState<FormationEntry[]>([]);
  const [retired, setRetired] = useState<string[]>(() => readRetiredFormations());
  const [entries, setEntries] = useState<FormationEntry[]>(() =>
    libraryEntries([], readRetiredFormations()),
  );
  const [selected, setSelected] = useState<string | null>(
    () => libraryEntries([], readRetiredFormations())[0]?.id ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [importName, setImportName] = useState("");
  const [repoName, setRepoName] = useState("");
  const [depth, setDepth] = useState({ undo: 0, redo: 0 });
  const [view, setView] = useState<FormationView>("adjusted");
  const [gridOn, setGridOn] = useState(() => readFormationGrid());
  const fileRef = useRef<HTMLInputElement>(null);
  const hist = useRef(freshFormHist());
  const editRef = useRef({ undo: () => {}, redo: () => {} });
  const pristineRef = useRef<FormationFrame | null>(null);
  const pristineId = useRef<string | null>(null);
  const forkedRef = useRef<string | null>(null);
  const savedRef = useRef(saved);
  const retiredRef = useRef(retired);
  savedRef.current = saved;
  retiredRef.current = retired;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const chosen = entries.find((entry) => entry.id === selected) ?? null;
  const imported = entries.filter((entry) => !entry.id.startsWith("bundled:"));
  const repo = entries.filter((entry) => entry.id.startsWith("bundled:"));

  const rememberEdit = (undo: number, redo: number) => {
    const entry = entriesRef.current.find((item) => item.id === selected);
    if (!entry || (undo === 0 && redo === 0)) return;
    if (isEditedFormationName(entry.name)) {
      if (!entry.id.startsWith("bundled:")) {
        writeFormationLibrary(
          readFormationLibrary().map((item) => (item.id === entry.id ? { ...item, frame: entry.frame } : item)),
        );
      }
      return;
    }
    if (forkedRef.current === entry.id) return;
    const pristine = pristineRef.current;
    if (!pristine || pristineId.current !== entry.id) return;
    forkedRef.current = entry.id;
    const copy: FormationEntry = {
      id: `edited-${crypto.randomUUID()}`,
      name: editedFormationName(entry.name),
      frame: entry.frame,
    };
    let local = readFormationLibrary();
    if (!entry.id.startsWith("bundled:")) {
      local = local.map((item) =>
        item.id === entry.id ? { ...item, frame: structuredClone(pristine) } : item,
      );
    }
    const err = writeFormationLibrary([...local.filter((item) => item.id !== copy.id), copy]);
    if (err) {
      forkedRef.current = null;
      setNotice(err);
      return;
    }
    let nextSaved = savedRef.current;
    if (nextSaved.some((item) => item.id === entry.id || item.frame === entry.frame)) {
      nextSaved = nextSaved.map((item) =>
        item.id === entry.id || item.frame === entry.frame
          ? { ...item, frame: structuredClone(pristine) }
          : item,
      );
      setSaved(nextSaved);
    }
    const listed = libraryEntries(nextSaved, retiredRef.current).map((item) =>
      item.id === copy.id ? { ...item, frame: entry.frame } : item,
    );
    setEntries(listed);
    setSelected(copy.id);
    setNotice(null);
  };
  const onDepth = (undo: number, redo: number) => {
    rememberEdit(undo, redo);
    setDepth((prev) => (prev.undo === undo && prev.redo === redo ? prev : { undo, redo }));
  };

  useLayoutEffect(() => {
    if (!chosen) {
      pristineRef.current = null;
      pristineId.current = null;
      return;
    }
    if (pristineId.current === chosen.id) return;
    pristineRef.current = structuredClone(chosen.frame);
    pristineId.current = chosen.id;
    forkedRef.current = null;
  }, [chosen]);

  useEffect(() => {
    const entry = entriesRef.current.find((item) => item.id === selected);
    const name = entry ? entry.name.replace(/\.json$/i, "") : "";
    if (entry?.id.startsWith("bundled:")) {
      setRepoName(name);
      setImportName("");
      return;
    }
    setImportName(entry ? name : "");
    setRepoName("");
  }, [selected]);

  const choose = (id: string) => {
    setSelected(id);
    setView("adjusted");
    setNotice(null);
  };

  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const added: FormationEntry[] = [];
    let n = 0;
    let problem: string | null = null;
    for (const file of list) {
      const text = await file.text();
      const parsed = entriesFromFile(
        file.name,
        text,
        () => `${file.name}-${n++}-${crypto.randomUUID()}`,
      );
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

  const keepRetired = (names: string[]) => {
    setRetired(names);
    writeRetiredFormations(names);
  };

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const files = retiredRepoFiles(readRetiredFormations(), bundledFormationEntries());
    if (!files.length) return;
    let cancel = false;
    void (async () => {
      for (const file of files) {
        const deleted = await deleteRepoJson("formations", file);
        if (cancel) return;
        if (!deleted) {
          setNotice("Could not remove that formation.");
          return;
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const remove = async (id: string) => {
    const rows = entriesRef.current;
    const entry = rows.find((item) => item.id === id);
    if (!entry) return;
    const fromRight = entry.id.startsWith("bundled:");
    const priorLocal = readFormationLibrary();
    const copied = copiesForRightRemove(entry, rows, () => `import-${crypto.randomUUID()}`);
    if (copied.length) {
      const copyErr = writeFormationLibrary([...priorLocal, ...copied]);
      if (copyErr) {
        setNotice(copyErr);
        return;
      }
    }
    const file = libraryRemoveFile(entry, rows, retired);
    let deleted: string | null = null;
    if (file) {
      deleted = await deleteRepoJson("formations", file);
      if (!deleted) {
        if (copied.length) writeFormationLibrary(priorLocal);
        setNotice("Could not remove that formation.");
        return;
      }
    }
    const next = deleted
      ? libraryStateAfterDelete(readFormationLibrary(), saved, retired, rows, id, deleted)
      : { local: readFormationLibrary().filter((item) => item.id !== id), saved, retired };
    const err = fromRight ? null : writeFormationLibrary(next.local);
    if (deleted) {
      setSaved(next.saved);
      // File is gone. Keep the retired entry so the stale glob cannot bring it back.
      if (next.retired.join("\0") !== retired.join("\0")) keepRetired(next.retired);
    }
    const listed = libraryEntries(next.saved, next.retired);
    setEntries(listed);
    setNotice(err);
    if (fromRight) {
      const kept = copied.find((item) => item.name === entry.name) ?? copied[0];
      setSelected(kept?.id ?? null);
      setView("adjusted");
      return;
    }
    if (listed.some((item) => item.id === selected)) return;
    const left = listed.filter((item) => !item.id.startsWith("bundled:"));
    const right = listed.filter((item) => item.id.startsWith("bundled:"));
    const pick = nextAfterLeftRemove(left, right);
    setSelected(pick?.id ?? null);
    setView("adjusted");
  };

  const saveCurrent = async (name: string) => {
    const saveName = chosen ? formationSaveName(chosen.name, name) : "";
    if (!chosen || !saveName.trim()) return;
    let res: Response;
    try {
      res = await fetch("/api/formations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName,
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
    const previous =
      chosen.id.startsWith("bundled:") && chosen.name !== entry.name ? chosen.name : null;
    let nextRetired = retired.filter((name) => name !== entry.name);
    if (previous && previous !== entry.name && !nextRetired.includes(previous))
      nextRetired = [...nextRetired, previous];
    if (nextRetired.join("\0") !== retired.join("\0")) keepRetired(nextRetired);
    const nextSaved = [
      entry,
      ...saved.filter((item) => item.name !== entry.name && item.name !== previous),
    ];
    setSaved(nextSaved);
    setEntries(libraryEntries(nextSaved, nextRetired));
    setSelected(entry.id);
    setRepoName(body.name.replace(/\.json$/i, ""));
    setImportName("");
    setNotice(`Saved ${body.name}`);
  };

  return (
    <div className="formation-lib">
      <header className="formation-top">
        <div className="formation-top-start">
          <div className="formation-banner-title">
            <p className="eyebrow">Library</p>
            <h1>Formations</h1>
          </div>
          <FormationKits />
          <button
            type="button"
            className={`btn-ghost formation-grid-toggle${gridOn ? " is-on" : ""}`}
            aria-pressed={gridOn}
            onClick={() => {
              setGridOn((on) => {
                const next = !on;
                writeFormationGrid(next);
                return next;
              });
            }}
          >
            Gridlines
          </button>
        </div>
        <div className="formation-top-center">
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
        </div>
        <div className="formation-history">
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.undo === 0}
            onKeyDown={(e) => {
              if (e.code === "Space") e.preventDefault();
            }}
            onClick={() => editRef.current.undo()}
          >
            Undo
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!chosen || depth.redo === 0}
            onKeyDown={(e) => {
              if (e.code === "Space") e.preventDefault();
            }}
            onClick={() => editRef.current.redo()}
          >
            Redo
          </button>
        </div>
      </header>
      <aside className="formation-side">
        <VersionSwitch frame={chosen?.frame} view={view} onView={setView} />
        {imported.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Imported formation name"
              value={importName}
              placeholder="Name"
              disabled={!chosen || chosen.id.startsWith("bundled:")}
              onChange={(e) => setImportName(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || chosen.id.startsWith("bundled:") || !importName.trim()}
              onClick={() => void saveCurrent(importName)}
            >
              Save
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || chosen.id.startsWith("bundled:")}
              onClick={() => chosen && void remove(chosen.id)}
            >
              Remove
            </button>
          </div>
        ) : null}
        {notice ? <p className="formation-note">{notice}</p> : null}
        <FormationList rows={imported} selected={selected} onChoose={choose} />
      </aside>
      <aside className="formation-side formation-repo">
        <VersionSwitch
          frame={chosen?.frame}
          view={view}
          onView={setView}
          disabled={!chosen?.id.startsWith("bundled:")}
        />
        {repo.length > 0 ? (
          <div className="formation-save">
            <input
              aria-label="Formation file name"
              value={repoName}
              placeholder="Name"
              disabled={!chosen || !chosen.id.startsWith("bundled:")}
              onChange={(e) => setRepoName(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || !chosen.id.startsWith("bundled:") || !repoName.trim()}
              onClick={() => void saveCurrent(repoName)}
            >
              Rename
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!chosen || !repo.some((entry) => entry.id === chosen.id)}
              onClick={() => chosen && void remove(chosen.id)}
            >
              Remove
            </button>
          </div>
        ) : null}
        <FormationList rows={repo} selected={selected} onChoose={choose} />
      </aside>
      <div className="formation-stage">
        {chosen ? (
          <Canvas
            className="rink-canvas"
            shadows={false}
            dpr={[1, 1.25]}
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.88,
            }}
            camera={{ position: [13.2, 9.4, 0], fov: 50, near: 0.15, far: 220 }}
          >
            <FormationStage
              frame={chosen.frame}
              view={view}
              hist={hist}
              onDepth={onDepth}
              editRef={editRef}
              grid={gridOn}
            />
          </Canvas>
        ) : (
          <div className="formation-empty">Import a frame to view it.</div>
        )}
      </div>
    </div>
  );
}
