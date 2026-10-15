import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle, workletOf } from '../../test-support/worklet';
import { createFrameCallback } from './frame-callback';

const detaches: Array<() => void> = [];

beforeEach(() => vi.useFakeTimers());
// The UI registry is shared, so a loop left running would outlive the fake clock of its test
afterEach(async () => {
  for (const detach of detaches.splice(0)) detach();
  await settle();
  vi.useRealTimers();
});

function counting() {
  const frames: number[] = [];
  const callback = workletOf((info: { timeSinceFirstFrame: number }) => {
    frames.push(info.timeSinceFirstFrame);
  }, []);
  return { frames, callback };
}

function attached(
  frame: ReturnType<typeof createFrameCallback>,
  callback: Parameters<typeof frame.attach>[0],
) {
  const detach = frame.attach(callback);
  detaches.push(detach);
  return detach;
}

describe('a frame callback made by the controller', () => {
  it('runs on every frame once attached, when it autostarts', async () => {
    const { frames, callback } = counting();
    const frame = createFrameCallback();

    attached(frame, callback);
    await settle();

    expect(frames.length).toBeGreaterThan(1);
    expect(frame.callback.isActive).toBe(true);
  });

  it('does not run until it is made active, when it does not autostart', async () => {
    const { frames, callback } = counting();
    const frame = createFrameCallback(false);
    attached(frame, callback);
    await settle();
    expect(frames).toHaveLength(0);

    frame.callback.setActive(true);
    await settle();

    expect(frames.length).toBeGreaterThan(0);
  });

  it('stops running once it is made inactive', async () => {
    const { frames, callback } = counting();
    const frame = createFrameCallback();
    attached(frame, callback);
    await settle();

    frame.callback.setActive(false);
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(frame.callback.isActive).toBe(false);
  });

  it('stops running and loses its id when it is detached', async () => {
    const { frames, callback } = counting();
    const frame = createFrameCallback();
    const detach = attached(frame, callback);
    await settle();
    expect(frame.callback.callbackId).toBeGreaterThanOrEqual(0);

    detach();
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(frame.callback.callbackId).toBe(-1);
  });

  it('keeps being inactive when it is attached again after being stopped', async () => {
    const { frames, callback } = counting();
    const frame = createFrameCallback();
    frame.callback.setActive(false);

    attached(frame, callback);
    await settle();

    expect(frames).toHaveLength(0);
  });
});
