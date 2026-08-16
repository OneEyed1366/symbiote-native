import { afterEach, describe, expect, it, vi } from 'vitest';

import type { INativeSecureStoreModule } from './native-module';

// Every accessibility constant gets its OWN distinctive value (not the small ints a
// hardcoded fallback might coincidentally guess) so the "sourced from native, not
// hardcoded" tests below would actually fail if secure-store.ts ever hardcoded one.
const FAKE_NATIVE_SECURE_STORE: INativeSecureStoreModule = {
  AFTER_FIRST_UNLOCK: 101,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 102,
  ALWAYS: 103,
  ALWAYS_THIS_DEVICE_ONLY: 104,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 105,
  WHEN_UNLOCKED: 106,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 107,
  getValueWithKeyAsync: vi.fn(async () => 'stored'),
  getValueWithKeySync: vi.fn(() => 'stored'),
  setValueWithKeyAsync: vi.fn(async () => true),
  setValueWithKeySync: vi.fn(() => true),
  deleteValueWithKeyAsync: vi.fn(async () => undefined),
  canUseBiometricAuthentication: vi.fn(() => true),
};

// The real ExpoSecureStore native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless run, so the module-lookup
// file is faked in place of expo-modules-core's runtime resolution, the same pattern
// packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-module', () => ({
  expoSecureStore: FAKE_NATIVE_SECURE_STORE,
}));

// expo-modules-core's real entry transitively imports 'react-native', whose Flow-typed source
// Vitest's Oxc transform can't parse — so only the members used as values are faked.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  AFTER_FIRST_UNLOCK,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  ALWAYS,
  ALWAYS_THIS_DEVICE_ONLY,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  WHEN_UNLOCKED,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  isAvailableAsync,
  getItemAsync,
  getItem,
  setItemAsync,
  setItem,
  deleteItemAsync,
  canUseBiometricAuthentication,
} = await import('./secure-store');

afterEach(() => {
  vi.clearAllMocks();
});

// Temporarily removes one native method to simulate a platform (or a stale native build)
// that doesn't implement it, runs `run`, then restores it — every accessibility constant and
// every data method is declared optional in INativeSecureStoreModule for exactly this reason.
async function withNativeMethodMissing<K extends keyof INativeSecureStoreModule>(
  method: K,
  run: () => void | Promise<void>,
): Promise<void> {
  const original = FAKE_NATIVE_SECURE_STORE[method];
  FAKE_NATIVE_SECURE_STORE[method] = undefined;
  try {
    await run();
  } finally {
    FAKE_NATIVE_SECURE_STORE[method] = original;
  }
}

