// Co-located Angular-driven test (ADR 0025) for LowPowerModeService. See
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
import { LowPowerModeService } from './index';

const addListenerMock = vi.fn();
const removeMock = vi.fn();
const isLowPowerModeEnabledAsyncMock = vi.fn(async () => true);

vi.mock('../../../core', () => ({
  addLowPowerModeListener: (listener: (event: { lowPowerMode: boolean }) => void) =>
    addListenerMock(listener),
  isLowPowerModeEnabledAsync: () => isLowPowerModeEnabledAsyncMock(),
}));

const ROOT_TAG = 973;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<boolean> | undefined;
let capturedListener: ((event: { lowPowerMode: boolean }) => void) | undefined;

@Component({
  selector: 'symbiote-low-power-mode-host',
  standalone: true,
  template: '',
})
class LowPowerModeHost {
  readonly lowPowerMode = inject(LowPowerModeService).connect();

  constructor() {
    capturedResult = this.lowPowerMode;
  }
}

beforeEach(() => {
  capturedResult = undefined;
  capturedListener = undefined;
  isLowPowerModeEnabledAsyncMock.mockResolvedValue(true);
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

describe('LowPowerModeService.connect', () => {
  it('reports false before the initial fetch resolves', async () => {
    // why: false is the documented "assume off until proven otherwise" sentinel — must be
    // visible immediately on mount, before the async seed fetch settles.
    mount(ROOT_TAG, LowPowerModeHost);

    expect(capturedResult?.()).toBe(false);
  });

  it('reports the fetched value once isLowPowerModeEnabledAsync() resolves', async () => {
    // why: proves the one-shot seed fetch actually reaches the signal.
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    expect(capturedResult?.()).toBe(true);
  });

  it('updates the signal when the registered listener fires', async () => {
    // why: after the initial seed, toggling low-power mode must come from the native event, not
    // a second fetch — proves the listener is wired to the signal, independent of the seed value.
    isLowPowerModeEnabledAsyncMock.mockResolvedValue(false);
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ lowPowerMode: true });

    expect(capturedResult?.()).toBe(true);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    // why: a leaked subscription keeps updating a signal no component reads, and leaks the
    // native listener — the effect's onCleanup must actually run on teardown.
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
