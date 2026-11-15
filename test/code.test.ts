import { describe, expect, it } from 'vitest';
import {
  crc32,
  createSaveCode,
  fromBase64Url,
  inspectCode,
  isSaveError,
  packBits,
  toBase64Url,
  unpackBits,
  type SaveErrorCode,
} from '../src/save/code';

const sample = { name: '모험가', floor: 3, hp: 17, inv: ['sword', 'potion', 'potion'], seed: 'abc' };

async function expectCode(p: Promise<unknown>, code: SaveErrorCode) {
  await expect(p).rejects.toSatisfy((e) => isSaveError(e, code));
}

describe('bytes helpers', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('base64url round-trips every length and matches RFC 4648 vectors', () => {
    expect(toBase64Url(new TextEncoder().encode('foobar'))).toBe('Zm9vYmFy');
    expect(toBase64Url(new TextEncoder().encode('fo'))).toBe('Zm8');
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    for (let n = 0; n < 40; n++) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) & 0xff);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    }
    expect(fromBase64Url('ab$d')).toBeUndefined();
    expect(fromBase64Url('abcde')).toBeUndefined();
  });

  it('packBits / unpackBits round-trip', () => {
    const bits = Array.from({ length: 77 }, (_, i) => i % 3 === 0);
    const packed = packBits(bits);
    expect(packed).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Array.from(unpackBits(packed, 77), Boolean)).toEqual(bits);
    expect(() => unpackBits('A', 77)).toThrow(expect.objectContaining({ code: 'CORRUPT' }));
  });
});

describe('createSaveCode', () => {
  const codec = createSaveCode<typeof sample>({ gameId: 'dungeon', version: 2 });

  it('round-trips data (including non-ASCII)', async () => {
    const code = await codec.exportCode(sample);
    expect(code).toMatch(/^dungeon\.2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{6}$/);
    expect(await codec.importCode(code)).toEqual(sample);
    expect(inspectCode(code)).toMatchObject({ gameId: 'dungeon', v: 2 });
  });

  it('is deterministic for the same data', async () => {
    expect(await codec.exportCode(sample)).toBe(await codec.exportCode({ ...sample }));
  });

  it('tolerates surrounding whitespace and line wrapping', async () => {
    const code = await codec.exportCode(sample);
    const wrapped = `  \n${code.match(/.{1,10}/g)!.join('\n')}\r\n\t `;
    expect(await codec.importCode(wrapped)).toEqual(sample);
  });

  it('detects a single-character typo in the payload', async () => {
    const code = await codec.exportCode(sample);
    const parts = code.split('.');
    const p = parts[2]!;
    const i = Math.floor(p.length / 2);
    parts[2] = p.slice(0, i) + (p[i] === 'A' ? 'B' : 'A') + p.slice(i + 1);
    await expectCode(codec.importCode(parts.join('.')), 'CHECKSUM');
  });

  it('detects truncation', async () => {
    const code = await codec.exportCode(sample);
    // cut inside the checksum, inside the payload, and before the payload
    await expectCode(codec.importCode(code.slice(0, -2)), 'CHECKSUM');
    await expectCode(codec.importCode(code.slice(0, code.length - 12)), 'BAD_FORMAT');
    await expectCode(codec.importCode('dungeon.2.'), 'BAD_FORMAT');
    await expectCode(codec.importCode(''), 'BAD_FORMAT');
  });

  it('detects a truncated payload with the checksum re-attached', async () => {
    const code = await codec.exportCode(sample);
    const [g, v, payload, check] = code.split('.');
    await expectCode(codec.importCode(`${g}.${v}.${payload!.slice(0, -3)}.${check}`), 'CHECKSUM');
  });

  it('rejects codes from another game', async () => {
    const other = createSaveCode({ gameId: 'puzzle', version: 2 });
    await expectCode(codec.importCode(await other.exportCode(sample)), 'WRONG_GAME');
  });

  it('migrates older codes and rejects newer ones', async () => {
    const v1 = createSaveCode({ gameId: 'dungeon', version: 1 });
    const v4 = createSaveCode({ gameId: 'dungeon', version: 4, migrations: {} });
    const oldCode = await v1.exportCode({ name: 'x' });

    const v3 = createSaveCode<{ name: string; hp: number; gold: number }>({
      gameId: 'dungeon',
      version: 3,
      migrations: { 1: (d) => ({ ...d, hp: 10 }), 2: (d) => ({ ...d, gold: 5 }) },
    });
    const r = await v3.importCodeDetailed(oldCode);
    expect(r).toEqual({ data: { name: 'x', hp: 10, gold: 5 }, from: 1, migrated: true });

    await expectCode(v3.importCode(await v4.exportCode({})), 'VERSION_TOO_NEW');
    await expectCode(createSaveCode({ gameId: 'dungeon', version: 3 }).importCode(oldCode), 'MISSING_MIGRATION');
  });

  it('tampering the version digit is caught by the checksum', async () => {
    const code = await codec.exportCode(sample);
    await expectCode(codec.importCode(code.replace('dungeon.2.', 'dungeon.1.')), 'CHECKSUM');
  });

  it('keyed checksum: same key round-trips, different/no key fails', async () => {
    const keyed = createSaveCode({ gameId: 'dungeon', version: 2, key: 'deterrent' });
    const code = await keyed.exportCode(sample);
    expect(await keyed.importCode(code)).toEqual(sample);
    await expectCode(codec.importCode(code), 'CHECKSUM');
    await expectCode(createSaveCode({ gameId: 'dungeon', version: 2, key: 'other' }).importCode(code), 'CHECKSUM');
  });

  it('rejects non-serializable data', async () => {
    await expect(createSaveCode({ gameId: 'g', version: 0 }).exportCode(undefined)).rejects.toThrow(TypeError);
  });

  it('reports CORRUPT when the checksum is valid but the payload is not deflate data', async () => {
    // Build a code whose CRC is correct over a garbage payload.
    const body = 'dungeon.2.AAAA';
    const check = toBase64Url(
      (() => {
        const n = crc32(new TextEncoder().encode(body));
        return new Uint8Array([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
      })(),
    );
    await expectCode(codec.importCode(`${body}.${check}`), 'CORRUPT');
  });
});
