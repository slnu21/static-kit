// Save file export (download) / import (file picker). Browser only; no dependencies.

export interface SaveFileNameOptions {
  /** Slot name to include. */
  slot?: string;
  /** Timestamp to include. Default: now. Pass `null` to omit. */
  date?: Date | null;
  /** File extension without dot. Default `'json'`. */
  ext?: string;
}

/** Filesystem-safe save file name: `dungeon-main-2026-11-15T0930.json`. Pure. */
export function saveFileName(gameId: string, options: SaveFileNameOptions = {}): string {
  const safe = (s: string) =>
    s
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const parts = [safe(gameId) || 'save'];
  if (options.slot) {
    const s = safe(options.slot);
    if (s) parts.push(s);
  }
  const date = options.date === undefined ? new Date() : options.date;
  if (date) {
    const p = (n: number) => String(n).padStart(2, '0');
    parts.push(
      `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}`,
    );
  }
  return `${parts.join('-')}.${options.ext ?? 'json'}`;
}

/** Trigger a browser download of `content`. */
export function downloadFile(filename: string, content: string | Blob, type = 'application/octet-stream'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Download a value as pretty JSON. */
export function downloadJSON(filename: string, value: unknown, space: number | string = 2): void {
  downloadFile(filename, JSON.stringify(value, null, space), 'application/json');
}

/** Download text (e.g. a save code) as a `.txt` file. */
export function downloadText(filename: string, text: string): void {
  downloadFile(filename, text, 'text/plain;charset=utf-8');
}

export interface PickFileOptions {
  /** `accept` attribute, e.g. `'.json,application/json'`. Default: any. */
  accept?: string;
}

/**
 * Open the file picker and resolve the chosen `File`, or `undefined` if cancelled.
 * Must be called from a user gesture (click/keypress).
 */
export function pickFile(options: PickFileOptions = {}): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    input.style.display = 'none';
    let done = false;
    const finish = (file: File | undefined) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0]));
    input.addEventListener('cancel', () => finish(undefined));
    document.body.appendChild(input);
    input.click();
  });
}

/** Read a `File`/`Blob` as UTF-8 text. */
export function readFileText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

/** Pick a file and return its text, or `undefined` if cancelled. */
export async function pickTextFile(options: PickFileOptions = {}): Promise<string | undefined> {
  const file = await pickFile(options);
  return file ? readFileText(file) : undefined;
}

/** Pick a JSON file and parse it, or `undefined` if cancelled. Throws on invalid JSON. */
export async function pickJSONFile<T = unknown>(
  options: PickFileOptions = { accept: '.json,application/json' },
): Promise<T | undefined> {
  const text = await pickTextFile(options);
  return text === undefined ? undefined : (JSON.parse(text) as T);
}
