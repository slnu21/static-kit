import { autoBackend, type SaveBackend, type SaveRecord } from './backends';
import { SaveError } from './errors';
import { assertVersion, migrate, type Migrations } from './migrate';
import { assertGameId } from './ids';

export {
  autoBackend,
  indexedDBBackend,
  localStorageBackend,
  memoryBackend,
  type IndexedDBBackendOptions,
  type LocalStorageBackendOptions,
  type SaveBackend,
  type SaveRecord,
} from './backends';
export { SaveError, isSaveError, type SaveErrorCode } from './errors';
export { migrate, type Migrations, type MigrateResult } from './migrate';

export interface SaveStoreOptions {
  /** Namespace for all slots. Letters, digits, `_` and `-` only. */
  gameId: string;
  /** Current schema version (non-negative integer). */
  version: number;
  /** `migrations[v]` upgrades data from `v` to `v + 1`. */
  migrations?: Migrations;
  /** Storage backend. Default: {@link autoBackend} (IndexedDB → localStorage → memory). */
  backend?: SaveBackend;
  /** Autosave debounce in ms. Default `1000`. */
  autosaveDelay?: number;
  /** Upper bound on how long continuous autosave calls may postpone a write. Default `5000`. */
  autosaveMaxWait?: number;
  /** Flush pending autosaves when the page is hidden (`visibilitychange`/`pagehide`). Default `true`. */
  flushOnHide?: boolean;
  /** Write migrated data back to storage on load. Default `false`. */
  writeBackMigrated?: boolean;
  /** Called when a background autosave fails. Default: `console.warn`. */
  onError?: (error: unknown, slot: string) => void;
  /** Clock override (tests). Default `Date.now`. */
  now?: () => number;
}

/** Summary of one slot, from {@link SaveStore.list}. */
export interface SlotInfo {
  slot: string;
  v: number;
  savedAt: number;
}

/** A loaded record after migrations. `v` is the current version; `from` is what was stored. */
export interface LoadedRecord<T> extends SaveRecord<T> {
  from: number;
  migrated: boolean;
}

export interface SaveStore<T = unknown> {
  readonly gameId: string;
  readonly version: number;
  readonly backend: SaveBackend;
  /** Write `data` to `slot` now (cancels a pending autosave for that slot). */
  save(slot: string, data: T): Promise<SaveRecord<T>>;
  /** Read `slot`, applying migrations. `undefined` if empty. */
  load(slot: string): Promise<T | undefined>;
  /** Like `load` but returns the full record. */
  loadRecord(slot: string): Promise<LoadedRecord<T> | undefined>;
  /** All slots for this game, newest first. Unreadable records are skipped. */
  list(): Promise<SlotInfo[]>;
  /** Delete `slot` (and any pending autosave for it). */
  remove(slot: string): Promise<void>;
  /** Debounced save: many calls → one write after `autosaveDelay` ms of quiet. */
  autosave(slot: string, data: T): void;
  /** Write all pending autosaves now. Rejects with the first write error. */
  flush(): Promise<void>;
  /** Drop pending autosave(s) without writing. */
  cancelAutosave(slot?: string): void;
  /** Whether an autosave is pending (for `slot`, or any). */
  hasPending(slot?: string): boolean;
  /** Flush, then detach page listeners. The store stays usable for direct calls. */
  dispose(): Promise<void>;
}

interface Pending<T> {
  data: T;
  firstAt: number;
  timer: ReturnType<typeof setTimeout>;
}

function isRecord(x: unknown): x is SaveRecord {
  if (typeof x !== 'object' || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.v === 'number' && Number.isSafeInteger(r.v) && r.v >= 0 && typeof r.savedAt === 'number' && 'data' in r
  );
}

function assertSlot(slot: unknown): asserts slot is string {
  if (typeof slot !== 'string' || slot.length === 0) {
    throw new TypeError('slot must be a non-empty string');
  }
}

/**
 * Create a slot-based save store.
 *
 * ```ts
 * const store = createSaveStore<GameState>({ gameId: 'dungeon', version: 2, migrations: { 1: (d) => ({ ...d, hp: 10 }) } });
 * await store.save('main', state);
 * const loaded = await store.load('main');
 * store.autosave('main', state); // debounced
 * ```
 */
