import { SaveError } from './errors';

/** What actually lands in storage for one slot. */
export interface SaveRecord<T = unknown> {
  /** Schema version the data was written with. */
  v: number;
  /** `Date.now()` at save time. */
  savedAt: number;
  data: T;
}

/**
 * Minimal async key/value storage used by `createSaveStore`.
 * Implement this to plug in another storage (e.g. a Tauri file, OPFS...).
 */
export interface SaveBackend {
  /** Short name for diagnostics: `'indexeddb' | 'localstorage' | 'memory' | ...`. */
  readonly kind: string;
  get(key: string): Promise<unknown>;
  set(key: string, value: SaveRecord): Promise<void>;
  delete(key: string): Promise<void>;
  /** All keys starting with `prefix`. */
  keys(prefix: string): Promise<string[]>;
}

function backendError(kind: string, op: string, cause: unknown): SaveError {
  return new SaveError('BACKEND', `${kind} ${op} failed`, { cause });
}

// ---------------------------------------------------------------------------
// memory

/**
 * In-memory backend (tests, SSR, or last-resort fallback). Values are
 * JSON-cloned on the way in and out, matching localStorage semantics.
 */
export function memoryBackend(): SaveBackend & { readonly size: number; clear(): void } {
  const map = new Map<string, string>();
  return {
    kind: 'memory',
    get size() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    async get(key) {
      const raw = map.get(key);
      return raw === undefined ? undefined : JSON.parse(raw);
    },
    async set(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async delete(key) {
      map.delete(key);
    },
    async keys(prefix) {
      return [...map.keys()].filter((k) => k.startsWith(prefix));
    },
  };
}

// ---------------------------------------------------------------------------
// localStorage

export interface LocalStorageBackendOptions {
  /** Prefix for every localStorage key. Default `'static-kit:'`. */
  prefix?: string;
  /** Storage object to use. Default `globalThis.localStorage`. */
  storage?: Storage;
}

/** localStorage backend (synchronous API wrapped in promises; ~5 MB limit). */
export function localStorageBackend(options: LocalStorageBackendOptions = {}): SaveBackend {
  const prefix = options.prefix ?? 'static-kit:';
  const ls = (): Storage => {
    const s = options.storage ?? globalThis.localStorage;
    if (!s) throw new SaveError('UNSUPPORTED', 'localStorage is not available');
    return s;
  };
  const wrap = async <R>(op: string, fn: () => R): Promise<R> => {
    try {
      return fn();
    } catch (cause) {
      if (cause instanceof SaveError) throw cause;
      throw backendError('localStorage', op, cause);
    }
  };
  return {
    kind: 'localstorage',
    get: (key) =>
      wrap('get', () => {
        const raw = ls().getItem(prefix + key);
        return raw === null ? undefined : (JSON.parse(raw) as unknown);
      }),
    set: (key, value) => wrap('set', () => ls().setItem(prefix + key, JSON.stringify(value))),
    delete: (key) => wrap('delete', () => ls().removeItem(prefix + key)),
    keys: (p) =>
      wrap('keys', () => {
        const s = ls();
        const out: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const k = s.key(i);
          if (k !== null && k.startsWith(prefix + p)) out.push(k.slice(prefix.length));
        }
        return out;
      }),
  };
}

// ---------------------------------------------------------------------------
// IndexedDB

export interface IndexedDBBackendOptions {
  /** Database name. Default `'static-kit'`. */
  dbName?: string;
  /** Object store name. Default `'saves'`. */
  storeName?: string;
  /** Factory to use. Default `globalThis.indexedDB`. */
  factory?: IDBFactory;
}

function req<R>(r: IDBRequest<R>): Promise<R> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** IndexedDB backend (default; larger quota, survives better than localStorage). */
export function indexedDBBackend(options: IndexedDBBackendOptions = {}): SaveBackend {
  const dbName = options.dbName ?? 'static-kit';
  const storeName = options.storeName ?? 'saves';
  let dbPromise: Promise<IDBDatabase> | undefined;

  const open = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise;
    const factory = options.factory ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new SaveError('UNSUPPORTED', 'IndexedDB is not available'));
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      let r: IDBOpenDBRequest;
      try {
        r = factory.open(dbName, 1);
      } catch (cause) {
        reject(backendError('IndexedDB', 'open', cause));
        return;
      }
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(storeName)) r.result.createObjectStore(storeName);
      };
      r.onsuccess = () => {
        const db = r.result;
        // Another tab upgraded the schema: close so it is not blocked, reopen lazily.
        db.onversionchange = () => {
          db.close();
          dbPromise = undefined;
        };
        resolve(db);
      };
      r.onerror = () => reject(backendError('IndexedDB', 'open', r.error));
      r.onblocked = () => reject(new SaveError('BACKEND', 'IndexedDB open blocked by another tab'));
    });
    dbPromise.catch(() => {
      dbPromise = undefined;
    });
    return dbPromise;
  };

  const run = async <R>(
    op: string,
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> => {
    const db = await open();
    try {
      const tx = db.transaction(storeName, mode);
      const result = await req(fn(tx.objectStore(storeName)));
      if (mode === 'readwrite') {
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
        });
      }
      return result;
    } catch (cause) {
      throw backendError('IndexedDB', op, cause);
    }
  };

  return {
    kind: 'indexeddb',
    get: (key) => run('get', 'readonly', (s) => s.get(key) as IDBRequest<unknown>),
    set: async (key, value) => {
      await run('set', 'readwrite', (s) => s.put(value, key));
    },
    delete: async (key) => {
      await run('delete', 'readwrite', (s) => s.delete(key));
    },
    keys: async (prefix) => {
      const range = IDBKeyRange.bound(prefix, prefix + '￿');
      const all = await run('keys', 'readonly', (s) => s.getAllKeys(range));
      return all.filter((k): k is string => typeof k === 'string');
    },
  };
}

// ---------------------------------------------------------------------------
// auto

/**
 * Picks the best available backend on first use: IndexedDB → localStorage → memory.
 * Fail-soft: if IndexedDB cannot be opened (private mode, blocked, absent),
 * it silently falls back. Check `resolvedKind()` to see which one won.
 */
export function autoBackend(
  options: { indexedDB?: IndexedDBBackendOptions; localStorage?: LocalStorageBackendOptions } = {},
): SaveBackend & { resolvedKind(): Promise<string> } {
  let picked: Promise<SaveBackend> | undefined;

  const pick = (): Promise<SaveBackend> =>
    (picked ??= (async () => {
      if (globalThis.indexedDB) {
        const idb = indexedDBBackend(options.indexedDB);
        try {
          await idb.keys('\u0000probe');
          return idb;
        } catch {
          /* fall through */
        }
      }
      try {
        const ls = options.localStorage?.storage ?? globalThis.localStorage;
        if (ls) {
          const probe = '__static-kit-probe__';
          ls.setItem(probe, '1');
          ls.removeItem(probe);
          return localStorageBackend(options.localStorage);
        }
      } catch {
        /* fall through */
      }
      return memoryBackend();
    })());

  return {
    kind: 'auto',
    resolvedKind: async () => (await pick()).kind,
    get: async (key) => (await pick()).get(key),
    set: async (key, value) => (await pick()).set(key, value),
    delete: async (key) => (await pick()).delete(key),
    keys: async (prefix) => (await pick()).keys(prefix),
  };
}