describe('positive — successful native delegation', () => {
  // why: the constants exist so callers never hand-write a raw kSecAttrAccessible int; if the
  // wrapper ever hardcoded one instead of reading it off the native module, it would silently
  // diverge from the platform's real values without any of these tests catching it.
  it.each([
    ['AFTER_FIRST_UNLOCK', AFTER_FIRST_UNLOCK, 101],
    ['AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY', AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY, 102],
    ['ALWAYS', ALWAYS, 103],
    ['ALWAYS_THIS_DEVICE_ONLY', ALWAYS_THIS_DEVICE_ONLY, 104],
    ['WHEN_PASSCODE_SET_THIS_DEVICE_ONLY', WHEN_PASSCODE_SET_THIS_DEVICE_ONLY, 105],
    ['WHEN_UNLOCKED', WHEN_UNLOCKED, 106],
    ['WHEN_UNLOCKED_THIS_DEVICE_ONLY', WHEN_UNLOCKED_THIS_DEVICE_ONLY, 107],
  ])('%s is re-exported verbatim from the native module', (_name, exported, expected) => {
    expect(exported).toBe(expected);
  });

  describe('isAvailableAsync', () => {
    // why: availability reflects whether the platform's native module implements the read
    // method at all — it must not just always resolve true.
    it('resolves true when the native read method is implemented', async () => {
      await expect(isAvailableAsync()).resolves.toBe(true);
    });

    it('resolves false when the native read method is absent', async () => {
      await withNativeMethodMissing('getValueWithKeyAsync', async () => {
        await expect(isAvailableAsync()).resolves.toBe(false);
      });
    });
  });

  describe('getItemAsync', () => {
    it('resolves with the value the native module returns for the given key and options', async () => {
      await expect(getItemAsync('token', { keychainService: 'auth' })).resolves.toBe('stored');
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).toHaveBeenCalledWith('token', {
        keychainService: 'auth',
      });
    });

    // why: options is an optional param — omitting it must not reach the native module as
    // `undefined`, which several native SDKs reject outright.
    it('defaults the options to an empty object when omitted', async () => {
      await getItemAsync('token');
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).toHaveBeenCalledWith('token', {});
    });
  });

  describe('getItem (sync)', () => {
    it('returns the value the native module returns for the given key and options', () => {
      expect(getItem('token', { keychainService: 'auth' })).toBe('stored');
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeySync).toHaveBeenCalledWith('token', {
        keychainService: 'auth',
      });
    });

    it('defaults the options to an empty object when omitted', () => {
      getItem('token');
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeySync).toHaveBeenCalledWith('token', {});
    });
  });

  describe('setItemAsync', () => {
    // why: the native call takes (value, key, options) — the OPPOSITE argument order from the
    // public (key, value, options) signature. A swapped call would silently store the key under
    // the value's slot with no type error, since both are strings.
    it('passes value, key and options to the native module in the native argument order', async () => {
      await setItemAsync('token', 'secret', { requireAuthentication: true });
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).toHaveBeenCalledWith(
        'secret',
        'token',
        { requireAuthentication: true },
      );
    });

    it('defaults the options to an empty object when omitted', async () => {
      await setItemAsync('token', 'secret');
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).toHaveBeenCalledWith(
        'secret',
        'token',
        {},
      );
    });
  });

  describe('setItem (sync)', () => {
    it('passes value, key and options to the native module in the native argument order', () => {
      setItem('token', 'secret', { requireAuthentication: true });
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeySync).toHaveBeenCalledWith(
        'secret',
        'token',
        { requireAuthentication: true },
      );
    });

    it('defaults the options to an empty object when omitted', () => {
      setItem('token', 'secret');
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeySync).toHaveBeenCalledWith(
        'secret',
        'token',
        {},
      );
    });
  });

  describe('deleteItemAsync', () => {
    it('delegates the key and options to the native module', async () => {
      await deleteItemAsync('token', { keychainService: 'auth' });
      expect(FAKE_NATIVE_SECURE_STORE.deleteValueWithKeyAsync).toHaveBeenCalledWith('token', {
        keychainService: 'auth',
      });
    });

    it('defaults the options to an empty object when omitted', async () => {
      await deleteItemAsync('token');
      expect(FAKE_NATIVE_SECURE_STORE.deleteValueWithKeyAsync).toHaveBeenCalledWith('token', {});
    });
  });

  describe('canUseBiometricAuthentication', () => {
    it('returns whatever the native module reports', () => {
      expect(canUseBiometricAuthentication()).toBe(true);
    });
  });
});

