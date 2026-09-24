import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function createFakeNativeBackgroundTask() {
  return {
    getStatusAsync: vi.fn(async () => 2),
    registerTaskAsync: vi.fn(async () => undefined),
    unregisterTaskAsync: vi.fn(async () => undefined),
    triggerTaskWorkerForTestingAsync: vi.fn(async () => true),
    addListener: vi.fn((eventName: string, listener: () => void) => {
      lastAddListener = { eventName, listener };
      return { remove: vi.fn() };
    }),
  };
}

let lastAddListener: { eventName: string; listener: () => void } | undefined;

const FAKE_NATIVE_BACKGROUND_TASK = createFakeNativeBackgroundTask();

// The real ExpoBackgroundTask native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/task-manager/src/core/task-manager.test.ts uses.
vi.mock('./native-module', () => ({
  expoBackgroundTask: FAKE_NATIVE_BACKGROUND_TASK,
}));

const isTaskDefinedMock = vi.fn(() => true);
const isTaskRegisteredAsyncMock = vi.fn(async () => false);
vi.mock('@symbiote-native/task-manager', () => ({
  isTaskDefined: isTaskDefinedMock,
  isTaskRegisteredAsync: isTaskRegisteredAsyncMock,
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
  registerTaskAsync,
  unregisterTaskAsync,
  triggerTaskWorkerForTestingAsync,
  addExpirationListener,
} = await import('./background-task');
const { BackgroundTaskStatus } = await import('./types');

function setDevBuild(value: boolean | undefined) {
  (globalThis as Record<string, unknown>).__DEV__ = value;
}

beforeEach(() => {
  vi.clearAllMocks();
  isTaskDefinedMock.mockReturnValue(true);
  isTaskRegisteredAsyncMock.mockResolvedValue(false);
  FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync.mockResolvedValue(2);
  platformOS = 'ios';
  lastAddListener = undefined;
  setDevBuild(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  setDevBuild(undefined);
});

describe('getStatusAsync', () => {
  it('delegates to native', async () => {
    await expect(getStatusAsync()).resolves.toBe(2);
    expect(FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync).toHaveBeenCalledTimes(1);
  });

  it('throws UnavailabilityError when native lacks the method', async () => {
    const original = FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync = undefined;

    await expect(getStatusAsync()).rejects.toThrow(
      'getStatusAsync is not available on BackgroundTask',
    );

    FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync = original;
  });
});

describe('registerTaskAsync — round trip', () => {
  it('registers a defined, unregistered task with native', async () => {
    await registerTaskAsync('sync', { minimumInterval: 30 });
    expect(FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync).toHaveBeenCalledWith(
      'sync',
      { minimumInterval: 30 },
    );
  });

  it('defaults options to an empty object', async () => {
    await registerTaskAsync('sync');
    expect(FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync).toHaveBeenCalledWith(
      'sync',
      {},
    );
  });

  it('is a no-op when the task is already registered', async () => {
    isTaskRegisteredAsyncMock.mockResolvedValue(true);

    await registerTaskAsync('sync');

    expect(
      FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('skips registration and warns once when the environment is restricted (iOS Simulator)', async () => {
    FAKE_NATIVE_BACKGROUND_TASK.getStatusAsync.mockResolvedValue(
      BackgroundTaskStatus.Restricted,
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await registerTaskAsync('sync');
    await registerTaskAsync('sync-again');

    expect(
      FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync,
    ).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Background tasks are not supported on iOS simulators. Skipped registering task: sync.',
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
      FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty taskName without calling through', async () => {
    await expect(registerTaskAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('throws UnavailabilityError when native lacks registerTaskAsync', async () => {
    const original = FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync = undefined;

    await expect(registerTaskAsync('sync')).rejects.toThrow(
      'registerTaskAsync is not available on BackgroundTask',
    );

    FAKE_NATIVE_BACKGROUND_TASK.registerTaskAsync = original;
  });
});

describe('unregisterTaskAsync', () => {
  it('delegates to native when the task is registered', async () => {
    isTaskRegisteredAsyncMock.mockResolvedValue(true);

    await unregisterTaskAsync('sync');

    expect(
      FAKE_NATIVE_BACKGROUND_TASK.unregisterTaskAsync,
    ).toHaveBeenCalledWith('sync');
  });

  it('is a no-op when the task is not registered', async () => {
    isTaskRegisteredAsyncMock.mockResolvedValue(false);

    await unregisterTaskAsync('sync');

    expect(
      FAKE_NATIVE_BACKGROUND_TASK.unregisterTaskAsync,
    ).not.toHaveBeenCalled();
  });

  it('rejects an empty taskName without calling through', async () => {
    await expect(unregisterTaskAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_BACKGROUND_TASK.unregisterTaskAsync,
    ).not.toHaveBeenCalled();
  });
});

describe('triggerTaskWorkerForTestingAsync', () => {
  it('resolves false without calling native outside a dev build', async () => {
    setDevBuild(false);
    await expect(triggerTaskWorkerForTestingAsync()).resolves.toBe(false);
    expect(
      FAKE_NATIVE_BACKGROUND_TASK.triggerTaskWorkerForTestingAsync,
    ).not.toHaveBeenCalled();
  });

  it('delegates to native in a dev build', async () => {
    setDevBuild(true);
    await expect(triggerTaskWorkerForTestingAsync()).resolves.toBe(true);
    expect(
      FAKE_NATIVE_BACKGROUND_TASK.triggerTaskWorkerForTestingAsync,
    ).toHaveBeenCalledTimes(1);
  });
});

describe('addExpirationListener', () => {
  it('subscribes to the onTasksExpired native event', () => {
    const listener = vi.fn();
    const subscription = addExpirationListener(listener);

    expect(lastAddListener?.eventName).toBe('onTasksExpired');
    lastAddListener?.listener();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(typeof subscription.remove).toBe('function');
  });

  it('throws UnavailabilityError when native lacks addListener', () => {
    const original = FAKE_NATIVE_BACKGROUND_TASK.addListener;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_BACKGROUND_TASK.addListener = undefined;

    expect(() => addExpirationListener(() => undefined)).toThrow(
      'addListener is not available on BackgroundTask',
    );

    FAKE_NATIVE_BACKGROUND_TASK.addListener = original;
  });
});
