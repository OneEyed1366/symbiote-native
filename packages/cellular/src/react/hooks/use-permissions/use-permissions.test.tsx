// Co-located React-driven test (ADR 0025) for usePermissions. See
// packages/battery/src/react/hooks/use-battery-state/use-battery-state.test.tsx for the shared
// rationale (mocks `core`, not expo-modules-core internals), adapted here to test the
// get/request permission pair instead of a listener subscription.

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
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

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(async () => GRANTED),
  requestPermissionsAsync: vi.fn(async () => GRANTED),
}));

vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
}));

const ROOT_TAG = 953;

let latestStatus: IPermissionResponse | null = null;
let requestFn: (() => Promise<IPermissionResponse>) | undefined;
let getFn: (() => Promise<IPermissionResponse>) | undefined;

function Probe(): ReactElement {
  const [status, request, get] = usePermissions();
  latestStatus = status;
  requestFn = request;
  getFn = get;
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  latestStatus = null;
  requestFn = undefined;
  getFn = undefined;
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('usePermissions', () => {
  it('starts at null before the initial getPermissionsAsync() resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(latestStatus).toBeNull();
  });

  it('fetches the permission status on mount', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));
    expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('requestPermission() re-fetches and updates the status', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

    requestPermissionsAsync.mockResolvedValueOnce(DENIED);
    await requestFn?.();

    await vi.waitFor(() => expect(latestStatus).toEqual(DENIED));
  });

  it('getPermission() re-fetches and updates the status', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

    getPermissionsAsync.mockResolvedValueOnce(DENIED);
    await getFn?.();

    await vi.waitFor(() => expect(latestStatus).toEqual(DENIED));
  });

  it('does not update state after unmount', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

    unmount(ROOT_TAG);
    getPermissionsAsync.mockResolvedValueOnce(DENIED);
    await getFn?.();

    // state setter is guarded by isMounted, so the captured value from before unmount stands
    expect(latestStatus).toEqual(GRANTED);
  });
});
