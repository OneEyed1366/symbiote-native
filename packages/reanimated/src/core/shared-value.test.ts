import { describe, expect, it, vi } from 'vitest';
import { withTiming } from 'react-native-reanimated/src/animation';
import { createSharedValue } from './shared-value';

describe('a shared value made by the controller', () => {
  it('holds the initial value it was given', () => {
    const { shared } = createSharedValue(7);

    expect(shared.value).toBe(7);
  });

  it('calls a function initializer once and stores what it returned', () => {
    const initial = vi.fn(() => ({ count: 1 }));

    const { shared } = createSharedValue(initial);

    expect(initial).toHaveBeenCalledTimes(1);
    expect(shared.value).toEqual({ count: 1 });
  });

  it('keeps assigning plain values like a Reanimated shared value does', () => {
    const { shared } = createSharedValue(0);

    shared.value = 5;

    expect(shared.value).toBe(5);
  });

  it('stops a running animation when it is disposed', async () => {
    vi.useFakeTimers();
    try {
      const { shared, dispose } = createSharedValue(0);
      shared.value = withTiming(100, { duration: 1_000 });
      await vi.advanceTimersByTimeAsync(200);
      const reached = shared.value;

      dispose();
      await vi.advanceTimersByTimeAsync(2_000);

      expect(shared.value).toBe(reached);
    } finally {
      vi.useRealTimers();
    }
  });
});
