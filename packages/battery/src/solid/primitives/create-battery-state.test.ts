// Co-located Solid test for createBatteryState. See create-battery-level's test for the shared
// rationale (core mocked wholesale, `createRoot` + explicit dispose, why `remove()` really
// unregisters here).
//
// No Negative group: the primitive has no guard clause or throwing path.

import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBatteryState } from './create-battery-state';

const CHARGING = 2;
const FULL = 3;

type IListener = (event: { batteryState: number }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const getBatteryStateAsyncMock = vi.fn(async () => CHARGING);

vi.mock('../../core', () => ({
  addBatteryStateListener: (listener: IListener) => addListenerMock(listener),
  getBatteryStateAsync: () => getBatteryStateAsyncMock(),
  BatteryState: {
    UNKNOWN: 0,
    UNPLUGGED: 1,
    CHARGING: 2,
    FULL: 3,
    NOT_CHARGING: 4,
  },
}));

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

async function flushPromises(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  registeredListener = undefined;
  addListenerMock.mockClear();
  removeMock.mockClear();
  getBatteryStateAsyncMock.mockClear();
  getBatteryStateAsyncMock.mockResolvedValue(CHARGING);
});

describe('createBatteryState (Solid)', () => {
  it('starts at UNKNOWN before the initial fetch resolves', () => {
    // why: UNKNOWN is the documented "no reading yet" sentinel — must hold synchronously at call
    // time, before the async fetch settles.
    const { value: batteryState, dispose } = inRoot(createBatteryState);

    expect(batteryState()).toBe(0);

    dispose();
  });

  it('updates to the fetched value once getBatteryStateAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches the signal.
    const { value: batteryState, dispose } = inRoot(createBatteryState);

    await vi.waitFor(() => expect(batteryState()).toBe(CHARGING));

    dispose();
  });

  it('updates the accessor when the native listener fires', async () => {
    // why: charging state changes while the app runs must come from the native event, not another
    // fetch — proves the synchronously registered listener writes the signal.
    const { value: batteryState, dispose } = inRoot(createBatteryState);
    await vi.waitFor(() => expect(batteryState()).toBe(CHARGING));

    registeredListener?.({ batteryState: FULL });

    expect(batteryState()).toBe(FULL);

    dispose();
  });

  it('keeps a native reading that arrived before the seed resolved', async () => {
    // why: the listener is synchronous, the seed is a promise — an event landing first makes the
    // seed the OLDER value, and it must not win. See create-battery-level.ts's header.
    let resolveSeed: ((state: number) => void) | undefined;
    getBatteryStateAsyncMock.mockImplementation(
      () =>
        new Promise<number>(resolve => {
          resolveSeed = resolve;
        }),
    );
    const { value: batteryState, dispose } = inRoot(createBatteryState);

    registeredListener?.({ batteryState: FULL });
    resolveSeed?.(CHARGING);
    await flushPromises();

    expect(batteryState()).toBe(FULL);

    dispose();
  });

  it('unsubscribes on dispose', async () => {
    // why: a listener that outlives its owner writes into a disposed scope forever.
    const { value: batteryState, dispose } = inRoot(createBatteryState);
    await vi.waitFor(() => expect(batteryState()).toBe(CHARGING));

    dispose();
    registeredListener?.({ batteryState: FULL });

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(batteryState()).toBe(CHARGING);
  });
});
