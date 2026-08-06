// Co-located Vue-driven test (ADR 0025) for usePermissions. See
// packages/battery/src/vue/composables/use-battery-state/use-battery-state.test.ts for the
// shared rationale, adapted here to test the get/request permission pair instead of a listener
// subscription.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';

type IPermissionResponse = {
  status: string;
  expires: 'never';
  granted: boolean;
  canAskAgain: boolean;
};

const GRANTED: IPermissionResponse = {
  status: 'granted',
  expires: 'never',
  granted: true,
  canAskAgain: true,
};
const DENIED: IPermissionResponse = {
  status: 'denied',
  expires: 'never',
  granted: false,
  canAskAgain: true,
};

const getPermissionsAsyncMock = vi.fn(async () => GRANTED);
const requestPermissionsAsyncMock = vi.fn(async () => GRANTED);

vi.mock('../../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
}));

const ROOT_TAG = 9953;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  getPermissionsAsyncMock.mockClear();
  requestPermissionsAsyncMock.mockClear();
  getPermissionsAsyncMock.mockResolvedValue(GRANTED);
  requestPermissionsAsyncMock.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

function mountPermissions(): ReturnType<typeof usePermissions> {
  let result: ReturnType<typeof usePermissions> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePermissions();
        return () => h('symbiote-text', {}, 'cellular');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('setup() did not run');
  }
  return result;
}

describe('usePermissions (Vue)', () => {
  it('starts at null before the initial get() resolves', () => {
    const { status } = mountPermissions();

    expect(status.value).toBeNull();
  });

  it('fetches the permission status on mount', async () => {
    const { status } = mountPermissions();

    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
    expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('request() re-fetches and updates the ref', async () => {
    const { status, request } = mountPermissions();
    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

    requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await request();

    expect(status.value).toEqual(DENIED);
  });

  it('get() re-fetches and updates the ref', async () => {
    const { status, get } = mountPermissions();
    await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

    getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
    await get();

    expect(status.value).toEqual(DENIED);
  });
});
