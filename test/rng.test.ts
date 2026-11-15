import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, hashSeed, randomSeed, restoreRng } from '../src/rng';

describe('rng determinism', () => {
  it('same seed → same sequence (golden values pinned)', () => {
    const a = createRng('static-kit');
    const b = createRng('static-kit');
    const seqA = Array.from({ length: 5 }, () => a.uint32());
    const seqB = Array.from({ length: 5 }, () => b.uint32());
    expect(seqA).toEqual(seqB);
    // Pinned: changing the algorithm, seeding or warm-up breaks every existing save/daily seed.
    expect(seqA).toEqual(GOLDEN_STATIC_KIT);
    expect(hashSeed('static-kit')).toEqual(GOLDEN_HASH);
  });

  it('numeric seeds equal their string form', () => {
    expect(createRng(42).uint32()).toBe(createRng('42').uint32());
  });

  it('different seeds diverge', () => {
    expect(createRng('a').uint32()).not.toBe(createRng('b').uint32());
  });

  it('state() / restoreRng() continue the exact sequence (JSON-safe)', () => {
    const r = createRng('save-me');
    for (let i = 0; i < 100; i++) r.next();
    const state = JSON.parse(JSON.stringify(r.state()));
    const restored = restoreRng(state);
    for (let i = 0; i < 50; i++) expect(restored.uint32()).toBe(r.uint32());
  });

  it('clone() is independent', () => {
    const r = createRng('x');
    const c = r.clone();
    expect(c.int(0, 1000)).toBe(r.int(0, 1000));
    c.next();
    expect(c.state()).not.toEqual(r.state());
  });

  it('restoreRng validates input', () => {
    expect(() => restoreRng([1, 2, 3])).toThrow(TypeError);
    expect(() => restoreRng([1, 2, 3, -1])).toThrow(TypeError);
    expect(() => restoreRng('nope')).toThrow(TypeError);
  });

  it('deriveSeed builds stable sub-seeds', () => {
    expect(deriveSeed('run', 'floor', 3)).toBe('run/floor/3');
    expect(createRng(deriveSeed('run', 'floor', 3)).uint32()).toBe(createRng('run/floor/3').uint32());
  });

  it('randomSeed returns the requested length', () => {
    expect(randomSeed(12)).toMatch(/^[a-z2-9]{12}$/);
  });
});

describe('rng helpers', () => {
  it('int stays in range, inclusive, roughly uniform', () => {
    const r = createRng('dice');
    const counts = new Array(6).fill(0);
    const N = 60_000;
    for (let i = 0; i < N; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      counts[v - 1]++;
    }
    for (const c of counts) expect(Math.abs(c - N / 6)).toBeLessThan(N * 0.01);
  });

  it('int handles single-value and full ranges, rejects bad input', () => {
    const r = createRng('edge');
    expect(r.int(5, 5)).toBe(5);
    const big = r.int(0, 2 ** 32 - 1);
    expect(big).toBeGreaterThanOrEqual(0);
    expect(() => r.int(3, 1)).toThrow(RangeError);
    expect(() => r.int(0.5, 2)).toThrow(TypeError);
    expect(() => r.int(0, 2 ** 33)).toThrow(RangeError);
  });

  it('next()/float() are in range with mean ≈ 0.5', () => {
    const r = createRng('float');
    let sum = 0;
    const N = 50_000;
    for (let i = 0; i < N; i++) {
      const x = r.next();
      expect(x >= 0 && x < 1).toBe(true);
      sum += x;
    }
    expect(Math.abs(sum / N - 0.5)).toBeLessThan(0.01);
    const f = r.float(-2, 2);
    expect(f >= -2 && f < 2).toBe(true);
  });

  it('chance(p) ≈ p', () => {
    const r = createRng('chance');
    let hits = 0;
    for (let i = 0; i < 20_000; i++) if (r.chance(0.25)) hits++;
    expect(Math.abs(hits / 20_000 - 0.25)).toBeLessThan(0.015);
    expect(r.chance(0)).toBe(false);
  });

  it('pick and shuffle', () => {
    const r = createRng('cards');
    const deck = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = r.shuffle(deck);
    expect(shuffled).not.toBe(deck);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(deck);
    expect(deck).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(createRng('cards').shuffle(deck)).toEqual(shuffled);
    expect(deck).toContain(r.pick(deck));
    expect(() => r.pick([])).toThrow(RangeError);
    const arr = [1, 2, 3];
    expect(r.shuffleInPlace(arr)).toBe(arr);
  });

  it('weighted follows weights roughly and never picks zero weight', () => {
    const r = createRng('loot');
    const counts: Record<string, number> = { common: 0, rare: 0, epic: 0, never: 0 };
    const N = 40_000;
    for (let i = 0; i < N; i++) {
      counts[
        r.weighted([
          ['common', 70],
          ['rare', 25],
          ['epic', 5],
          ['never', 0],
        ])
      ]!++;
    }
    expect(counts.never).toBe(0);
    expect(Math.abs(counts.common! / N - 0.7)).toBeLessThan(0.015);
    expect(Math.abs(counts.rare! / N - 0.25)).toBeLessThan(0.015);
    expect(Math.abs(counts.epic! / N - 0.05)).toBeLessThan(0.01);
    expect(() => r.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => r.weightedIndex([1, -1])).toThrow(RangeError);
  });
});

// Generated once with this implementation; see the test above.
const GOLDEN_STATIC_KIT = [1405215447, 516410569, 1910315213, 3874396645, 1306617627];
const GOLDEN_HASH = [1911171191, 3633048225, 1386960936, 3808543838];
