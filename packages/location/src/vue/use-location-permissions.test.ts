// Vue twin of `../react`'s location permission hooks test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

const core = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  getMotionActivityPermissionsAsync: vi.fn(),
  requestMotionActivityPermissionsAsync: vi.fn(),
}));

vi.mock('../core/location', () => core);

const hooks = await import('./use-location-permissions');

const ROOT_TAG = 988;
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

const CASES = [
  {
    name: 'useForegroundPermissions',
    use: hooks.useForegroundPermissions,
    get: core.getForegroundPermissionsAsync,
    request: core.requestForegroundPermissionsAsync,
  },
  {
    name: 'useBackgroundPermissions',
    use: hooks.useBackgroundPermissions,
    get: core.getBackgroundPermissionsAsync,
    request: core.requestBackgroundPermissionsAsync,
  },
  {
    name: 'useMotionActivityPermissions',
    use: hooks.useMotionActivityPermissions,
    get: core.getMotionActivityPermissionsAsync,
    request: core.requestMotionActivityPermissionsAsync,
  },
];

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe.each(CASES)(
  '$name (Positive: resolves, requests, and re-fetches permission)',
  ({ use, get, request }) => {
    let captured: ReturnType<typeof use> | undefined;
    let options: IPermissionHookBehavior | undefined;

    const Probe = defineComponent(() => {
      captured = use(options);
      return (): VNode => h('text', 'probe');
    });

    function mountHarness(): void {
      mount(ROOT_TAG, { render: (): VNode => h(Probe) });
    }

    beforeEach(() => {
      captured = undefined;
      options = undefined;
      get.mockResolvedValue(DENIED);
      request.mockResolvedValue(GRANTED);
    });

    it('resolves the current status on mount by default', async () => {
      mountHarness();
      expect(captured?.[0].value).toBeNull();

      await tick();

      expect(get).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
      expect(captured?.[0].value).toEqual(DENIED);
    });

    it('requests instead of fetching on mount when request is true', async () => {
      options = { request: true };
      mountHarness();
      await tick();

      expect(request).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
      expect(captured?.[0].value).toEqual(GRANTED);
    });

    it('does nothing on mount when both get and request are false', async () => {
      options = { get: false };
      mountHarness();
      await tick();

      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(captured?.[0].value).toBeNull();
    });

    it('updates the status when requestPermission is called imperatively', async () => {
      mountHarness();
      await tick();

      await captured?.[1]();
      await tick();

      expect(request).toHaveBeenCalledTimes(1);
      expect(captured?.[0].value).toEqual(GRANTED);
    });

    it('updates the status when getPermission is called imperatively', async () => {
      get.mockResolvedValueOnce(GRANTED).mockResolvedValue(DENIED);
      mountHarness();
      await tick();

      await captured?.[2]();
      await tick();

      expect(get).toHaveBeenCalledTimes(2);
      expect(captured?.[0].value).toEqual(DENIED);
    });
  },
);
