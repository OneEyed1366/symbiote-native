// Solid twin of `../react`'s `useCalendarPermissions` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';
import type { IPermissionHookOptions } from '../core/permission-hook-runtime';
import type { IUseCalendarPermissionsOptions } from './use-calendar-permissions';

const { getCalendarPermissions, requestCalendarPermissions } = vi.hoisted(
  () => ({
    getCalendarPermissions: vi.fn(),
    requestCalendarPermissions: vi.fn(),
  }),
);

vi.mock('../core/calendar', () => ({
  getCalendarPermissions,
  requestCalendarPermissions,
}));

const { useCalendarPermissions } = await import('./use-calendar-permissions');

const ROOT_TAG = 1105;
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

let captured: ReturnType<typeof useCalendarPermissions> | undefined;
let harnessOptions:
  IPermissionHookOptions<IUseCalendarPermissionsOptions> | undefined;

function Probe(): null {
  captured = useCalendarPermissions(harnessOptions);
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  harnessOptions = undefined;
  getCalendarPermissions.mockResolvedValue(DENIED);
  requestCalendarPermissions.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useCalendarPermissions (Positive: resolves, requests, forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    await tick();

    expect(getCalendarPermissions).toHaveBeenCalledWith(undefined);
    expect(captured?.[0]()).toEqual(DENIED);
  });

  it('forwards writeOnly to the dispatched method on mount', async () => {
    harnessOptions = { writeOnly: true };
    mountHarness();
    await tick();

    expect(getCalendarPermissions).toHaveBeenCalledWith(true);
  });

  it('forwards writeOnly to requestPermission when called imperatively', async () => {
    harnessOptions = { writeOnly: true };
    mountHarness();
    await tick();

    await captured?.[1]();

    expect(requestCalendarPermissions).toHaveBeenCalledWith(true);
    expect(captured?.[0]()).toEqual(GRANTED);
  });
});
