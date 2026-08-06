import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getRandomValues = vi.fn((typedArray: Uint8Array) => {
  typedArray.fill(7);
  return typedArray;
});

// @symbiote-native/crypto resolves the real native module via requireNativeModule() at import
// time, which would throw in this headless test run — faked here in place of the sibling
// package, the same pattern packages/crypto/src/core/crypto.test.ts uses for expo-modules-core.
vi.mock('@symbiote-native/crypto', () => ({
  getRandomValues,
}));

// Node (unlike React Native) ships its own native `globalThis.crypto` — deleted before every test
// so `web-crypto.ts`'s module-load-time feature detection sees the same "no crypto global" state
// it would on-device, not Node's own WebCrypto implementation.
beforeEach(() => {
  Reflect.deleteProperty(globalThis, 'crypto');
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, 'crypto');
  vi.resetModules();
});

describe('webCrypto.getRandomValues', () => {
  it('delegates a supported typed array to @symbiote-native/crypto', async () => {
    const { default: webCrypto } = await import('./web-crypto');
    const typedArray = new Uint8Array(4);

    const result = webCrypto.getRandomValues(typedArray);

    expect(result).toBe(typedArray);
    expect(getRandomValues).toHaveBeenCalledWith(typedArray);
    expect(Array.from(typedArray)).toEqual([7, 7, 7, 7]);
  });

  it('throws a TypeError for a view outside the supported integer TypedArrays', async () => {
    const { default: webCrypto } = await import('./web-crypto');

    expect(() => webCrypto.getRandomValues(new DataView(new ArrayBuffer(4)))).toThrow(TypeError);
    expect(getRandomValues).not.toHaveBeenCalled();
  });
});

describe('webCrypto singleton', () => {
  it('is the polyfill instance when globalThis.crypto is absent', async () => {
    const { default: webCrypto } = await import('./web-crypto');

    expect(typeof webCrypto.getRandomValues).toBe('function');
  });

  it('reuses an existing globalThis.crypto instead of the polyfill', async () => {
    const existingCrypto = { getRandomValues: vi.fn() };
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: existingCrypto,
    });

    const { default: webCrypto } = await import('./web-crypto');

    expect(webCrypto).toBe(existingCrypto);
  });
});

describe('polyfillWebCrypto', () => {
  it('defines globalThis.crypto when it is absent', async () => {
    const { default: webCrypto, polyfillWebCrypto } = await import('./web-crypto');

    expect(Reflect.get(globalThis, 'crypto')).toBeUndefined();

    polyfillWebCrypto();

    expect(Reflect.get(globalThis, 'crypto')).toBe(webCrypto);
  });

  it('does not overwrite an existing globalThis.crypto', async () => {
    const existingCrypto = { getRandomValues: vi.fn() };
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: existingCrypto,
    });

    const { polyfillWebCrypto } = await import('./web-crypto');
    polyfillWebCrypto();

    expect(Reflect.get(globalThis, 'crypto')).toBe(existingCrypto);
  });
});
