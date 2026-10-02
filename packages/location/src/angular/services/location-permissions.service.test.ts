// Angular twin of `../../react`'s location permission hooks

import '@angular/compiler';
import { Component, inject, type Signal, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';
import type { PermissionsServiceBase } from '@symbiote-native/angular';

const core = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  getMotionActivityPermissionsAsync: vi.fn(),
  requestMotionActivityPermissionsAsync: vi.fn(),
}));

vi.mock('../../core/location', () => core);

const services = await import('./location-permissions.service');

const GRANTED: PermissionResponse = {
  granted: true,
  status: 'granted' as PermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as PermissionResponse['status'],
};

const CASES = [
  {
    name: 'ForegroundPermissionsService',
    token: services.ForegroundPermissionsService,
    get: core.getForegroundPermissionsAsync,
    request: core.requestForegroundPermissionsAsync,
  },
  {
    name: 'BackgroundPermissionsService',
    token: services.BackgroundPermissionsService,
    get: core.getBackgroundPermissionsAsync,
    request: core.requestBackgroundPermissionsAsync,
  },
  {
    name: 'MotionActivityPermissionsService',
    token: services.MotionActivityPermissionsService,
    get: core.getMotionActivityPermissionsAsync,
    request: core.requestMotionActivityPermissionsAsync,
  },
];

const ROOT_TAG = 993;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let activeToken: Type<PermissionsServiceBase<PermissionResponse>>;
let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService: PermissionsServiceBase<PermissionResponse> | undefined;

@Component({
  selector: 'location-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(activeToken);
  readonly status = this.service.connect();
  constructor() {
    capturedStatus = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  capturedStatus = undefined;
  capturedService = undefined;
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe.each(CASES)(
  '$name.connect (Positive: auto-fetches once, get/request update the signal)',
  ({ token, get, request }) => {
    beforeEach(() => {
      activeToken = token;
      get.mockResolvedValue(DENIED);
      request.mockResolvedValue(GRANTED);
    });

    it('reports null before the initial fetch resolves', () => {
      mount(ROOT_TAG, Host);

      expect(capturedStatus?.()).toBeNull();
    });

    it('reports the fetched status once the getter resolves', async () => {
      mount(ROOT_TAG, Host);
      await tick();

      expect(capturedStatus?.()).toEqual(DENIED);
      expect(get).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch on a second connect() once status is already known', async () => {
      mount(ROOT_TAG, Host);
      await tick();

      capturedService?.connect();
      await tick();

      expect(get).toHaveBeenCalledTimes(1);
    });

    it('request() updates the signal with the granted response', async () => {
      mount(ROOT_TAG, Host);
      await tick();

      await capturedService?.request();

      expect(capturedStatus?.()).toEqual(GRANTED);
    });

    it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
      get.mockRejectedValueOnce(new Error('permission query failed'));

      mount(ROOT_TAG, Host);
      await tick();

      expect(capturedService?.error()?.message).toBe('permission query failed');
      expect(capturedStatus?.()).toBeNull();
    });
  },
);
