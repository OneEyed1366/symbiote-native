import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CRYPTO = {
  getRandomValues: vi.fn((typedArray: Uint8Array) => {
    typedArray.fill(7);
  }),
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
  digestStringAsync: vi.fn(async () => 'fake-digest-hex'),
  digestAsync: vi.fn(async () => new ArrayBuffer(32)),
  digest: vi.fn((_algorithm: string, output: Uint8Array) => {
    output.fill(9);
  }),
};

// The real ExpoCrypto native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-module', () => ({
  expoCrypto: FAKE_NATIVE_CRYPTO,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getRandomBytes,
  getRandomBytesAsync,
  getRandomValues,
  randomUUID,
  digestStringAsync,
  digest,
} = await import('./crypto');
const { CryptoDigestAlgorithm, CryptoEncoding } = await import('./types');

afterEach(() => {
  vi.clearAllMocks();
});

describe('getRandomBytes', () => {
  it('accepts the lower bound (0)', () => {
    const result = getRandomBytes(0);
    expect(result).toHaveLength(0);
  });

  it('accepts the upper bound (1024)', () => {
    const result = getRandomBytes(1024);
    expect(result).toHaveLength(1024);
    expect(FAKE_NATIVE_CRYPTO.getRandomValues).toHaveBeenCalledTimes(1);
  });

  it('floors a fractional byteCount', () => {
    const result = getRandomBytes(4.9);
    expect(result).toHaveLength(4);
  });

  it('rejects a negative byteCount', () => {
    expect(() => getRandomBytes(-1)).toThrow(TypeError);
  });

  it('rejects a byteCount above 1024', () => {
    expect(() => getRandomBytes(1025)).toThrow(TypeError);
  });

  it('rejects a non-number byteCount', () => {
    // @ts-expect-error -- exercising the runtime guard against a caller ignoring the types
    expect(() => getRandomBytes('16')).toThrow(TypeError);
  });

  it('rejects NaN', () => {
    expect(() => getRandomBytes(NaN)).toThrow(TypeError);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', () => {
    const { getRandomValues: native } = FAKE_NATIVE_CRYPTO;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CRYPTO.getRandomValues = undefined;

    expect(() => getRandomBytes(4)).toThrow('getRandomBytes is not available on expo-crypto');

    FAKE_NATIVE_CRYPTO.getRandomValues = native;
  });
});

describe('getRandomBytesAsync', () => {
  it('accepts the lower and upper bound', async () => {
    await expect(getRandomBytesAsync(0)).resolves.toHaveLength(0);
    await expect(getRandomBytesAsync(1024)).resolves.toHaveLength(1024);
  });

  it('rejects a negative byteCount', async () => {
    await expect(getRandomBytesAsync(-1)).rejects.toThrow(TypeError);
  });

  it('rejects a byteCount above 1024', async () => {
    await expect(getRandomBytesAsync(1025)).rejects.toThrow(TypeError);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getRandomValues: native } = FAKE_NATIVE_CRYPTO;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CRYPTO.getRandomValues = undefined;

    await expect(getRandomBytesAsync(4)).rejects.toThrow(
      'getRandomBytesAsync is not available on expo-crypto',
    );

    FAKE_NATIVE_CRYPTO.getRandomValues = native;
  });
});

describe('getRandomValues', () => {
  it('fills the provided typed array in place and returns it', () => {
    const typedArray = new Uint8Array(4);
    const result = getRandomValues(typedArray);

    expect(result).toBe(typedArray);
    expect(FAKE_NATIVE_CRYPTO.getRandomValues).toHaveBeenCalledWith(typedArray);
    expect(Array.from(typedArray)).toEqual([7, 7, 7, 7]);
  });
});

describe('randomUUID', () => {
  it('returns the native UUID directly', () => {
    expect(randomUUID()).toBe('00000000-0000-4000-8000-000000000000');
  });
});

