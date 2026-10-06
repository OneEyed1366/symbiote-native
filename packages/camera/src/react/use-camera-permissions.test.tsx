// React `useCameraPermissions` and `useMicrophonePermissions` over the shared permission runtime

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';

const methods = vi.hoisted(() => ({
  cameraGet: vi.fn(),
  cameraRequest: vi.fn(),
  microphoneGet: vi.fn(),
  microphoneRequest: vi.fn(),
}));

vi.mock('../core/camera-api', () => ({
  cameraPermissionMethods: {
    getMethod: methods.cameraGet,
    requestMethod: methods.cameraRequest,
  },
  microphonePermissionMethods: {
    getMethod: methods.microphoneGet,
    requestMethod: methods.microphoneRequest,
  },
}));

const { useCameraPermissions, useMicrophonePermissions } =
  await import('./use-camera-permissions');

const ROOT_TAG = 1812;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

let camera: ReturnType<typeof useCameraPermissions> | undefined;
let microphone: ReturnType<typeof useMicrophonePermissions> | undefined;
let cameraOptions: Parameters<typeof useCameraPermissions>[0];

function Probe(): null {
  camera = useCameraPermissions(cameraOptions);
  microphone = useMicrophonePermissions();
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  camera = undefined;
  microphone = undefined;
  cameraOptions = undefined;
  methods.cameraGet.mockResolvedValue(DENIED);
  methods.cameraRequest.mockResolvedValue(GRANTED);
  methods.microphoneGet.mockResolvedValue(GRANTED);
  methods.microphoneRequest.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('useCameraPermissions', () => {
  it('resolves the current status on mount', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(camera?.[0]).toBeNull();

    await tick();

    expect(methods.cameraGet).toHaveBeenCalledTimes(1);
    expect(camera?.[0]).toEqual(DENIED);
  });

  it('requests on mount when asked to', async () => {
    cameraOptions = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(methods.cameraRequest).toHaveBeenCalledTimes(1);
    expect(methods.cameraGet).not.toHaveBeenCalled();
    expect(camera?.[0]).toEqual(GRANTED);
  });

  it('updates the status when the permission is requested by hand', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    await camera?.[1]();
    await tick();

    expect(camera?.[0]).toEqual(GRANTED);
  });
});

describe('useMicrophonePermissions', () => {
  it('resolves the microphone status apart from the camera one', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(methods.microphoneGet).toHaveBeenCalledTimes(1);
    expect(microphone?.[0]).toEqual(GRANTED);
    expect(camera?.[0]).toEqual(DENIED);
  });
});
