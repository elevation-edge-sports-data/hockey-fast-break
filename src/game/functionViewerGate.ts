/**
 * Visualizer on/off state for live meshes.
 * This file must not mention the private gallery or carry-pose names.
 * The public pose editor bundles PlayerMesh, which imports only this gate.
 */

type ArgReader = (id: string) => Record<string, boolean | number>;
type PreviewRunner = (id: string, parts: object) => void;
type RefPreview = "poseRefLeg" | "poseRefChecked";
type RefRunner = (id: RefPreview, parts: object) => void;

let active = false;
let meshIndex: number | null = null;
let selected: string | null = null;
let selectedGoalie = false;
let argReader: ArgReader = () => ({});
let previewRunner: PreviewRunner | null = null;
let refRunner: RefRunner | null = null;

export function setGateActive(on: boolean): void {
  active = on;
}

export function setGateMesh(index: number | null): void {
  meshIndex = index;
}

export function setGateSelected(id: string | null, goalie: boolean): void {
  selected = id;
  selectedGoalie = goalie;
}

export function functionViewerGoalie(): boolean {
  return selectedGoalie;
}

/** Null unless this mesh is the visualizer preview. */
export function functionViewerPreview(index: number): string | null {
  if (!active || meshIndex !== index || selected === null) return null;
  return selected;
}

/** Referee preview only. Null in live play and in the public editor. */
export function functionViewerRef(): RefPreview | null {
  if (!active || (selected !== "poseRefLeg" && selected !== "poseRefChecked")) return null;
  return selected;
}

export function setViewerArgReader(fn: ArgReader): void {
  argReader = fn;
}

export function readViewerArgs(id: string): Record<string, boolean | number> {
  return argReader(id);
}

export function viewerNum(values: Record<string, boolean | number>, name: string, fallback: number): number {
  const value = values[name];
  return typeof value === "number" ? value : fallback;
}

export function viewerFlag(values: Record<string, boolean | number>, name: string, fallback: boolean): boolean {
  const value = values[name];
  return typeof value === "boolean" ? value : fallback;
}

export function registerFunctionPreview(fn: PreviewRunner): void {
  previewRunner = fn;
}

export function runFunctionPreview(id: string, parts: object): void {
  previewRunner?.(id, parts);
}

export function registerRefPreview(fn: RefRunner): void {
  refRunner = fn;
}

export function runRefPreview(id: RefPreview, parts: object): void {
  refRunner?.(id, parts);
}
