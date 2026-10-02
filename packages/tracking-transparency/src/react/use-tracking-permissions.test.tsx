// Twin of `expo-tracking-transparency`'s `useTrackingPermissions` on `createPermissionHook`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';

const core = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

vi.mock('../core/tracking-transparency', () => core);

const { useTrackingPermissions } = await import('./use-tracking-permissions');

const ROOT_TAG = 955;
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

let captured: ReturnType<typeof useTrackingPermissions> | undefined;
let capturedOptions: Parameters<typeof useTrackingPermissions>[0];

function Probe(): null {
  captured = useTrackingPermissions(capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  capturedOptions = undefined;
  core.getTrackingPermissionsAsync.mockResolvedValue(DENIED);
  core.requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useTrackingPermissions (Positive: resolves, requests, and re-fetches permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();
    await tick();

    expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(core.requestTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedOptions = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(core.requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(core.getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('does nothing on mount when get is false', async () => {
    capturedOptions = { get: false };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(core.getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]).toBeNull();
  });

  it('updates the status when request is called imperatively', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();
    await captured?.[1]();
    await tick();

    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('updates the status when get is called imperatively', async () => {
    core.getTrackingPermissionsAsync
      .mockResolvedValueOnce(GRANTED)
      .mockResolvedValue(DENIED);
    mount(ROOT_TAG, <Probe />);
    await tick();
    await captured?.[2]();
    await tick();

    expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(captured?.[0]).toEqual(DENIED);
  });
});
