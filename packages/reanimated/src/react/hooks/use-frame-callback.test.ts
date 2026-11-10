import { installRecordingFabric } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '../../../test-support/render-hook';
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
  const hook = renderHook(
    () => useFrameCallback(callback, autostart),
    undefined,
  );
  mounted.push(hook.unmount);
  return { frames, hook };
}

describe('useFrameCallback', () => {
  it('runs on every frame once mounted, when it autostarts', async () => {
    const { frames } = rendered();

    await settle();

    expect(frames.length).toBeGreaterThan(1);
  });

  it('does not run until it is made active, when it does not autostart', async () => {
    const { frames, hook } = rendered(false);
    await settle();
    expect(frames).toHaveLength(0);

    hook.latest().setActive(true);
    await settle();

    expect(frames.length).toBeGreaterThan(0);
  });

  it('stops running once it is made inactive', async () => {
    const { frames, hook } = rendered();
    await settle();

    hook.latest().setActive(false);
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(hook.latest().isActive).toBe(false);
  });

  it('is the same frame callback object on every render', () => {
    const { hook } = rendered();
    const first = hook.latest();

    hook.rerender(undefined);

    expect(hook.latest()).toBe(first);
  });

  it('stops running, and loses its id, once the component is gone', async () => {
    const { frames, hook } = rendered();
    await settle();
    const frameCallback = hook.latest();

    hook.unmount();
    await settle();
    const seen = frames.length;
    await settle();

    expect(frames).toHaveLength(seen);
    expect(frameCallback.callbackId).toBe(-1);
  });

  it('refuses a callback that is not a worklet', () => {
    expect(() =>
      renderHook(() => useFrameCallback(() => undefined), undefined),
    ).toThrow(/useFrameCallback needs a worklet/);
  });
});
