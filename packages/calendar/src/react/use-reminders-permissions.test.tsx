// React twin of expo-calendar's `useRemindersPermissions`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';

const { getRemindersPermissions, requestRemindersPermissions } = vi.hoisted(
  () => ({
    getRemindersPermissions: vi.fn(),
    requestRemindersPermissions: vi.fn(),
  }),
);

vi.mock('../core/calendar', () => ({
  getRemindersPermissions,
  requestRemindersPermissions,
}));

const { useRemindersPermissions } = await import('./use-reminders-permissions');

const ROOT_TAG = 1102;
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

let captured: ReturnType<typeof useRemindersPermissions> | undefined;
let capturedOptions: Parameters<typeof useRemindersPermissions>[0];

function Probe(): null {
  captured = useRemindersPermissions(capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  capturedOptions = undefined;
  getRemindersPermissions.mockResolvedValue(DENIED);
  requestRemindersPermissions.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useRemindersPermissions (Positive: resolves and requests reminders permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();

    await tick();

    expect(getRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(requestRemindersPermissions).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedOptions = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(requestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(getRemindersPermissions).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[1]();
    await tick();

    expect(requestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.[0]).toEqual(GRANTED);
  });
});
