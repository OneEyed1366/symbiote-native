// Solid twin of `../react`'s `useTrackingPermissions` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

const core = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

vi.mock('../core/tracking-transparency', () => core);

const { useTrackingPermissions } = await import('./use-tracking-permissions');

const ROOT_TAG = 957;
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
let options: IPermissionHookBehavior | undefined;

function Probe(): null {
  captured = useTrackingPermissions(options);
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  options = undefined;
  core.getTrackingPermissionsAsync.mockResolvedValue(DENIED);
  core.requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useTrackingPermissions (Positive: resolves, requests, and re-fetches permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    expect(captured?.[0]()).toBeNull();
    await tick();

    expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(core.requestTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]()).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    options = { request: true };
    mountHarness();
    await tick();

    expect(core.requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(core.getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]()).toEqual(GRANTED);
  });

  it('does nothing on mount when get is false', async () => {
    options = { get: false };
    mountHarness();
    await tick();

    expect(core.getTrackingPermissionsAsync).not.toHaveBeenCalled();
    expect(captured?.[0]()).toBeNull();
  });

  it('updates the status when request is called imperatively', async () => {
    mountHarness();
    await tick();
    await captured?.[1]();
    await tick();

    expect(captured?.[0]()).toEqual(GRANTED);
  });

  it('updates the status when get is called imperatively', async () => {
    core.getTrackingPermissionsAsync
      .mockResolvedValueOnce(GRANTED)
      .mockResolvedValue(DENIED);
    mountHarness();
    await tick();
    await captured?.[2]();
    await tick();

    expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(2);
    expect(captured?.[0]()).toEqual(DENIED);
  });
});
