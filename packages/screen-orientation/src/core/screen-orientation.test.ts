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

describe('Positive (delegates to the native module without error)', () => {
  describe('lockAsync', () => {
    it('delegates to the native module', async () => {
      await lockAsync(OrientationLock.PORTRAIT_UP);

      expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).toHaveBeenCalledWith(
        OrientationLock.PORTRAIT_UP,
      );
    });

    // why: OTHER means "some platform-specific lock is already active" (set by
    // lockPlatformAsync) — lockAsync has no OTHER-shaped native call to make, so it must not
    // touch the native module at all rather than sending a bogus value
    it('no-ops on OrientationLock.OTHER without calling the native module', async () => {
      await lockAsync(OrientationLock.OTHER);

      expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).not.toHaveBeenCalled();
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

    // why: getOrientationLockAsync's own fallback (below) must reflect a platform-specific lock
    // as OTHER, not as whatever numeric/array/string value was actually sent to the native side
    it('records the applied lock as OrientationLock.OTHER for the getOrientationLockAsync fallback', async () => {
      fakePlatform.OS = 'android';
      await lockPlatformAsync({ screenOrientationConstantAndroid: 1 });
      const { getOrientationLockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationLockAsync = undefined;

      await expect(getOrientationLockAsync()).resolves.toBe(OrientationLock.OTHER);

      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationLockAsync = native;
    });
  });

  describe('unlockAsync', () => {
    it('delegates to lockAsync with OrientationLock.DEFAULT', async () => {
      await unlockAsync();

      expect(FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync).toHaveBeenCalledWith(
        OrientationLock.DEFAULT,
      );
    });
  });

  describe('getOrientationAsync', () => {
    it('delegates to the native module', async () => {
      await expect(getOrientationAsync()).resolves.toBe(1);
    });
  });

  describe('getOrientationLockAsync', () => {
    it('delegates to the native module when present', async () => {
      await expect(getOrientationLockAsync()).resolves.toBe(0);
    });

    // why: without a real getOrientationLockAsync, the caller's own last lockAsync() call is
    // the only signal available — falling back to UNKNOWN instead would throw away information
    // the wrapper already has
    it('falls back to the last lock set via lockAsync when the native method is absent', async () => {
      await lockAsync(OrientationLock.LANDSCAPE);
      const { getOrientationLockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
      // @ts-expect-error -- simulating a platform where the native method is absent
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

    // why: unlike every other getter/setter in this module, getPlatformOrientationLockAsync has
    // no explicit "native method absent" guard — it relies on `?.()` and the shape check below to
    // degrade gracefully instead of throwing an UnavailabilityError, on the (untyped) native
    // module returning a value that doesn't match the current platform's expected shape
    it('resolves to an empty object when the native value does not match the current platform', async () => {
      fakePlatform.OS = 'ios';
      FAKE_NATIVE_SCREEN_ORIENTATION.getPlatformOrientationLockAsync.mockResolvedValueOnce(
        undefined,
      );

      await expect(getPlatformOrientationLockAsync()).resolves.toEqual({});
    });
  });

  describe('supportsOrientationLockAsync', () => {
    it('delegates to the native module', async () => {
      await expect(supportsOrientationLockAsync(OrientationLock.PORTRAIT)).resolves.toBe(true);
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

    // why: the iOS/web path is a thin pass-through over the native event — the caller's listener
    // must see exactly what the native side sent, not a reshaped copy
    it('forwards the native expoDidUpdateDimensions event to the caller unchanged on iOS', async () => {
      fakePlatform.OS = 'ios';
      const listener = vi.fn();
      addOrientationChangeListener(listener);
      const nativeCallback = FAKE_NATIVE_SCREEN_ORIENTATION.addListener.mock.calls[0]?.[1];
      const event = {
        orientationLock: OrientationLock.LANDSCAPE,
        orientationInfo: { orientation: Orientation.LANDSCAPE_LEFT },
      };

      await nativeCallback?.(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    // why: Android has no native orientation-change event, so the wrapper must reconstruct the
    // same OrientationChangeEvent shape the iOS/web path gets natively, from two separate
    // one-shot reads — a caller switching platforms must see an identical event contract
    it('reconstructs the event from getOrientationAsync()/getOrientationLockAsync() on Android', async () => {
      fakePlatform.OS = 'android';
      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationAsync.mockResolvedValueOnce(
        Orientation.LANDSCAPE_LEFT,
      );
      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationLockAsync.mockResolvedValueOnce(
        OrientationLock.LANDSCAPE,
      );
      const listener = vi.fn();
      addOrientationChangeListener(listener);
      const dimensionsCallback = vi.mocked(Dimensions.addEventListener).mock.calls[0]?.[1];

      await dimensionsCallback?.({ window: {} as never, screen: {} as never });

      expect(listener).toHaveBeenCalledWith({
        orientationInfo: { orientation: Orientation.LANDSCAPE_LEFT },
        orientationLock: OrientationLock.LANDSCAPE,
      });
    });
  });

  describe('removeOrientationChangeListener / removeOrientationChangeListeners', () => {
    it('removes a single subscription', () => {
      const subscription = addOrientationChangeListener(vi.fn());
      const removeSpy = vi.spyOn(subscription, 'remove');

      removeOrientationChangeListener(subscription);

      expect(removeSpy).toHaveBeenCalledTimes(1);
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

    // why: removeOrientationChangeListener must drop the subscription from the internal list, not
    // just call .remove() on it — otherwise a later removeOrientationChangeListeners() sweep
    // would call .remove() on an already-removed subscription a second time
    it('excludes an already-removed subscription from a later removeOrientationChangeListeners() sweep', () => {
      const subscription = addOrientationChangeListener(vi.fn());
      const removeSpy = vi.spyOn(subscription, 'remove');
      removeOrientationChangeListener(subscription);
      removeSpy.mockClear();

      removeOrientationChangeListeners();

      expect(removeSpy).not.toHaveBeenCalled();
    });
  });
});

describe('Negative (native method absent / invalid input must throw, not silently no-op)', () => {
  describe('lockAsync', () => {
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
    it('throws a TypeError on an invalid iOS orientation entry', async () => {
      fakePlatform.OS = 'ios';

      // @ts-expect-error -- simulating a caller passing a bogus orientation value
      await expect(lockPlatformAsync({ screenOrientationArrayIOS: [999] })).rejects.toThrow(
        'is not a valid Orientation',
      );
    });

    // why: screenOrientationArrayIOS is documented as an array — a caller that (from plain JS,
    // not TS) passes a single non-array value must be told so, not silently fall through to the
    // generic "no option supplied" message
    it('throws a TypeError when screenOrientationArrayIOS on iOS is not an array', async () => {
      fakePlatform.OS = 'ios';

      // @ts-expect-error -- simulating a caller passing a non-array value from plain JS
      await expect(lockPlatformAsync({ screenOrientationArrayIOS: 'landscape' })).rejects.toThrow(
        'cannot be called with landscape',
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
    // why: unlockAsync shares lockAsync's native call (OrientationLock.DEFAULT), so it must
    // reject the same way lockAsync does when the underlying method is unavailable, rather than
    // resolving as if it had silently succeeded
    it('throws UnavailabilityError when the native lockAsync method is absent', async () => {
      const { lockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync = undefined;

      await expect(unlockAsync()).rejects.toThrow('lockAsync is not available on ScreenOrientation');

      FAKE_NATIVE_SCREEN_ORIENTATION.lockAsync = native;
    });
  });

  describe('getOrientationAsync', () => {
    it('throws UnavailabilityError when the native method is absent', async () => {
      const { getOrientationAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
      // @ts-expect-error -- simulating a platform where the native method is absent
      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationAsync = undefined;

      await expect(getOrientationAsync()).rejects.toThrow();

      FAKE_NATIVE_SCREEN_ORIENTATION.getOrientationAsync = native;
    });
  });

  describe('supportsOrientationLockAsync', () => {
    it('throws a TypeError on an invalid lock value', async () => {
      // @ts-expect-error -- simulating a caller passing a bogus lock value
      await expect(supportsOrientationLockAsync(999)).rejects.toThrow('Invalid Orientation Lock');
    });

    it('throws UnavailabilityError when the native method is absent', async () => {
      const { supportsOrientationLockAsync: native } = FAKE_NATIVE_SCREEN_ORIENTATION;
      // @ts-expect-error -- simulating a platform where the native method is absent
      FAKE_NATIVE_SCREEN_ORIENTATION.supportsOrientationLockAsync = undefined;

      await expect(supportsOrientationLockAsync(OrientationLock.PORTRAIT)).rejects.toThrow();

      FAKE_NATIVE_SCREEN_ORIENTATION.supportsOrientationLockAsync = native;
    });
  });

  describe('addOrientationChangeListener', () => {
    it('throws a TypeError when the listener is not a function', () => {
      // @ts-expect-error -- simulating a caller passing a non-function listener
      expect(() => addOrientationChangeListener('not-a-function')).toThrow();
    });
  });

  describe('removeOrientationChangeListener', () => {
    it('throws a TypeError when passed an invalid subscription', () => {
      // @ts-expect-error -- simulating a caller passing a bogus subscription
      expect(() => removeOrientationChangeListener(null)).toThrow(
        'Must pass in a valid subscription',
      );
    });
  });
});

// lockPlatformAsync's Android branch guards entry with a plain truthy check
// (`Platform.OS === 'android' && screenOrientationConstantAndroid`) before its own isNaN check
// ever runs. Two consequences, both reachable without any `as` cast since NaN and 0 are both
// valid `number` values under screenOrientationConstantAndroid's type:
//   1. Android's real SCREEN_ORIENTATION_LANDSCAPE constant is 0, which is falsy — so locking to
//      it never reaches the branch at all and falls through to the generic "no option supplied"
//      error instead of actually locking.
//   2. NaN is also falsy, so the explicit `isNaN(...)` check a few lines below can never fire —
//      it is dead code, and a NaN caller sees the generic error message, not the isNaN-specific
//      one authored for it.
// Both consequences are inherited, not ours: expo's ScreenOrientation.ts carries the same truthy
// guard at :81 and the same `!platformOrientationParam` re-check at :112, so fixing only the first
// would change nothing. See the UPSTREAM-BUG tag at the call site. These tests pin the inherited
// behavior so a well-meaning cleanup of either guard is caught rather than shipped.
describe('falsy Android constant — upstream parity', () => {
  describe('lockPlatformAsync', () => {
    it('throws the generic "no option supplied" error for Android constant 0 instead of locking', async () => {
      fakePlatform.OS = 'android';

      await expect(lockPlatformAsync({ screenOrientationConstantAndroid: 0 })).rejects.toThrow(
        'cannot be called with undefined option properties',
      );
    });

    it('throws the generic "no option supplied" error for NaN instead of the isNaN-specific message', async () => {
      fakePlatform.OS = 'android';

      await expect(
        lockPlatformAsync({ screenOrientationConstantAndroid: NaN }),
      ).rejects.toThrow('cannot be called with undefined option properties');
    });
  });
});
