import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const EVENT_NAME = 'TaskManager.executeTask';

// A tiny fake EventEmitter: addListener captures the callback so a test can fire it directly,
// mirroring how native would invoke the wired listener.
function createFakeNativeTaskManager() {
  let listener: ((event: unknown) => void) | undefined;
  return {
    EVENT_NAME,
    addListener: vi.fn((eventName: string, cb: (event: unknown) => void) => {
      if (eventName === EVENT_NAME) listener = cb;
      return { remove: vi.fn() };
    }),
    isAvailableAsync: vi.fn(async () => true),
    isTaskRegisteredAsync: vi.fn(async () => true),
    getTaskOptionsAsync: vi.fn(async () => ({ interval: 60_000 })),
    getRegisteredTasksAsync: vi.fn(async () => [
      { taskName: 'sync', taskType: 'location', options: {} },
    ]),
    unregisterTaskAsync: vi.fn(async () => undefined),
    unregisterAllTasksAsync: vi.fn(async () => undefined),
    notifyTaskFinishedAsync: vi.fn(async () => undefined),
    // Test-only escape hatch to simulate native firing the task-execute event.
    fireTaskEvent(event: unknown) {
      listener?.(event);
    },
  };
}

const FAKE_NATIVE_TASK_MANAGER = createFakeNativeTaskManager();

// The real ExpoTaskManager native module only exists on device — resolving it via
// requireNativeModule() at import time would throw in this headless test run, same pattern
// packages/local-auth/src/core/local-authentication.test.ts and
// packages/sensors/src/core/device-sensor.test.ts use.
vi.mock('./native-module', () => ({
  expoTaskManager: FAKE_NATIVE_TASK_MANAGER,
}));

// expo-modules-core's real entry transitively imports 'react-native' for Platform/
// TurboModuleRegistry, whose Flow-typed source Vitest's Oxc transform can't parse.
vi.mock('expo-modules-core', () => ({
  UnavailabilityError: class UnavailabilityError extends Error {
    constructor(moduleName: string, propertyName: string) {
      super(`${propertyName} is not available on ${moduleName}`);
    }
  },
}));

const {
  defineTask,
  isTaskDefined,
  isTaskRegisteredAsync,
  getTaskOptionsAsync,
  getRegisteredTasksAsync,
  unregisterTaskAsync,
  unregisterAllTasksAsync,
  isAvailableAsync,
} = await import('./task-manager');

function executionInfo(taskName: string, eventId = 'evt-1') {
  return { eventId, taskName };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defineTask / isTaskDefined', () => {
  it('registers a task executor that isTaskDefined can see', () => {
    defineTask('probe-task', async () => undefined);
    expect(isTaskDefined('probe-task')).toBe(true);
  });

  it('warns and does not register when taskName is empty', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    defineTask('', async () => undefined);
    expect(isTaskDefined('')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "TaskManager.defineTask: 'taskName' argument must be a non-empty string.",
    );
  });

  it('warns and does not register when taskExecutor is not a function', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // @ts-expect-error -- exercising the runtime guard for a caller bug
    defineTask('bad-executor', 'not-a-function');
    expect(isTaskDefined('bad-executor')).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      "TaskManager.defineTask: 'task' argument must be a function.",
    );
  });
});

