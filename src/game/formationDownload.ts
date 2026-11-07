/** Pretty JSON the in-game Download formation button writes, including the trailing newline. */
export function formationDownloadBody(data: unknown): string {
  return JSON.stringify(data, null, 2) + "\n";
}

/** `replay-frame-1107.json` for frame 1107. The in-game lock uses this name. */
export function formationDownloadName(frame: number): string {
  return `replay-frame-${frame}.json`;
}

function saveBlob(body: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download one locked frame. The file keeps both original and adjusted,
 * the same object exportReplayFrame builds for the in-game button.
 */
export function downloadFormationFrame(frame: { frame: number }): void {
  saveBlob(formationDownloadBody(frame), formationDownloadName(frame.frame));
}
