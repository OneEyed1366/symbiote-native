// Vue twin of `../react`'s `useCameraPermissions` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { ICameraPermissionResponse } from '../core';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';

const { getCameraPermissionsAsync, requestCameraPermissionsAsync } = vi.hoisted(
  () => ({
    getCameraPermissionsAsync: vi.fn(),
    requestCameraPermissionsAsync: vi.fn(),
  }),
);

vi.mock('../core', () => ({
  getCameraPermissionsAsync,
  requestCameraPermissionsAsync,
}));

const { useCameraPermissions } = await import('./use-camera-permissions');

const ROOT_TAG = 988;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED: ICameraPermissionResponse = {
  granted: true,
  status: 'granted' as ICameraPermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};
const DENIED: ICameraPermissionResponse = {
  ...GRANTED,
  granted: false,
  status: 'denied' as ICameraPermissionResponse['status'],
};

let captured: ReturnType<typeof useCameraPermissions> | undefined;
let harnessOptions: IPermissionHookBehavior | undefined;

const Probe = defineComponent(() => {
  captured = useCameraPermissions(harnessOptions);
  return (): VNode => h('text', 'probe');
});

function mountHarness(): void {
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  harnessOptions = undefined;
  getCameraPermissionsAsync.mockResolvedValue(DENIED);
  requestCameraPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useCameraPermissions (Positive: resolves, requests, and re-fetches camera permission)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    expect(captured?.[0].value).toBeNull();

    await tick();

    expect(getCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(captured?.[0].value).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    harnessOptions = { request: true };
    mountHarness();
    await tick();

    expect(requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(captured?.[0].value).toEqual(GRANTED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mountHarness();
    await tick();

    await captured?.[1]();

    expect(captured?.[0].value).toEqual(GRANTED);
  });
});
