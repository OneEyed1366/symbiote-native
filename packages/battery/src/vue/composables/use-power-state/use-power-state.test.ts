// Vue-driven test for `usePowerState`; the merge and seed logic is covered in
// core/power-state.test.ts, this file proves only the composable's own lifecycle wiring

import { defineComponent, h, type Ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const ROOT_TAG = 9954;
const fabric = installRecordingFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

function mountPowerState(): Ref<IPowerState> {
  let powerState: Ref<IPowerState> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        powerState = usePowerState();
        return () => h('text', {}, 'battery');
      },
    }),
  );
  if (powerState === undefined) {
    throw new Error('setup() did not run');
  }
  return powerState;
}

describe('usePowerState (Vue)', () => {
  it('starts from the initial power state', () => {
    const powerState = mountPowerState();

    expect(powerState.value).toEqual(initialPowerState);
  });

  it('updates the ref with the state the watcher pushes', () => {
    const powerState = mountPowerState();
    const push = watchPowerState.mock.calls[0][0];

    push({ lowPowerMode: true, batteryLevel: 0.4, batteryState: 2 });

    expect(powerState.value).toEqual({
      lowPowerMode: true,
      batteryLevel: 0.4,
      batteryState: 2,
    });
  });

  it('stops watching on unmount', () => {
    mountPowerState();

    unmount(ROOT_TAG);

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
