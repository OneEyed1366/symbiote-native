// Co-located Angular-driven test (ADR 0025) for PermissionsService. See battery's
// battery-state.service.test.ts for the shared rationale.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/angular/services/battery-state.service's
// test uses for BatteryState.
vi.mock('../../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const GRANTED: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService: PermissionsService | undefined;

@Component({
  selector: 'symbiote-permissions-host',
  standalone: true,
  template: '',
})
class PermissionsHost {
  readonly service = inject(PermissionsService);
  readonly status = this.service.connect();

  constructor() {
    capturedStatus = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  capturedStatus = undefined;
  capturedService = undefined;
  vi.clearAllMocks();
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('PermissionsService.connect', () => {
  it('reports null before the initial fetch resolves', () => {
    mount(ROOT_TAG, PermissionsHost);

    expect(capturedStatus?.()).toBe(null);
  });

  it('reports the fetched status once getTrackingPermissionsAsync() resolves', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    expect(capturedStatus?.()).toEqual(GRANTED);
    expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() delegates to requestTrackingPermissionsAsync and updates the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await capturedService?.request();

    expect(capturedStatus?.()).toEqual(DENIED);
  });

  it('get() re-fetches and updates the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await capturedService?.get();

    expect(capturedStatus?.()).toEqual(DENIED);
  });
});
