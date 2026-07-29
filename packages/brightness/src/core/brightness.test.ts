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
  it('resolves true when the native module implements getBrightnessAsync', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('resolves false when the native method is absent', async () => {
    const { getBrightnessAsync: native } = FAKE_NATIVE_BRIGHTNESS;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_BRIGHTNESS.getBrightnessAsync = native;
  });
});

describe('getBrightnessAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getBrightnessAsync()).resolves.toBe(0.5);
  });

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

describe('setBrightnessAsync', () => {
  it('delegates to the native module', async () => {
    await setBrightnessAsync(0.4);
    expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(0.4);
  });

  it('clamps a value above 1 down to 1', async () => {
    await setBrightnessAsync(1.5);
    expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(1);
  });

  it('clamps a value below 0 up to 0', async () => {
    await setBrightnessAsync(-0.5);
    expect(FAKE_NATIVE_BRIGHTNESS.setBrightnessAsync).toHaveBeenCalledWith(0);
  });

  it('throws a TypeError when the clamped value is NaN', async () => {
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

describe('getSystemBrightnessAsync', () => {
  it('delegates to getBrightnessAsync on non-Android platforms', async () => {
    fakePlatform.OS = 'ios';
    await expect(getSystemBrightnessAsync()).resolves.toBe(0.5);
    expect(FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    fakePlatform.OS = 'android';
    await expect(getSystemBrightnessAsync()).resolves.toBe(0.6);
  });

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

describe('setSystemBrightnessAsync', () => {
  it('delegates to setBrightnessAsync on non-Android platforms', async () => {
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

  it('clamps out-of-range values before delegating', async () => {
    fakePlatform.OS = 'android';
    await setSystemBrightnessAsync(2);
    expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessAsync).toHaveBeenCalledWith(1);
  });

  it('throws a TypeError when the clamped value is NaN', async () => {
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

describe('restoreSystemBrightnessAsync', () => {
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

describe('isUsingSystemBrightnessAsync', () => {
  it('resolves false on non-Android platforms without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(isUsingSystemBrightnessAsync()).resolves.toBe(false);
    expect(FAKE_NATIVE_BRIGHTNESS.isUsingSystemBrightnessAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    fakePlatform.OS = 'android';
    await expect(isUsingSystemBrightnessAsync()).resolves.toBe(true);
  });

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

describe('getSystemBrightnessModeAsync', () => {
  it('resolves UNKNOWN on non-Android platforms without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await expect(getSystemBrightnessModeAsync()).resolves.toBe(BrightnessMode.UNKNOWN);
    expect(FAKE_NATIVE_BRIGHTNESS.getSystemBrightnessModeAsync).not.toHaveBeenCalled();
  });

  it('delegates to the native module on Android', async () => {
    fakePlatform.OS = 'android';
    await expect(getSystemBrightnessModeAsync()).resolves.toBe(1);
  });

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

describe('setSystemBrightnessModeAsync', () => {
  it('no-ops on non-Android platforms without calling the native module', async () => {
    fakePlatform.OS = 'ios';
    await setSystemBrightnessModeAsync(BrightnessMode.AUTOMATIC);
    expect(FAKE_NATIVE_BRIGHTNESS.setSystemBrightnessModeAsync).not.toHaveBeenCalled();
  });

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

describe('getPermissionsAsync', () => {
  it('passes straight through to the native module', async () => {
    await expect(getPermissionsAsync()).resolves.toEqual({ status: 'granted', granted: true });
  });
});

describe('requestPermissionsAsync', () => {
  it('passes straight through to the native module', async () => {
    await expect(requestPermissionsAsync()).resolves.toEqual({ status: 'granted', granted: true });
  });
});

describe('addBrightnessListener', () => {
  it('subscribes through the Expo.brightnessDidChange event name', () => {
    const listener = vi.fn();
    addBrightnessListener(listener);

    expect(FAKE_NATIVE_BRIGHTNESS.addListener).toHaveBeenCalledWith(
      'Expo.brightnessDidChange',
      listener,
    );
  });
});
