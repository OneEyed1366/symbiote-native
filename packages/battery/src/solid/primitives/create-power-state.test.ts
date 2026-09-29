// Solid test for `createPowerState`; the merge and seed logic is covered in
// core/power-state.test.ts, this file proves only the primitive's own lifecycle wiring

import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPowerState } from './create-power-state';

type IPowerState = {
  lowPowerMode: boolean;
  batteryLevel: number;
  batteryState: number;
};

const { watchPowerState, stop, initialPowerState } = vi.hoisted(() => {
  const stop = vi.fn();
  return {
    stop,
    initialPowerState: {
      lowPowerMode: false,
      batteryLevel: -1,
      batteryState: 0,
    },
    watchPowerState: vi.fn((_onChange: (state: IPowerState) => void) => stop),
  };
});

vi.mock('../../core', () => ({ initialPowerState, watchPowerState }));

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

beforeEach(() => vi.clearAllMocks());

describe('createPowerState (Solid)', () => {
  it('starts from the initial power state', () => {
    const { value: powerState, dispose } = inRoot(createPowerState);

    expect(powerState()).toEqual(initialPowerState);

    dispose();
  });

  it('updates the accessor with the state the watcher pushes', () => {
    const { value: powerState, dispose } = inRoot(createPowerState);
    const push = watchPowerState.mock.calls[0][0];

    push({ lowPowerMode: true, batteryLevel: 0.4, batteryState: 2 });

    expect(powerState()).toEqual({
      lowPowerMode: true,
      batteryLevel: 0.4,
      batteryState: 2,
    });

    dispose();
  });

  it('stops watching on dispose', () => {
    const { dispose } = inRoot(createPowerState);

    dispose();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
