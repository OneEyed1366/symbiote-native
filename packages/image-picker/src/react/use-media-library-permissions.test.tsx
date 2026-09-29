// React twin of expo-image-picker's `useMediaLibraryPermissions`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IMediaLibraryPermissionResponse } from '../core';

const { getMediaLibraryPermissionsAsync, requestMediaLibraryPermissionsAsync } =
  vi.hoisted(() => ({
    getMediaLibraryPermissionsAsync: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
  }));

vi.mock('../core', () => ({
  getMediaLibraryPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
}));

const { useMediaLibraryPermissions } =
  await import('./use-media-library-permissions');

const ROOT_TAG = 987;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED: IMediaLibraryPermissionResponse = {
  granted: true,
  status: 'granted' as IMediaLibraryPermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
  accessPrivileges: 'all',
};
const DENIED: IMediaLibraryPermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as IMediaLibraryPermissionResponse['status'],
  accessPrivileges: 'none',
};

let captured: ReturnType<typeof useMediaLibraryPermissions> | undefined;
let capturedOptions: Parameters<typeof useMediaLibraryPermissions>[0];

function Probe(): null {
  captured = useMediaLibraryPermissions(capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  capturedOptions = undefined;
  getMediaLibraryPermissionsAsync.mockResolvedValue(DENIED);
  requestMediaLibraryPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useMediaLibraryPermissions (Positive: resolves, requests, and forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(undefined);
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('forwards writeOnly to the dispatched method on mount', async () => {
    capturedOptions = { writeOnly: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
  });

  it('forwards writeOnly to requestPermission when called imperatively', async () => {
    capturedOptions = { writeOnly: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[1]();
    await tick();

    expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
    expect(captured?.[0]).toEqual(GRANTED);
  });
});
