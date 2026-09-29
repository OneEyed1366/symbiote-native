// Covers `connect()` lifecycle wiring; merge and seed logic lives in core/power-state.test.ts

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { PowerStateService } from './index';

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

const ROOT_TAG = 974;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<IPowerState> | undefined;

@Component({
  selector: 'symbiote-power-state-host',
  standalone: true,
  template: '',
})
class PowerStateHost {
  readonly powerState = inject(PowerStateService).connect();

  constructor() {
    capturedResult = this.powerState;
  }
}

beforeEach(() => {
  capturedResult = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('PowerStateService.connect', () => {
  it('starts from the initial power state', () => {
    mount(ROOT_TAG, PowerStateHost);

    expect(capturedResult?.()).toEqual(initialPowerState);
  });

  it('updates the signal with the state the watcher pushes', async () => {
    mount(ROOT_TAG, PowerStateHost);
    await tick();
    const push = watchPowerState.mock.calls[0][0];

    push({ lowPowerMode: true, batteryLevel: 0.4, batteryState: 2 });

    expect(capturedResult?.()).toEqual({
      lowPowerMode: true,
      batteryLevel: 0.4,
      batteryState: 2,
    });
  });

  it('stops watching when the host component is unmounted', async () => {
    mount(ROOT_TAG, PowerStateHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(stop).toHaveBeenCalledOnce();
  });
});
