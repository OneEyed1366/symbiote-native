// Co-located React-driven test (ADR 0025) for usePermissions. See battery's
// use-battery-state.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/react/hooks/use-battery-state's test
// uses for BatteryState — the mock factory's runtime object stands in for the real enum
// (imported here purely for its type), so `PermissionStatus.GRANTED` still type-checks.
vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
}));

const ROOT_TAG = 953;

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

const results: (PermissionResponse | null)[] = [];
let latestRequest: (() => Promise<PermissionResponse>) | undefined;
let latestGet: (() => Promise<PermissionResponse>) | undefined;

function Probe(): ReactElement {
  const [status, request, get] = usePermissions();
  results.push(status);
  latestRequest = request;
  latestGet = get;
  return createElement(View);
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  latestRequest = undefined;
  latestGet = undefined;
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('usePermissions', () => {
  it('starts at null before the initial fetch resolves', () => {
    mount(ROOT_TAG, createElement(Probe));

    expect(results[results.length - 1]).toBe(null);
  });

  it('fetches the permission status once on mount', async () => {
    mount(ROOT_TAG, createElement(Probe));

    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));
    expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('request() delegates to requestPermissionsAsync and updates the status', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

    requestPermissionsAsync.mockResolvedValueOnce(DENIED);
    await latestRequest?.();

    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(DENIED));
  });

  it('get() re-fetches and updates the status', async () => {
    mount(ROOT_TAG, createElement(Probe));
    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

    getPermissionsAsync.mockResolvedValueOnce(DENIED);
    await latestGet?.();

    await vi.waitFor(() => expect(results[results.length - 1]).toEqual(DENIED));
  });
});
