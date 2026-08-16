import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_HAPTICS = {
  notificationAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
  performHapticsAsync: vi.fn(async () => undefined),
};

// The real ExpoHaptics native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, the same
// pattern packages/local-auth/src/core/local-authentication.test.ts uses.
vi.mock('./native-module', () => ({
  expoHaptics: FAKE_NATIVE_HAPTICS,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/local-auth/src/core/local-authentication.test.ts uses.
const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const { notificationAsync, impactAsync, selectionAsync, performAndroidHapticsAsync } =
  await import('./haptics');
const { NotificationFeedbackType, ImpactFeedbackStyle, AndroidHaptics } = await import('./types');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('notificationAsync', () => {
  describe('positive', () => {
    // why: the documented default feedback type is Success — a caller that doesn't specify one
    // must still reach the native module with a concrete, valid enum value.
    it('defaults to Success and delegates to the native module', async () => {
      await notificationAsync();
      expect(FAKE_NATIVE_HAPTICS.notificationAsync).toHaveBeenCalledWith(
        NotificationFeedbackType.Success,
      );
    });

    it('passes through an explicit type', async () => {
      await notificationAsync(NotificationFeedbackType.Warning);
      expect(FAKE_NATIVE_HAPTICS.notificationAsync).toHaveBeenCalledWith(
        NotificationFeedbackType.Warning,
      );
    });
  });

  describe('negative', () => {
    // why: on a platform build missing this native method, the app must get a clear
    // UnavailabilityError, not a silent no-op or a raw "not a function" crash.
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { notificationAsync: native } = FAKE_NATIVE_HAPTICS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_HAPTICS.notificationAsync = undefined;

      await expect(notificationAsync()).rejects.toThrow(
        'notificationAsync is not available on expo-haptics',
      );

      FAKE_NATIVE_HAPTICS.notificationAsync = native;
    });
  });
});

describe('impactAsync', () => {
  describe('positive', () => {
    // why: the documented default collision weight is Medium.
    it('defaults to Medium and delegates to the native module', async () => {
      await impactAsync();
      expect(FAKE_NATIVE_HAPTICS.impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Medium);
    });

    it('passes through an explicit style', async () => {
      await impactAsync(ImpactFeedbackStyle.Rigid);
      expect(FAKE_NATIVE_HAPTICS.impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Rigid);
    });
  });

  describe('negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { impactAsync: native } = FAKE_NATIVE_HAPTICS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_HAPTICS.impactAsync = undefined;

      await expect(impactAsync()).rejects.toThrow('impactAsync is not available on expo-haptics');

      FAKE_NATIVE_HAPTICS.impactAsync = native;
    });
  });
});

describe('selectionAsync', () => {
  describe('positive', () => {
    it('delegates to the native module', async () => {
      await selectionAsync();
      expect(FAKE_NATIVE_HAPTICS.selectionAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('negative', () => {
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { selectionAsync: native } = FAKE_NATIVE_HAPTICS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_HAPTICS.selectionAsync = undefined;

      await expect(selectionAsync()).rejects.toThrow(
        'selectionAsync is not available on expo-haptics',
      );

      FAKE_NATIVE_HAPTICS.selectionAsync = native;
    });
  });
});

describe('performAndroidHapticsAsync', () => {
  describe('positive', () => {
    // why: Android's haptics engine has no iOS/other-platform equivalent through this call —
    // the product rule is a silent no-op elsewhere, not a crash or a wasted native round-trip.
    it('no-ops on non-Android platforms without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await performAndroidHapticsAsync(AndroidHaptics.Confirm);
      expect(FAKE_NATIVE_HAPTICS.performHapticsAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await performAndroidHapticsAsync(AndroidHaptics.Confirm);
      expect(FAKE_NATIVE_HAPTICS.performHapticsAsync).toHaveBeenCalledWith(
        AndroidHaptics.Confirm,
      );
    });
  });

  describe('negative', () => {
    // why: on Android specifically (the one platform this call is meant to reach), a missing
    // native method must still surface as a typed UnavailabilityError, not a silent no-op — the
    // no-op behavior is reserved for the "wrong platform" case above, not "wrong build".
    it('throws an UnavailabilityError-shaped error when the native method is absent on Android', async () => {
      fakePlatform.OS = 'android';
      const { performHapticsAsync: native } = FAKE_NATIVE_HAPTICS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_HAPTICS.performHapticsAsync = undefined;

      await expect(performAndroidHapticsAsync(AndroidHaptics.Confirm)).rejects.toThrow(
        'performHapticsAsync is not available on expo-haptics',
      );

      FAKE_NATIVE_HAPTICS.performHapticsAsync = native;
    });
  });
});
