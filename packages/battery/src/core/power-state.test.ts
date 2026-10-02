// Covers `watchPowerState` seed, subscribe, merge and teardown; native delegation of the
// underlying calls is covered once in battery.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BatteryState, type PowerState } from './types';
import { initialPowerState, watchPowerState } from './power-state';

type IListeners = {
  lowPowerMode?: (event: { lowPowerMode: boolean }) => void;
  batteryLevel?: (event: { batteryLevel: number }) => void;
  batteryState?: (event: { batteryState: BatteryState }) => void;
};

const listeners: IListeners = {};
const removeMock = vi.fn();
const isLowPowerModeEnabledAsyncMock = vi.fn(async () => true);
const getBatteryLevelAsyncMock = vi.fn(async () => 0.5);
const getBatteryStateAsyncMock = vi.fn(async () => BatteryState.CHARGING);

vi.mock('./battery', () => ({
  isLowPowerModeEnabledAsync: () => isLowPowerModeEnabledAsyncMock(),
  getBatteryLevelAsync: () => getBatteryLevelAsyncMock(),
  getBatteryStateAsync: () => getBatteryStateAsyncMock(),
  addLowPowerModeListener: (listener: IListeners['lowPowerMode']) => {
    listeners.lowPowerMode = listener;
    return { remove: removeMock };
  },
  addBatteryLevelListener: (listener: IListeners['batteryLevel']) => {
    listeners.batteryLevel = listener;
    return { remove: removeMock };
  },
  addBatteryStateListener: (listener: IListeners['batteryState']) => {
    listeners.batteryState = listener;
    return { remove: removeMock };
  },
}));

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function collect(): { states: PowerState[]; stop: () => void } {
  const states: PowerState[] = [];
  const stop = watchPowerState(state => states.push(state));
  return { states, stop };
}

beforeEach(() => {
  vi.clearAllMocks();
  listeners.lowPowerMode = undefined;
  listeners.batteryLevel = undefined;
  listeners.batteryState = undefined;
  isLowPowerModeEnabledAsyncMock.mockResolvedValue(true);
  getBatteryLevelAsyncMock.mockResolvedValue(0.5);
  getBatteryStateAsyncMock.mockResolvedValue(BatteryState.CHARGING);
});

describe('initialPowerState', () => {
  it('uses the documented unknown sentinels', () => {
    expect(initialPowerState).toEqual({
      lowPowerMode: false,
      batteryLevel: -1,
      batteryState: BatteryState.UNKNOWN,
    });
  });
});

describe('watchPowerState', () => {
  it('emits the merged state once every seed fetch resolved', async () => {
    const { states, stop } = collect();
    await tick();

    expect(states[states.length - 1]).toEqual({
      lowPowerMode: true,
      batteryLevel: 0.5,
      batteryState: BatteryState.CHARGING,
    });
    stop();
  });

  it('merges a native event into the current state', async () => {
    const { states, stop } = collect();
    await tick();

    listeners.batteryLevel?.({ batteryLevel: 0.9 });

    expect(states[states.length - 1]).toEqual({
      lowPowerMode: true,
      batteryLevel: 0.9,
      batteryState: BatteryState.CHARGING,
    });
    stop();
  });

  it('keeps an event that arrived before its seed resolved', async () => {
    // The listener is synchronous and the seed is a promise, so the seed is the older value
    let resolveLevel: ((level: number) => void) | undefined;
    getBatteryLevelAsyncMock.mockImplementation(
      () =>
        new Promise<number>(resolve => {
          resolveLevel = resolve;
        }),
    );
    const { states, stop } = collect();

    listeners.batteryLevel?.({ batteryLevel: 0.8 });
    resolveLevel?.(0.1);
    await tick();

    expect(states[states.length - 1].batteryLevel).toBe(0.8);
    stop();
  });

  it('removes all three subscriptions on stop', () => {
    const { stop } = collect();

    stop();

    expect(removeMock).toHaveBeenCalledTimes(3);
  });

  it('ignores a seed that resolves after stop', async () => {
    const { states, stop } = collect();

    stop();
    await tick();

    expect(states).toHaveLength(0);
  });
});
