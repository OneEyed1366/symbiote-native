// Solid twin of `../react`'s `useRemindersPermissions` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
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

const ROOT_TAG = 1106;
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

function Probe(): null {
  captured = useRemindersPermissions();
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  getRemindersPermissions.mockResolvedValue(DENIED);
  requestRemindersPermissions.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useRemindersPermissions (Positive: resolves and requests reminders permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    await tick();

    expect(getRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.[0]()).toEqual(DENIED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mountHarness();
    await tick();

    await captured?.[1]();

    expect(requestRemindersPermissions).toHaveBeenCalledTimes(1);
    expect(captured?.[0]()).toEqual(GRANTED);
  });
});
