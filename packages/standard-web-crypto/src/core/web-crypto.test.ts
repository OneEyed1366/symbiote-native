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
  describe('Positive', () => {
    it('delegates a supported typed array to @symbiote-native/crypto', async () => {
      // why: this package adds no randomness of its own — it exists only to reshape
      // @symbiote-native/crypto behind the W3C `Crypto.getRandomValues` signature, so the native
      // result (both the returned array and its filled contents) must pass through untouched.
      const { default: webCrypto } = await import('./web-crypto');
      const typedArray = new Uint8Array(4);

      const result = webCrypto.getRandomValues(typedArray);

      expect(result).toBe(typedArray);
      expect(getRandomValues).toHaveBeenCalledWith(typedArray);
      expect(Array.from(typedArray)).toEqual([7, 7, 7, 7]);
    });
  });

  describe('Negative', () => {
    it('throws a TypeError for a view outside the supported integer TypedArrays', async () => {
      // why: @symbiote-native/crypto's native call only accepts the integer TypedArrays it can
      // hand to the native module — a DataView or Float array must be rejected here, before
      // reaching the native boundary, with a clear error rather than an opaque native-side one.
      const { default: webCrypto } = await import('./web-crypto');

      expect(() =>
        webCrypto.getRandomValues(new DataView(new ArrayBuffer(4))),
      ).toThrow(TypeError);
      expect(getRandomValues).not.toHaveBeenCalled();
    });
  });
});

describe('webCrypto singleton', () => {
  describe('Positive', () => {
    it('is the polyfill instance when globalThis.crypto is absent', async () => {
      // why: React Native ships no `crypto` global, so the singleton must fall back to this
      // package's own Crypto implementation rather than leaving `getRandomValues` undefined.
      const { default: webCrypto } = await import('./web-crypto');

      expect(typeof webCrypto.getRandomValues).toBe('function');
    });

    it('reuses an existing globalThis.crypto instead of the polyfill', async () => {
      // why: a host environment (Node in tests, or a future RN engine with real WebCrypto) that
      // already implements the API must win over this polyfill — replacing a real implementation
      // with a partial one would be a regression, not a safety net.
      const existingCrypto = { getRandomValues: vi.fn() };
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: existingCrypto,
      });

      const { default: webCrypto } = await import('./web-crypto');

      expect(webCrypto).toBe(existingCrypto);
    });

    it('ignores an existing globalThis.crypto that does not implement getRandomValues', async () => {
      // why: some other native module could define a `crypto` global for an unrelated purpose
      // before this one loads — isWebCrypto's shape check must reject that instead of adopting a
      // singleton whose getRandomValues is missing, which would fail at call time instead of here.
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { notGetRandomValues: () => {} },
      });

      const { default: webCrypto } = await import('./web-crypto');

      expect(typeof webCrypto.getRandomValues).toBe('function');
      expect(webCrypto.getRandomValues(new Uint8Array(1))).toBeInstanceOf(
        Uint8Array,
      );
    });
  });
});

describe('polyfillWebCrypto', () => {
  describe('Positive', () => {
    it('defines globalThis.crypto when it is absent', async () => {
      // why: consumer code (and any third-party lib assuming a Web Crypto global) must be able to
      // call `globalThis.crypto.getRandomValues` directly after opting in, without importing this
      // package's default export first.
      const { default: webCrypto, polyfillWebCrypto } =
        await import('./web-crypto');

      expect(Reflect.get(globalThis, 'crypto')).toBeUndefined();

      polyfillWebCrypto();

      expect(Reflect.get(globalThis, 'crypto')).toBe(webCrypto);
    });

    it('does not overwrite an existing globalThis.crypto', async () => {
      // why: calling polyfillWebCrypto() must be safe to do unconditionally at app startup —
      // it must never clobber a real host implementation that was already present.
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
});