describe('digestStringAsync', () => {
  it('defaults to HEX encoding when options are omitted', async () => {
    await digestStringAsync(CryptoDigestAlgorithm.SHA256, 'hello');

    expect(FAKE_NATIVE_CRYPTO.digestStringAsync).toHaveBeenCalledWith(
      CryptoDigestAlgorithm.SHA256,
      'hello',
      { encoding: CryptoEncoding.HEX },
    );
  });

  it('passes through a custom encoding', async () => {
    await digestStringAsync(CryptoDigestAlgorithm.SHA1, 'hello', {
      encoding: CryptoEncoding.BASE64,
    });

    expect(FAKE_NATIVE_CRYPTO.digestStringAsync).toHaveBeenCalledWith(
      CryptoDigestAlgorithm.SHA1,
      'hello',
      { encoding: CryptoEncoding.BASE64 },
    );
  });

  it('resolves with the native digest', async () => {
    await expect(digestStringAsync(CryptoDigestAlgorithm.MD5, 'hello')).resolves.toBe(
      'fake-digest-hex',
    );
  });

  it('rejects an invalid algorithm', async () => {
    // @ts-expect-error -- exercising the runtime guard against an invalid algorithm value
    await expect(digestStringAsync('NOT-A-REAL-ALGORITHM', 'hello')).rejects.toThrow(
      'Invalid algorithm provided',
    );
    expect(FAKE_NATIVE_CRYPTO.digestStringAsync).not.toHaveBeenCalled();
  });

  it('rejects non-string data', async () => {
    // @ts-expect-error -- exercising the runtime guard against non-string data
    await expect(digestStringAsync(CryptoDigestAlgorithm.SHA256, 12345)).rejects.toThrow(
      'Invalid data provided',
    );
  });

  it('rejects an invalid encoding', async () => {
    await expect(
      // @ts-expect-error -- exercising the runtime guard against an invalid encoding value
      digestStringAsync(CryptoDigestAlgorithm.SHA256, 'hello', { encoding: 'not-an-encoding' }),
    ).rejects.toThrow('Invalid encoding provided');
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { digestStringAsync: native } = FAKE_NATIVE_CRYPTO;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_CRYPTO.digestStringAsync = undefined;

    await expect(digestStringAsync(CryptoDigestAlgorithm.SHA256, 'hello')).rejects.toThrow(
      'digestStringAsync is not available on expo-crypto',
    );

    FAKE_NATIVE_CRYPTO.digestStringAsync = native;
  });
});

describe('digest', () => {
  it('prefers digestAsync when the native module implements it', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await digest(CryptoDigestAlgorithm.SHA256, data);

    expect(FAKE_NATIVE_CRYPTO.digestAsync).toHaveBeenCalledWith(CryptoDigestAlgorithm.SHA256, data);
    expect(FAKE_NATIVE_CRYPTO.digest).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(32);
  });

  it('falls back to the sync digest + digestLengths lookup table when digestAsync is absent', async () => {
    const { digestAsync: native } = FAKE_NATIVE_CRYPTO;
    // @ts-expect-error -- simulating a platform where the native module has no digestAsync
    FAKE_NATIVE_CRYPTO.digestAsync = undefined;

    const data = new Uint8Array([1, 2, 3]);
    const result = await digest(CryptoDigestAlgorithm.SHA1, data);

    expect(FAKE_NATIVE_CRYPTO.digest).toHaveBeenCalledTimes(1);
    const [algorithm, output, passedData] = FAKE_NATIVE_CRYPTO.digest.mock.calls[0];
    expect(algorithm).toBe(CryptoDigestAlgorithm.SHA1);
    expect(output).toHaveLength(20); // SHA1's entry in digestLengths
    expect(passedData).toBe(data);
    expect(result.byteLength).toBe(20);
    expect(Array.from(new Uint8Array(result))).toEqual(new Array(20).fill(9));

    FAKE_NATIVE_CRYPTO.digestAsync = native;
  });

  it('rejects when neither digestAsync nor digest is available', async () => {
    const { digestAsync: nativeAsync, digest: nativeSync } = FAKE_NATIVE_CRYPTO;
    // @ts-expect-error -- simulating a platform where the native module has neither method
    FAKE_NATIVE_CRYPTO.digestAsync = undefined;
    // @ts-expect-error -- simulating a platform where the native module has neither method
    FAKE_NATIVE_CRYPTO.digest = undefined;

    await expect(digest(CryptoDigestAlgorithm.SHA256, new Uint8Array([1]))).rejects.toThrow(
      'digest is not available on expo-crypto',
    );

    FAKE_NATIVE_CRYPTO.digestAsync = nativeAsync;
    FAKE_NATIVE_CRYPTO.digest = nativeSync;
  });
});
