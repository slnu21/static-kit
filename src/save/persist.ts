// Thin, fail-soft wrappers over the Storage API (navigator.storage).
// Browsers may evict IndexedDB/localStorage under storage pressure unless the
// origin is marked "persistent". None of these functions throw.

export interface StorageEstimateInfo {
  /** Bytes used by this origin (may be padded/approximate). */
  usage: number;
  /** Bytes available to this origin. */
  quota: number;
  /** `usage / quota` in 0–1, or `0` when quota is unknown. */
  ratio: number;
}

export interface StorageStatus {
  /** Storage API present at all. */
  supported: boolean;
  /** `true`/`false` if known, `undefined` if the browser cannot tell. */
  persisted: boolean | undefined;
  estimate: StorageEstimateInfo | undefined;
}

function storageManager(): StorageManager | undefined {
  try {
    return typeof navigator !== 'undefined' ? navigator.storage : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Ask the browser to keep this origin's data (call after a user gesture, e.g. first save).
 * Resolves `true` if granted (or already persistent), `false` if denied or unsupported.
 */
export async function requestPersistence(): Promise<boolean> {
  const sm = storageManager();
  if (!sm || typeof sm.persist !== 'function') return false;
  try {
    if (typeof sm.persisted === 'function' && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return false;
  }
}

/** Whether storage is already persistent. `undefined` when unsupported. */
export async function isPersisted(): Promise<boolean | undefined> {
  const sm = storageManager();
  if (!sm || typeof sm.persisted !== 'function') return undefined;
  try {
    return await sm.persisted();
  } catch {
    return undefined;
  }
}

/** Usage/quota estimate. `undefined` when unsupported. */
export async function estimateStorage(): Promise<StorageEstimateInfo | undefined> {
  const sm = storageManager();
  if (!sm || typeof sm.estimate !== 'function') return undefined;
  try {
    const e = await sm.estimate();
    const usage = e.usage ?? 0;
    const quota = e.quota ?? 0;
    return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
  } catch {
    return undefined;
  }
}

/** Everything at once, for a settings/diagnostics screen. */
export async function storageStatus(): Promise<StorageStatus> {
  const [persisted, estimate] = await Promise.all([isPersisted(), estimateStorage()]);
  return { supported: storageManager() !== undefined, persisted, estimate };
}

/** Human-readable byte size (`1536` → `"1.5 KB"`). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
