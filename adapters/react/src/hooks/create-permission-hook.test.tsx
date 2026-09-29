// Every Expo-wrapper package's own permission hook (`useCameraPermissions`,
// `useCalendarPermissions`, ...) is a thin binding of this factory to its own `methods`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createPermissionHook } from './create-permission-hook';

type IFakePermission = { granted: boolean };
type IFakeOptions = { writeOnly?: boolean };

const getMethod = vi.fn();
const requestMethod = vi.fn();
const methods = { getMethod, requestMethod };

const GRANTED: IFakePermission = { granted: true };
const DENIED: IFakePermission = { granted: false };

const ROOT_TAG = 90_101;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let usePermission: ReturnType<
  typeof createPermissionHook<IFakePermission, IFakeOptions>
>;
let captured: ReturnType<typeof usePermission> | undefined;
let capturedBehavior: Parameters<typeof usePermission>[0];
let capturedOptions: Parameters<typeof usePermission>[1];

function Probe(): null {
  captured = usePermission(capturedBehavior, capturedOptions);
  return null;
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  usePermission = createPermissionHook(methods);
  captured = undefined;
  capturedBehavior = undefined;
  capturedOptions = undefined;
  getMethod.mockResolvedValue(DENIED);
  requestMethod.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createPermissionHook (Positive: resolves, requests, forwards methodOptions)', () => {
  it('resolves the current status on mount by default', async () => {
    mount(ROOT_TAG, <Probe />);
    expect(captured?.[0]).toBeNull();

    await tick();

    expect(getMethod).toHaveBeenCalledTimes(1);
    expect(requestMethod).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(DENIED);
  });

  it('requests instead of fetching on mount when request is true', async () => {
    capturedBehavior = { request: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(requestMethod).toHaveBeenCalledTimes(1);
    expect(getMethod).not.toHaveBeenCalled();
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('forwards methodOptions to the dispatched method', async () => {
    capturedOptions = { writeOnly: true };
    mount(ROOT_TAG, <Probe />);
    await tick();

    expect(getMethod).toHaveBeenCalledWith({ writeOnly: true });
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    mount(ROOT_TAG, <Probe />);
    await tick();

    await captured?.[1]();
    await tick();

    expect(requestMethod).toHaveBeenCalledTimes(1);
    expect(captured?.[0]).toEqual(GRANTED);
  });

  it('does not update state after unmount', async () => {
    let resolveGet: (value: IFakePermission) => void = () => {};
    getMethod.mockReturnValueOnce(
      new Promise(resolve => {
        resolveGet = resolve;
      }),
    );

    mount(ROOT_TAG, <Probe />);
    unmount(ROOT_TAG);
    resolveGet(DENIED);
    await tick();

    expect(captured?.[0]).toBeNull();
  });
});
