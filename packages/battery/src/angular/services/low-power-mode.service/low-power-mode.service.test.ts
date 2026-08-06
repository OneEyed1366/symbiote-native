// Co-located Angular-driven test (ADR 0025) for LowPowerModeService. See
// battery-level.service.test.ts for the shared rationale.

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
    mount(ROOT_TAG, LowPowerModeHost);

    expect(capturedResult?.()).toBe(false);
  });

  it('reports the fetched value once isLowPowerModeEnabledAsync() resolves', async () => {
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    expect(capturedResult?.()).toBe(true);
  });

  it('updates the signal when the registered listener fires', async () => {
    isLowPowerModeEnabledAsyncMock.mockResolvedValue(false);
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    if (capturedListener === undefined) throw new Error('addListener callback was not captured');
    capturedListener({ lowPowerMode: true });

    expect(capturedResult?.()).toBe(true);
  });

  it('removes the subscription when the host component is unmounted', async () => {
    mount(ROOT_TAG, LowPowerModeHost);
    await tick();

    unmount(ROOT_TAG);
    await tick();

    expect(removeMock).toHaveBeenCalledOnce();
  });
});
