// Co-located Solid test for createBatteryLevel. Mocks the whole `core` barrel (never
// expo-modules-core internals) — native delegation itself is proven once in
// packages/battery/src/core/battery.test.ts; what is exercised here is the reactive lifecycle:
// seed, subscribe, ordering between the two, and teardown.
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: a primitive
// needs an OWNER for `onCleanup`, not a host tree, and disposing by hand is what makes the
// teardown assertion possible at all.
//
// No Negative group: the primitive has no guard clause or throwing path.

import { createEffect, createRoot, type Accessor } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatteryLevel } from './create-battery-level';

type IListener = (event: { batteryLevel: number }) => void;

let registeredListener: IListener | undefined;
// Playing native: `remove()` really unregisters, so a teardown that never ran is observable as
// the accessor still moving after dispose — not merely as a spy that went uncalled.
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryLevelAsyncMock = vi.fn(async () => 0.42);

vi.mock('../../core', () => ({
  addBatteryLevelListener: (listener: IListener) => addListenerMock(listener),
  getBatteryLevelAsync: () => getBatteryLevelAsyncMock(),
}));

// `createEffect` is a USER effect: Solid defers it to the end of the enclosing `runUpdates`, so
// one created inside `createRoot`'s callback has not run when that callback returns. Build inside
// the root, assert outside it — the same ordering a component gets.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

// Drains the microtask queue so a settled seed promise has reached the signal.
async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryLevelAsyncMock.mockClear();
  getBatteryLevelAsyncMock.mockResolvedValue(0.42);
});

describe('createBatteryLevel (Solid)', () => {
  it('starts at -1 before the initial fetch resolves', () => {
    // why: -1 is the documented "unknown yet" sentinel — the accessor must hold it synchronously
    // at call time, before the async fetch has any chance to settle.
    const { value: batteryLevel, dispose } = inRoot(createBatteryLevel);

    expect(batteryLevel()).toBe(-1);

    dispose();
  });

  it('updates to the fetched value once getBatteryLevelAsync() resolves', async () => {
    // why: the primitive seeds with a one-shot fetch in addition to subscribing — proves that
    // seed actually reaches the signal, not just the listener path below.
    const { value: batteryLevel, dispose } = inRoot(createBatteryLevel);

    await vi.waitFor(() => expect(batteryLevel()).toBe(0.42));

    dispose();
  });

  it('updates the accessor when the native listener fires', async () => {
    // why: after the seed, live updates must come from the native event, not another fetch. The
    // accessor is also read from a TRACKED scope: a value that only moved when polled would not
    // re-run a consumer's effect, which is the whole reason this returns an accessor.
    const seen: number[] = [];
    const { value: batteryLevel, dispose } = inRoot<Accessor<number>>(() => {
      const level = createBatteryLevel();
      createEffect(() => {
        seen.push(level());
      });
      return level;
    });
    await vi.waitFor(() => expect(batteryLevel()).toBe(0.42));

    registeredListener?.({ batteryLevel: 0.1 });

    expect(batteryLevel()).toBe(0.1);
    expect(seen).toEqual([-1, 0.42, 0.1]);

    dispose();
  });

  it('keeps a native reading that arrived before the seed resolved', async () => {
    // why: the listener is registered synchronously but the seed is a promise, so a native event
    // can land first — and the seed is then OLDER than what the accessor already holds. React's
    // and Vue's versions overwrite in that case; this one must not.
    let resolveSeed: ((level: number) => void) | undefined;
    getBatteryLevelAsyncMock.mockImplementation(
      () =>
        new Promise<number>(resolve => {
          resolveSeed = resolve;
        }),
    );
    const { value: batteryLevel, dispose } = inRoot(createBatteryLevel);

    registeredListener?.({ batteryLevel: 0.1 });
    resolveSeed?.(0.9);
    await flushPromises();

    expect(batteryLevel()).toBe(0.1);

    dispose();
  });

  it('unsubscribes on dispose', async () => {
    // why: a listener that outlives its owner writes into a disposed scope forever. Asserting the
    // accessor stops moving catches a subscription object that ignores `remove()`; asserting the
    // call catches a teardown that never runs at all.
    const { value: batteryLevel, dispose } = inRoot(createBatteryLevel);
    await vi.waitFor(() => expect(batteryLevel()).toBe(0.42));

    dispose();
    registeredListener?.({ batteryLevel: 0.1 });

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(batteryLevel()).toBe(0.42);
  });
});
