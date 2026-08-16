import { afterEach, describe, expect, it, vi } from 'vitest';

const FAKE_NATIVE_KEEP_AWAKE = {
  isAvailableAsync: vi.fn(async () => true),
  activate: vi.fn(async () => undefined),
  deactivate: vi.fn(async () => undefined),
  addListenerForTag: vi.fn(() => ({ remove: vi.fn() })),
};

// The real ExpoKeepAwake native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, so the
// module-lookup file is faked in place of expo-modules-core's runtime resolution, same pattern
// packages/battery/src/core/battery.test.ts uses.
vi.mock('./native-module', () => ({
  expoKeepAwake: FAKE_NATIVE_KEEP_AWAKE,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse — same fake
// packages/haptics/src/core/haptics.test.ts uses. keep-awake.ts imports UnavailabilityError as a
// real value (not just a type), so it needs mocking here too.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  ExpoKeepAwakeTag,
  isAvailableAsync,
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  addListener,
} = await import('./keep-awake');

afterEach(() => {
  vi.clearAllMocks();
});

describe('isAvailableAsync', () => {
  // No Negative group here: the function never rejects or throws — it only ever resolves a
  // boolean, either delegated or defaulted.

  // why: the wrapper must forward the native module's OWN answer, not just always report
  // available — asserting a value that differs from the true-by-default fallback is what
  // actually proves delegation happens instead of the fallback masking a broken pass-through.
  it('resolves with the native module\'s own result when isAvailableAsync exists', async () => {
    FAKE_NATIVE_KEEP_AWAKE.isAvailableAsync.mockResolvedValueOnce(false);

    await expect(isAvailableAsync()).resolves.toBe(false);
  });

  // why: platforms without the capability check omit the method entirely (see native-module.ts —
  // every native method is optional); the wrapper must assume "available" rather than crash.
  it('defaults to true when the native method is absent', async () => {
    const { isAvailableAsync: native } = FAKE_NATIVE_KEEP_AWAKE;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_KEEP_AWAKE.isAvailableAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(true);

    FAKE_NATIVE_KEEP_AWAKE.isAvailableAsync = native;
  });
});

describe('activateKeepAwakeAsync', () => {
  describe('Positive', () => {
    // why: callers that don't care about naming their handle share the module's default tag, so
    // the screen stays on for as long as ANY caller holds a lock under it.
    it('activates the default tag when none is given', async () => {
      await activateKeepAwakeAsync();

      expect(FAKE_NATIVE_KEEP_AWAKE.activate).toHaveBeenCalledWith(ExpoKeepAwakeTag);
    });

    // why: a caller managing its own named lock must be able to target it specifically, matching
    // upstream expo-keep-awake's tag-based API.
    it('activates an explicit tag', async () => {
      await activateKeepAwakeAsync('custom-tag');

      expect(FAKE_NATIVE_KEEP_AWAKE.activate).toHaveBeenCalledWith('custom-tag');
    });

    // why: `activate` is an optional native method (native-module.ts) — a platform lacking it
    // must not crash callers, it should just be a silent no-op via optional chaining.
    it('resolves without throwing when the native activate method is absent', async () => {
      const { activate: native } = FAKE_NATIVE_KEEP_AWAKE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_KEEP_AWAKE.activate = undefined;

      await expect(activateKeepAwakeAsync('custom-tag')).resolves.toBeUndefined();

      FAKE_NATIVE_KEEP_AWAKE.activate = native;
    });
  });
});

describe('deactivateKeepAwake', () => {
  describe('Positive', () => {
    // why: releasing without an explicit tag must target the same shared default tag that an
    // untagged activate call used, or the lock would leak.
    it('deactivates the default tag when none is given', async () => {
      await deactivateKeepAwake();

      expect(FAKE_NATIVE_KEEP_AWAKE.deactivate).toHaveBeenCalledWith(ExpoKeepAwakeTag);
    });

    // why: a caller releasing one of several named locks must target only that lock.
    it('deactivates an explicit tag', async () => {
      await deactivateKeepAwake('custom-tag');

      expect(FAKE_NATIVE_KEEP_AWAKE.deactivate).toHaveBeenCalledWith('custom-tag');
    });

    // why: `deactivate` is an optional native method too — its absence must not crash a caller
    // that's simply cleaning up on unmount.
    it('resolves without throwing when the native deactivate method is absent', async () => {
      const { deactivate: native } = FAKE_NATIVE_KEEP_AWAKE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_KEEP_AWAKE.deactivate = undefined;

      await expect(deactivateKeepAwake('custom-tag')).resolves.toBeUndefined();

      FAKE_NATIVE_KEEP_AWAKE.deactivate = native;
    });
  });
});

describe('addListener', () => {
  describe('Positive', () => {
    // why: mirrors upstream expo-keep-awake's own overload — a bare listener subscribes for the
    // shared default tag, so the simplest call shape still works.
    it('subscribes the default tag when called with a bare listener', () => {
      const listener = vi.fn();
      addListener(listener);

      expect(FAKE_NATIVE_KEEP_AWAKE.addListenerForTag).toHaveBeenCalledWith(
        ExpoKeepAwakeTag,
        listener,
      );
    });

    // why: a caller observing one of several named locks must subscribe to that lock only.
    it('subscribes an explicit tag when given tag + listener', () => {
      const listener = vi.fn();
      addListener('custom-tag', listener);

      expect(FAKE_NATIVE_KEEP_AWAKE.addListenerForTag).toHaveBeenCalledWith(
        'custom-tag',
        listener,
      );
    });

    // why: the overload resolution is positional, not "whichever argument looks like a
    // function" — a function-typed first argument always resolves to the bare-listener form,
    // so a second argument passed alongside it is dead weight, never silently double-invoked.
    it('resolves the listener from the first argument when it is a function, ignoring a second one', () => {
      const bareListener = vi.fn();
      const ignoredSecondArgument = vi.fn();

      addListener(bareListener, ignoredSecondArgument);

      expect(FAKE_NATIVE_KEEP_AWAKE.addListenerForTag).toHaveBeenCalledWith(
        ExpoKeepAwakeTag,
        bareListener,
      );
      expect(ignoredSecondArgument).not.toHaveBeenCalled();
    });
  });

  describe('Negative', () => {
    // why: unlike activate/deactivate, addListener throws rather than silently no-opping when
    // its native method is missing — matching local-auth/haptics's UnavailabilityError
    // convention (see this file's top comment), because a dropped subscription would silently
    // leave a caller believing it's listening when it never was.
    it('throws an UnavailabilityError-shaped error when addListenerForTag is absent', () => {
      const { addListenerForTag: native } = FAKE_NATIVE_KEEP_AWAKE;
      // @ts-expect-error -- simulating a platform where the native module has no such method
      FAKE_NATIVE_KEEP_AWAKE.addListenerForTag = undefined;

      expect(() => addListener(vi.fn())).toThrow(
        'addListenerForTag is not available on ExpoKeepAwake',
      );

      FAKE_NATIVE_KEEP_AWAKE.addListenerForTag = native;
    });

    // why: calling the tag-only overload without a listener leaves nothing to subscribe —
    // failing loudly here beats silently registering `undefined` as a listener.
    it('throws when no listener can be resolved', () => {
      expect(() => addListener('custom-tag')).toThrow(
        'addListener requires a listener function',
      );
    });
  });
});
