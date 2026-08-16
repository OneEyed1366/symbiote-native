// Co-located Vue-driven test (ADR 0025) for usePermissions. See battery's
// use-battery-state.test.ts for the shared rationale.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric } from '@symbiote-native/test-utils';
import { usePermissions } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/vue/composables/use-battery-state's
// test uses for BatteryState.
vi.mock('../../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
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

const ROOT_TAG = 9954;
const fabric = installFabric();

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await` on the composable's own refs is too early to prove one did not happen.
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

function mountPermissions(): ReturnType<typeof usePermissions> {
  let result: ReturnType<typeof usePermissions> | undefined;
  mount(
    ROOT_TAG,
    defineComponent({
      setup: () => {
        result = usePermissions();
        return () => h('symbiote-text', {}, 'tracking-transparency');
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
    it('starts at null before the initial fetch resolves', () => {
      // why: a caller needs a distinct "don't know yet" state to render a neutral UI in, rather
      // than defaulting to either granted or denied before onMounted's fetch has settled.
      const { status } = mountPermissions();

      expect(status.value).toBe(null);
    });

    it('fetches the permission status exactly once on mount', async () => {
      // why: the composable's setup body runs once per component instance, so onMounted's fetch
      // must fire exactly once too — a repeated fetch would be a wasted native round-trip on
      // every screen that reads this composable.
      const { status } = mountPermissions();

      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('request() delegates to requestTrackingPermissionsAsync and updates the status', async () => {
      // why: the imperative request() is how a caller drives the actual OS permission prompt —
      // its result must land back in the same reactive `status` ref the initial fetch populated.
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await request();

      expect(status.value).toEqual(DENIED);
    });

    it('get() re-fetches and updates the status', async () => {
      // why: a caller returning from Settings (where the user may have changed the OS
      // permission outside the app) needs a way to refresh status without re-requesting it.
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await get();

      expect(status.value).toEqual(DENIED);
    });
  });

  describe('characterization', () => {
    it(
      // characterization: React's usePermissions guards against a late setStatus with an
      // isMounted ref; this composable has no equivalent guard — status.value is written
      // unconditionally whenever the promise resolves, mount state notwithstanding. Writing a
      // bare Vue ref after its owning component unmounted doesn't throw (there's simply no
      // template left to react to it), so this isn't a crash — but it's a structural asymmetry
      // with the React wrapper. [characterization — behavior not confirmed as intentional]
      'updates status.value even after the component has already unmounted',
      async () => {
        // QUESTION: is skipping the post-unmount write (React's approach) actually required here,
        // or is writing a now-orphaned ref harmless enough that Vue's composable intentionally
        // omits the guard? Worth confirming with whoever owns the adapter parity contract.
        let resolveFetch: (value: PermissionResponse) => void = () => {};
        getTrackingPermissionsAsync.mockReturnValueOnce(
          new Promise(resolve => {
            resolveFetch = resolve;
          }),
        );

        const { status } = mountPermissions();
        unmount(ROOT_TAG);

        expect(() => resolveFetch(GRANTED)).not.toThrow();
        await vi.waitFor(() => expect(status.value).toEqual(GRANTED));
      },
    );
  });

  // get()/request() are called directly here — neither catches a rejection from core, so it
  // propagates to this caller. onMounted's fetch is the one exception: nobody can await it, so it
  // routes its failure into `error` instead of letting it escape unhandled.
  describe('Negative', () => {
    it('get() propagates a native failure to its caller without updating the status', async () => {
      // why: a rejection from a direct get() call must reach the caller so it can react (e.g.
      // show an error), and the last-known status must not be silently overwritten.
      const { status, get } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      await expect(get()).rejects.toThrow('native call failed');

      expect(status.value).toEqual(GRANTED);
    });

    it('request() propagates a native failure to its caller without updating the status', async () => {
      const { status, request } = mountPermissions();
      await vi.waitFor(() => expect(status.value).toEqual(GRANTED));

      requestTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      await expect(request()).rejects.toThrow('native call failed');

      expect(status.value).toEqual(GRANTED);
    });

    it('surfaces a mount-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: onMounted's auto-fetch has no caller to reject to. It used to be `void get()`, so a
      // native rejection escaped the composable entirely as an unhandled promise rejection and
      // left `status` at null — indistinguishable from "still fetching".
      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      const { status, error } = mountPermissions();
      const unhandled = await collectUnhandledRejections(async () => {
        await vi.waitFor(() => expect(error.value?.message).toBe('native call failed'));
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(status.value).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed mount fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      const { status, error, get } = mountPermissions();
      await vi.waitFor(() => expect(error.value).not.toBe(null));

      await get();

      expect(error.value).toBe(null);
      expect(status.value).toEqual(GRANTED);
    });
  });
});
