// Framework-agnostic twin of expo-modules-core's `useReleasingSharedObject`, ported so every
// adapter's `useImageManipulator` shares one recreate/release rule instead of five

import { describe, expect, it, vi } from 'vitest';
import { createManipulatorContextController } from './manipulator-context-controller';

function createFakeContext(): { release: ReturnType<typeof vi.fn> } {
  return { release: vi.fn() };
}

describe('createManipulatorContextController (Positive: recreates on source change, releases the stale one)', () => {
  it('creates a context for the first resolve() call', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const context = controller.resolve('uri-1');

    expect(manipulate).toHaveBeenCalledWith('uri-1');
    expect(context).toBe(manipulate.mock.results[0]?.value);
  });

  it('returns the same context on a repeated resolve() with an unchanged source', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const first = controller.resolve('uri-1');
    const second = controller.resolve('uri-1');

    expect(second).toBe(first);
    expect(manipulate).toHaveBeenCalledTimes(1);
  });

  it('creates a new context when the source changes, without releasing the old one yet', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const first = controller.resolve('uri-1');
    const second = controller.resolve('uri-2');

    expect(second).not.toBe(first);
    expect(first.release).not.toHaveBeenCalled();
  });

  it('releases the stale context only once flushRelease() runs', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const first = controller.resolve('uri-1');
    controller.resolve('uri-2');
    controller.flushRelease();

    expect(first.release).toHaveBeenCalledTimes(1);
  });

  it('release() releases the current context and clears it', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const current = controller.resolve('uri-1');
    controller.release();

    expect(current.release).toHaveBeenCalledTimes(1);
  });

  it('release() also flushes a still-pending stale context', () => {
    const manipulate = vi.fn(createFakeContext);
    const controller = createManipulatorContextController(manipulate);

    const stale = controller.resolve('uri-1');
    controller.resolve('uri-2');
    controller.release();

    expect(stale.release).toHaveBeenCalledTimes(1);
  });
});
