import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_LOCAL_AUTHENTICATION = {
  hasHardwareAsync: vi.fn(async () => true),
  supportedAuthenticationTypesAsync: vi.fn(async () => [1, 2]),
  isEnrolledAsync: vi.fn(async () => true),
  getEnrolledLevelAsync: vi.fn(async () => 3),
  authenticateAsync: vi.fn(async () => ({ success: true })),
  cancelAuthenticate: vi.fn(async () => undefined),
};

// The real ExpoLocalAuthentication native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/sensors/src/core/pedometer.test.ts uses for exponent-pedometer.
vi.mock('./native-module', () => ({
  expoLocalAuthentication: FAKE_NATIVE_LOCAL_AUTHENTICATION,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/sensors/src/core/device-sensor.test.ts uses.
vi.mock('expo-modules-core', () => ({
  Platform: { OS: 'ios' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  hasHardwareAsync,
  supportedAuthenticationTypesAsync,
  isEnrolledAsync,
  getEnrolledLevelAsync,
  authenticateAsync,
  cancelAuthenticate,
} = await import('./local-authentication');

afterEach(() => {
  vi.clearAllMocks();
});

describe('hasHardwareAsync', () => {
  it('delegates to the native module', async () => {
    await expect(hasHardwareAsync()).resolves.toBe(true);
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.hasHardwareAsync).toHaveBeenCalledTimes(1);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { hasHardwareAsync: native } = FAKE_NATIVE_LOCAL_AUTHENTICATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_LOCAL_AUTHENTICATION.hasHardwareAsync = undefined;

    await expect(hasHardwareAsync()).rejects.toThrow(
      'hasHardwareAsync is not available on expo-local-authentication',
    );

    FAKE_NATIVE_LOCAL_AUTHENTICATION.hasHardwareAsync = native;
  });
});

describe('supportedAuthenticationTypesAsync', () => {
  it('delegates to the native module', async () => {
    await expect(supportedAuthenticationTypesAsync()).resolves.toEqual([1, 2]);
  });
});

describe('isEnrolledAsync', () => {
  it('delegates to the native module', async () => {
    await expect(isEnrolledAsync()).resolves.toBe(true);
  });
});

describe('getEnrolledLevelAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getEnrolledLevelAsync()).resolves.toBe(3);
  });
});

describe('authenticateAsync', () => {
  it('defaults promptMessage and cancelLabel when omitted', async () => {
    await authenticateAsync();

    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Authenticate',
      cancelLabel: 'Cancel',
    });
  });

  it('passes through a custom promptMessage and cancelLabel', async () => {
    await authenticateAsync({ promptMessage: 'Unlock the vault', cancelLabel: 'Nope' });

    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock the vault',
      cancelLabel: 'Nope',
    });
  });

  it('rejects an empty-string promptMessage', async () => {
    await expect(authenticateAsync({ promptMessage: '' })).rejects.toThrow(
      '`options.promptMessage` must be a non-empty string',
    );
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).not.toHaveBeenCalled();
  });

  it('resolves with the native result', async () => {
    await expect(authenticateAsync()).resolves.toEqual({ success: true });
  });
});

describe('cancelAuthenticate', () => {
  it('delegates to the native module', async () => {
    await cancelAuthenticate();
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.cancelAuthenticate).toHaveBeenCalledTimes(1);
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { cancelAuthenticate: native } = FAKE_NATIVE_LOCAL_AUTHENTICATION;
    // @ts-expect-error -- simulating iOS, where cancelAuthenticate has no native implementation
    FAKE_NATIVE_LOCAL_AUTHENTICATION.cancelAuthenticate = undefined;

    await expect(cancelAuthenticate()).rejects.toThrow(
      'cancelAuthenticate is not available on expo-local-authentication',
    );

    FAKE_NATIVE_LOCAL_AUTHENTICATION.cancelAuthenticate = native;
  });
});
