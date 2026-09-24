import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createFakeNativeBackgroundFetch() {
  return {
    getStatusAsync: vi.fn(async () => 3),
    setMinimumIntervalAsync: vi.fn(async () => undefined),
    registerTaskAsync: vi.fn(async () => undefined),
    unregisterTaskAsync: vi.fn(async () => undefined),
  };
}

const FAKE_NATIVE_BACKGROUND_FETCH = createFakeNativeBackgroundFetch();

// The real ExpoBackgroundFetch native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/task-manager/src/core/task-manager.test.ts uses.
vi.mock('./native-module', () => ({
  expoBackgroundFetch: FAKE_NATIVE_BACKGROUND_FETCH,
}));

const isTaskDefinedMock = vi.fn(() => true);
vi.mock('@symbiote-native/task-manager', () => ({
  isTaskDefined: isTaskDefinedMock,
}));

let platformOS = 'ios';
// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse.
vi.mock('expo-modules-core', () => ({
  get Platform() {
    return { OS: platformOS };
  },
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  getStatusAsync,
  setMinimumIntervalAsync,
  registerTaskAsync,
  unregisterTaskAsync,
} = await import('./background-fetch');
const { BackgroundFetchStatus } = await import('./types');

beforeEach(() => {
  vi.clearAllMocks();
  isTaskDefinedMock.mockReturnValue(true);
  platformOS = 'ios';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getStatusAsync', () => {
  it('shortcuts to Available on android without calling native', async () => {
    platformOS = 'android';
    await expect(getStatusAsync()).resolves.toBe(
      BackgroundFetchStatus.Available,
    );
    expect(FAKE_NATIVE_BACKGROUND_FETCH.getStatusAsync).not.toHaveBeenCalled();
  });

  it('delegates to native on ios', async () => {
    platformOS = 'ios';
    await expect(getStatusAsync()).resolves.toBe(3);
    expect(FAKE_NATIVE_BACKGROUND_FETCH.getStatusAsync).toHaveBeenCalledTimes(
      1,
    );
  });
});

describe('setMinimumIntervalAsync', () => {
  it('delegates to native', async () => {
    await setMinimumIntervalAsync(900);
    expect(
      FAKE_NATIVE_BACKGROUND_FETCH.setMinimumIntervalAsync,
    ).toHaveBeenCalledWith(900);
  });

  it('no-ops when native lacks the method (android)', async () => {
    const original = FAKE_NATIVE_BACKGROUND_FETCH.setMinimumIntervalAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BACKGROUND_FETCH.setMinimumIntervalAsync = undefined;

    await expect(setMinimumIntervalAsync(900)).resolves.toBeUndefined();

    FAKE_NATIVE_BACKGROUND_FETCH.setMinimumIntervalAsync = original;
  });
});

describe('registerTaskAsync — round trip', () => {
  it('registers a defined task with native', async () => {
    await registerTaskAsync('sync', { minimumInterval: 900 });
    expect(FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync).toHaveBeenCalledWith(
      'sync',
      { minimumInterval: 900 },
    );
  });

  it('defaults options to an empty object', async () => {
    await registerTaskAsync('sync');
    expect(FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync).toHaveBeenCalledWith(
      'sync',
      {},
    );
  });
});

describe('negative — registration preconditions', () => {
  it('rejects when the task was never defined via task-manager', async () => {
    isTaskDefinedMock.mockReturnValue(false);

    await expect(registerTaskAsync('ghost')).rejects.toThrow(
      "Task 'ghost' is not defined. You must define a task using defineTask (from @symbiote-native/task-manager) before registering.",
    );
    expect(
      FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty taskName without calling through', async () => {
    await expect(registerTaskAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('throws UnavailabilityError when native lacks registerTaskAsync', async () => {
    const original = FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync = undefined;

    await expect(registerTaskAsync('sync')).rejects.toThrow(
      'registerTaskAsync is not available on BackgroundFetch',
    );

    FAKE_NATIVE_BACKGROUND_FETCH.registerTaskAsync = original;
  });
});

describe('unregisterTaskAsync', () => {
  it('delegates to native', async () => {
    await unregisterTaskAsync('sync');
    expect(
      FAKE_NATIVE_BACKGROUND_FETCH.unregisterTaskAsync,
    ).toHaveBeenCalledWith('sync');
  });

  it('rejects an empty taskName without calling through', async () => {
    await expect(unregisterTaskAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_BACKGROUND_FETCH.unregisterTaskAsync,
    ).not.toHaveBeenCalled();
  });
});
