// Angular twin of `../../react`'s `useCameraPermissions`, DI shape matching
// `@symbiote-native/brightness`'s `PermissionsService` (`connect()`/`get()`/`request()`/`error`)

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { CameraPermissionsService } from './index';
import type { ICameraPermissionResponse } from '../../../core';

const { getCameraPermissionsAsync, requestCameraPermissionsAsync } = vi.hoisted(
  () => ({
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  }),
);

vi.mock('../../../core', () => ({
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
}));

const GRANTED: ICameraPermissionResponse = {
  granted: true,
  status: 'granted' as ICameraPermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};
const DENIED: ICameraPermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as ICameraPermissionResponse['status'],
};

const ROOT_TAG = 992;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<ICameraPermissionResponse | null> | undefined;
let capturedService: CameraPermissionsService | undefined;

@Component({
  selector: 'camera-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly service = inject(CameraPermissionsService);
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
  getCameraPermissionsAsync.mockResolvedValue(DENIED);
  requestCameraPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('CameraPermissionsService.connect (Positive: auto-fetches once, get/request update the signal)', () => {
  it('reports null before the initial fetch resolves', () => {
    mount(ROOT_TAG, Host);

    expect(capturedStatus?.()).toBeNull();
  });

  it('reports the fetched status once getCameraPermissionsAsync resolves', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedStatus?.()).toEqual(DENIED);
    expect(getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('does not re-fetch on a second connect() once status is already known', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    capturedService?.connect();
    await tick();

    expect(getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() updates the signal with the granted response', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await capturedService?.request();

    expect(capturedStatus?.()).toEqual(GRANTED);
  });
});

describe('CameraPermissionsService.connect (Negative: an auto-fetch failure surfaces as error, not an unhandled rejection)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getCameraPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mount(ROOT_TAG, Host);
    await tick();

    expect(capturedService?.error()?.message).toBe('permission query failed');
    expect(capturedStatus?.()).toBeNull();
  });
});
