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
  it('delegates to the native module when isAvailableAsync exists', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });

  it('defaults to true when the native method is absent', async () => {
    const { isAvailableAsync: native } = FAKE_NATIVE_KEEP_AWAKE;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_KEEP_AWAKE.isAvailableAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(true);

    FAKE_NATIVE_KEEP_AWAKE.isAvailableAsync = native;
  });
});

describe('activateKeepAwakeAsync', () => {
  it('activates the default tag when none is given', async () => {
    await activateKeepAwakeAsync();

    expect(FAKE_NATIVE_KEEP_AWAKE.activate).toHaveBeenCalledWith(ExpoKeepAwakeTag);
  });

  it('activates an explicit tag', async () => {
    await activateKeepAwakeAsync('custom-tag');

    expect(FAKE_NATIVE_KEEP_AWAKE.activate).toHaveBeenCalledWith('custom-tag');
  });
});

describe('deactivateKeepAwake', () => {
  it('deactivates the default tag when none is given', async () => {
    await deactivateKeepAwake();

    expect(FAKE_NATIVE_KEEP_AWAKE.deactivate).toHaveBeenCalledWith(ExpoKeepAwakeTag);
  });

  it('deactivates an explicit tag', async () => {
    await deactivateKeepAwake('custom-tag');

    expect(FAKE_NATIVE_KEEP_AWAKE.deactivate).toHaveBeenCalledWith('custom-tag');
  });
});

describe('addListener', () => {
  it('subscribes the default tag when called with a bare listener', () => {
    const listener = vi.fn();
    addListener(listener);

    expect(FAKE_NATIVE_KEEP_AWAKE.addListenerForTag).toHaveBeenCalledWith(
      ExpoKeepAwakeTag,
      listener,
    );
  });

  it('subscribes an explicit tag when given tag + listener', () => {
    const listener = vi.fn();
    addListener('custom-tag', listener);

    expect(FAKE_NATIVE_KEEP_AWAKE.addListenerForTag).toHaveBeenCalledWith('custom-tag', listener);
  });

  it('throws an UnavailabilityError-shaped error when addListenerForTag is absent', () => {
    const { addListenerForTag: native } = FAKE_NATIVE_KEEP_AWAKE;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_KEEP_AWAKE.addListenerForTag = undefined;

    expect(() => addListener(vi.fn())).toThrow(
      'addListenerForTag is not available on ExpoKeepAwake',
    );

    FAKE_NATIVE_KEEP_AWAKE.addListenerForTag = native;
  });

  it('throws when no listener can be resolved', () => {
    expect(() => addListener('custom-tag')).toThrow('addListener requires a listener function');
  });
});