export function createSaveStore<T = unknown>(options: SaveStoreOptions): SaveStore<T> {
  const { gameId, version, migrations = {} } = options;
  assertGameId(gameId);
  assertVersion(version);
  const backend = options.backend ?? autoBackend();
  const delay = Math.max(0, options.autosaveDelay ?? 1000);
  const maxWait = Math.max(delay, options.autosaveMaxWait ?? 5000);
  const now = options.now ?? Date.now;
  const onError =
    options.onError ?? ((err: unknown, slot: string) => console.warn(`[static-kit] autosave "${slot}" failed`, err));
  const prefix = `${gameId}/`;
  const keyOf = (slot: string) => prefix + slot;

  const pending = new Map<string, Pending<T>>();
  // Per-slot write chain so writes land in call order.
  const chains = new Map<string, Promise<unknown>>();

  const enqueue = <R>(slot: string, op: () => Promise<R>): Promise<R> => {
    const prev = chains.get(slot) ?? Promise.resolve();
    const next = prev.then(op, op);
    const settled = next.catch(() => undefined);
    chains.set(slot, settled);
    void settled.then(() => {
      if (chains.get(slot) === settled) chains.delete(slot);
    });
    return next;
  };

  const write = (slot: string, data: T): Promise<SaveRecord<T>> => {
    const record: SaveRecord<T> = { v: version, savedAt: now(), data };
    return enqueue(slot, async () => {
      await backend.set(keyOf(slot), record);
      return record;
    });
  };

  const takePending = (slot: string): Pending<T> | undefined => {
    const p = pending.get(slot);
    if (p) {
      clearTimeout(p.timer);
      pending.delete(slot);
    }
    return p;
  };

  const flushSlot = (slot: string): Promise<SaveRecord<T>> | undefined => {
    const p = takePending(slot);
    return p ? write(slot, p.data) : undefined;
  };

  const store: SaveStore<T> = {
    gameId,
    version,
    backend,

    save(slot, data) {
      assertSlot(slot);
      takePending(slot);
      return write(slot, data);
    },

    async loadRecord(slot) {
      assertSlot(slot);
      // Wait for in-flight writes so a load right after save sees it.
      await chains.get(slot);
      const raw = await backend.get(keyOf(slot));
      if (raw === undefined || raw === null) return undefined;
      if (!isRecord(raw)) throw new SaveError('BAD_RECORD', `Slot "${slot}" does not contain a valid save record.`);
      const m = migrate<T>(raw.data, raw.v, version, migrations);
      if (m.migrated && options.writeBackMigrated) {
        await enqueue(slot, () => backend.set(keyOf(slot), { v: version, savedAt: raw.savedAt, data: m.data }));
      }
      return { v: version, savedAt: raw.savedAt, data: m.data, from: m.from, migrated: m.migrated };
    },

    async load(slot) {
      return (await store.loadRecord(slot))?.data;
    },

    async list() {
      await Promise.all(chains.values());
      const keys = await backend.keys(prefix);
      const out: SlotInfo[] = [];
      for (const key of keys) {
        try {
          const raw = await backend.get(key);
          if (isRecord(raw)) out.push({ slot: key.slice(prefix.length), v: raw.v, savedAt: raw.savedAt });
        } catch {
          /* fail-soft: skip unreadable slot */
        }
      }
      return out.sort((a, b) => b.savedAt - a.savedAt || a.slot.localeCompare(b.slot));
    },

    remove(slot) {
      assertSlot(slot);
      takePending(slot);
      return enqueue(slot, () => backend.delete(keyOf(slot)));
    },

    autosave(slot, data) {
      assertSlot(slot);
      const t = now();
      const prev = pending.get(slot);
      if (prev) clearTimeout(prev.timer);
      const firstAt = prev?.firstAt ?? t;
      const wait = Math.max(0, Math.min(delay, firstAt + maxWait - t));
      const timer = setTimeout(() => {
        flushSlot(slot)?.catch((err) => onError(err, slot));
      }, wait);
      pending.set(slot, { data, firstAt, timer });
    },

    async flush() {
      const writes = [...pending.keys()].map((slot) => flushSlot(slot));
      await Promise.all(writes);
    },

    cancelAutosave(slot) {
      if (slot === undefined) for (const s of [...pending.keys()]) takePending(s);
      else takePending(slot);
    },

    hasPending(slot) {
      return slot === undefined ? pending.size > 0 : pending.has(slot);
    },

    async dispose() {
      detach();
      await store.flush();
    },
  };

  // Best-effort flush when the tab goes away.
  let detach = () => {};
  if (options.flushOnHide !== false && typeof document !== 'undefined' && typeof addEventListener === 'function') {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && pending.size > 0) {
        store.flush().catch((err) => onError(err, '*'));
      }
    };
    const onPageHide = () => {
      if (pending.size > 0) store.flush().catch((err) => onError(err, '*'));
    };
    document.addEventListener('visibilitychange', onHide);
    addEventListener('pagehide', onPageHide);
    detach = () => {
      document.removeEventListener('visibilitychange', onHide);
      removeEventListener('pagehide', onPageHide);
    };
  }

  return store;
}
