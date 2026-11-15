// Roguelike save pattern: store the *inputs* of generation, not its outputs.
// The map is regenerated from (seed, floor); the save only keeps what the
// player changed: explored tiles (bitmask), player stats, inventory, RNG state.
import { createRng, deriveSeed, restoreRng, type Rng, type RngState } from '../src/rng';
import { createSaveCode, packBits, unpackBits } from '../src/save/code';

export const W = 48;
export const H = 32;

export type Tile = 0 | 1; // 0 wall, 1 floor

export interface Floor {
  tiles: Uint8Array; // W*H
  start: { x: number; y: number };
}

/** Deterministic cave: same (seed, floor) → same map, on every device. */
export function generateFloor(seed: string, floor: number): Floor {
  const rng = createRng(deriveSeed(seed, 'floor', floor));
  const tiles = new Uint8Array(W * H);
  let x = rng.int(4, W - 5);
  let y = rng.int(4, H - 5);
  const start = { x, y };
  const target = Math.floor(W * H * 0.45);
  let carved = 0;
  while (carved < target) {
    const i = y * W + x;
    if (!tiles[i]) {
      tiles[i] = 1;
      carved++;
    }
    const [dx, dy] = rng.pick([
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const);
    x = Math.min(W - 2, Math.max(1, x + dx));
    y = Math.min(H - 2, Math.max(1, y + dy));
  }
  return { tiles, start };
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  lvl: number;
  xp: number;
}

/** In-memory game state (what the game uses while running). */
export interface RunState {
  seed: string;
  floor: number;
  map: Floor; // regenerated, never saved
  explored: Uint8Array; // W*H, 1 = seen
  player: Player;
  inventory: Map<string, number>;
  rng: Rng; // combat/loot rolls
  turn: number;
}

/** What goes into the save code (JSON-compatible, small). */
export interface RunSave {
  seed: string;
  floor: number;
  explored: string; // packBits
  player: Player;
  inv: Array<[string, number]>;
  rng: RngState;
  turn: number;
}

export function toSave(s: RunState): RunSave {
  return {
    seed: s.seed,
    floor: s.floor,
    explored: packBits(s.explored),
    player: { ...s.player },
    inv: [...s.inventory],
    rng: s.rng.state(),
    turn: s.turn,
  };
}

export function fromSave(save: RunSave): RunState {
  return {
    seed: save.seed,
    floor: save.floor,
    map: generateFloor(save.seed, save.floor),
    explored: unpackBits(save.explored, W * H),
    player: { ...save.player },
    inventory: new Map(save.inv),
    rng: restoreRng(save.rng),
    turn: save.turn,
  };
}

export const codec = createSaveCode<RunSave>({ gameId: 'dungeon', version: 1 });

// ---------------------------------------------------------------------------
// Simulation helpers (tests / measurement only)

/** Walk the player around, revealing tiles within `radius`, for `steps` moves. */
export function simulate(state: RunState, steps: number, radius = 3): void {
  const { tiles } = state.map;
  for (let n = 0; n < steps; n++) {
    const { x, y } = state.player;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (tx >= 0 && ty >= 0 && tx < W && ty < H && dx * dx + dy * dy <= radius * radius) {
          state.explored[ty * W + tx] = 1;
        }
      }
    }
    const moves = (
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const
    ).filter(([mx, my]) => tiles[(y + my) * W + (x + mx)] === 1);
    if (moves.length) {
      const [mx, my] = state.rng.pick(moves);
      state.player.x += mx;
      state.player.y += my;
    }
    state.turn++;
    if (state.rng.chance(0.05)) {
      const item = state.rng.weighted<string>([
        ['potion', 50],
        ['scroll', 25],
        ['arrow', 20],
        [`gem-${state.rng.int(1, 30)}`, 5],
      ]);
      state.inventory.set(item, (state.inventory.get(item) ?? 0) + 1);
    }
  }
}

export function newRun(seed: string, floor = 1): RunState {
  const map = generateFloor(seed, floor);
  return {
    seed,
    floor,
    map,
    explored: new Uint8Array(W * H),
    player: { ...map.start, hp: 20, maxHp: 20, lvl: 1, xp: 0 },
    inventory: new Map([['potion', 2]]),
    rng: createRng(deriveSeed(seed, 'play')),
    turn: 0,
  };
}

/** The anti-pattern, for comparison: save the generated map itself. */
export function naiveSave(s: RunState): unknown {
  return {
    floor: s.floor,
    tiles: Array.from(s.map.tiles),
    explored: Array.from(s.explored),
    player: s.player,
    inv: Object.fromEntries(s.inventory),
    turn: s.turn,
  };
}
