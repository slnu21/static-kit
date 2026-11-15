import { crc32, deflateRaw, fromBase64Url, hasDeflateRaw, inflateRaw, toBase64Url, u32be } from './bytes';
import { SaveError } from './errors';
import { assertGameId } from './ids';
import { assertVersion, migrate, type Migrations } from './migrate';

export { SaveError, isSaveError, type SaveErrorCode } from './errors';
export { type Migrations } from './migrate';
export { crc32, toBase64Url, fromBase64Url, hasDeflateRaw } from './bytes';

/*
 * Save code format:   <gameId>.<v>.<payload>.<check>
 *   gameId   [A-Za-z0-9_-]{1,64}
 *   v        decimal schema version
 *   payload  base64url( deflate-raw( UTF-8( JSON ) ) )
 *   check    base64url( CRC-32 of "<gameId>.<v>.<payload>" ), 6 chars
 *
 * CRC-32 is an integrity check (catches typos and truncation), NOT encryption
 * and NOT a security boundary. With `key`, the CRC is seeded by a key that
 * ships inside the client: it deters casual editing, nothing more.
 */

export interface SaveCodeOptions {
  /** Must match the gameId embedded in imported codes. */
  gameId: string;
  /** Current schema version. Older codes are migrated, newer codes are rejected. */
  version: number;
  /** `migrations[v]` upgrades data from `v` to `v + 1` (same table as the save store). */
  migrations?: Migrations;
  /**
   * Optional tamper-deterrence key mixed into the checksum.
   * It lives in client code, so anyone can extract it: this is deterrence, not security.
   * Changing it invalidates every code issued with the old key.
   */
  key?: string;
}

/** Result of {@link SaveCodec.importCodeDetailed}. */
export interface ImportedCode<T> {
  data: T;
  /** Version embedded in the code (before migration). */
  from: number;
  migrated: boolean;
}

export interface SaveCodec<T = unknown> {
  readonly gameId: string;
  readonly version: number;
  /** Serialize `data` (JSON-compatible) into a copy-pasteable code. */
  exportCode(data: T): Promise<string>;
  /** Parse a code (whitespace anywhere is ignored) and return migrated data. */
  importCode(code: string): Promise<T>;
  /** Like `importCode`, plus version/migration info. */
  importCodeDetailed(code: string): Promise<ImportedCode<T>>;
}

/** Header fields of a code, readable without decompressing. */
export interface CodeParts {
  gameId: string;
  v: number;
  payload: string;
  check: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

/** Remove all whitespace (spaces, tabs, line breaks) — users paste wrapped or padded codes. */
export function normalizeCode(code: string): string {
  return code.replace(/\s+/g, '');
}

/**
 * Split a code into its parts without verifying the checksum.
 * Throws `BAD_FORMAT` if it is not `<gameId>.<v>.<payload>.<check>`.
 */
export function inspectCode(code: string): CodeParts {
  const parts = normalizeCode(code).split('.');
  if (parts.length !== 4) {
    throw new SaveError(
      'BAD_FORMAT',
      parts.length < 4
        ? 'Save code is incomplete (missing sections). It may have been cut off while copying.'
        : 'Save code has too many sections.',
    );
  }
  const [gameId, vText, payload, check] = parts as [string, string, string, string];
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(gameId)) throw new SaveError('BAD_FORMAT', 'Save code has an invalid game id.');
  if (!/^\d{1,9}$/.test(vText)) throw new SaveError('BAD_FORMAT', 'Save code has an invalid version.');
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) throw new SaveError('BAD_FORMAT', 'Save code payload is empty or invalid.');
  return { gameId, v: Number(vText), payload, check };
}

function checksum(body: string, key: string | undefined): string {
  const seed = key === undefined ? 0 : crc32(enc.encode(`\u0000${key}\u0000`));
  return toBase64Url(u32be(crc32(enc.encode(body), seed)));
}

function requireDeflate(): void {
  if (!hasDeflateRaw()) {
    throw new SaveError(
      'UNSUPPORTED',
      "CompressionStream('deflate-raw') is not available (needs Chrome 103+, Firefox 113+, Safari 16.4+, Node 21.2+).",
    );
  }
}

/**
 * Create an exporter/importer for save codes.
 *
 * ```ts
 * const codec = createSaveCode<State>({ gameId: 'dungeon', version: 3, migrations });
 * const code = await codec.exportCode(state);   // { floor: 3, hp: 17, inv: ['sword'] } → "dungeon.3.q1ZKy8nPL1KyMtZRyihQsjI011HKzCtTsopWKi7PL0pRiq0FAA.XX782A"
 * const back = await codec.importCode(code);
 * ```
 */
export function createSaveCode<T = unknown>(options: SaveCodeOptions): SaveCodec<T> {
  const { gameId, version, migrations = {}, key } = options;
  assertGameId(gameId);
  assertVersion(version);

  const codec: SaveCodec<T> = {
    gameId,
    version,

    async exportCode(data) {
      requireDeflate();
      const json = JSON.stringify(data);
      if (json === undefined) throw new TypeError('exportCode: data is not JSON-serializable');
      const payload = toBase64Url(await deflateRaw(enc.encode(json)));
      const body = `${gameId}.${version}.${payload}`;
      return `${body}.${checksum(body, key)}`;
    },

    async importCodeDetailed(code) {
      const p = inspectCode(code);
      if (p.gameId !== gameId) {
        throw new SaveError('WRONG_GAME', `This save code is for "${p.gameId}", not "${gameId}".`);
      }
      if (p.check !== checksum(`${p.gameId}.${p.v}.${p.payload}`, key)) {
        throw new SaveError(
          'CHECKSUM',
          'Save code checksum does not match: it has a typo, was cut off, or was edited.',
        );
      }
      if (p.v > version) {
        throw new SaveError(
          'VERSION_TOO_NEW',
          `Save code is version ${p.v}, but this build only understands up to version ${version}. Update the app.`,
        );
      }
      requireDeflate();
      const bytes = fromBase64Url(p.payload);
      if (!bytes) throw new SaveError('CORRUPT', 'Save code payload is not valid base64url.');
      let data: unknown;
      try {
        data = JSON.parse(dec.decode(await inflateRaw(bytes)));
      } catch (cause) {
        throw new SaveError('CORRUPT', 'Save code payload could not be decoded.', { cause });
      }
      const m = migrate<T>(data, p.v, version, migrations);
      return { data: m.data, from: m.from, migrated: m.migrated };
    },

    async importCode(code) {
      return (await codec.importCodeDetailed(code)).data;
    },
  };
  return codec;
}

// ---------------------------------------------------------------------------
// Bit packing — compact storage for "explored tiles", "collected items", etc.

/**
 * Pack booleans (or 0/1) into a base64url string, 6 bits per char, LSB-first per byte.
 * A 64×64 exploration map (4096 bits) becomes 683 chars before compression.
 */
export function packBits(bits: ArrayLike<boolean | number>): string {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3]! |= 1 << (i & 7);
  return toBase64Url(bytes);
}

/** Inverse of {@link packBits}. Returns `length` entries of 0/1. Throws `CORRUPT` on bad input. */
export function unpackBits(text: string, length: number): Uint8Array {
  const bytes = fromBase64Url(text);
  if (!bytes || bytes.length < Math.ceil(length / 8)) {
    throw new SaveError('CORRUPT', 'Packed bit string is invalid or too short.');
  }
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (bytes[i >> 3]! >> (i & 7)) & 1;
  return out;
}
