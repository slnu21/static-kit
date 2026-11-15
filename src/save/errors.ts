/** Machine-readable reason attached to every {@link SaveError}. */
export type SaveErrorCode =
  /** Saved/coded version is newer than this build understands. */
  | 'VERSION_TOO_NEW'
  /** A migration step `migrations[v]` is missing. */
  | 'MISSING_MIGRATION'
  /** A migration function threw. */
  | 'MIGRATION_FAILED'
  /** Stored record is not `{ v, savedAt, data }`. */
  | 'BAD_RECORD'
  /** Save code does not look like `<gameId>.<v>.<payload>.<check>`. */
  | 'BAD_FORMAT'
  /** Save code belongs to a different game. */
  | 'WRONG_GAME'
  /** Checksum mismatch: typo, truncation, or (with a key) tampering. */
  | 'CHECKSUM'
  /** Checksum passed but the payload could not be decoded. */
  | 'CORRUPT'
  /** The runtime lacks a required API (e.g. CompressionStream). */
  | 'UNSUPPORTED'
  /** Backend read/write failed (quota, private mode, blocked IndexedDB...). */
  | 'BACKEND';

/** Error thrown by the `save/*` modules. Check `code` rather than `message`. */
export class SaveError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SaveError';
    this.code = code;
  }
}

/** Type guard: `true` when `err` is a {@link SaveError} (optionally with a given code). */
export function isSaveError(err: unknown, code?: SaveErrorCode): err is SaveError {
  return err instanceof SaveError && (code === undefined || err.code === code);
}
