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

// This hook must defer the actual permission decision to core/cellular.ts — mocking `../../../
// core` (not expo-modules-core) proves the hook's own lifecycle in isolation from that logic,
// which core's own test suite already covers exhaustively.
vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
}));

const ROOT_TAG = 953;

let latestStatus: IPermissionResponse | null = null;
let latestError: Error | null = null;
let requestFn: (() => Promise<IPermissionResponse>) | undefined;
let getFn: (() => Promise<IPermissionResponse>) | undefined;

function Probe(): ReactElement {
  const [status, request, get, error] = usePermissions();
  latestStatus = status;
  latestError = error;
  requestFn = request;
  getFn = get;
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
  latestStatus = null;
  latestError = null;
  requestFn = undefined;
  getFn = undefined;
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('usePermissions', () => {
  describe('Positive', () => {
    it('starts at null before the initial getPermissionsAsync() resolves', () => {
      // why: a consumer must be able to render a distinct "not checked yet" state instead of
      // conflating it with "denied".
      mount(ROOT_TAG, createElement(Probe));

      expect(latestStatus).toBeNull();
    });

    it('fetches the permission status on mount', async () => {
      // why: the hook's whole reason to exist is fetching without the consumer having to call
      // getPermission() itself on first render.
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
      // why: an in-flight getPermission() resolving after the component is gone must not call
      // setState on an unmounted component — the isMounted ref guard exists exactly for this.
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

      unmount(ROOT_TAG);
      getPermissionsAsync.mockResolvedValueOnce(DENIED);
      await getFn?.();

      // state setter is guarded by isMounted, so the captured value from before unmount stands
      expect(latestStatus).toEqual(GRANTED);
    });
  });

  describe('Negative', () => {
    it('propagates a rejection from requestPermission() without swallowing it, leaving status unchanged', async () => {
      // why: the hook must defer error handling to the caller, same as core — silently catching a
      // denied/failed permission request here would hide it from the app.
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

      requestPermissionsAsync.mockRejectedValueOnce(new Error('permission request failed'));

      await expect(requestFn?.()).rejects.toThrow('permission request failed');
      expect(latestStatus).toEqual(GRANTED);
    });

    it('propagates a rejection from getPermission() without swallowing it, leaving status unchanged', async () => {
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(latestStatus).toEqual(GRANTED));

      getPermissionsAsync.mockRejectedValueOnce(new Error('permission check failed'));

      await expect(getFn?.()).rejects.toThrow('permission check failed');
      expect(latestStatus).toEqual(GRANTED);
    });

    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: the mount-time auto-fetch has no caller to reject to. It used to be
      // `void getPermission()`, so a native rejection escaped the hook entirely as an unhandled
      // promise rejection and left `status` at null — indistinguishable from "still fetching".
      getPermissionsAsync.mockRejectedValueOnce(new Error('permission check failed'));

      const unhandled = await collectUnhandledRejections(async () => {
        mount(ROOT_TAG, createElement(Probe));
        await vi.waitFor(() => expect(latestError?.message).toBe('permission check failed'));
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(latestStatus).toBeNull();
    });

    it('clears the recorded error once a later getPermission() succeeds', async () => {
      // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getPermissionsAsync.mockRejectedValueOnce(new Error('permission check failed'));
      mount(ROOT_TAG, createElement(Probe));
      await vi.waitFor(() => expect(latestError).not.toBeNull());

      await getFn?.();

      await vi.waitFor(() => expect(latestError).toBeNull());
      expect(latestStatus).toEqual(GRANTED);
    });
  });
});