describe('negative — guards and unavailable native methods', () => {
  // why: a bad key must fail here with a readable message rather than deep inside the keychain
  // call, and the native module must never see junk it didn't validate.
  describe('invalid key rejected before any native call', () => {
    it.each([
      ['', 'empty'],
      ['has space', 'a space'],
      ['sla/sh', 'a slash'],
      ['💥', 'an emoji'],
    ])('getItemAsync rejects %j (%s)', async key => {
      await expect(getItemAsync(key)).rejects.toThrow(/Invalid key provided to SecureStore/);
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).not.toHaveBeenCalled();
    });

    // why: every key-accepting export shares the same ensureValidKey guard — this proves the
    // guard actually runs (and blocks the native call) from each entry point, not just the one
    // above, so a future export that forgets to call it is caught here.
    it('getItem (sync) rejects an invalid key without calling the native module', () => {
      expect(() => getItem('bad key')).toThrow(/Invalid key provided to SecureStore/);
      expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeySync).not.toHaveBeenCalled();
    });

    it('setItemAsync rejects an invalid key without calling the native module', async () => {
      await expect(setItemAsync('bad key', 'secret')).rejects.toThrow(
        /Invalid key provided to SecureStore/,
      );
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).not.toHaveBeenCalled();
    });

    it('setItem (sync) rejects an invalid key without calling the native module', () => {
      expect(() => setItem('bad key', 'secret')).toThrow(/Invalid key provided to SecureStore/);
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeySync).not.toHaveBeenCalled();
    });

    it('deleteItemAsync rejects an invalid key without calling the native module', async () => {
      await expect(deleteItemAsync('bad key')).rejects.toThrow(
        /Invalid key provided to SecureStore/,
      );
      expect(FAKE_NATIVE_SECURE_STORE.deleteValueWithKeyAsync).not.toHaveBeenCalled();
    });

    it.each(['token', 'com.example.token', 'my-token', 'my_token'])(
      'accepts %j as a valid key',
      async key => {
        await expect(getItemAsync(key)).resolves.toBe('stored');
      },
    );
  });

  // why: values reach setItem(Async) from JS callers that TypeScript can't police — the runtime
  // guard is the only thing stopping a non-string from ever reaching the keychain.
  describe('invalid value rejected before any native call', () => {
    it('setItemAsync rejects a non-string value', async () => {
      // @ts-expect-error -- the guard exists precisely for callers without type checking
      await expect(setItemAsync('token', { a: 1 })).rejects.toThrow(
        /Values must be strings; consider JSON-encoding/,
      );
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).not.toHaveBeenCalled();
    });

    it('setItem (sync) rejects a non-string value', () => {
      expect(() =>
        // @ts-expect-error -- the guard exists precisely for callers without type checking
        setItem('token', { a: 1 }),
      ).toThrow(/Values must be strings; consider JSON-encoding/);
      expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeySync).not.toHaveBeenCalled();
    });
  });

  // why: every data method throws a consistent, identifiable UnavailabilityError instead of a
  // raw TypeError from calling `undefined()`, so a caller can catch/report it distinctly from a
  // real keychain failure.
  describe('UnavailabilityError when the native method is missing', () => {
    it('getItemAsync throws naming itself and the native module', async () => {
      await withNativeMethodMissing('getValueWithKeyAsync', async () => {
        await expect(getItemAsync('token')).rejects.toThrow(
          'getItemAsync is not available on expo-secure-store',
        );
      });
    });

    it('getItem (sync) throws naming itself and the native module', async () => {
      await withNativeMethodMissing('getValueWithKeySync', () => {
        expect(() => getItem('token')).toThrow('getItem is not available on expo-secure-store');
      });
    });

    it('setItemAsync throws naming itself and the native module', async () => {
      await withNativeMethodMissing('setValueWithKeyAsync', async () => {
        await expect(setItemAsync('token', 'secret')).rejects.toThrow(
          'setItemAsync is not available on expo-secure-store',
        );
      });
    });

    it('setItem (sync) throws naming itself and the native module', async () => {
      await withNativeMethodMissing('setValueWithKeySync', () => {
        expect(() => setItem('token', 'secret')).toThrow(
          'setItem is not available on expo-secure-store',
        );
      });
    });

    it('deleteItemAsync throws naming itself and the native module', async () => {
      await withNativeMethodMissing('deleteValueWithKeyAsync', async () => {
        await expect(deleteItemAsync('token')).rejects.toThrow(
          'deleteItemAsync is not available on expo-secure-store',
        );
      });
    });

    it('canUseBiometricAuthentication throws naming itself and the native module', async () => {
      await withNativeMethodMissing('canUseBiometricAuthentication', () => {
        expect(() => canUseBiometricAuthentication()).toThrow(
          'canUseBiometricAuthentication is not available on expo-secure-store',
        );
      });
    });
  });
});
