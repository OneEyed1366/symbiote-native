// Co-located React-driven test (ADR 0025) for usePermissions. See battery's
// use-battery-state.test.tsx for the shared rationale (mocks `core`, not expo-modules-core
// internals).

import { createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } =
  vi.hoisted(() => ({
    getTrackingPermissionsAsync: vi.fn(),
    requestTrackingPermissionsAsync: vi.fn(),
  }));

// Same enum-shaped-object mock trick packages/battery/src/react/hooks/use-battery-state's test
// uses for BatteryState — the mock factory's runtime object stands in for the real enum
// (imported here purely for its type), so `PermissionStatus.GRANTED` still type-checks.
vi.mock('../../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

const ROOT_TAG = 954;

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
async function collectUnhandledRejections(
  run: () => Promise<void>,
): Promise<unknown[]> {
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
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('usePermissions', () => {
  describe('Positive', () => {
    it('starts at null before the initial fetch resolves', () => {
      // why: a caller (e.g. a permission-gated feature) must have a distinct "don't know yet"
      // state to render a neutral UI in, rather than defaulting to either granted or denied
      // before the native round-trip has actually happened.
      mount(ROOT_TAG, createElement(Probe));

      expect(results[results.length - 1]).toBe(null);
    });

    it('fetches the permission status exactly once on mount', async () => {
      // why: getPermission is wrapped in useCallback with an empty dep array specifically so the
      // mount effect's own [getPermission] dependency stays stable — a second fetch per mount
      // would be a wasted native round-trip on every screen that reads this hook.
      mount(ROOT_TAG, createElement(Probe));

      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(GRANTED),
      );
      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('request() delegates to requestTrackingPermissionsAsync and updates the status', async () => {
      // why: the imperative request() is how a caller drives the actual OS permission prompt —
      // its result must land back in the same reactive `status` the initial fetch populated, so
      // one UI branch works whether the status came from mount or from a user tapping "Allow".
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(GRANTED),
      );

      requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await latestRequest?.();

      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(DENIED),
      );
    });

    it('get() re-fetches and updates the status', async () => {
      // why: a caller returning from Settings (where the user may have changed the OS
      // permission outside the app) needs a way to refresh status without re-requesting it.
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(GRANTED),
      );

      getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await latestGet?.();

      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(DENIED),
      );
    });

    it('tolerates the initial fetch resolving after the component already unmounted', async () => {
      // why: the hook's isMounted ref exists specifically to skip setStatus once the component is
      // gone — mounting, unmounting before the fetch settles, and letting it resolve afterward
      // must not throw or otherwise break the surrounding app.
      let resolveFetch: (value: PermissionResponse) => void = () => {};
      getTrackingPermissionsAsync.mockReturnValueOnce(
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
      );

      mount(ROOT_TAG, createElement(Probe));
      unmount(ROOT_TAG);

      expect(() => resolveFetch(GRANTED)).not.toThrow();
    });
  });

  // get()/request() are called directly here — neither catches a rejection from core, so it
  // propagates to this caller. The mount-time auto-fetch is the one exception: nobody can await
  // it, so it routes its failure into `error` instead of letting it escape unhandled.
  describe('Negative', () => {
    it('get() propagates a native failure to its caller without updating the status', async () => {
      // why: a rejection from a direct get() call must reach the caller so it can react (e.g.
      // show an error), and the last-known status must not be silently overwritten by a failed
      // attempt.
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(GRANTED),
      );

      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      await expect(latestGet?.()).rejects.toThrow('native call failed');

      expect(results[results.length - 1]).toEqual(GRANTED);
    });

    it('request() propagates a native failure to its caller without updating the status', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() =>
        expect(results[results.length - 1]).toEqual(GRANTED),
      );

      requestTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      await expect(latestRequest?.()).rejects.toThrow('native call failed');

      expect(results[results.length - 1]).toEqual(GRANTED);
    });

    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: the mount-time auto-fetch has no caller to reject to. It used to be
      // `void getPermission()`, so a native rejection escaped the hook entirely as an unhandled
      // promise rejection and left `status` at null — indistinguishable from "still fetching".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );

      const unhandled = await collectUnhandledRejections(async () => {
        mount(ROOT_TAG, createElement(Probe));
        await vi.waitFor(() =>
          expect(errors[errors.length - 1]?.message).toBe('native call failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(results[results.length - 1]).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(errors[errors.length - 1]).not.toBe(null));

      await latestGet?.();

      await vi.waitFor(() => expect(errors[errors.length - 1]).toBe(null));
      expect(results[results.length - 1]).toEqual(GRANTED);
    });
  });
});
