// Co-located Solid test for createLowPowerMode. See create-battery-level's test for the shared
// rationale (core mocked wholesale, `createRoot` + explicit dispose, why `remove()` really
// unregisters here).
//
// No Negative group: the primitive has no guard clause or throwing path.

import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createLowPowerMode } from './create-low-power-mode';

type IListener = (event: { lowPowerMode: boolean }) => void;

let registeredListener: IListener | undefined;
const removeMock = vi.fn(() => {
  registeredListener = undefined;
});
const addListenerMock = vi.fn((listener: IListener) => {
  registeredListener = listener;
  return { remove: removeMock };
});
const isLowPowerModeEnabledAsyncMock = vi.fn(async () => true);

vi.mock('../../core', () => ({
  addLowPowerModeListener: (listener: IListener) => addListenerMock(listener),
  isLowPowerModeEnabledAsync: () => isLowPowerModeEnabledAsyncMock(),
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
  isLowPowerModeEnabledAsyncMock.mockClear();
  isLowPowerModeEnabledAsyncMock.mockResolvedValue(true);
});

describe('createLowPowerMode (Solid)', () => {
  it('starts at false before the initial fetch resolves', () => {
    // why: false is the documented "assume off until proven otherwise" sentinel — must hold
    // synchronously at call time, before the async fetch settles.
    const { value: lowPowerMode, dispose } = inRoot(createLowPowerMode);

    expect(lowPowerMode()).toBe(false);

    dispose();
  });

  it('updates to the fetched value once isLowPowerModeEnabledAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches the signal.
    const { value: lowPowerMode, dispose } = inRoot(createLowPowerMode);

    await vi.waitFor(() => expect(lowPowerMode()).toBe(true));

    dispose();
  });

  it('updates the accessor when the native listener fires', async () => {
    // why: seeding false and then toggling true from the event isolates the listener path from
    // the fetch path — either alone would otherwise explain a `true`.
    isLowPowerModeEnabledAsyncMock.mockResolvedValue(false);
    const { value: lowPowerMode, dispose } = inRoot(createLowPowerMode);
    await vi.waitFor(() => expect(lowPowerMode()).toBe(false));

    registeredListener?.({ lowPowerMode: true });

    expect(lowPowerMode()).toBe(true);

    dispose();
  });

  it('keeps a native reading that arrived before the seed resolved', async () => {
    // why: the listener is synchronous, the seed is a promise — an event landing first makes the
    // seed the OLDER value, and it must not win. See create-battery-level.ts's header.
    let resolveSeed: ((enabled: boolean) => void) | undefined;
    isLowPowerModeEnabledAsyncMock.mockImplementation(
      () =>
        new Promise<boolean>(resolve => {
          resolveSeed = resolve;
        }),
    );
    const { value: lowPowerMode, dispose } = inRoot(createLowPowerMode);

    registeredListener?.({ lowPowerMode: true });
    resolveSeed?.(false);
    await flushPromises();

    expect(lowPowerMode()).toBe(true);

    dispose();
  });

  it('unsubscribes on dispose', async () => {
    // why: a listener that outlives its owner writes into a disposed scope forever.
    const { value: lowPowerMode, dispose } = inRoot(createLowPowerMode);
    await vi.waitFor(() => expect(lowPowerMode()).toBe(true));

    dispose();
    registeredListener?.({ lowPowerMode: false });

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(lowPowerMode()).toBe(true);
  });
});
