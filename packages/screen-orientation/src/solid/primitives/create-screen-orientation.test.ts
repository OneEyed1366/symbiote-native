// Co-located Solid-driven test (ADR 0025) for createScreenOrientation, the Solid twin of
// react/hooks/use-screen-orientation, vue/composables/use-screen-orientation and
// svelte/runes/use-screen-orientation. Same coverage as the Vue file: seed, fetched value,
// listener-driven update, teardown.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: this primitive
// renders nothing, so a root is the whole owner it needs. This layer owns ONLY the Solid
// lifecycle — core's own validation and platform branches are covered by screen-orientation.test.ts
// and must not be re-asserted here.

import { createEffect, createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScreenOrientation } from './create-screen-orientation';

type IOrientationChangeEvent = {
  orientationLock: number;
  orientationInfo: { orientation: number };
};
type IListener = (event: IOrientationChangeEvent) => void;

let registeredListener: IListener | undefined;
// remove() clears the captured listener, exactly as the real subscription does — otherwise the
// "stops moving after dispose" assertion below could never fail.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getOrientationAsyncMock = vi.fn(async () => 1);
const getOrientationLockAsyncMock = vi.fn(async () => 0);

vi.mock('../../core', () => ({
  addOrientationChangeListener: (listener: IListener) =>
    addListenerMock(listener),
  getOrientationAsync: () => getOrientationAsyncMock(),
  getOrientationLockAsync: () => getOrientationLockAsyncMock(),
  Orientation: { UNKNOWN: 0, PORTRAIT_UP: 1 },
  OrientationLock: { UNKNOWN: 9, DEFAULT: 0 },
}));

// A user `createEffect` is deferred to the end of the enclosing `runUpdates`, so one created
// inside `createRoot`'s callback has not run when that callback returns — every test therefore
// builds inside the root and asserts outside it, the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getOrientationAsyncMock.mockClear();
  getOrientationLockAsyncMock.mockClear();
  getOrientationAsyncMock.mockResolvedValue(1);
  getOrientationLockAsyncMock.mockResolvedValue(0);
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createScreenOrientation (Solid)', () => {
  // why: a caller reads the accessor before the async initial fetch settles — it must expose a
  // real, documented UNKNOWN state rather than `undefined` during that window.
  it('starts at Orientation/OrientationLock UNKNOWN before the initial fetch resolves', () => {
    getOrientationAsyncMock.mockReturnValue(new Promise<number>(() => {}));
    const { value: screenOrientation, dispose } = inRoot(
      createScreenOrientation,
    );
    disposeRoot = dispose;

    expect(screenOrientation()).toEqual({
      orientation: 0,
      orientationLock: 9,
    });
  });

  // why: the primitive must actually apply the values core's one-shot getters resolve to, not
  // just call them.
  it('updates to the fetched value once getOrientationAsync()/getOrientationLockAsync() resolve', async () => {
    const { value: screenOrientation, dispose } = inRoot(
      createScreenOrientation,
    );
    disposeRoot = dispose;

    await vi.waitFor(() =>
      expect(screenOrientation()).toEqual({
        orientation: 1,
        orientationLock: 0,
      }),
    );
  });

  // why: staying in sync with device rotation after the initial read is the whole point of
  // subscribing. Reading the accessor from a TRACKED scope is what proves it is a real signal
  // and not a value that only moves when polled.
  it('updates the accessor when the native listener fires', async () => {
    const seen: number[] = [];
    const { value: screenOrientation, dispose } = inRoot(() => {
      const state = createScreenOrientation();
      createEffect(() => {
        seen.push(state().orientation);
      });
      return state;
    });
    disposeRoot = dispose;
    await vi.waitFor(() => expect(screenOrientation().orientation).toBe(1));

    registeredListener?.({
      orientationLock: 5,
      orientationInfo: { orientation: 3 },
    });

    expect(screenOrientation()).toEqual({ orientation: 3, orientationLock: 5 });
    expect(seen).toEqual([0, 1, 3]);
  });

  // why: a listener outliving its owner is a real leak — it keeps writing into a disposed scope.
  // Asserting `remove` was CALLED would pass on a subscription object that ignores it; asserting
  // the accessor stops moving cannot.
  it('removes the subscription on dispose', () => {
    const { value: screenOrientation, dispose } = inRoot(
      createScreenOrientation,
    );

    registeredListener?.({
      orientationLock: 5,
      orientationInfo: { orientation: 3 },
    });
    expect(screenOrientation().orientation).toBe(3);

    dispose();

    expect(removeMock).toHaveBeenCalledTimes(1);
    registeredListener?.({
      orientationLock: 0,
      orientationInfo: { orientation: 1 },
    });
    expect(screenOrientation().orientation).toBe(3);
  });
});
