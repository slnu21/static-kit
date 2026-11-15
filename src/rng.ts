// Seeded PRNG: sfc32 (Chris Doty-Humphrey's Small Fast Counting generator, 128-bit state)
// seeded through cyrb128 string hashing. Deterministic across browsers and Node.

/** Serializable generator state: four uint32 words. Safe to put in a save file/code. */
export type RngState = [number, number, number, number];

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Uniform uint32 in [0, 2^32). */
  uint32(): number;
  /** Uniform integer in [min, max] (inclusive, unbiased). */
  int(min: number, max: number): number;
  /** Float in [min, max). Default [0, 1). */
  float(min?: number, max?: number): number;
  /** `true` with probability `p`. */
  chance(p: number): boolean;
  /** Random element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Shuffled copy (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Shuffle in place and return the same array. */
  shuffleInPlace<T>(items: T[]): T[];
  /** Pick by weight: `weighted([['common', 70], ['rare', 25], ['epic', 5]])`. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T;
  /** Index chosen by weight: `weightedIndex([70, 25, 5])`. */
  weightedIndex(weights: readonly number[]): number;
  /** Snapshot of the current state (copy). */
  state(): RngState;
  /** Independent generator continuing from the same state. */
  clone(): Rng;
}

/**
 * cyrb128: fast 128-bit string hash (bryc, public domain). Used to turn any
 * string seed into sfc32's four state words.
 */
export function hashSeed(text: string): RngState {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

function isState(x: unknown): x is RngState {
  return (
    Array.isArray(x) &&
    x.length === 4 &&
    x.every((n) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffffff)
  );
}

function build(init: RngState): Rng {
  let [a, b, c, d] = init;

  const uint32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };

  const next = (): number => uint32() / 4294967296;

  const int = (min: number, max: number): number => {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw new TypeError('int(min, max) needs integers');
    if (max < min) throw new RangeError(`int(min, max): max (${max}) < min (${min})`);
    const range = max - min + 1;
    if (range > 4294967296) throw new RangeError('int(min, max): range larger than 2^32');
    if (range === 4294967296) return min + uint32();
    // Rejection sampling removes modulo bias.
    const limit = 4294967296 - (4294967296 % range);
    let x = uint32();
    while (x >= limit) x = uint32();
    return min + (x % range);
  };

  const weightedIndex = (weights: readonly number[]): number => {
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError('weights must be finite and >= 0');
      total += w;
    }
    if (!(total > 0)) throw new RangeError('weights must contain a positive value');
    let r = next() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]!;
      if (r < 0) return i;
    }
    // Floating-point edge: return the last positive weight.
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i]! > 0) return i;
    return weights.length - 1;
  };

  const shuffleInPlace = <T>(items: T[]): T[] => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  };

  return {
    next,
    uint32,
    int,
    float: (min = 0, max = 1) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new RangeError('pick() from an empty array');
      return items[int(0, items.length - 1)]!;
    },
    shuffle: <T>(items: readonly T[]) => shuffleInPlace(items.slice()),
    shuffleInPlace,
    weighted: <T>(entries: ReadonlyArray<readonly [T, number]>): T =>
      entries[weightedIndex(entries.map((e) => e[1]))]![0],
    weightedIndex,
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
    clone: () => build([a >>> 0, b >>> 0, c >>> 0, d >>> 0]),
  };
}

/**
 * Seeded generator. Same seed → same sequence, everywhere.
 *
 * ```ts
 * const rng = createRng('dungeon:2026-11-15');
 * rng.int(1, 6); rng.pick(['orc', 'bat']); rng.shuffle(deck);
 * save.rng = rng.state();         // later: restoreRng(save.rng)
 * ```
 */
export function createRng(seed: string | number): Rng {
  const rng = build(hashSeed(String(seed)));
  // Warm up: sfc32 output is weak for the first few draws from a hashed state.
  for (let i = 0; i < 12; i++) rng.uint32();
  return rng;
}

/** Continue a generator from a saved {@link RngState}. Throws `TypeError` on invalid state. */
export function restoreRng(state: unknown): Rng {
  if (!isState(state)) throw new TypeError('restoreRng: expected [uint32, uint32, uint32, uint32]');
  return build([state[0], state[1], state[2], state[3]]);
}

/**
 * Derive a sub-seed string: `deriveSeed('run42', 'floor', 3)` → `"run42/floor/3"`.
 * Use one generator per independent concern (map, loot, combat) so adding a roll
 * in one place does not shift every other roll.
 */
export function deriveSeed(seed: string | number, ...labels: Array<string | number>): string {
  return [seed, ...labels].map(String).join('/');
}

/** Random seed string from `crypto.getRandomValues` (falls back to Math.random). */
export function randomSeed(length = 10): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
