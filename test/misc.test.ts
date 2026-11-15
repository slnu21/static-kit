import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateStorage, formatBytes, isPersisted, requestPersistence, storageStatus } from '../src/save/persist';
import { saveFileName } from '../src/save/file';
import { autoBackend, localStorageBackend } from '../src/save/backends';

describe('persist (fail-soft)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never throws when navigator.storage is missing', async () => {
    vi.stubGlobal('navigator', {});
    expect(await requestPersistence()).toBe(false);
    expect(await isPersisted()).toBeUndefined();
    expect(await estimateStorage()).toBeUndefined();
    expect(await storageStatus()).toEqual({ supported: false, persisted: undefined, estimate: undefined });
  });

  it('swallows API errors', async () => {
    const boom = () => Promise.reject(new Error('nope'));
    vi.stubGlobal('navigator', { storage: { persist: boom, persisted: boom, estimate: boom } });
    expect(await requestPersistence()).toBe(false);
    expect(await isPersisted()).toBeUndefined();
    expect(await estimateStorage()).toBeUndefined();
  });

  it('passes through supported results', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', {
      storage: { persist, persisted: async () => false, estimate: async () => ({ usage: 250, quota: 1000 }) },
    });
    expect(await requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(await estimateStorage()).toEqual({ usage: 250, quota: 1000, ratio: 0.25 });
  });

  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(formatBytes(-1)).toBe('?');
  });
});

describe('saveFileName', () => {
  it('builds a safe name', () => {
    const d = new Date(2026, 10, 15, 9, 5);
    expect(saveFileName('dungeon', { slot: 'main', date: d })).toBe('dungeon-main-2026-11-15T0905.json');
    expect(saveFileName('my game!', { slot: '../슬롯 1', date: null, ext: 'txt' })).toBe('my-game-..-1.txt');
    expect(saveFileName('', { date: null })).toBe('save.json');
  });
});

describe('localStorage backend / auto fallback (stubbed Storage)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function fakeStorage(): Storage {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      key: (i) => [...m.keys()][i] ?? null,
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, String(v)),
      removeItem: (k) => void m.delete(k),
      clear: () => m.clear(),
    };
  }

  it('round-trips and lists by prefix', async () => {
    const storage = fakeStorage();
    storage.setItem('unrelated', 'x');
    const b = localStorageBackend({ storage, prefix: 'p:' });
    await b.set('g/a', { v: 1, savedAt: 1, data: 'A' });
    await b.set('h/b', { v: 1, savedAt: 1, data: 'B' });
    expect(await b.get('g/a')).toEqual({ v: 1, savedAt: 1, data: 'A' });
    expect(await b.keys('g/')).toEqual(['g/a']);
    await b.delete('g/a');
    expect(await b.get('g/a')).toBeUndefined();
  });

  it('wraps quota errors as BACKEND', async () => {
    const storage = fakeStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    await expect(localStorageBackend({ storage }).set('k', { v: 0, savedAt: 0, data: 0 })).rejects.toMatchObject({
      code: 'BACKEND',
    });
  });

  it('autoBackend falls back: no IndexedDB → localStorage → memory', async () => {
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('localStorage', fakeStorage());
    expect(await autoBackend().resolvedKind()).toBe('localstorage');

    vi.stubGlobal('localStorage', undefined);
    expect(await autoBackend().resolvedKind()).toBe('memory');
  });
});
