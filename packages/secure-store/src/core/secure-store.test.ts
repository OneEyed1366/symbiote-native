import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SECURE_STORE = {
  AFTER_FIRST_UNLOCK: 1,
  WHEN_UNLOCKED: 5,
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
  WHEN_UNLOCKED,
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

describe('keychain accessibility constants', () => {
  it('come from the native module rather than being hardcoded', () => {
    expect(AFTER_FIRST_UNLOCK).toBe(1);
    expect(WHEN_UNLOCKED).toBe(5);
  });
});

describe('isAvailableAsync', () => {
  it('reports availability from the presence of the native read method', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });
});

describe('getItemAsync', () => {
  it('passes the key and options straight through', async () => {
    await expect(getItemAsync('token', { keychainService: 'auth' })).resolves.toBe('stored');
    expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).toHaveBeenCalledWith('token', {
      keychainService: 'auth',
    });
  });

  it('defaults the options to an empty object', async () => {
    await getItemAsync('token');
    expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).toHaveBeenCalledWith('token', {});
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { getValueWithKeyAsync: native } = FAKE_NATIVE_SECURE_STORE;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync = undefined;

    await expect(getItemAsync('token')).rejects.toThrow(
      'getItemAsync is not available on expo-secure-store',
    );

    FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync = native;
  });
});

describe('setItemAsync', () => {
  it('passes value, key and options in the native argument order', async () => {
    await setItemAsync('token', 'secret', { requireAuthentication: true });
    expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).toHaveBeenCalledWith('secret', 'token', {
      requireAuthentication: true,
    });
  });
});

describe('the synchronous pair', () => {
  it('reads and writes through the sync native methods', () => {
    expect(getItem('token')).toBe('stored');
    setItem('token', 'secret');
    expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeySync).toHaveBeenCalledWith('token', {});
    expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeySync).toHaveBeenCalledWith(
      'secret',
      'token',
      {},
    );
  });
});

describe('deleteItemAsync', () => {
  it('delegates to the native module', async () => {
    await deleteItemAsync('token');
    expect(FAKE_NATIVE_SECURE_STORE.deleteValueWithKeyAsync).toHaveBeenCalledWith('token', {});
  });
});

describe('canUseBiometricAuthentication', () => {
  it('delegates to the native module', () => {
    expect(canUseBiometricAuthentication()).toBe(true);
  });
});

// Validation happens before the native call so a bad key fails with a readable message here
// rather than deep inside the keychain, and the native module is never handed junk.
describe('key and value validation', () => {
  it.each([
    ['', 'empty'],
    ['has space', 'a space'],
    ['sla/sh', 'a slash'],
    ['💥', 'an emoji'],
  ])('rejects %j (%s)', async key => {
    await expect(getItemAsync(key)).rejects.toThrow(/Invalid key provided to SecureStore/);
    expect(FAKE_NATIVE_SECURE_STORE.getValueWithKeyAsync).not.toHaveBeenCalled();
  });

  it.each(['token', 'com.example.token', 'my-token', 'my_token'])('accepts %j', async key => {
    await expect(getItemAsync(key)).resolves.toBe('stored');
  });

  it('rejects a non-string value before reaching the native module', async () => {
    // @ts-expect-error -- the guard exists precisely for callers without type checking
    await expect(setItemAsync('token', { a: 1 })).rejects.toThrow(
      /Values must be strings; consider JSON-encoding/,
    );
    expect(FAKE_NATIVE_SECURE_STORE.setValueWithKeyAsync).not.toHaveBeenCalled();
  });
});
