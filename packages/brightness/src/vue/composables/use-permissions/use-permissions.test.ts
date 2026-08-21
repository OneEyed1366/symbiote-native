// Co-located Vue-driven test (ADR 0025) for usePermissions. See battery's
// use-battery-state.test.ts for the shared rationale.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/vue/composables/use-battery-state's
// test uses for BatteryState. Mocking core here means the actual permission-request/native-call
// logic (throw/clamp/platform contracts) stays out of scope — that's core/brightness.test.ts's
// job. This file tests only the composable's own lifecycle wiring around whatever core resolves
// or rejects with.
vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
}));

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

const ROOT_TAG = 9953;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await` on the composable's own refs is too early to prove one did not happen.
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

function mountPermissions(): ReturnType<typeof usePermissions> {
  let result: ReturnType<typeof usePermissions> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePermissions();
        return () => h('symbiote-text', {}, 'brightness');
      },
    }),
  );
  if (result === undefined) {
    throw new Error('setup() did not run');
  }
  return result;
}

describe('usePermissions (Vue)', () => {
  describe('Positive', () => {
    // why: the status must read as "not yet known" (null), not a stale/default granted value,
    // during the gap between mount and the async fetch resolving.
    it('starts at null before the initial fetch resolves', () => {
      const { status } = mountPermissions();

      expect(status.value).toBe(null);
    });

    // why: the composable's whole purpose is auto-fetching current status on mount, so the
    // consumer never has to remember to call get() themselves.
    it('fetches the permission status once on mount', async () => {
      const { status } = mountPermissions();

      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    // why: request() is how a consumer triggers the OS permission prompt — its result must
    // become the composable's new status so a re-render reflects the user's actual decision.
    it('request() delegates to core.requestPermissionsAsync and updates the status', async () => {
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestPermissionsAsync.mockResolvedValueOnce(DENIED);
      await request();

      expect(status.value).toEqual(DENIED);
    });

    // why: get() is the manual re-check path (e.g. after the user flips permission in OS
    // settings and returns to the app) — it must refresh status on demand, not just once at mount.
    it('get() re-fetches and updates the status', async () => {
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getPermissionsAsync.mockResolvedValueOnce(DENIED);
      await get();

      expect(status.value).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    // why: the composable must not swallow a permission-call failure behind a resolved status —
    // a caller awaiting request()/get() needs to see the real rejection to show an error, not a
    // silently-stuck GRANTED/DENIED value.
    it('request() propagates a native rejection instead of swallowing it', async () => {
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestPermissionsAsync.mockRejectedValueOnce(
        new Error('permission request failed'),
      );

      await expect(request()).rejects.toThrow('permission request failed');
      // status must stay at the last known-good value, not be clobbered by the failed call
      expect(status.value).toEqual(GRANTED);
    });

    it('get() propagates a native rejection instead of swallowing it', async () => {
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      await expect(get()).rejects.toThrow('permission query failed');
      expect(status.value).toEqual(GRANTED);
    });

    // why: onMounted's auto-fetch has no caller to reject to. It used to be `void get()`, so a
    // native rejection escaped the composable entirely as an unhandled promise rejection and left
    // `status` at null — indistinguishable from "still fetching".
    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      const { status, error } = mountPermissions();
      const unhandled = await collectUnhandledRejections(async () => {
        await vi.waitFor(() =>
          expect(error.value?.message).toBe('permission query failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(status.value).toBe(null);
    });

    // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
    // slate — a stale error next to a freshly fetched status would keep reading as "broken".
    it('clears the recorded error once a later get() succeeds', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );
      const { status, error, get } = mountPermissions();
      await vi.waitFor(() => expect(error.value).not.toBe(null));

      await get();

      expect(error.value).toBe(null);
      expect(status.value).toEqual(GRANTED);
    });
  });
});
