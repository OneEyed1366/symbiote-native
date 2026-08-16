import { UnavailabilityError } from 'expo-modules-core';

import { expoCrypto } from './native-module';
import { CryptoDigestAlgorithm, CryptoEncoding } from './types';
import type { ICryptoDigestOptions, IDigest, ITypedArray } from './types';

const NATIVE_MODULE_NAME = 'expo-crypto';
const MIN_BYTE_COUNT = 0;
const MAX_BYTE_COUNT = 1024;

export class CryptoError extends TypeError {
  code = 'ERR_CRYPTO';

  constructor(message: string) {
    super(`expo-crypto: ${message}`);
  }
}

function assertByteCount(value: number, methodName: string): void {
  if (
    typeof value !== 'number' ||
    Number.isNaN(value) ||
    Math.floor(value) < MIN_BYTE_COUNT ||
    Math.floor(value) > MAX_BYTE_COUNT
  ) {
    throw new TypeError(
      `expo-crypto: ${methodName}(${value}) expected a valid number from range ${MIN_BYTE_COUNT}...${MAX_BYTE_COUNT}`,
    );
  }
}

function assertAlgorithm(algorithm: CryptoDigestAlgorithm): void {
  if (!Object.values(CryptoDigestAlgorithm).includes(algorithm)) {
    throw new CryptoError(
      `Invalid algorithm provided. Expected one of: CryptoDigestAlgorithm.${Object.keys(
        CryptoDigestAlgorithm,
      ).join(', CryptoDigestAlgorithm.')}`,
    );
  }
}

function assertData(data: string): void {
  if (typeof data !== 'string') {
    throw new CryptoError('Invalid data provided. Expected a string.');
  }
}

function assertEncoding(encoding: CryptoEncoding): void {
  if (!Object.values(CryptoEncoding).includes(encoding)) {
    throw new CryptoError(
      `Invalid encoding provided. Expected one of: CryptoEncoding.${Object.keys(
        CryptoEncoding,
      ).join(', CryptoEncoding.')}`,
    );
  }
}

/**
 * Generates completely random bytes using native implementations. `byteCount` must be within
 * `0`-`1024` (inclusive), anything else throws a `TypeError`.
 */
export function getRandomBytes(byteCount: number): Uint8Array {
  assertByteCount(byteCount, 'getRandomBytes');
  const validByteCount = Math.floor(byteCount);
  if (!expoCrypto.getRandomValues) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getRandomBytes');
  }
  const byteArray = new Uint8Array(validByteCount);
  expoCrypto.getRandomValues(byteArray);
  return byteArray;
}

/**
 * Generates completely random bytes using native implementations. `byteCount` must be within
 * `0`-`1024` (inclusive), anything else throws a `TypeError`.
 */
export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  assertByteCount(byteCount, 'getRandomBytesAsync');
  const validByteCount = Math.floor(byteCount);
  if (!expoCrypto.getRandomValues) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getRandomBytesAsync');
  }
  const byteArray = new Uint8Array(validByteCount);
  expoCrypto.getRandomValues(byteArray);
  return byteArray;
}

/**
 * Fills the provided `TypedArray` with cryptographically secure random values in place, and
 * returns it.
 */
export function getRandomValues<T extends ITypedArray>(typedArray: T): T {
  if (!expoCrypto.getRandomValues) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'getRandomValues');
  }
  expoCrypto.getRandomValues(typedArray);
  return typedArray;
}

/**
 * Returns a unique identifier based on the V4 UUID spec (RFC4122), using cryptographically
 * secure random values.
 */
export function randomUUID(): string {
  if (!expoCrypto.randomUUID) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'randomUUID');
  }
  return expoCrypto.randomUUID();
}

/**
 * Generates a digest of the supplied `data` string with the provided digest `algorithm`,
 * formatted as one of `CryptoEncoding` (defaults to `HEX`).
 */
export async function digestStringAsync(
  algorithm: CryptoDigestAlgorithm,
  data: string,
  options: ICryptoDigestOptions = { encoding: CryptoEncoding.HEX },
): Promise<IDigest> {
  if (!expoCrypto.digestStringAsync) {
    throw new UnavailabilityError(NATIVE_MODULE_NAME, 'digestStringAsync');
  }

  assertAlgorithm(algorithm);
  assertData(data);
  assertEncoding(options.encoding);

  return expoCrypto.digestStringAsync(algorithm, data, options);
}

// Fixed output length (in bytes) per digest algorithm — used only as the sync fallback's
// preallocated output buffer size when the native module has no digestAsync.
const digestLengths: Record<CryptoDigestAlgorithm, number> = {
  [CryptoDigestAlgorithm.SHA1]: 20,
  [CryptoDigestAlgorithm.SHA256]: 32,
  [CryptoDigestAlgorithm.SHA384]: 48,
  [CryptoDigestAlgorithm.SHA512]: 64,
  [CryptoDigestAlgorithm.MD2]: 16,
  [CryptoDigestAlgorithm.MD4]: 16,
  [CryptoDigestAlgorithm.MD5]: 16,
};

// UPSTREAM-BUG(expo): .vendors/expo/packages/expo-crypto/src/Crypto.ts:205 - digest() has none
// of digestStringAsync's guards, so an unknown algorithm leaves digestLengths[algorithm]
// undefined and new Uint8Array(undefined) zero-length.
// The caller gets an empty ArrayBuffer resolved as SUCCESS - no throw, nothing to catch, a hash
// that silently is not one.
// Ported verbatim for parity; do NOT fix without recording a deliberate divergence.
/**
 * Generates a digest of the supplied `TypedArray`/`ArrayBuffer` of bytes with the provided digest
 * `algorithm`. Prefers the native async `digestAsync` when present; otherwise falls back to
 * allocating a fixed-size output buffer (sized via `digestLengths`) and the sync `digest`.
 */
export function digest(algorithm: CryptoDigestAlgorithm, data: BufferSource): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    try {
      if (typeof expoCrypto.digestAsync === 'function') {
        resolve(expoCrypto.digestAsync(algorithm, data));
        return;
      }
      if (!expoCrypto.digest) {
        throw new UnavailabilityError(NATIVE_MODULE_NAME, 'digest');
      }
      const output = new Uint8Array(digestLengths[algorithm]);
      expoCrypto.digest(algorithm, output, data);
      resolve(output.buffer);
    } catch (error) {
      reject(error);
    }
  });
}
