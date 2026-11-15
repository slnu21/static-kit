// Daily-puzzle helpers: date keys in a chosen time zone, puzzle numbers,
// streaks, and share text. Date math is done on calendar days (UTC epoch days),
// so DST changes never produce a 23- or 25-hour "day".

/** Calendar day as `YYYY-MM-DD`. */
export type DateKey = string;

export interface DailyOptions {
  /**
   * IANA time zone that defines when "today" rolls over, e.g. `'UTC'`, `'Asia/Seoul'`.
   * Default: the user's local zone. Use a fixed zone if everyone must share the same puzzle.
   */
  timeZone?: string;
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined): Intl.DateTimeFormat {
  const id = timeZone ?? '';
  let f = fmtCache.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    fmtCache.set(id, f);
  }
  return f;
}

function wallClock(date: Date | number, timeZone: string | undefined) {
  const parts = formatter(timeZone).formatToParts(typeof date === 'number' ? new Date(date) : date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** The calendar date of `date` (default now) in the chosen time zone, as `YYYY-MM-DD`. */
export function dateKey(date: Date | number = Date.now(), options: DailyOptions = {}): DateKey {
  const w = wallClock(date, options.timeZone);
  return `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`;
}

/** Parse and validate a `YYYY-MM-DD` key. Throws `RangeError` on invalid input. */
export function parseDateKey(key: DateKey): { year: number; month: number; day: number } {
  const m = DATE_KEY.exec(key);
  if (!m) throw new RangeError(`Invalid date key "${key}" (expected YYYY-MM-DD)`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new RangeError(`Invalid calendar date "${key}"`);
  }
  return { year, month, day };
}

/** Days since 1970-01-01 for a date key. */
export function epochDay(key: DateKey): number {
  const { year, month, day } = parseDateKey(key);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Date key for an epoch day number. */
export function fromEpochDay(n: number): DateKey {
  const d = new Date(n * 86_400_000);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** `key` shifted by `days` (may be negative). */
export function addDays(key: DateKey, days: number): DateKey {
  return fromEpochDay(epochDay(key) + days);
}

/** Whole days from `from` to `to` (`to - from`). */
export function daysBetween(from: DateKey, to: DateKey): number {
  return epochDay(to) - epochDay(from);
}

function toKey(when: Date | number | DateKey | undefined, options: DailyOptions): DateKey {
  if (typeof when === 'string') {
    parseDateKey(when);
    return when;
  }
  return dateKey(when ?? Date.now(), options);
}

/**
 * Puzzle number: `1` on `launch` day, `2` the next day, ...
 * Returns `<= 0` before launch.
 */
export function puzzleNumber(launch: DateKey, when?: Date | number | DateKey, options: DailyOptions = {}): number {
  return daysBetween(launch, toKey(when, options)) + 1;
}

/** Seed string for today's puzzle: `"<gameId>/<YYYY-MM-DD>"`. Feed it to `createRng`. */
export function dailySeed(gameId: string, when?: Date | number | DateKey, options: DailyOptions = {}): string {
  return `${gameId}/${toKey(when, options)}`;
}

/**
 * Milliseconds until the next day starts in the chosen zone (for a countdown).
 * Approximate on DST-transition days (off by the DST shift for that one day).
 */
export function msUntilNextDay(now: Date | number = Date.now(), options: DailyOptions = {}): number {
  const t = typeof now === 'number' ? now : now.getTime();
  const w = wallClock(t, options.timeZone);
  const elapsed = (w.hour * 3600 + w.minute * 60 + w.second) * 1000 + (((t % 1000) + 1000) % 1000);
  return 86_400_000 - elapsed;
}

// ---------------------------------------------------------------------------
// Streaks

/** Compact streak state to persist (no full history needed). */
export interface StreakState {
  /** Length of the streak ending on `last`. */
  current: number;
  /** Longest streak ever. */
  best: number;
  /** Last day played, or `undefined` if never. */
  last?: DateKey;
}

export interface StreakSummary {
  /** Streak still alive today (played today, or played yesterday and today not yet). */
  current: number;
  best: number;
  playedToday: boolean;
  last: DateKey | undefined;
}

/**
 * Record a play on `today`. Idempotent for the same day; a gap of 2+ days resets to 1.
 * Plays dated before `last` are ignored (clock moved backwards).
 */
export function recordPlay(state: StreakState | undefined, today: DateKey): StreakState {
  parseDateKey(today);
  const s = state ?? { current: 0, best: 0 };
  if (!s.last) return { current: 1, best: Math.max(1, s.best), last: today };
  const gap = daysBetween(s.last, today);
  if (gap <= 0) return { ...s };
  const current = gap === 1 ? s.current + 1 : 1;
  return { current, best: Math.max(s.best, current), last: today };
}

/** Streak as seen on `today` (a streak whose last play is older than yesterday shows 0). */
export function streakOn(state: StreakState | undefined, today: DateKey): StreakSummary {
  if (!state?.last) return { current: 0, best: state?.best ?? 0, playedToday: false, last: undefined };
  const gap = daysBetween(state.last, today);
  return {
    current: gap === 0 || gap === 1 ? state.current : 0,
    best: state.best,
    playedToday: gap === 0,
    last: state.last,
  };
}

/** Streak from a full list of played days (any order, duplicates allowed). */
export function computeStreak(played: Iterable<DateKey>, today: DateKey): StreakSummary {
  const days = [...new Set([...played].map(epochDay))].sort((a, b) => a - b);
  let state: StreakState | undefined;
  for (const d of days) state = recordPlay(state, fromEpochDay(d));
  return streakOn(state, today);
}

// ---------------------------------------------------------------------------
// Share text

export interface ShareTextOptions {
  /** Game title, e.g. `'Tilewords'`. */
  title: string;
  /** Puzzle number (`#123`). */
  number?: number;
  /** Score line, e.g. `'4/6'` or `'03:12'`. */
  score?: string;
  /** Emoji grid rows (see {@link emojiGrid}). */
  grid?: readonly string[];
  /** Extra lines after the grid. */
  extra?: readonly string[];
  /** URL appended last. */
  url?: string;
}

/** Build the classic share block: `"Title #123 4/6\n\n🟩🟨⬛\n...\nhttps://..."`. */
export function shareText(o: ShareTextOptions): string {
  const head = [o.title, o.number !== undefined ? `#${o.number}` : '', o.score ?? ''].filter(Boolean).join(' ');
  const blocks: string[] = [head];
  if (o.grid?.length) blocks.push(o.grid.join('\n'));
  if (o.extra?.length) blocks.push(o.extra.join('\n'));
  if (o.url) blocks.push(o.url);
  return blocks.join('\n\n');
}

/** Map a grid of numbers to emoji rows: `emojiGrid([[2,1,0]], ['⬛','🟨','🟩'])` → `['🟩🟨⬛']`. */
export function emojiGrid(rows: ReadonlyArray<ReadonlyArray<number>>, palette: readonly string[]): string[] {
  return rows.map((row) => row.map((v) => palette[v] ?? '?').join(''));
}

/**
 * Share via the Web Share API, else copy to clipboard. Never throws.
 * Resolves `'shared' | 'copied' | 'failed'`.
 */
export async function shareOrCopy(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  try {
    if (nav?.share) {
      await nav.share({ text });
      return 'shared';
    }
  } catch (err) {
    // User cancelled the share sheet: do not fall through to clipboard.
    if ((err as { name?: string })?.name === 'AbortError') return 'failed';
  }
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    /* fall through */
  }
  return 'failed';
}
