// Vue twin of `../react`'s `useMediaLibraryPermissions` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IMediaLibraryPermissionResponse } from '../core';
import type { IPermissionHookOptions } from '@symbiote-native/engine';
import type { IUseMediaLibraryPermissionsOptions } from './use-media-library-permissions';

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

const ROOT_TAG = 989;
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
let harnessOptions:
  IPermissionHookOptions<IUseMediaLibraryPermissionsOptions> | undefined;

const Probe = defineComponent(() => {
  captured = useMediaLibraryPermissions(harnessOptions);
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
  getMediaLibraryPermissionsAsync.mockResolvedValue(DENIED);
  requestMediaLibraryPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('useMediaLibraryPermissions (Positive: resolves, requests, and forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    mountHarness();
    await tick();

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(undefined);
    expect(captured?.[0].value).toEqual(DENIED);
  });

  it('forwards writeOnly to the dispatched method on mount', async () => {
    harnessOptions = { writeOnly: true };
    mountHarness();
    await tick();

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
  });

  it('forwards writeOnly to requestPermission when called imperatively', async () => {
    harnessOptions = { writeOnly: true };
    mountHarness();
    await tick();

    await captured?.[1]();

    expect(requestMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
    expect(captured?.[0].value).toEqual(GRANTED);
  });
});
