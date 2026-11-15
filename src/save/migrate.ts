import { SaveError } from './errors';

/**
 * Migration table. `migrations[v]` upgrades data written at version `v`
 * to version `v + 1`. Loading data at `v` applies `migrations[v]`,
 * `migrations[v + 1]`, ... up to the current version.
 */
export type Migrations = Readonly<Record<number, (data: any) => unknown>>;

/** Result of {@link migrate}. */
export interface MigrateResult<T> {
  data: T;
  /** Version the data was written at. */
  from: number;
  /** `true` when at least one migration step ran. */
  migrated: boolean;
}

/** Validate a version number (non-negative safe integer). */
export function assertVersion(v: unknown, what = 'version'): asserts v is number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) {
    throw new TypeError(`${what} must be a non-negative integer, got ${String(v)}`);
  }
}

/**
 * Bring `data` saved at version `from` up to `to`.
 * Throws `VERSION_TOO_NEW` if `from > to`, `MISSING_MIGRATION` if a step is absent.
 */
export function migrate<T = unknown>(
  data: unknown,
  from: number,
  to: number,
  migrations: Migrations = {},
): MigrateResult<T> {
  if (from > to) {
    throw new SaveError(
      'VERSION_TOO_NEW',
      `Save data is version ${from}, but this build only understands up to version ${to}. Update the app.`,
    );
  }
  let cur = data;
  for (let v = from; v < to; v++) {
    const step = migrations[v];
    if (typeof step !== 'function') {
      throw new SaveError('MISSING_MIGRATION', `No migration from version ${v} to ${v + 1}.`);
    }
    try {
      cur = step(cur);
    } catch (cause) {
      throw new SaveError('MIGRATION_FAILED', `Migration ${v} -> ${v + 1} failed.`, { cause });
    }
  }
  return { data: cur as T, from, migrated: from < to };
}
