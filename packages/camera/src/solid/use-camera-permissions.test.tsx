// Solid twin of `../react`'s camera permission hooks test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { IPermissionHookBehavior } from '@symbiote-native/engine';
import type { PermissionResponse } from 'expo-modules-core';

const methods = vi.hoisted(() => ({
  cameraGet: vi.fn(),
  cameraRequest: vi.fn(),
  microphoneGet: vi.fn(),
  microphoneRequest: vi.fn(),
}));

vi.mock('../core/camera-api', () => ({
  cameraPermissionMethods: {
    getMethod: methods.cameraGet,
    requestMethod: methods.cameraRequest,
  },
  microphonePermissionMethods: {
    getMethod: methods.microphoneGet,
    requestMethod: methods.microphoneRequest,
  },
}));

const hooks = await import('./use-camera-permissions');

const ROOT_TAG = 1816;
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
    name: 'useCameraPermissions',
    use: hooks.useCameraPermissions,
    get: methods.cameraGet,
    request: methods.cameraRequest,
  },
  {
    name: 'useMicrophonePermissions',
    use: hooks.useMicrophonePermissions,
    get: methods.microphoneGet,
    request: methods.microphoneRequest,
  },
];

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
});

afterEach(() => unmount(ROOT_TAG));

describe.each(CASES)('$name', ({ use, get, request }) => {
  let captured: ReturnType<typeof use> | undefined;
  let options: IPermissionHookBehavior | undefined;

  function Probe(): null {
    captured = use(options);
    return null;
  }

  function mountHarness(): void {
    mount(ROOT_TAG, () => <Probe />);
  }

  beforeEach(() => {
    captured = undefined;
    options = undefined;
    get.mockResolvedValue(DENIED);
    request.mockResolvedValue(GRANTED);
  });

  it('resolves the current status on mount by default', async () => {
    mountHarness();
    expect(captured?.[0]()).toBeNull();

    await tick();

    expect(get).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(captured?.[0]()).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    options = { request: true };
    mountHarness();
    await tick();

    expect(request).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    expect(captured?.[0]()).toEqual(GRANTED);
  });

  it('does nothing on mount when both get and request are false', async () => {
    options = { get: false };
    mountHarness();
    await tick();

    expect(get).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(captured?.[0]()).toBeNull();
  });

  it('updates the status when the permission is requested by hand', async () => {
    mountHarness();
    await tick();

    await captured?.[1]();
    await tick();

    expect(request).toHaveBeenCalledTimes(1);
    expect(captured?.[0]()).toEqual(GRANTED);
  });
});
