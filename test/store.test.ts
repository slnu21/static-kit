import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaveStore, isSaveError, memoryBackend, migrate, type SaveBackend } from '../src/save/store';

interface V3 {
  name: string;
  hp: number;
  gold: number;
}

describe('createSaveStore (memory backend)', () => {
  it('saves, loads, lists, removes', async () => {
    let t = 1000;
    const backend = memoryBackend();
    const store = createSaveStore<{ n: number }>({ gameId: 'g', version: 1, backend, now: () => t });
    expect(await store.load('a')).toBeUndefined();
    const rec = await store.save('a', { n: 1 });
    expect(rec).toEqual({ v: 1, savedAt: 1000, data: { n: 1 } });
    t = 2000;
    await store.save('b', { n: 2 });
    expect(await store.load('a')).toEqual({ n: 1 });
    expect(await store.list()).toEqual([
      { slot: 'b', v: 1, savedAt: 2000 },
      { slot: 'a', v: 1, savedAt: 1000 },
    ]);
    await store.remove('a');
    expect(await store.load('a')).toBeUndefined();
    expect((await store.list()).map((s) => s.slot)).toEqual(['b']);
  });

  it('isolates games sharing a backend', async () => {
    const backend = memoryBackend();
    const a = createSaveStore({ gameId: 'alpha', version: 1, backend });
    const b = createSaveStore({ gameId: 'beta', version: 1, backend });
    await a.save('main', 1);
    await b.save('main', 2);
    expect(await a.load('main')).toBe(1);
    expect(await b.load('main')).toBe(2);
    expect(await a.list()).toHaveLength(1);
  });

  it('returns copies, not live references', async () => {
    const store = createSaveStore<{ list: number[] }>({ gameId: 'g', version: 1, backend: memoryBackend() });
    const data = { list: [1] };
    await store.save('s', data);
    data.list.push(2);
    expect(await store.load('s')).toEqual({ list: [1] });
  });

  it('applies migrations in order from the stored version', async () => {
    const backend = memoryBackend();
    const v1 = createSaveStore({ gameId: 'g', version: 1, backend });
    await v1.save('s', { name: 'Ann' });

    const calls: number[] = [];
    const v3 = createSaveStore<V3>({
      gameId: 'g',
      version: 3,
      backend,
      migrations: {
        1: (d) => (calls.push(1), { ...d, hp: 10 }),
        2: (d) => (calls.push(2), { ...d, gold: 0 }),
      },
    });
    const rec = await v3.loadRecord('s');
    expect(calls).toEqual([1, 2]);
    expect(rec).toMatchObject({ v: 3, from: 1, migrated: true, data: { name: 'Ann', hp: 10, gold: 0 } });
    // Not written back by default
    expect((await v3.list())[0]?.v).toBe(1);
  });

  it('writes migrated data back when asked', async () => {
    const backend = memoryBackend();
    await createSaveStore({ gameId: 'g', version: 1, backend }).save('s', { a: 1 });
    const v2 = createSaveStore({
      gameId: 'g',
      version: 2,
      backend,
      writeBackMigrated: true,
      migrations: { 1: (d) => ({ ...d, b: 2 }) },
    });
    await v2.load('s');
    expect((await v2.list())[0]?.v).toBe(2);
    expect(await backend.get('g/s')).toMatchObject({ v: 2, data: { a: 1, b: 2 } });
  });

  it('rejects data from a newer version with VERSION_TOO_NEW', async () => {
    const backend = memoryBackend();
    await createSaveStore({ gameId: 'g', version: 5, backend }).save('s', {});
    const old = createSaveStore({ gameId: 'g', version: 2, backend });
    await expect(old.load('s')).rejects.toSatisfy((e) => isSaveError(e, 'VERSION_TOO_NEW'));
  });

  it('reports a missing migration step', async () => {
    const backend = memoryBackend();
    await createSaveStore({ gameId: 'g', version: 1, backend }).save('s', {});
    const v3 = createSaveStore({ gameId: 'g', version: 3, backend, migrations: { 1: (d) => d } });
    await expect(v3.load('s')).rejects.toSatisfy((e) => isSaveError(e, 'MISSING_MIGRATION'));
  });

  it('wraps a throwing migration as MIGRATION_FAILED', () => {
    expect(() =>
      migrate({}, 0, 1, {
        0: () => {
          throw new Error('boom');
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'MIGRATION_FAILED' }));
  });

  it('flags garbage records as BAD_RECORD and skips them in list()', async () => {
    const backend = memoryBackend();
    await backend.set('g/bad', { nope: true } as never);
    const store = createSaveStore({ gameId: 'g', version: 1, backend });
    await store.save('ok', 1);
    await expect(store.load('bad')).rejects.toSatisfy((e) => isSaveError(e, 'BAD_RECORD'));
    expect((await store.list()).map((s) => s.slot)).toEqual(['ok']);
  });

  it('validates gameId, version, slot', () => {
    expect(() => createSaveStore({ gameId: 'has.dot', version: 1, backend: memoryBackend() })).toThrow(TypeError);
    expect(() => createSaveStore({ gameId: 'g', version: -1, backend: memoryBackend() })).toThrow(TypeError);
    const store = createSaveStore({ gameId: 'g', version: 0, backend: memoryBackend() });
    expect(() => store.save('', 1)).toThrow(TypeError);
  });

  it('keeps write order per slot even with a slow backend', async () => {
    const inner = memoryBackend();
    const delays = [30, 0];
    const slow: SaveBackend = {
      ...inner,
      kind: 'slow',
      set: async (k, v) => {
        await new Promise((r) => setTimeout(r, delays.shift() ?? 0));
        return inner.set(k, v);
      },
    };
    const store = createSaveStore({ gameId: 'g', version: 1, backend: slow });
    void store.save('s', 'first');
    await store.save('s', 'second');
    expect(await store.load('s')).toBe('second');
  });
});

describe('autosave debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function spyBackend() {
    const inner = memoryBackend();
    const set = vi.fn(inner.set);
    return { backend: { ...inner, set } as SaveBackend, set, inner };
  }

  it('collapses rapid calls into one write with the latest data', async () => {
    const { backend, set } = spyBackend();
    const store = createSaveStore<number>({ gameId: 'g', version: 1, backend, autosaveDelay: 100 });
    store.autosave('s', 1);
    await vi.advanceTimersByTimeAsync(50);
    store.autosave('s', 2);
    await vi.advanceTimersByTimeAsync(50);
    store.autosave('s', 3);
    expect(set).not.toHaveBeenCalled();
    expect(store.hasPending('s')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(set).toHaveBeenCalledTimes(1);
    expect(store.hasPending()).toBe(false);
    expect(await store.load('s')).toBe(3);
  });

  it('maxWait forces a write during continuous autosave', async () => {
    const { backend, set } = spyBackend();
    const store = createSaveStore<number>({
      gameId: 'g',
      version: 1,
      backend,
      autosaveDelay: 100,
      autosaveMaxWait: 300,
    });
    for (let i = 0; i < 10; i++) {
      store.autosave('s', i);
      await vi.advanceTimersByTimeAsync(50);
    }
    // 500 ms of calls every 50 ms: debounce alone would never fire; maxWait fires at ~300 ms.
    expect(set.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('debounces each slot independently', async () => {
    const { backend, set } = spyBackend();
    const store = createSaveStore<string>({ gameId: 'g', version: 1, backend, autosaveDelay: 100 });
    store.autosave('a', 'A');
    store.autosave('b', 'B');
    await vi.advanceTimersByTimeAsync(100);
    expect(set).toHaveBeenCalledTimes(2);
  });

  it('flush() writes pending immediately; cancelAutosave drops it', async () => {
    const { backend, set } = spyBackend();
    const store = createSaveStore<string>({ gameId: 'g', version: 1, backend, autosaveDelay: 10_000 });
    store.autosave('a', 'A');
    store.autosave('b', 'B');
    store.cancelAutosave('b');
    await store.flush();
    expect(set).toHaveBeenCalledTimes(1);
    expect(await store.load('a')).toBe('A');
    expect(await store.load('b')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('explicit save() supersedes a pending autosave', async () => {
    const { backend, set } = spyBackend();
    const store = createSaveStore<string>({ gameId: 'g', version: 1, backend, autosaveDelay: 100 });
    store.autosave('s', 'old');
    await store.save('s', 'new');
    await vi.advanceTimersByTimeAsync(500);
    expect(set).toHaveBeenCalledTimes(1);
    expect(await store.load('s')).toBe('new');
  });

  it('reports background failures through onError', async () => {
    const onError = vi.fn();
    const failing: SaveBackend = {
      ...memoryBackend(),
      set: async () => {
        throw new Error('quota');
      },
    };
    const store = createSaveStore({ gameId: 'g', version: 1, backend: failing, autosaveDelay: 10, onError });
    store.autosave('s', 1);
    await vi.advanceTimersByTimeAsync(20);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 's');
  });
});
