import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderComposable } from '../../../test-support/render-composable';
import { settle, workletOf } from '../../../test-support/worklet';
import { useFrameCallback } from './use-frame-callback';

installRecordingFabric();

const mounted: Array<() => void> = [];

beforeEach(() => vi.useFakeTimers());
// The UI registry is shared, so a loop left running would outlive the fake clock of its test
afterEach(async () => {
  for (const unmount of mounted.splice(0)) unmount();
  await settle();
  vi.useRealTimers();
});

function counting() {
  const frames: number[] = [];
  const callback = workletOf(
    (info: { timeSinceFirstFrame: number }) => {
      frames.push(info.timeSinceFirstFrame);
    },
    [frames],
    51,
  );
  return { frames, callback };
}

function rendered(autostart?: boolean) {
  const { frames, callback } = counting();
  const composable = renderComposable(() =>
    useFrameCallback(callback, autostart),
  );
  mounted.push(composable.unmount);
  return { frames, composable };
}

describe('useFrameCallback', () => {
  it('runs on every frame once mounted, when it autostarts', async () => {
    const { frames } = rendered();

    await settle();

    expect(frames.length).toBeGreaterThan(1);
  });

  it('does not run until it is made active, when it does not autostart', async () => {
    const { frames, composable } = rendered(false);
    await settle();
    expect(frames).toHaveLength(0);

    composable.result().setActive(true);
    await settle();

    expect(frames.length).toBeGreaterThan(0);
  });

  it('stops running once it is made inactive', async () => {
    const { frames, composable } = rendered();
    await settle();

    composable.result().setActive(false);
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(composable.result().isActive).toBe(false);
  });

  it('stops running, and loses its id, once the component is gone', async () => {
    const { frames, composable } = rendered();
    await settle();
    const frameCallback = composable.result();

    composable.unmount();
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(frameCallback.callbackId).toBe(-1);
  });

  it('refuses a callback that is not a worklet', () => {
    expect(() => useFrameCallback(() => undefined)).toThrow(
      /useFrameCallback needs a worklet/,
    );
  });
});
