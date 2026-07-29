// Co-located Vue-driven test (ADR 0025) for usePermissions. See battery's
// use-battery-state.test.ts for the shared rationale.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/vue/composables/use-battery-state's
// test uses for BatteryState.
vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const GRANTED: PermissionResponse = {
  status: PermissionStatus.GRANTED,
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  status: PermissionStatus.DENIED,
  granted: false,
  canAskAgain: true,
  expires: 'never',
};

const ROOT_TAG = 9953;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

function mountPermissions(): ReturnType<typeof usePermissions> {
  let result: ReturnType<typeof usePermissions> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePermissions();
        return () => h('symbiote-text', {}, 'brightness');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('setup() did not run');
  }
  return result;
}

describe('usePermissions (Vue)', () => {
  it('starts at null before the initial fetch resolves', () => {
    const { status } = mountPermissions();

    expect(status.value).toBe(null);
  });

  it('fetches the permission status once on mount', async () => {
    const { status } = mountPermissions();

    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
    expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() delegates to requestPermissionsAsync and updates the status', async () => {
    const { status, request } = mountPermissions();
    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

    requestPermissionsAsync.mockResolvedValueOnce(DENIED);
    await request();

    expect(status.value).toEqual(DENIED);
  });

  it('get() re-fetches and updates the status', async () => {
    const { status, get } = mountPermissions();
    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

    getPermissionsAsync.mockResolvedValueOnce(DENIED);
    await get();

    expect(status.value).toEqual(DENIED);
  });
});
