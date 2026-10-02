// React twin of expo-location's permission hooks, ported onto the shared `createPermissionHook`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
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

const ROOT_TAG = 987;
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
    let capturedOptions: Parameters<typeof use>[0];

    function Probe(): null {
      captured = use(capturedOptions);
      return null;
    }

    beforeEach(() => {
      captured = undefined;
      capturedOptions = undefined;
      get.mockResolvedValue(DENIED);
      request.mockResolvedValue(GRANTED);
    });

    it('resolves the current status on mount by default', async () => {
      mount(ROOT_TAG, <Probe />);
      expect(captured?.[0]).toBeNull();

      await tick();

      expect(get).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
      expect(captured?.[0]).toEqual(DENIED);
    });

    it('requests instead of fetching on mount when request is true', async () => {
      capturedOptions = { request: true };
      mount(ROOT_TAG, <Probe />);
      await tick();

      expect(request).toHaveBeenCalledTimes(1);
      expect(get).not.toHaveBeenCalled();
      expect(captured?.[0]).toEqual(GRANTED);
    });

    it('does nothing on mount when both get and request are false', async () => {
      capturedOptions = { get: false };
      mount(ROOT_TAG, <Probe />);
      await tick();

      expect(get).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
      expect(captured?.[0]).toBeNull();
    });

    it('updates the status when requestPermission is called imperatively', async () => {
      mount(ROOT_TAG, <Probe />);
      await tick();

      await captured?.[1]();
      await tick();

      expect(request).toHaveBeenCalledTimes(1);
      expect(captured?.[0]).toEqual(GRANTED);
    });

    it('updates the status when getPermission is called imperatively', async () => {
      get.mockResolvedValueOnce(GRANTED).mockResolvedValue(DENIED);
      mount(ROOT_TAG, <Probe />);
      await tick();

      await captured?.[2]();
      await tick();

      expect(get).toHaveBeenCalledTimes(2);
      expect(captured?.[0]).toEqual(DENIED);
    });
  },
);
