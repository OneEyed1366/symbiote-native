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
// This also means the actual permission-request/native-call logic (core's throw/clamp/platform
// contracts) is out of scope here by design — that's core/brightness.test.ts's job. This file
// tests only the hook's own lifecycle wiring around whatever core resolves or rejects with.
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
const errors: (Error | null)[] = [];
let latestRequest: (() => Promise<PermissionResponse>) | undefined;
let latestGet: (() => Promise<PermissionResponse>) | undefined;

function Probe(): ReactElement {
  const [status, request, get, error] = usePermissions();
  results.push(status);
  errors.push(error);
  latestRequest = request;
  latestGet = get;
  return createElement(View);
}

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await` on the hook's own state is too early to prove one did not happen.
async function collectUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
  const unhandled: unknown[] = [];
  const onUnhandledRejection = (reason: unknown): void => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await run();
    await new Promise(resolve => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
  return unhandled;
}

const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  results.length = 0;
  errors.length = 0;
  latestRequest = undefined;
  latestGet = undefined;
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('usePermissions', () => {
  describe('Positive', () => {
    // why: the status must read as "not yet known" (null), not a stale/default granted value,
    // during the gap between mount and the async fetch resolving.
    it('starts at null before the initial fetch resolves', () => {
      mount(ROOT_TAG, createElement(Probe));

      expect(results[results.length - 1]).toBe(null);
    });

    // why: the hook's whole purpose is auto-fetching current status on mount, so the consumer
    // never has to remember to call get() themselves.
    it('fetches the permission status once on mount', async () => {
      mount(ROOT_TAG, createElement(Probe));

      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));
      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    // why: request() is how a consumer triggers the OS permission prompt — its result must
    // become the hook's new status so a re-render reflects the user's actual decision.
    it('request() delegates to core.requestPermissionsAsync and updates the status', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

      requestPermissionsAsync.mockResolvedValueOnce(DENIED);
      await latestRequest?.();

      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(DENIED));
    });

    // why: get() is the manual re-check path (e.g. after the user flips permission in OS
    // settings and returns to the app) — it must refresh status on demand, not just once at mount.
    it('get() re-fetches and updates the status', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

      getPermissionsAsync.mockResolvedValueOnce(DENIED);
      await latestGet?.();

      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(DENIED));
    });

    // why: unmounting must stop the hook from calling setState on a component that no longer
    // exists — an in-flight get()/request() resolving after unmount must be a silent no-op, not
    // a React "state update on an unmounted component" warning/crash.
    it('does not update status after the component has unmounted', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

      let resolveGet!: (value: PermissionResponse) => void;
      getPermissionsAsync.mockReturnValueOnce(
        new Promise<PermissionResponse>(resolve => {
          resolveGet = resolve;
        }),
      );
      const pendingGet = latestGet?.();
      unmount(ROOT_TAG);
      resolveGet(DENIED);
      await pendingGet;

      expect(results[results.length - 1]).toEqual(GRANTED);
    });
  });

  describe('Negative', () => {
    // why: the hook must not swallow a permission-call failure behind a resolved status — a
    // caller awaiting request()/get() needs to see the real rejection to show an error, not a
    // silently-stuck GRANTED/DENIED value.
    it('request() propagates a native rejection instead of swallowing it', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

      requestPermissionsAsync.mockRejectedValueOnce(new Error('permission request failed'));

      await expect(latestRequest?.()).rejects.toThrow('permission request failed');
      // status must stay at the last known-good value, not be clobbered by the failed call
      expect(results[results.length - 1]).toEqual(GRANTED);
    });

    it('get() propagates a native rejection instead of swallowing it', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(results[results.length - 1]).toEqual(GRANTED));

      getPermissionsAsync.mockRejectedValueOnce(new Error('permission query failed'));

      await expect(latestGet?.()).rejects.toThrow('permission query failed');
      expect(results[results.length - 1]).toEqual(GRANTED);
    });

    // why: the mount-time auto-fetch has no caller to reject to. It used to be
    // `void getPermission()`, so a native rejection escaped the hook entirely as an unhandled
    // promise rejection and left `status` at null — indistinguishable from "still fetching".
    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      getPermissionsAsync.mockRejectedValueOnce(new Error('permission query failed'));

      const unhandled = await collectUnhandledRejections(async () => {
        mount(ROOT_TAG, createElement(Probe));
        await vi.waitFor(() =>
          expect(errors[errors.length - 1]?.message).toBe('permission query failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(results[results.length - 1]).toBe(null);
    });

    // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
    // slate — a stale error next to a freshly fetched status would keep reading as "broken".
    it('clears the recorded error once a later get() succeeds', async () => {
      getPermissionsAsync.mockRejectedValueOnce(new Error('permission query failed'));
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(errors[errors.length - 1]).not.toBe(null));

      await latestGet?.();

      await vi.waitFor(() => expect(errors[errors.length - 1]).toBe(null));
      expect(results[results.length - 1]).toEqual(GRANTED);
    });
  });
});
