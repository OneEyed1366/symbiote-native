import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SHARING = {
  shareAsync: vi.fn(async () => undefined),
};

// The real ExpoSharing native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless run, so the module-lookup
// file is faked in place of expo-modules-core's runtime resolution, the same pattern
// packages/secure-store/src/core/secure-store.test.ts uses.
vi.mock('./native-module', () => ({
  expoSharing: FAKE_NATIVE_SHARING,
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

const { isAvailableAsync, shareAsync } = await import('./sharing');

const LOCAL_FILE_URL = 'file:///tmp/report.pdf';

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('reports availability from the presence of the native share method', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('reports unavailable when the native module cannot share', async () => {
    const { shareAsync: native } = FAKE_NATIVE_SHARING;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SHARING.shareAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_SHARING.shareAsync = native;
  });

  it('defers to the native check when the module implements one', async () => {
    const nativeCheck = vi.fn(async () => false);
    Object.assign(FAKE_NATIVE_SHARING, { isAvailableAsync: nativeCheck });

    await expect(isAvailableAsync()).resolves.toBe(false);
    expect(nativeCheck).toHaveBeenCalled();

    Reflect.deleteProperty(FAKE_NATIVE_SHARING, 'isAvailableAsync');
  });
});

describe('shareAsync', () => {
  it('passes the url and options straight through', async () => {
    await shareAsync(LOCAL_FILE_URL, { mimeType: 'application/pdf', dialogTitle: 'Send report' });
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, {
      mimeType: 'application/pdf',
      dialogTitle: 'Send report',
    });
  });

  it('defaults the options to an empty object', async () => {
    await shareAsync(LOCAL_FILE_URL);
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, {});
  });

  it('forwards the iPad anchor rectangle unflattened', async () => {
    const anchor = { x: 10, y: 20, width: 1, height: 1 };
    await shareAsync(LOCAL_FILE_URL, { anchor });
    expect(FAKE_NATIVE_SHARING.shareAsync).toHaveBeenCalledWith(LOCAL_FILE_URL, { anchor });
  });

  it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
    const { shareAsync: native } = FAKE_NATIVE_SHARING;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SHARING.shareAsync = undefined;

    await expect(shareAsync(LOCAL_FILE_URL)).rejects.toThrow(
      'shareAsync is not available on expo-sharing',
    );

    FAKE_NATIVE_SHARING.shareAsync = native;
  });
});

// Validation happens before the native call so a bad url fails with a readable message here
// rather than as an argument-conversion failure on iOS or a generic share failure on Android.
describe('url validation', () => {
  it('rejects an empty url', async () => {
    await expect(shareAsync('')).rejects.toThrow(/Invalid url provided to Sharing/);
    expect(FAKE_NATIVE_SHARING.shareAsync).not.toHaveBeenCalled();
  });

  it('rejects a non-string url before reaching the native module', async () => {
    // @ts-expect-error -- the guard exists precisely for callers without type checking
    await expect(shareAsync(undefined)).rejects.toThrow(/Invalid url provided to Sharing/);
    expect(FAKE_NATIVE_SHARING.shareAsync).not.toHaveBeenCalled();
  });
});