describe('native event dispatch — the reason this module wires a listener at load time', () => {
  it('runs the matching defined task and acks native with notifyTaskFinishedAsync', async () => {
    const executor = vi.fn(async () => undefined);
    defineTask('sync-task', executor);

    FAKE_NATIVE_TASK_MANAGER.fireTaskEvent({
      data: { foo: 'bar' },
      error: null,
      executionInfo: executionInfo('sync-task'),
    });
    // the executor's own promise chain (await + .finally) needs a microtask to settle
    await Promise.resolve();
    await Promise.resolve();

    expect(executor).toHaveBeenCalledWith({
      data: { foo: 'bar' },
      error: null,
      executionInfo: executionInfo('sync-task'),
    });
    expect(
      FAKE_NATIVE_TASK_MANAGER.notifyTaskFinishedAsync,
    ).toHaveBeenCalledWith('sync-task', { eventId: 'evt-1', result: null });
  });

  it('acks and unregisters when the event names a task nobody defined', async () => {
    FAKE_NATIVE_TASK_MANAGER.fireTaskEvent({
      data: null,
      error: null,
      executionInfo: executionInfo('ghost-task', 'evt-2'),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(
      FAKE_NATIVE_TASK_MANAGER.notifyTaskFinishedAsync,
    ).toHaveBeenCalledWith('ghost-task', { eventId: 'evt-2', result: null });
    expect(FAKE_NATIVE_TASK_MANAGER.unregisterTaskAsync).toHaveBeenCalledWith(
      'ghost-task',
    );
  });

  it('acks native even when the task executor throws, so the OS wakelock is released', async () => {
    defineTask('throwing-task', async () => {
      throw new Error('boom');
    });
    const errorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    FAKE_NATIVE_TASK_MANAGER.fireTaskEvent({
      data: null,
      error: null,
      executionInfo: executionInfo('throwing-task', 'evt-3'),
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(
      FAKE_NATIVE_TASK_MANAGER.notifyTaskFinishedAsync,
    ).toHaveBeenCalledWith('throwing-task', { eventId: 'evt-3', result: null });
    expect(errorSpy).toHaveBeenCalledWith(
      'TaskManager: Task "throwing-task" failed:',
      expect.any(Error),
    );
  });
});

describe('positive — native methods present', () => {
  it('isTaskRegisteredAsync delegates to native', async () => {
    await expect(isTaskRegisteredAsync('sync-task')).resolves.toBe(true);
    expect(FAKE_NATIVE_TASK_MANAGER.isTaskRegisteredAsync).toHaveBeenCalledWith(
      'sync-task',
    );
  });

  it('getTaskOptionsAsync delegates to native', async () => {
    await expect(getTaskOptionsAsync('sync-task')).resolves.toEqual({
      interval: 60_000,
    });
  });

  it('getRegisteredTasksAsync delegates to native', async () => {
    await expect(getRegisteredTasksAsync()).resolves.toEqual([
      { taskName: 'sync', taskType: 'location', options: {} },
    ]);
  });

  it('unregisterTaskAsync delegates to native', async () => {
    await unregisterTaskAsync('sync-task');
    expect(FAKE_NATIVE_TASK_MANAGER.unregisterTaskAsync).toHaveBeenCalledWith(
      'sync-task',
    );
  });

  it('unregisterAllTasksAsync delegates to native', async () => {
    await unregisterAllTasksAsync();
    expect(
      FAKE_NATIVE_TASK_MANAGER.unregisterAllTasksAsync,
    ).toHaveBeenCalledTimes(1);
  });

  it('isAvailableAsync delegates to native', async () => {
    await expect(isAvailableAsync()).resolves.toBe(true);
  });
});

describe('negative — taskName validation', () => {
  it('isTaskRegisteredAsync rejects an empty taskName without calling through', async () => {
    await expect(isTaskRegisteredAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(
      FAKE_NATIVE_TASK_MANAGER.isTaskRegisteredAsync,
    ).not.toHaveBeenCalled();
  });

  it('unregisterTaskAsync rejects an empty taskName without calling through', async () => {
    await expect(unregisterTaskAsync('')).rejects.toThrow(
      '`taskName` must be a non-empty string.',
    );
    expect(FAKE_NATIVE_TASK_MANAGER.unregisterTaskAsync).not.toHaveBeenCalled();
  });
});

describe('negative — native method missing on this platform', () => {
  it('isAvailableAsync resolves false rather than throwing when native lacks it', async () => {
    const original = FAKE_NATIVE_TASK_MANAGER.isAvailableAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_TASK_MANAGER.isAvailableAsync = undefined;

    await expect(isAvailableAsync()).resolves.toBe(false);

    FAKE_NATIVE_TASK_MANAGER.isAvailableAsync = original;
  });

  it('getRegisteredTasksAsync throws an UnavailabilityError-shaped error', async () => {
    const original = FAKE_NATIVE_TASK_MANAGER.getRegisteredTasksAsync;
    // @ts-expect-error -- simulating a platform where the native module has no such method
    FAKE_NATIVE_TASK_MANAGER.getRegisteredTasksAsync = undefined;

    await expect(getRegisteredTasksAsync()).rejects.toThrow(
      'getRegisteredTasksAsync is not available on expo-task-manager',
    );

    FAKE_NATIVE_TASK_MANAGER.getRegisteredTasksAsync = original;
  });
});
