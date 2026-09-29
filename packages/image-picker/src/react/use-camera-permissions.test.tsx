// React twin of expo-image-picker's `useCameraPermissions`, ported onto this package's own
// `resolveInitialPermission` runtime instead of `expo-modules-core`'s `createPermissionHook`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { ICameraPermissionResponse } from '../core';

const { getCameraPermissionsAsync, requestCameraPermissionsAsync } = vi.hoisted(
  () => ({
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  }),
);

vi.mock('../core', () => ({
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
}));

const { useCameraPermissions } = await import('./use-camera-permissions');

const ROOT_TAG = 986;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

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

let captured: ReturnType<typeof useCameraPermissions> | undefined;
let capturedOptions: Parameters<typeof useCameraPermissions>[0];

function Probe(): null {
  captured = useCameraPermissions(capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  capturedOptions = undefined;
  getCameraPermissionsAsync.mockResolvedValue(DENIED);
  requestCameraPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useCameraPermissions (Positive: resolves, requests, and re-fetches camera permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();

    await tick();

    expect(getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedOptions = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(getCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('does nothing on mount when both get and request are false', async () => {
    capturedOptions = { get: false };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(getCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toBeNull();
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[1]();
    await tick();

    expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('updates the status when getPermission is called imperatively', async () => {
    getCameraPermissionsAsync
      .mockResolvedValueOnce(GRANTED)
      .mockResolvedValue(DENIED);
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[2]();
    await tick();

    expect(getCameraPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(captured?.[0]).toEqual(DENIED);
  });
});
