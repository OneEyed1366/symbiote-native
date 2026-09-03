// Covers createTrailingThrottle (react-native.ts) in isolation — the send-frequency half of the
// real-device memory crash fix (serialize-tree.test.ts covers the payload-size half). Imported
// from `../react-native` at the package root rather than `src/`, since that file's own
// self-invoking setup (`void setupDevtoolsInspector()`) needs a real Rozenite bridge that isn't
// present here; its promise is left dangling and caught internally, harmless for this test.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTrailingThrottle } from '../react-native';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createTrailingThrottle', () => {
  it('calls fn immediately on the first invocation (leading edge)', () => {
    const fn = vi.fn();
    const throttled = createTrailingThrottle(fn, 250);

    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst within the interval into ONE trailing call, not one per invocation', () => {
    // why: this IS the fix — registerPostCommit can fire many times per second during a
    // scroll/animation/navigation transition, and each of those must not become its own
    // serialize-and-ship call.
    const fn = vi.fn();
    const throttled = createTrailingThrottle(fn, 250);

    throttled();
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1); // only the leading call so far

    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(2); // exactly one trailing call for the whole burst
  });

  it('does not schedule a trailing call when nothing happened during the interval', () => {
    const fn = vi.fn();
    const throttled = createTrailingThrottle(fn, 250);

    throttled();
    vi.advanceTimersByTime(250);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('a call after the interval fully elapsed fires immediately again (new leading edge)', () => {
    const fn = vi.fn();
    const throttled = createTrailingThrottle(fn, 250);

    throttled();
    vi.advanceTimersByTime(250);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
