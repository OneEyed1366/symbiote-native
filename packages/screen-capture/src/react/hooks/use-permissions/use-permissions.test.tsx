// React twin of `@symbiote-native/brightness`'s `usePermissions` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
}));

const { usePermissions } = await import('./index');

const ROOT_TAG = 1000;
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

let captured: ReturnType<typeof usePermissions> | undefined;

function Probe(): null {
  captured = usePermissions();
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('usePermissions (Positive: auto-fetches on mount, request/get update status)', () => {
  it('resolves the current status on mount', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();

    await tick();

    expect(captured?.[0]).toEqual(GRANTED);
    expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() updates status with the request response', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    requestPermissionsAsync.mockResolvedValueOnce(DENIED);
    await captured?.[1]();
    await tick();

    expect(captured?.[0]).toEqual(DENIED);
  });
});

describe('usePermissions (Negative: an auto-fetch failure surfaces as the 4th tuple slot)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(captured?.[3]?.message).toBe('permission query failed');
    expect(captured?.[0]).toBeNull();
  });
});
