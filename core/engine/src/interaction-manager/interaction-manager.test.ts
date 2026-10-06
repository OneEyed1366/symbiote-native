// InteractionManager RN 0.86 - заглушка: задача на `setImmediate`, дескрипторы ничего не блокируют

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionManager } from '@symbiote-native/engine';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('InteractionManager.runAfterInteractions', () => {
  it('runs a plain function on the next immediate and resolves', async () => {
    const task = vi.fn();
    const handle = InteractionManager.runAfterInteractions(task);
    expect(task).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
    await expect(handle.then(() => 'done')).resolves.toBe('done');
  });

  it('runs an object task through run()', async () => {
    const run = vi.fn();
    InteractionManager.runAfterInteractions({ name: 't', run });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('awaits an object task through gen()', async () => {
    const gen = vi.fn(() => Promise.resolve());
    const handle = InteractionManager.runAfterInteractions({ name: 't', gen });
    await vi.advanceTimersByTimeAsync(0);
    expect(gen).toHaveBeenCalledTimes(1);
    await expect(handle.then(() => 'done')).resolves.toBe('done');
  });

  it('cancel() prevents the task from running', async () => {
    const task = vi.fn();
    InteractionManager.runAfterInteractions(task).cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
  });

  it('does not wait for a handle that was never cleared', async () => {
    InteractionManager.createInteractionHandle();
    const task = vi.fn();
    InteractionManager.runAfterInteractions(task);
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);
  });

  // RN: ошибка задачи не отклоняет промис, а бросается из таймера
  it.each([
    [
      'a plain function that throws',
      () => {
        throw new Error('boom');
      },
      'boom',
    ],
    [
      'a run() that throws',
      {
        name: 'n',
        run: () => {
          throw new Error('boom');
        },
      },
      'boom',
    ],
    [
      'a task object without gen or run',
      { name: 'broken' },
      'Task "broken" missing gen or run.',
    ],
    ['an invalid task', 42, 'Invalid task of type: number'],
  ])('throws asynchronously for %s', async (_label, task, message) => {
    Reflect.apply(InteractionManager.runAfterInteractions, InteractionManager, [
      task,
    ]);
    await expect(vi.advanceTimersByTimeAsync(1)).rejects.toThrow(message);
  });
});

describe('InteractionManager handles and events', () => {
  it('hands out the stub handle', () => {
    expect(InteractionManager.createInteractionHandle()).toBe(-1);
  });

  it('clearInteractionHandle accepts the stub handle and rejects a falsy one', () => {
    expect(() => InteractionManager.clearInteractionHandle(-1)).not.toThrow();
    expect(() => InteractionManager.clearInteractionHandle(0)).toThrow(
      'InteractionManager: Must provide a handle to clear.',
    );
  });

  it('addListener returns a removable subscription and never fires', () => {
    const listener = vi.fn();
    const subscription = InteractionManager.addListener(
      InteractionManager.Events.interactionStart,
      listener,
    );
    InteractionManager.createInteractionHandle();
    subscription.remove();
    expect(listener).not.toHaveBeenCalled();
  });

  it('exposes the event names and a no-op deadline', () => {
    expect(InteractionManager.Events).toEqual({
      interactionStart: 'interactionStart',
      interactionComplete: 'interactionComplete',
    });
    expect(() => InteractionManager.setDeadline(100)).not.toThrow();
  });
});
