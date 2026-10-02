// React-driven test for `usePowerState`; the merge and seed logic is covered in
// core/power-state.test.ts, this file proves only the hook's own lifecycle wiring

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { usePowerState } from './index';

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

vi.mock('../../../core', () => ({ initialPowerState, watchPowerState }));

const ROOT_TAG = 954;

const results: IPowerState[] = [];

function Probe(): ReactElement {
  results.push(usePowerState());
  return createElement('view');
}

const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe('usePowerState', () => {
  it('starts from the initial power state', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[0]).toEqual(initialPowerState);
  });

  it('re-renders with the state the watcher pushes', async () => {
    mount(ROOT_TAG, createElement(Probe));
    const push = watchPowerState.mock.calls[0][0];

    push({ lowPowerMode: true, batteryLevel: 0.4, batteryState: 2 });

    await vi.waitFor(() =>
      expect(results[results.length - 1]).toEqual({
        lowPowerMode: true,
        batteryLevel: 0.4,
        batteryState: 2,
      }),
    );
  });

  it('stops watching on unmount', () => {
    mount(ROOT_TAG, createElement(Probe));

    unmount(ROOT_TAG);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
