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

// Every wrapped function guards on the native method's presence and throws the same
// UnavailabilityError shape (matching upstream's per-platform capability checks) before ever
// calling through — this helper exercises that identical guard once per function instead of
// six near-copies of the same undefine/restore dance.
async function expectThrowsWhenNativeMethodAbsent(
  methodName: keyof typeof FAKE_NATIVE_LOCAL_AUTHENTICATION,
  call: () => Promise<unknown>,
): Promise<void> {
  const original = FAKE_NATIVE_LOCAL_AUTHENTICATION[methodName];
  // @ts-expect-error -- simulating a platform where the native module has no such method
  FAKE_NATIVE_LOCAL_AUTHENTICATION[methodName] = undefined;

  await expect(call()).rejects.toThrow(`${methodName} is not available on expo-local-authentication`);

  FAKE_NATIVE_LOCAL_AUTHENTICATION[methodName] = original;
}

describe('Positive — the native module is present and answers', () => {
  it('hasHardwareAsync delegates to the native module', async () => {
    // why: the wrapper adds no logic of its own here — it must be a transparent proxy so a
    // caller's "does this device even have a scanner" check reflects the real hardware.
    await expect(hasHardwareAsync()).resolves.toBe(true);
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.hasHardwareAsync).toHaveBeenCalledTimes(1);
  });

  it('supportedAuthenticationTypesAsync delegates to the native module', async () => {
    // why: a device can report more than one supported type at once (e.g. fingerprint AND
    // face) — the wrapper must forward the whole array, not just the first entry.
    await expect(supportedAuthenticationTypesAsync()).resolves.toEqual([1, 2]);
  });

  it('isEnrolledAsync delegates to the native module', async () => {
    // why: authenticateAsync only makes sense once something is enrolled — callers gate the
    // biometric prompt behind this check, so it must reflect real enrollment state.
    await expect(isEnrolledAsync()).resolves.toBe(true);
  });

  it('getEnrolledLevelAsync delegates to the native module', async () => {
    // why: callers pick PIN-fallback vs biometric UX based on the enrolled security level.
    await expect(getEnrolledLevelAsync()).resolves.toBe(3);
  });

  it('authenticateAsync defaults promptMessage and cancelLabel when omitted', async () => {
    // why: an omitted prompt/cancel string must not reach the native layer as `undefined` —
    // several platforms crash or render blank UI text when the system prompt has no label.
    await authenticateAsync();

    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Authenticate',
      cancelLabel: 'Cancel',
    });
  });

  it('authenticateAsync passes through a custom promptMessage and cancelLabel', async () => {
    // why: apps must be able to brand the system authentication prompt with their own copy.
    await authenticateAsync({ promptMessage: 'Unlock the vault', cancelLabel: 'Nope' });

    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock the vault',
      cancelLabel: 'Nope',
    });
  });

  it('authenticateAsync falls back to the default cancelLabel when given an empty string', async () => {
    // why: unlike promptMessage, cancelLabel carries no invariant guard — an empty string must
    // still resolve to a usable button label rather than shipping blank UI text to native.
    await authenticateAsync({ cancelLabel: '' });

    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Authenticate',
      cancelLabel: 'Cancel',
    });
  });

  it('authenticateAsync resolves with the native module\'s success result', async () => {
    await expect(authenticateAsync()).resolves.toEqual({ success: true });
  });

  it('authenticateAsync resolves with a failure result exactly as the native module returned it', async () => {
    // why: ILocalAuthenticationResult is a discriminated union — the wrapper must pass a failed
    // attempt's `error`/`warning` fields through unchanged so callers can branch on `.error` to
    // show the right retry UI, not swallow or remap the failure shape.
    FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync.mockResolvedValueOnce({
      success: false,
      error: 'user_cancel',
    });

    await expect(authenticateAsync()).resolves.toEqual({ success: false, error: 'user_cancel' });
  });

  it('cancelAuthenticate delegates to the native module', async () => {
    // why: Android callers must be able to interrupt an in-flight prompt (e.g. leaving the
    // screen) — the call has to actually reach the native side, not be a local no-op.
    await cancelAuthenticate();
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.cancelAuthenticate).toHaveBeenCalledTimes(1);
  });
});

describe('Negative — the native method is missing on this platform', () => {
  it('hasHardwareAsync throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent('hasHardwareAsync', hasHardwareAsync));

  it('supportedAuthenticationTypesAsync throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent(
      'supportedAuthenticationTypesAsync',
      supportedAuthenticationTypesAsync,
    ));

  it('isEnrolledAsync throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent('isEnrolledAsync', isEnrolledAsync));

  it('getEnrolledLevelAsync throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent('getEnrolledLevelAsync', getEnrolledLevelAsync));

  it('authenticateAsync throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent('authenticateAsync', () => authenticateAsync()));

  it('cancelAuthenticate throws an UnavailabilityError-shaped error', () =>
    expectThrowsWhenNativeMethodAbsent('cancelAuthenticate', cancelAuthenticate));

  it('authenticateAsync rejects an empty-string promptMessage without calling through', async () => {
    // why: an explicitly-empty promptMessage is a caller bug (the system prompt would render
    // with no message) — the invariant must fail loudly instead of silently defaulting, and
    // must fail BEFORE the native module is ever invoked.
    await expect(authenticateAsync({ promptMessage: '' })).rejects.toThrow(
      '`options.promptMessage` must be a non-empty string',
    );
    expect(FAKE_NATIVE_LOCAL_AUTHENTICATION.authenticateAsync).not.toHaveBeenCalled();
  });
});
