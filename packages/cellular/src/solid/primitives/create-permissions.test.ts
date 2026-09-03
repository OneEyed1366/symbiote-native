// Co-located Solid-driven test for createPermissions, the Solid twin of
// vue/composables/use-permissions' own test — same scenario list, driven through `createRoot` +
// an explicit `dispose` instead of mount/unmount, because this primitive renders nothing (no
// Fabric surface is involved, so no installFabric()).
//
// Mocks the whole core module (never expo-modules-core internals): the native-call contract is
// core/cellular.test.ts's job, this file covers only the primitive's own reactive lifecycle.

import { createEffect, createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionStatus, type PermissionResponse } from '../../core';
import { createPermissions } from './create-permissions';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../../core', () => ({
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

beforeEach(() => {
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

// `createEffect` is a USER effect: Solid defers it to the end of the enclosing `runUpdates`, so one
// created inside `createRoot`'s callback has not run yet when that callback returns. Every test
// therefore builds inside the root and asserts OUTSIDE it — the ordering a component gets, where
// effects flush after the render pass. Same helper as adapters/solid/src/primitives/primitives.test.ts.
function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await` on the primitive's own accessors is too early to prove one did not happen.
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

describe('createPermissions (Solid)', () => {
  describe('Positive', () => {
    // why: the status must read as "not yet known" (null), not a stale/default granted value,
    // during the gap between construction and the async fetch resolving.
    it('starts at null before the initial fetch resolves', () => {
      const { value, dispose } = inRoot(createPermissions);

      expect(value.status()).toBe(null);

      dispose();
    });

    // why: the primitive's whole purpose is fetching the current status without the consumer
    // remembering to call get(). A Solid body runs ONCE, so the value has to arrive through an
    // accessor — read here from a tracked scope too, since a value that only updates when polled
    // would never re-run a consumer's effect.
    it('fetches the permission status once and pushes it through the accessor', async () => {
      const seen: (PermissionResponse | null)[] = [];
      const { value, dispose } = inRoot(() => {
        const permissions = createPermissions();
        createEffect(() => {
          seen.push(permissions.status());
        });
        return permissions;
      });

      await vi.waitFor(() => expect(value.status()).toEqual(GRANTED));
      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([null, GRANTED]);

      dispose();
    });

    // why: request() is how a consumer triggers the OS permission prompt — its result must become
    // the primitive's new status so a tracked read reflects the user's actual decision.
    it('request() delegates to core.requestPermissionsAsync and updates the status', async () => {
      const { value, dispose } = inRoot(createPermissions);
      await vi.waitFor(() => expect(value.status()).toEqual(GRANTED));

      requestPermissionsAsync.mockResolvedValueOnce(DENIED);
      await value.request();

      expect(value.status()).toEqual(DENIED);

      dispose();
    });

    // why: get() is the manual re-check path (e.g. after the user flips permission in OS settings
    // and returns to the app) — it must refresh status on demand, not just once at construction.
    it('get() re-fetches and updates the status', async () => {
      const { value, dispose } = inRoot(createPermissions);
      await vi.waitFor(() => expect(value.status()).toEqual(GRANTED));

      getPermissionsAsync.mockResolvedValueOnce(DENIED);
      await value.get();

      expect(value.status()).toEqual(DENIED);

      dispose();
    });
  });

  describe('Negative', () => {
    // why: the primitive must not swallow a permission-call failure behind a resolved status — a
    // caller awaiting request()/get() needs to see the real rejection to show an error, not a
    // silently-stuck GRANTED/DENIED value.
    it('request() propagates a native rejection instead of swallowing it', async () => {
      const { value, dispose } = inRoot(createPermissions);
      await vi.waitFor(() => expect(value.status()).toEqual(GRANTED));

      requestPermissionsAsync.mockRejectedValueOnce(
        new Error('permission request failed'),
      );

      await expect(value.request()).rejects.toThrow(
        'permission request failed',
      );
      // status must stay at the last known-good value, not be clobbered by the failed call
      expect(value.status()).toEqual(GRANTED);

      dispose();
    });

    it('get() propagates a native rejection instead of swallowing it', async () => {
      const { value, dispose } = inRoot(createPermissions);
      await vi.waitFor(() => expect(value.status()).toEqual(GRANTED));

      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      await expect(value.get()).rejects.toThrow('permission query failed');
      expect(value.status()).toEqual(GRANTED);

      dispose();
    });

    // why: the body's automatic fetch has no caller to reject to. A bare `void get()` would let a
    // native rejection escape the primitive entirely as an unhandled promise rejection and leave
    // `status` at null — indistinguishable from "still fetching".
    it('surfaces the automatic fetch rejection as `error` instead of leaving it unhandled', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      const { value, dispose } = inRoot(createPermissions);
      const unhandled = await collectUnhandledRejections(async () => {
        await vi.waitFor(() =>
          expect(value.error()?.message).toBe('permission query failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(value.status()).toBe(null);

      dispose();
    });

    // why: a consumer that retries by hand after a failed automatic fetch must end up with a clean
    // slate — a stale error next to a freshly fetched status would keep reading as "broken".
    it('clears the recorded error once a later get() succeeds', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );
      const { value, dispose } = inRoot(createPermissions);
      await vi.waitFor(() => expect(value.error()).not.toBe(null));

      await value.get();

      expect(value.error()).toBe(null);
      expect(value.status()).toEqual(GRANTED);

      dispose();
    });
  });

  describe('Teardown', () => {
    // why: the fetch is async, so the owner can be disposed while it is still in flight — the
    // Solid equivalent of React's isMounted guard. Writing into a disposed scope is not an error
    // in Solid, so nothing would report the leak; only the accessor standing still proves it.
    it('drops a fetch that resolves after dispose', async () => {
      let resolveGet: (response: PermissionResponse) => void = () => {};
      getPermissionsAsync.mockImplementationOnce(
        () =>
          new Promise<PermissionResponse>(resolve => {
            resolveGet = resolve;
          }),
      );

      const { value, dispose } = inRoot(createPermissions);
      dispose();

      resolveGet(GRANTED);
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(value.status()).toBe(null);
    });
  });
});
