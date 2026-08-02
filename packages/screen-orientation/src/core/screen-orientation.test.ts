import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_SCREEN_ORIENTATION = {
  lockAsync: vi.fn(async () => undefined),
  lockPlatformAsync: vi.fn(async () => undefined),
  getOrientationAsync: vi.fn(async () => 1),
  getOrientationLockAsync: vi.fn(async () => 0),
  getPlatformOrientationLockAsync: vi.fn(async () => 0),
  supportsOrientationLockAsync: vi.fn(async () => true),
  addListener: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoScreenOrientation native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/network/src/core/network.test.ts uses.
vi.mock('./native-module', () => ({
  expoScreenOrientation: FAKE_NATIVE_SCREEN_ORIENTATION,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/cellular/src/core/cellular.test.ts uses. Platform.OS is mutable per-test.
const fakePlatform = { OS: 'ios' as 'ios' | 'android' | 'web' };

vi.mock('expo-modules-core', () => ({
  Platform: fakePlatform,
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

// Android doesn't emit `expoDidUpdateDimensions` — the module piggybacks on RN's own Dimensions
// change event there instead (see the function-level comment in screen-orientation.ts).
vi.mock('react-native', () => ({
  Dimensions: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));

const {
  lockAsync,
  lockPlatformAsync,
  unlockAsync,
  getOrientationAsync,
  getOrientationLockAsync,
  getPlatformOrientationLockAsync,
  supportsOrientationLockAsync,
  addOrientationChangeListener,
  removeOrientationChangeListeners,
  removeOrientationChangeListener,
} = await import('./screen-orientation');
const { Orientation, OrientationLock, WebOrientationLock } = await import('./types');
const { Dimensions } = await import('react-native');

afterEach(() => {
  fakePlatform.OS = 'ios';
  vi.clearAllMocks();
  removeOrientationChangeListeners();
});

describe('lockAsync', () => {
  it('delegates to the native module', async () => {
    await lockAsync(OrientationLock.PORTRAIT_UP);

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).toHaveBeenCalledWith(
      OrientationLock.PORTRAIT_UP,
    );
  });

  it('no-ops on OrientationLock.OTHER without calling the native module', async () => {
    await lockAsync(OrientationLock.OTHER);

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).not.toHaveBeenCalled();
  });

  it('throws a TypeError on an invalid lock value', async () => {
    // @ts-expect-error -- simulating a caller passing a bogus lock value
    await expect(lockAsync(999)).rejects.toThrow('Invalid Orientation Lock');
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { lockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync = undefined;

    await expect(lockAsync(OrientationLock.PORTRAIT_UP)).rejects.toThrow(
      'lockAsync is not available on ScreenOrientation',
    );

    FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync = native;
  });
});

describe('lockPlatformAsync', () => {
  it('forwards the Android numeric constant on Android', async () => {
    fakePlatform.OS = 'android';

    await lockPlatformAsync({ screenOrientationConstantAndroid: 1 });

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockPlatformAsync).toHaveBeenCalledWith(1);
  });

  it('forwards the iOS orientation array on iOS', async () => {
    fakePlatform.OS = 'ios';

    await lockPlatformAsync({ screenOrientationArrayIOS: [Orientation.PORTRAIT_UP] });

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockPlatformAsync).toHaveBeenCalledWith([
      Orientation.PORTRAIT_UP,
    ]);
  });

  it('forwards the web orientation lock on web', async () => {
    fakePlatform.OS = 'web';

    await lockPlatformAsync({ screenOrientationLockWeb: WebOrientationLock.LANDSCAPE });

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockPlatformAsync).toHaveBeenCalledWith(
      WebOrientationLock.LANDSCAPE,
    );
  });

  it('throws a TypeError on an invalid iOS orientation entry', async () => {
    fakePlatform.OS = 'ios';

    // @ts-expect-error -- simulating a caller passing a bogus orientation value
    await expect(lockPlatformAsync({ screenOrientationArrayIOS: [999] })).rejects.toThrow(
      'is not a valid Orientation',
    );
  });

  it('throws a TypeError when no matching platform option is supplied', async () => {
    fakePlatform.OS = 'ios';

    await expect(lockPlatformAsync({})).rejects.toThrow(
      'cannot be called with undefined option properties',
    );
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { lockPlatformAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SCREEN_ORIENTATION.lockPlatformAsync = undefined;

    await expect(lockPlatformAsync({ screenOrientationConstantAndroid: 1 })).rejects.toThrow(
      'lockPlatformAsync is not available on ScreenOrientation',
    );

    FAKE_NATIVE_SCREEN_ORIENTATION.lockPlatformAsync = native;
  });
});

describe('unlockAsync', () => {
  it('delegates to lockAsync with OrientationLock.DEFAULT', async () => {
    await unlockAsync();

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).toHaveBeenCalledWith(OrientationLock.DEFAULT);
  });
});

describe('getOrientationAsync', () => {
  it('delegates to the native module', async () => {
    await expect(getOrientationAsync()).resolves.toBe(1);
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { getOrientationAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationAsync = undefined;

    await expect(getOrientationAsync()).rejects.toThrow();

    FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationAsync = native;
  });
});

describe('getOrientationLockAsync', () => {
  it('delegates to the native module when present', async () => {
    await expect(getOrientationLockAsync()).resolves.toBe(0);
  });

  it('falls back to the last lock set via lockAsync when the native method is absent', async () => {
    await lockAsync(OrientationLock.LANDSCAPE);
    const { getOrientationLockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationLockAsync = undefined;

    await expect(getOrientationLockAsync()).resolves.toBe(OrientationLock.LANDSCAPE);

    FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationLockAsync = native;
  });
});

describe('getPlatformOrientationLockAsync', () => {
  it('wraps a numeric native value as screenOrientationConstantAndroid on Android', async () => {
    fakePlatform.OS = 'android';
    FAKE_NATIVE_SCREEN_ORIENTATION.getPlatformOrientationLockAsync.mockResolvedValueOnce(1);

    await expect(getPlatformOrientationLockAsync()).resolves.toEqual({
      screenOrientationConstantAndroid: 1,
    });
  });

  it('wraps an array native value as screenOrientationArrayIOS on iOS', async () => {
    fakePlatform.OS = 'ios';
    FAKE_NATIVE_SCREEN_ORIENTATION.getPlatformOrientationLockAsync.mockResolvedValueOnce([
      Orientation.LANDSCAPE_LEFT,
    ]);

    await expect(getPlatformOrientationLockAsync()).resolves.toEqual({
      screenOrientationArrayIOS: [Orientation.LANDSCAPE_LEFT],
    });
  });

  it('wraps a string native value as screenOrientationLockWeb on web', async () => {
    fakePlatform.OS = 'web';
    FAKE_NATIVE_SCREEN_ORIENTATION.getPlatformOrientationLockAsync.mockResolvedValueOnce(
      WebOrientationLock.ANY,
    );

    await expect(getPlatformOrientationLockAsync()).resolves.toEqual({
      screenOrientationLockWeb: WebOrientationLock.ANY,
    });
  });
});

describe('supportsOrientationLockAsync', () => {
  it('delegates to the native module', async () => {
    await expect(supportsOrientationLockAsync(OrientationLock.PORTRAIT)).resolves.toBe(true);
  });

  it('throws a TypeError on an invalid lock value', async () => {
    // @ts-expect-error -- simulating a caller passing a bogus lock value
    await expect(supportsOrientationLockAsync(999)).rejects.toThrow('Invalid Orientation Lock');
  });

  it('throws UnavailabilityError when the native method is absent', async () => {
    const { supportsOrientationLockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_SCREEN_ORIENTATION.supportsOrientationLockAsync = undefined;

    await expect(supportsOrientationLockAsync(OrientationLock.PORTRAIT)).rejects.toThrow();

    FAKE_NATIVE_SCREEN_ORIENTATION.supportsOrientationLockAsync = native;
  });
});

describe('addOrientationChangeListener', () => {
  it('subscribes through the native expoDidUpdateDimensions event on iOS', () => {
    fakePlatform.OS = 'ios';
    const listener = vi.fn();

    addOrientationChangeListener(listener);

    expect(FAKE_NATIVE_SCREEN_ORIENTATION.addListener).toHaveBeenCalledWith(
      'expoDidUpdateDimensions',
      expect.any(Function),
    );
    expect(Dimensions.addEventListener).not.toHaveBeenCalled();
  });

  it('subscribes through RN Dimensions.addEventListener on Android', () => {
    fakePlatform.OS = 'android';
    const listener = vi.fn();

    addOrientationChangeListener(listener);

    expect(Dimensions.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    expect(FAKE_NATIVE_SCREEN_ORIENTATION.addListener).not.toHaveBeenCalled();
  });

  it('throws a TypeError when the listener is not a function', () => {
    // @ts-expect-error -- simulating a caller passing a non-function listener
    expect(() => addOrientationChangeListener('not-a-function')).toThrow();
  });
});

describe('removeOrientationChangeListener / removeOrientationChangeListeners', () => {
  it('removes a single subscription', () => {
    const subscription = addOrientationChangeListener(vi.fn());
    const removeSpy = vi.spyOn(subscription, 'remove');

    removeOrientationChangeListener(subscription);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });

  it('throws a TypeError when passed an invalid subscription', () => {
    // @ts-expect-error -- simulating a caller passing a bogus subscription
    expect(() => removeOrientationChangeListener(null)).toThrow(
      'Must pass in a valid subscription',
    );
  });

  it('removes every registered subscription', () => {
    const first = addOrientationChangeListener(vi.fn());
    const second = addOrientationChangeListener(vi.fn());
    const firstRemove = vi.spyOn(first, 'remove');
    const secondRemove = vi.spyOn(second, 'remove');

    removeOrientationChangeListeners();

    expect(firstRemove).toHaveBeenCalledTimes(1);
    expect(secondRemove).toHaveBeenCalledTimes(1);
  });
});
