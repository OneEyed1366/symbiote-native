// Generic twin of expo-modules-core's `useReleasingSharedObject` recreate/dispose rule

import { describe, expect, it, vi } from 'vitest';
import { createResourceController } from './resource-controller';

describe('createResourceController (Positive: recreates on key change, defers disposal)', () => {
  it('creates once for a stable key', () => {
    const create = vi.fn((key: string) => ({ key }));
    const dispose = vi.fn();
    const controller = createResourceController(create, dispose);

    const first = controller.resolve('a');
    const second = controller.resolve('a');

    expect(first).toBe(second);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('creates a new resource and defers disposal of the stale one until flushDispose', () => {
    const create = vi.fn((key: string) => ({ key }));
    const dispose = vi.fn();
    const controller = createResourceController(create, dispose);

    const first = controller.resolve('a');
    const second = controller.resolve('b');

    expect(create).toHaveBeenCalledTimes(2);
    expect(dispose).not.toHaveBeenCalled();

    controller.flushDispose();

    expect(dispose).toHaveBeenCalledExactlyOnceWith(first);
    expect(second).not.toBe(first);
  });

  it('uses a custom isSameKey comparator instead of Object.is', () => {
    const create = vi.fn((key: { id: number }) => ({ key }));
    const dispose = vi.fn();
    const controller = createResourceController(
      create,
      dispose,
      (a, b) => a.id === b.id,
    );

    const first = controller.resolve({ id: 1 });
    const second = controller.resolve({ id: 1 });

    expect(first).toBe(second);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('dispose() flushes the pending resource and releases the current one', () => {
    const create = vi.fn((key: string) => ({ key }));
    const dispose = vi.fn();
    const controller = createResourceController(create, dispose);

    const first = controller.resolve('a');
    const second = controller.resolve('b');
    controller.dispose();

    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenNthCalledWith(1, first);
    expect(dispose).toHaveBeenNthCalledWith(2, second);
  });
});
