// Co-located Angular-driven test (ADR 0025) for BatteryStateService. See
// battery-level.service.test.ts for the shared rationale: `core` is mocked wholesale (the real
// native delegation is covered once in packages/battery/src/core/battery.test.ts), this file
// proves only connect()'s own seed/subscribe/update/unsubscribe lifecycle.
//
// No Negative group: connect() has no guard clause or throwing path.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { BatteryStateService } from './index';

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const getBatteryStateAsyncMock = vi.fn(async () => 2);

vi.mock('../../../core', () => ({
  addBatteryStateListener: (listener: (event: { batteryState: number }) => void) =>
    addListenerMock(listener),
  getBatteryStateAsync: () => getBatteryStateAsyncMock(),
  BatteryState: { UNKNOWN: 0, UNPLUGGED: 1, CHARGING: 2, FULL: 3, NOT_CHARGING: 4 },
}));

const ROOT_TAG = 972;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<number> | undefined;
let capturedListener: ((event: { batteryState: number }) => void) | undefined;

@Component({
  selector: 'symbiote-battery-state-host',
  standalone: true,
  template: '',
})
class BatteryStateHost {
  readonly batteryState = inject(BatteryStateService).connect();

  constructor() {
    capturedResult = this.batteryState;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  getBatteryStateAsyncMock.mockResolvedValue(2);
  addListenerMock.mockImplementation(listener => {
    capturedListener = listener;
    return { remove: removeMock };
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
  vi.clearAllMocks();
});

describe('BatteryStateService.connect', () => {
  it('reports UNKNOWN (0) before the initial fetch resolves', async () => {
    // why: BatteryState.UNKNOWN is the documented "can't tell yet" sentinel — must be visible
    // immediately on mount, before the async seed fetch settles.
    mount(ROOT_TAG, BatteryStateHost);

    expect(capturedResult?.()).toBe(0);
  });

  it('reports the fetched state once getBatteryStateAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches the signal.
    mount(ROOT_TAG, BatteryStateHost);
    await tick();

    expect(capturedResult?.()).toBe(2);
  });

  it('updates the signal when the registered listener fires', async () => {
    // why: after the initial seed, state transitions (charging → unplugged, etc.) must come
    // from the native event, not a second fetch — proves the listener is wired to the signal.
    mount(ROOT_TAG, BatteryStateHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ batteryState: 1 });

    expect(capturedResult?.()).toBe(1);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    // why: a leaked subscription keeps updating a signal no component reads, and leaks the
    // native listener — the effect's onCleanup must actually run on teardown.
    mount(ROOT_TAG, BatteryStateHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
