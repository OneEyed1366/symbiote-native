// Co-located unit test for the Vibration module: JS->native only. The platform builds
// are separate files (vibration/index.ios.ts / vibration/index.android.ts), imported
// DIRECTLY. A fake __turboModuleProxy returns a Vibration module that records
// vibrate / vibrateByPattern / cancel. Every method degrades to a no-op when the module is
// absent — never throws — so there is no Negative group; "no native module" is its own
// describe below instead.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVibration } from './shared';

let iosVibration: typeof import('./index.ios').Vibration;
let androidVibration: typeof import('./index.android').Vibration;

let vibrateArg: number | undefined;
let patternArg: number[] | undefined;
let patternRepeatArg: number | undefined;
let canceled: boolean;

beforeEach(async () => {
  vibrateArg = undefined;
  patternArg = undefined;
  patternRepeatArg = undefined;
  canceled = false;

  const fakeVibration = {
    vibrate: (pattern: number): void => {
      vibrateArg = pattern;
    },
    vibrateByPattern: (pattern: number[], repeat: number): void => {
      patternArg = pattern;
      patternRepeatArg = repeat;
    },
    cancel: (): void => {
      canceled = true;
    },
  };

  const registeredModules: Record<string, unknown> = { Vibration: fakeVibration };
  globalThis.__turboModuleProxy = <T>(name: string): T | null => {
    const module = registeredModules[name];
    return isPresent<T>(module) ? module : null;
  };

  vi.resetModules();
  ({ Vibration: iosVibration } = await import('./index.ios'));
  ({ Vibration: androidVibration } = await import('./index.android'));
});

afterEach(() => {
  globalThis.__turboModuleProxy = undefined;
  vi.useRealTimers();
});

function isPresent<T>(value: unknown): value is T {
  return value !== null && value !== undefined;
}

describe('Vibration (iOS build -> JS scheduler)', () => {
  it('a default (number) call dispatches to native vibrate(400)', () => {
    iosVibration.vibrate();
    expect(vibrateArg).toBe(400);
  });

  // why: iOS has no native pattern scheduler (per shared.ts's file header) — the array
  // branch must never reach vibrateByPattern, which only the Android build implements.
  it('an array buzzes the first segment via native vibrate, NOT vibrateByPattern', () => {
    iosVibration.vibrate([0, 100, 200]);
    expect(vibrateArg).toBe(400);
    expect(patternArg).toBeUndefined();
  });

  // why: a leading 0 in the pattern means "buzz immediately" (documented in vibratePattern's
  // own comment); any OTHER leading value is the initial WAIT before the first buzz, so
  // nothing should fire synchronously.
  it('a non-zero-leading pattern schedules the first buzz after its leading wait, not synchronously', () => {
    vi.useFakeTimers();
    iosVibration.vibrate([100, 200]);
    expect(vibrateArg).toBeUndefined();
    vi.advanceTimersByTime(100);
    expect(vibrateArg).toBe(400);
  });

  // why: `if (vibrating) return;` guards against a second vibrate() call re-entering the
  // scheduler mid-pattern — without it, two overlapping patterns would race and corrupt the
  // buzz/wait timing.
  it('a second array vibrate() call while one is already running is ignored', () => {
    vi.useFakeTimers();
    iosVibration.vibrate([0, 500]);
    expect(vibrateArg).toBe(400);
    vibrateArg = undefined;

    iosVibration.vibrate([0, 999]);
    expect(vibrateArg).toBeUndefined(); // the second call's immediate buzz never ran
  });

  it('cancel() reaches native cancel()', () => {
    iosVibration.cancel();
    expect(canceled).toBe(true);
  });

  // why: cancel's stopPattern hook resets the scheduler's `vibrating` flag — without it, a
  // canceled pattern would permanently block every future vibrate() call via the
  // already-vibrating reentrancy guard.
  it('cancel() clears the scheduler so a new pattern can start immediately', () => {
    vi.useFakeTimers();
    iosVibration.vibrate([0, 500]);
    iosVibration.cancel();
    vibrateArg = undefined;

    iosVibration.vibrate([0, 200]);
    expect(vibrateArg).toBe(400);
  });
});

describe('Vibration (Android build -> native vibrateByPattern)', () => {
  // why: Android's own number-path is inherited unchanged from the shared core (only the
  // ARRAY strategy diverges by platform) — a single-number call must hit native `vibrate`
  // directly, never `vibrateByPattern`.
  it('a default (number) call dispatches to native vibrate, not vibrateByPattern', () => {
    androidVibration.vibrate(200);
    expect(vibrateArg).toBe(200);
    expect(patternArg).toBeUndefined();
  });

  it('an array without repeat calls vibrateByPattern(pattern, -1)', () => {
    androidVibration.vibrate([0, 100, 200]);
    expect(patternArg).toEqual([0, 100, 200]);
    expect(patternRepeatArg).toBe(-1);
  });

  it('an array with repeat=true passes repeat 0', () => {
    androidVibration.vibrate([0, 100, 200], true);
    expect(patternRepeatArg).toBe(0);
  });

  it('cancel() reaches native cancel()', () => {
    androidVibration.cancel();
    expect(canceled).toBe(true);
  });
});

describe('Vibration (no native module)', () => {
  it('is a silent no-op and never runs the pattern strategy', () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    const nullProxyVibration = createVibration({
      vibratePattern: () => {
        throw new Error('vibratePattern must not run when the native module is absent');
      },
    });
    expect(() => {
      nullProxyVibration.vibrate(50);
      nullProxyVibration.vibrate([0, 100]);
      nullProxyVibration.cancel();
    }).not.toThrow();
  });

  // why: cancel's platform hook is OPTIONAL (Android's platform config has no stopPattern) —
  // `platform.stopPattern?.()` must tolerate its absence rather than throw.
  it('cancel() without a platform stopPattern hook does not throw', () => {
    globalThis.__turboModuleProxy = <T>(_name: string): T | null => null;
    const noHookVibration = createVibration({ vibratePattern: () => undefined });
    expect(() => noHookVibration.cancel()).not.toThrow();
  });
});
