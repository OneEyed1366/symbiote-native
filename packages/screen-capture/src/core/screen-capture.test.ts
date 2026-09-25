import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SCREEN_CAPTURE = {
  preventScreenCapture: vi.fn(async () => undefined),
  allowScreenCapture: vi.fn(async () => undefined),
  enableAppSwitcherProtection: vi.fn(async () => undefined),
  disableAppSwitcherProtection: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({
    granted: true,
    expires: 'never',
    canAskAgain: true,
    status: 'granted',
  })),
  requestPermissionsAsync: vi.fn(async () => ({
    granted: true,
    expires: 'never',
    canAskAgain: true,
    status: 'granted',
  })),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoScreenCapture native module only resolves on-device - faked in place of
// expo-modules-core's runtime resolution, same pattern packages/clipboard/src/core/
// clipboard.test.ts uses.
vi.mock('./native-module', () => ({
  expoScreenCapture: FAKE_NATIVE_SCREEN_CAPTURE,
  ON_SCREENSHOT_EVENT_NAME: 'onScreenshot',
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse - same fake
// packages/tracking-transparency/src/core/tracking-transparency.test.ts uses.
vi.mock('expo-modules-core', () => ({
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  addScreenshotListener,
  allowScreenCaptureAsync,
  disableAppSwitcherProtectionAsync,
  enableAppSwitcherProtectionAsync,
  getPermissionsAsync,
  isAvailableAsync,
  preventScreenCaptureAsync,
  removeScreenshotListener,
  requestPermissionsAsync,
} = await import('./screen-capture');

function withNativeMethodRemoved<
  K extends keyof typeof FAKE_NATIVE_SCREEN_CAPTURE,
>(method: K, run: () => Promise<void>): Promise<void> {
  const original = FAKE_NATIVE_SCREEN_CAPTURE[method];
  // @ts-expect-error - deliberately simulating a platform where this method is absent.
  delete FAKE_NATIVE_SCREEN_CAPTURE[method];
  return run().finally(() => {
    FAKE_NATIVE_SCREEN_CAPTURE[method] = original;
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  it('resolves true when both prevent/allow are present', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false when preventScreenCapture is absent', () =>
    withNativeMethodRemoved('preventScreenCapture', async () => {
      await expect(isAvailableAsync()).resolves.toBe(false);
    }));
});

describe('preventScreenCaptureAsync / allowScreenCaptureAsync', () => {
  it('calls the native module once per unique key', async () => {
    await preventScreenCaptureAsync('a');
    await preventScreenCaptureAsync('a');
    await preventScreenCaptureAsync('b');
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.preventScreenCapture,
    ).toHaveBeenCalledTimes(2);
  });

  it('only allows once every active key is released', async () => {
    await preventScreenCaptureAsync('a');
    await preventScreenCaptureAsync('b');
    await allowScreenCaptureAsync('a');
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.allowScreenCapture,
    ).not.toHaveBeenCalled();
    await allowScreenCaptureAsync('b');
    expect(FAKE_NATIVE_SCREEN_CAPTURE.allowScreenCapture).toHaveBeenCalledTimes(
      1,
    );
  });

  it('throws UnavailabilityError when the native module lacks the method', () =>
    withNativeMethodRemoved('preventScreenCapture', async () => {
      await expect(preventScreenCaptureAsync()).rejects.toThrow(
        /preventScreenCaptureAsync/,
      );
    }));
});

describe('enableAppSwitcherProtectionAsync / disableAppSwitcherProtectionAsync', () => {
  it('forwards the blur intensity', async () => {
    await enableAppSwitcherProtectionAsync(0.8);
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.enableAppSwitcherProtection,
    ).toHaveBeenCalledWith(0.8);
  });

  it('throws UnavailabilityError on a platform without the app-switcher pair (Android)', () =>
    withNativeMethodRemoved('enableAppSwitcherProtection', async () => {
      await expect(enableAppSwitcherProtectionAsync()).rejects.toThrow(
        /enableAppSwitcherProtectionAsync/,
      );
    }));

  it('disables cleanly', async () => {
    await disableAppSwitcherProtectionAsync();
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.disableAppSwitcherProtection,
    ).toHaveBeenCalledTimes(1);
  });
});

describe('addScreenshotListener / removeScreenshotListener', () => {
  it('registers on the onScreenshot event and removes via the returned subscription', () => {
    const listener = vi.fn();
    const subscription = addScreenshotListener(listener);
    expect(FAKE_NATIVE_SCREEN_CAPTURE.addListener).toHaveBeenCalledWith(
      'onScreenshot',
      listener,
    );
    removeScreenshotListener(subscription);
    expect(subscription.remove).toHaveBeenCalledTimes(1);
  });
});

describe('getPermissionsAsync / requestPermissionsAsync', () => {
  it('delegates to the native module when present', async () => {
    await getPermissionsAsync();
    await requestPermissionsAsync();
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.getPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
    expect(
      FAKE_NATIVE_SCREEN_CAPTURE.requestPermissionsAsync,
    ).toHaveBeenCalledTimes(1);
  });

  it('falls back to a granted response on iOS, where the native module has neither method', () =>
    withNativeMethodRemoved('getPermissionsAsync', () =>
      withNativeMethodRemoved('requestPermissionsAsync', async () => {
        await expect(getPermissionsAsync()).resolves.toEqual({
          granted: true,
          expires: 'never',
          canAskAgain: true,
          status: 'granted',
        });
        await expect(requestPermissionsAsync()).resolves.toEqual({
          granted: true,
          expires: 'never',
          canAskAgain: true,
          status: 'granted',
        });
      }),
    ));
});
