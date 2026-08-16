import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_CLIPBOARD = {
  getStringAsync: vi.fn(async () => 'text'),
  setStringAsync: vi.fn(async () => true),
  hasStringAsync: vi.fn(async () => true),
  getUrlAsync: vi.fn(async () => 'https://example.com'),
  setUrlAsync: vi.fn(async () => undefined),
  hasUrlAsync: vi.fn(async () => true),
  getImageAsync: vi.fn(async () => ({
    data: 'data:image/png;base64,abc',
    size: { width: 1, height: 1 },
  })),
  setImageAsync: vi.fn(async () => undefined),
  hasImageAsync: vi.fn(async () => true),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoClipboard native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern @symbiote-native/local-auth's local-authentication.test.ts uses for native-module.
vi.mock('./native-module', () => ({
  expoClipboard: FAKE_NATIVE_CLIPBOARD,
  CLIPBOARD_CHANGED_EVENT_NAME: 'onClipboardChanged',
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// @symbiote-native/local-auth's local-authentication.test.ts uses.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getStringAsync,
  setStringAsync,
  hasStringAsync,
  getUrlAsync,
  setUrlAsync,
  hasUrlAsync,
  getImageAsync,
  setImageAsync,
  hasImageAsync,
  addClipboardListener,
  removeClipboardListener,
} = await import('./clipboard');

// Every optional native method (everything except addListener/removeAllListeners, which come
// from expo-modules-core's always-present EventEmitter base) is torn down and restored around
// each Negative test rather than left mutated for later tests — clipboard.test.ts has no
// beforeEach reset for this, only vi.clearAllMocks() in afterEach, which does NOT restore a
// deleted property.
function withNativeMethodRemoved<K extends keyof typeof FAKE_NATIVE_CLIPBOARD>(
  method: K,
  run: () => Promise<void>,
): Promise<void> {
  const original = FAKE_NATIVE_CLIPBOARD[method];
  // @ts-expect-error -- simulating a platform/native-build where this optional method is absent
  FAKE_NATIVE_CLIPBOARD[method] = undefined;
  return run().finally(() => {
    FAKE_NATIVE_CLIPBOARD[method] = original;
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Positive (delegates to the native module without error)', () => {
  describe('getStringAsync', () => {
    // why: the wrapper must forward the caller's options straight to the native layer instead
    // of silently dropping them — StringFormat conversion happens on the native side
    it('resolves to the native clipboard string and forwards the default options object', async () => {
      await expect(getStringAsync()).resolves.toBe('text');
      expect(FAKE_NATIVE_CLIPBOARD.getStringAsync).toHaveBeenCalledWith({});
    });
  });

  describe('setStringAsync', () => {
    // why: text + a default options object must both reach the native call so a missing
    // `options` argument doesn't silently become `undefined` on the native side
    it('writes the given text and forwards the default options object', async () => {
      await expect(setStringAsync('hello')).resolves.toBe(true);
      expect(FAKE_NATIVE_CLIPBOARD.setStringAsync).toHaveBeenCalledWith('hello', {});
    });
  });

  describe('hasStringAsync', () => {
    it('resolves to whatever the native module reports', async () => {
      await expect(hasStringAsync()).resolves.toBe(true);
    });
  });

  describe('getUrlAsync', () => {
    it('resolves to the native clipboard URL', async () => {
      await expect(getUrlAsync()).resolves.toBe('https://example.com');
    });
  });

  describe('setUrlAsync', () => {
    it('forwards the URL to the native module', async () => {
      await setUrlAsync('https://example.com');
      expect(FAKE_NATIVE_CLIPBOARD.setUrlAsync).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('hasUrlAsync', () => {
    it('resolves to whatever the native module reports', async () => {
      await expect(hasUrlAsync()).resolves.toBe(true);
    });
  });

  describe('getImageAsync', () => {
    // why: the caller's format/quality options decide how the native side encodes the image —
    // dropping them would silently return the wrong format
    it('forwards the format options and resolves to the native image payload', async () => {
      await expect(getImageAsync({ format: 'png' })).resolves.toEqual({
        data: 'data:image/png;base64,abc',
        size: { width: 1, height: 1 },
      });
      expect(FAKE_NATIVE_CLIPBOARD.getImageAsync).toHaveBeenCalledWith({ format: 'png' });
    });
  });

  describe('setImageAsync', () => {
    it('forwards the base64 image to the native module', async () => {
      await setImageAsync('base64==');
      expect(FAKE_NATIVE_CLIPBOARD.setImageAsync).toHaveBeenCalledWith('base64==');
    });
  });

  describe('hasImageAsync', () => {
    it('resolves to whatever the native module reports', async () => {
      await expect(hasImageAsync()).resolves.toBe(true);
    });
  });
});

describe('Negative (an absent optional native method must throw, not silently no-op)', () => {
  // why: getUrlAsync/setUrlAsync/hasUrlAsync are iOS-only upstream — on Android the native
  // module simply never implements them, so the wrapper's own presence check is the ONLY thing
  // standing between a real caller and a raw "undefined is not a function" crash
  describe('getStringAsync', () => {
    it('rejects with an UnavailabilityError-shaped error when the native method is absent', () =>
      withNativeMethodRemoved('getStringAsync', async () => {
        await expect(getStringAsync()).rejects.toThrow(
          'getStringAsync is not available on Clipboard',
        );
      }));
  });

  describe('setStringAsync', () => {
    it('rejects with an UnavailabilityError-shaped error when the native method is absent', () =>
      withNativeMethodRemoved('setStringAsync', async () => {
        await expect(setStringAsync('hello')).rejects.toThrow(
          'setStringAsync is not available on Clipboard',
        );
      }));
  });

  describe('hasStringAsync', () => {
    // why: this one used to be a plain `function` returning a Promise, so the guard fired
    // synchronously at the call site and a caller's .catch() never saw it — the no-throw
    // assertion is what pins it to the rejection contract its 8 siblings follow
    it('rejects with an UnavailabilityError-shaped error without throwing at the call site', () =>
      withNativeMethodRemoved('hasStringAsync', async () => {
        let pending: Promise<boolean> | undefined;
        expect(() => {
          pending = hasStringAsync();
        }).not.toThrow();

        await expect(pending).rejects.toThrow('hasStringAsync is not available on Clipboard');
      }));
  });

  describe('getUrlAsync', () => {
    it('rejects with an UnavailabilityError-shaped error on a platform without URL support', () =>
      withNativeMethodRemoved('getUrlAsync', async () => {
        await expect(getUrlAsync()).rejects.toThrow('getUrlAsync is not available on Clipboard');
      }));
  });

  describe('setUrlAsync', () => {
    it('rejects with an UnavailabilityError-shaped error on a platform without URL support', () =>
      withNativeMethodRemoved('setUrlAsync', async () => {
        await expect(setUrlAsync('https://example.com')).rejects.toThrow(
          'setUrlAsync is not available on Clipboard',
        );
      }));
  });

  describe('hasUrlAsync', () => {
    it('rejects with an UnavailabilityError-shaped error on a platform without URL support', () =>
      withNativeMethodRemoved('hasUrlAsync', async () => {
        await expect(hasUrlAsync()).rejects.toThrow('hasUrlAsync is not available on Clipboard');
      }));
  });

  describe('getImageAsync', () => {
    it('rejects with an UnavailabilityError-shaped error when the native method is absent', () =>
      withNativeMethodRemoved('getImageAsync', async () => {
        await expect(getImageAsync({ format: 'png' })).rejects.toThrow(
          'getImageAsync is not available on Clipboard',
        );
      }));
  });

  describe('setImageAsync', () => {
    it('rejects with an UnavailabilityError-shaped error when the native method is absent', () =>
      withNativeMethodRemoved('setImageAsync', async () => {
        await expect(setImageAsync('base64==')).rejects.toThrow(
          'setImageAsync is not available on Clipboard',
        );
      }));
  });

  describe('hasImageAsync', () => {
    it('rejects with an UnavailabilityError-shaped error when the native method is absent', () =>
      withNativeMethodRemoved('hasImageAsync', async () => {
        await expect(hasImageAsync()).rejects.toThrow(
          'hasImageAsync is not available on Clipboard',
        );
      }));
  });
});

// addListener/removeAllListeners come from expo-modules-core's always-present EventEmitter base
// class (see native-module.ts's INativeClipboardModule comment) — unlike the async methods
// above, they are never optional on the native module, so there is no "absent method" branch to
// exercise here. removeClipboardListener is a pure passthrough to subscription.remove() with no
// branch of its own either. N/A for a Negative group: neither function has a throwing path.
describe('subscription lifecycle (no throwing path — nothing to negative-test)', () => {
  describe('addClipboardListener', () => {
    // why: a wrong event name would silently miss every clipboard-change event — this pins the
    // event name to the one the native module actually emits (CLIPBOARD_CHANGED_EVENT_NAME)
    it('registers the listener under the native clipboard-changed event name', () => {
      const listener = vi.fn();
      addClipboardListener(listener);

      expect(FAKE_NATIVE_CLIPBOARD.addListener).toHaveBeenCalledWith(
        'onClipboardChanged',
        listener,
      );
    });
  });

  describe('removeClipboardListener', () => {
    // why: this deprecated shim exists ONLY to delegate to subscription.remove() — the test
    // guards against it ever growing its own removal logic instead of delegating
    it('delegates removal to the given subscription', () => {
      const remove = vi.fn();
      removeClipboardListener({ remove });

      expect(remove).toHaveBeenCalledTimes(1);
    });
  });
});
