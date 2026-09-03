// Co-located Vue-driven test (ADR 0025) for usePermissions. See
// packages/battery/src/vue/composables/use-battery-state/use-battery-state.test.ts for the
// shared rationale, adapted here to test the get/request permission pair instead of a listener
// subscription.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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

const getPermissionsAsyncMock = vi.fn(async () => GRANTED);
const requestPermissionsAsyncMock = vi.fn(async () => GRANTED);

// This composable must defer the actual permission decision to core/cellular.ts — mocking
// `../../../core` (not expo-modules-core) proves the composable's own lifecycle in isolation from
// that logic, which core's own test suite already covers exhaustively.
vi.mock('../../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
}));

const ROOT_TAG = 9953;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  getPermissionsAsyncMock.mockClear();
  requestPermissionsAsyncMock.mockClear();
  getPermissionsAsyncMock.mockResolvedValue(GRANTED);
  requestPermissionsAsyncMock.mockResolvedValue(GRANTED);
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
        return () => h('symbiote-text', {}, 'cellular');
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
    it('starts at null before the initial get() resolves', () => {
      // why: a template reading `status?.granted` must see a distinct "not checked yet" state
      // instead of conflating it with "denied".
      const { status } = mountPermissions();

      expect(status.value).toBeNull();
    });

    it('fetches the permission status on mount', async () => {
      // why: the composable's whole reason to exist is fetching on onMounted without the caller
      // having to invoke get() itself for the first render.
      const { status } = mountPermissions();

      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
      expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('request() re-fetches and updates the ref', async () => {
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await request();

      expect(status.value).toEqual(DENIED);
    });

    it('get() re-fetches and updates the ref', async () => {
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await get();

      expect(status.value).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    it('propagates a rejection from request() without swallowing it, leaving the ref unchanged', async () => {
      // why: the composable must defer error handling to the caller, same as core — silently
      // catching a denied/failed permission request here would hide it from the app.
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission request failed'),
      );

      await expect(request()).rejects.toThrow('permission request failed');
      expect(status.value).toEqual(GRANTED);
    });

    it('propagates a rejection from get() without swallowing it, leaving the ref unchanged', async () => {
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission check failed'),
      );

      await expect(get()).rejects.toThrow('permission check failed');
      expect(status.value).toEqual(GRANTED);
    });

    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: onMounted's auto-fetch has no caller to reject to. It used to be `void get()`, so a
      // native rejection escaped the composable entirely as an unhandled promise rejection and
      // left `status` at null — indistinguishable from "still fetching".
      getPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission check failed'),
      );

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      const { status, error } = mountPermissions();
      const unhandled = await collectUnhandledRejections(async () => {
        await vi.waitFor(() =>
          expect(error.value?.message).toBe('permission check failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(status.value).toBeNull();
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getPermissionsAsyncMock.mockRejectedValueOnce(
        new Error('permission check failed'),
      );
      const { status, error, get } = mountPermissions();
      await vi.waitFor(() => expect(error.value).not.toBeNull());

      await get();

      expect(error.value).toBeNull();
      expect(status.value).toEqual(GRANTED);
    });
  });
});
