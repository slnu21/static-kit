// Small byte helpers shared by save/code. No dependencies.

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
let B64_REV: Int16Array | undefined;

/** Bytes → base64url (RFC 4648 §5, no padding). */
export function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[n >>> 18]! + B64[(n >>> 12) & 63]! + B64[(n >>> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[n >>> 18]! + B64[(n >>> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[n >>> 18]! + B64[(n >>> 12) & 63]! + B64[(n >>> 6) & 63]!;
  }
  return out;
}

/** base64url → bytes. Returns `undefined` on an invalid character or impossible length. */
export function fromBase64Url(text: string): Uint8Array | undefined {
  if (!B64_REV) {
    B64_REV = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++) B64_REV[B64.charCodeAt(i)] = i;
  }
  const rev = B64_REV;
  if (text.length % 4 === 1) return undefined;
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    const v = c < 128 ? rev[c]! : -1;
    if (v < 0) return undefined;
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

let CRC_TABLE: Uint32Array | undefined;

/** CRC-32 (IEEE 802.3, same as zip/png). Optional `seed` continues a previous CRC. */
export function crc32(bytes: Uint8Array, seed = 0): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  const t = CRC_TABLE;
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** uint32 → 4 big-endian bytes. */
export function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

async function pipe(bytes: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** `true` when `CompressionStream('deflate-raw')` is usable here. */
export function hasDeflateRaw(): boolean {
  try {
    if (typeof CompressionStream !== 'function' || typeof DecompressionStream !== 'function') return false;
    new CompressionStream('deflate-raw');
    return true;
  } catch {
    return false;
  }
}

export function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
}

export function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
}
