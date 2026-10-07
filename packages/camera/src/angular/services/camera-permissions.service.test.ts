// Angular twin of `../../react`'s camera permission hooks, DI shape of `CalendarPermissionsService`

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';
import {
  CameraPermissionsService,
  MicrophonePermissionsService,
} from './camera-permissions.service';

const methods = vi.hoisted(() => ({
  cameraGet: vi.fn(),
  cameraRequest: vi.fn(),
  microphoneGet: vi.fn(),
  microphoneRequest: vi.fn(),
}));

vi.mock('../../core/camera-api', () => ({
  cameraPermissionMethods: {
    getMethod: methods.cameraGet,
    requestMethod: methods.cameraRequest,
  },
  microphonePermissionMethods: {
    getMethod: methods.microphoneGet,
    requestMethod: methods.microphoneRequest,
  },
}));

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

const ROOT_TAG = 1819;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let cameraStatus: Signal<PermissionResponse | null> | undefined;
let microphoneStatus: Signal<PermissionResponse | null> | undefined;
let cameraService: CameraPermissionsService | undefined;

@Component({
  selector: 'camera-permissions-host',
  standalone: true,
  template: '',
})
class Host {
  readonly camera = inject(CameraPermissionsService);
  readonly microphone = inject(MicrophonePermissionsService);
  readonly cameraStatus = this.camera.connect();
  readonly microphoneStatus = this.microphone.connect();
  constructor() {
    cameraStatus = this.cameraStatus;
    microphoneStatus = this.microphoneStatus;
    cameraService = this.camera;
  }
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  cameraStatus = undefined;
  microphoneStatus = undefined;
  cameraService = undefined;
  methods.cameraGet.mockResolvedValue(DENIED);
  methods.cameraRequest.mockResolvedValue(GRANTED);
  methods.microphoneGet.mockResolvedValue(GRANTED);
  methods.microphoneRequest.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('CameraPermissionsService and MicrophonePermissionsService', () => {
  it('report the fetched status of their own permission', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    expect(cameraStatus?.()).toEqual(DENIED);
    expect(microphoneStatus?.()).toEqual(GRANTED);
  });

  it('update the status when the permission is requested', async () => {
    mount(ROOT_TAG, Host);
    await tick();

    await cameraService?.request();

    expect(methods.cameraRequest).toHaveBeenCalledTimes(1);
    expect(cameraStatus?.()).toEqual(GRANTED);
  });

  it('surface an auto-fetch rejection as `error` and leave the status null', async () => {
    methods.cameraGet.mockRejectedValueOnce(new Error('query failed'));

    mount(ROOT_TAG, Host);
    await tick();

    expect(cameraService?.error()?.message).toBe('query failed');
    expect(cameraStatus?.()).toBeNull();
  });
});
