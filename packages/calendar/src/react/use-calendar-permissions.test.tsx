// React twin of expo-calendar's `useCalendarPermissions`, ported onto this package's own
// `resolveInitialPermission` runtime instead of `expo-modules-core`'s `createPermissionHook`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';

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

const ROOT_TAG = 1101;
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
let capturedOptions: Parameters<typeof useCalendarPermissions>[0];

function Probe(): null {
  captured = useCalendarPermissions(capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  capturedOptions = undefined;
  getCalendarPermissions.mockResolvedValue(DENIED);
  requestCalendarPermissions.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useCalendarPermissions (Positive: resolves, requests, forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();

    await tick();

    expect(getCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(requestCalendarPermissions).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedOptions = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(requestCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(getCalendarPermissions).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('forwards writeOnly to the dispatched method', async () => {
    capturedOptions = { writeOnly: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(getCalendarPermissions).toHaveBeenCalledWith(true);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[1]();
    await tick();

    expect(requestCalendarPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.[0]).toEqual(GRANTED);
  });
});
