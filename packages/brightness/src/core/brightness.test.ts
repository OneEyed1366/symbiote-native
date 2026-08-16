import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_BRIGHTNESS = {
  getBrightnessAsync: vi.fn(async () => 0.5),
  setBrightnessAsync: vi.fn(async () => undefined),
  getSystemBrightnessAsync: vi.fn(async () => 0.6),
  setSystemBrightnessAsync: vi.fn(async () => undefined),
  restoreSystemBrightnessAsync: vi.fn(async () => undefined),
  isUsingSystemBrightnessAsync: vi.fn(async () => true),
  getSystemBrightnessModeAsync: vi.fn(async () => 1),
  setSystemBrightnessModeAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'granted', granted: true })),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoBrightness native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/battery/src/core/battery.test.ts and packages/haptics/src/core/haptics.test.ts use.
vi.mock('./native-module', () => ({
  expoBrightness: FAKE_NATIVE_BRIGHTNESS,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/haptics/src/core/haptics.test.ts uses, since Platform.OS gates every
// system-brightness branch here.
const fakePlatform = { OS: 'ios' as 'ios' | 'android' };

vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  isAvailableAsync,
  getBrightnessAsync,
  setBrightnessAsync,
  getSystemBrightnessAsync,
  setSystemBrightnessAsync,
  restoreSystemBrightnessAsync,
  isUsingSystemBrightnessAsync,
  getSystemBrightnessModeAsync,
  setSystemBrightnessModeAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  addBrightnessListener,
} = await import('./brightness');
const { BrightnessMode } = await import('./types');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  // why: no throwing path — it probes for a native method and reports a boolean, so there is no
  // Negative group here; both outcomes below are the unit's only two contracts.
  describe('probes for the native method without throwing', () => {
    it('resolves true when the native module implements getBrightnessAsync', async () => {
      await expect(isAvailableAsync()).resolves.toBe(true);
    });

    // why: a build missing the method entirely must be reported as unavailable, not crash the
    // caller trying to feature-detect brightness support.
    it('resolves false when the native method is absent', async () => {
      const { getBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = undefined;

      await expect(isAvailableAsync()).resolves.toBe(false);

      FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = native;
    });
  });
});

describe('getBrightnessAsync', () => {
  describe('Positive', () => {
    it('delegates to the native module', async () => {
      await expect(getBrightnessAsync()).resolves.toBe(0.5);
    });
  });

  describe('Negative', () => {
    // why: a build without the native method must fail loudly (UnavailabilityError), not resolve
    // a bogus brightness value.
    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { getBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = undefined;

      await expect(getBrightnessAsync()).rejects.toThrow(
        'getBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = native;
    });
  });
});

describe('setBrightnessAsync', () => {
  describe('Positive', () => {
    it('delegates an in-range value to the native module unchanged', async () => {
      await setBrightnessAsync(0.4);
      expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(0.4);
    });

    // why: the native API is documented 0..1 — a caller passing an out-of-range value must be
    // clamped into range rather than forwarded verbatim, which upstream (and native platform
    // brightness APIs) would reject or misbehave on.
    it('clamps a value above 1 down to 1', async () => {
      await setBrightnessAsync(1.5);
      expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(1);
    });

    it('clamps a value below 0 up to 0', async () => {
      await setBrightnessAsync(-0.5);
      expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(0);
    });
  });

  describe('Negative', () => {
    // why: NaN survives Math.max/Math.min unclamped, so it needs an explicit guard — silently
    // forwarding NaN to native would be a worse failure mode than an immediate, named TypeError.
    it('throws a TypeError before calling the native module when the value is NaN', async () => {
      await expect(setBrightnessAsync(NaN)).rejects.toThrow(
        'setBrightnessAsync cannot be called with NaN',
      );
      expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).not.toHaveBeenCalled();
    });

    it('throws an UnavailabilityError-shaped error when the native method is absent', async () => {
      const { setBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync = undefined;

      await expect(setBrightnessAsync(0.5)).rejects.toThrow(
        'setBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync = native;
    });
  });
});

describe('getSystemBrightnessAsync', () => {
  describe('Positive', () => {
    // why: iOS has no separate system-level brightness — app-local and system brightness are the
    // same value, so this must fall back to getBrightnessAsync instead of calling a native method
    // that doesn't meaningfully exist there.
    it('delegates to getBrightnessAsync on non-Android platforms, without touching the Android-only native method', async () => {
      fakePlatform.OS = 'ios';
      await expect(getSystemBrightnessAsync()).resolves.toBe(0.5);
      expect(FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await expect(getSystemBrightnessAsync()).resolves.toBe(0.6);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { getSystemBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessAsync = undefined;

      await expect(getSystemBrightnessAsync()).rejects.toThrow(
        'getSystemBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessAsync = native;
    });
  });
});

describe('setSystemBrightnessAsync', () => {
  describe('Positive', () => {
    it('delegates to setBrightnessAsync on non-Android platforms, without touching the Android-only native method', async () => {
      fakePlatform.OS = 'ios';
      await setSystemBrightnessAsync(0.3);
      expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(0.3);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await setSystemBrightnessAsync(0.3);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync).toHaveBeenCalledWith(0.3);
    });

    // why: clamping is shared with setBrightnessAsync and must apply before the platform branch
    // splits — an Android caller passing an out-of-range value must not bypass the same 0..1
    // contract iOS gets.
    it('clamps out-of-range values before delegating to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await setSystemBrightnessAsync(2);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync).toHaveBeenCalledWith(1);
    });
  });

  describe('Negative', () => {
    // why: NaN must be rejected before the platform branch runs — regardless of which native path
    // it would have taken.
    it('throws a TypeError before branching on platform when the value is NaN', async () => {
      await expect(setSystemBrightnessAsync(NaN)).rejects.toThrow(
        'setSystemBrightnessAsync cannot be called with NaN',
      );
    });

    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { setSystemBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync = undefined;

      await expect(setSystemBrightnessAsync(0.5)).rejects.toThrow(
        'setSystemBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync = native;
    });
  });
});

describe('restoreSystemBrightnessAsync', () => {
  describe('Positive', () => {
    // why: there is nothing to restore on a platform with no system-brightness override concept —
    // it must be a true no-op, not an error, so non-Android callers can call it unconditionally.
    it('no-ops on non-Android platforms without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await restoreSystemBrightnessAsync();
      expect(FAKE_NATIVE_BRIGHTNESS.restoreSystemBrightnessAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await restoreSystemBrightnessAsync();
      expect(FAKE_NATIVE_BRIGHTNESS.restoreSystemBrightnessAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { restoreSystemBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.restoreSystemBrightnessAsync = undefined;

      await expect(restoreSystemBrightnessAsync()).rejects.toThrow(
        'restoreSystemBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.restoreSystemBrightnessAsync = native;
    });
  });
});

describe('isUsingSystemBrightnessAsync', () => {
  describe('Positive', () => {
    // why: native reads a raw override flag that only means something once the app has actually
    // set an Android system value — on every other platform the answer is unconditionally false.
    it('resolves false on non-Android platforms without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(isUsingSystemBrightnessAsync()).resolves.toBe(false);
      expect(FAKE_NATIVE_BRIGHTNESS.isUsingSystemBrightnessAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await expect(isUsingSystemBrightnessAsync()).resolves.toBe(true);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { isUsingSystemBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.isUsingSystemBrightnessAsync = undefined;

      await expect(isUsingSystemBrightnessAsync()).rejects.toThrow(
        'isUsingSystemBrightnessAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.isUsingSystemBrightnessAsync = native;
    });
  });
});

describe('getSystemBrightnessModeAsync', () => {
  describe('Positive', () => {
    // why: brightness mode (AUTOMATIC/MANUAL) is an Android-only concept — a non-Android caller
    // must get a defined, non-throwing UNKNOWN rather than an error for a mode that doesn't exist
    // on their platform.
    it('resolves UNKNOWN on non-Android platforms without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await expect(getSystemBrightnessModeAsync()).resolves.toBe(BrightnessMode.UNKNOWN);
      expect(FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessModeAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android', async () => {
      fakePlatform.OS = 'android';
      await expect(getSystemBrightnessModeAsync()).resolves.toBe(1);
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { getSystemBrightnessModeAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessModeAsync = undefined;

      await expect(getSystemBrightnessModeAsync()).rejects.toThrow(
        'getSystemBrightnessModeAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessModeAsync = native;
    });
  });
});

describe('setSystemBrightnessModeAsync', () => {
  describe('Positive', () => {
    it('no-ops on non-Android platforms without calling the native module', async () => {
      fakePlatform.OS = 'ios';
      await setSystemBrightnessModeAsync(BrightnessMode.AUTOMATIC);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync).not.toHaveBeenCalled();
    });

    // why: UNKNOWN isn't a real mode to set — there's nothing meaningful to ask native to do with
    // it, so it must no-op instead of forwarding a nonsense mode value.
    it('no-ops on Android when passed UNKNOWN', async () => {
      fakePlatform.OS = 'android';
      await setSystemBrightnessModeAsync(BrightnessMode.UNKNOWN);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync).not.toHaveBeenCalled();
    });

    it('delegates to the native module on Android with a concrete mode', async () => {
      fakePlatform.OS = 'android';
      await setSystemBrightnessModeAsync(BrightnessMode.MANUAL);
      expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync).toHaveBeenCalledWith(
        BrightnessMode.MANUAL,
      );
    });
  });

  describe('Negative', () => {
    it('throws an UnavailabilityError-shaped error on Android when the native method is absent', async () => {
      fakePlatform.OS = 'android';
      const { setSystemBrightnessModeAsync: native } = FAKE_NATIVE_BRIGHTNESS;
      // @ts-expect-error -- simulating an Android build missing this native method
      FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync = undefined;

      await expect(setSystemBrightnessModeAsync(BrightnessMode.MANUAL)).rejects.toThrow(
        'setSystemBrightnessModeAsync is not available on expo-brightness',
      );

      FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync = native;
    });
  });
});

describe('getPermissionsAsync', () => {
  describe('Positive', () => {
    it('passes the native response straight through', async () => {
      await expect(getPermissionsAsync()).resolves.toEqual({ status: 'granted', granted: true });
    });
  });

  describe('Negative', () => {
    // why: this wrapper has no capability check of its own (unlike the get/set-brightness calls)
    // — it must not swallow a native rejection (e.g. the OS permission dialog erroring out) behind
    // a resolved value.
    it('propagates a native rejection instead of swallowing it', async () => {
      FAKE_NATIVE_BRIGHTNESS.getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      await expect(getPermissionsAsync()).rejects.toThrow('permission query failed');
    });
  });
});

describe('requestPermissionsAsync', () => {
  describe('Positive', () => {
    it('passes the native response straight through', async () => {
      await expect(requestPermissionsAsync()).resolves.toEqual({
        status: 'granted',
        granted: true,
      });
    });
  });

  describe('Negative', () => {
    it('propagates a native rejection instead of swallowing it', async () => {
      FAKE_NATIVE_BRIGHTNESS.requestPermissionsAsync.mockRejectedValueOnce(
        new Error('permission request failed'),
      );

      await expect(requestPermissionsAsync()).rejects.toThrow('permission request failed');
    });
  });
});

describe('addBrightnessListener', () => {
  // why: no throwing path — it's a synchronous subscribe call, so there is no Negative group.
  describe('subscribes through the native event name', () => {
    // why: 'Expo.brightnessDidChange' is the exact string the native side emits — a typo here
    // silently means the listener never fires, with no error to catch it.
    it('forwards the listener under the Expo.brightnessDidChange event name', () => {
      const listener = vi.fn();
      addBrightnessListener(listener);

      expect(FAKE_NATIVE_BRIGHTNESS.addListener).toHaveBeenCalledWith(
        'Expo.brightnessDidChange',
        listener,
      );
    });
  });
});
