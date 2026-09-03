// Co-located Solid-driven test (ADR 0025) for createPermissions, the Solid twin of
// react/hooks/use-permissions, vue/composables/use-permissions and svelte/runes/use-permissions.
// Mirrors the Vue file's coverage group for group: Positive (seed, one auto-fetch, request/get),
// a characterization of the missing isMounted guard, and Negative (rejection routing).
//
// Driven with `createRoot` + an explicit dispose rather than a mounted component: this primitive
// renders nothing, so a root is the whole owner it needs.

import { createRoot } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPermissions } from './create-permissions';
import { PermissionStatus, type PermissionResponse } from '../../core';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } =
  vi.hoisted(() => ({
    getTrackingPermissionsAsync: vi.fn(),
    requestTrackingPermissionsAsync: vi.fn(),
  }));

// Same enum-shaped-object mock trick the Vue and React sibling tests use for PermissionStatus.
vi.mock('../../core', () => ({
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
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

function inRoot<T>(build: () => T): { value: T; dispose: () => void } {
  return createRoot(dispose => ({ value: build(), dispose }));
}

let disposeRoot: (() => void) | undefined;

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

beforeEach(() => {
  vi.clearAllMocks();
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  disposeRoot?.();
  disposeRoot = undefined;
});

describe('createPermissions (Solid)', () => {
  describe('Positive', () => {
    it('starts at null before the initial fetch resolves', () => {
      // why: a caller needs a distinct "don't know yet" state to render a neutral UI in, rather
      // than defaulting to either granted or denied before the auto-fetch has settled.
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;

      expect(permissions.status()).toBe(null);
    });

    it('fetches the permission status exactly once on creation', async () => {
      // why: a Solid primitive body runs once per owner, so the auto-fetch must fire exactly once
      // too — a repeated fetch would be a wasted native round-trip on every screen reading this.
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;

      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));
      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('request() delegates to requestTrackingPermissionsAsync and updates the status', async () => {
      // why: the imperative request() is how a caller drives the actual OS permission prompt —
      // its result must land back in the same accessor the initial fetch populated.
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));

      requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await permissions.request();

      expect(permissions.status()).toEqual(DENIED);
    });

    it('get() re-fetches and updates the status', async () => {
      // why: a caller returning from Settings (where the user may have changed the OS permission
      // outside the app) needs a way to refresh status without re-requesting it.
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));

      getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await permissions.get();

      expect(permissions.status()).toEqual(DENIED);
    });
  });

  describe('characterization', () => {
    it(// characterization: React's usePermissions guards a late setStatus with an isMounted ref;
    // this primitive has none — the signal is written unconditionally whenever the promise
    // resolves. In Solid that write is inert rather than merely harmless: a disposed root has no
    // subscribers left to notify, so nothing can observe it except a caller still holding the
    // accessor, as here. [characterization — behavior not confirmed as intentional]
    'updates the status accessor even after its root has already been disposed', async () => {
      // QUESTION: is skipping the post-dispose write (React's approach) actually required here,
      // or is writing an unobserved signal harmless enough to omit the guard, as Vue and Svelte
      // already do? Worth confirming with whoever owns the adapter parity contract.
      let resolveFetch: (value: PermissionResponse) => void = () => {};
      getTrackingPermissionsAsync.mockReturnValueOnce(
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
      );

      const { value: permissions, dispose } = inRoot(createPermissions);
      dispose();

      expect(() => resolveFetch(GRANTED)).not.toThrow();
      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));
    });
  });

  // get()/request() are called directly here — neither catches a rejection from core, so it
  // propagates to this caller. The auto-fetch is the one exception: nobody can await it, so it
  // routes its failure into `error` instead of letting it escape unhandled.
  describe('Negative', () => {
    it('get() propagates a native failure to its caller without updating the status', async () => {
      // why: a rejection from a direct get() call must reach the caller so it can react (e.g.
      // show an error), and the last-known status must not be silently overwritten.
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));

      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      await expect(permissions.get()).rejects.toThrow('native call failed');

      expect(permissions.status()).toEqual(GRANTED);
    });

    it('request() propagates a native failure to its caller without updating the status', async () => {
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      await vi.waitFor(() => expect(permissions.status()).toEqual(GRANTED));

      requestTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      await expect(permissions.request()).rejects.toThrow('native call failed');

      expect(permissions.status()).toEqual(GRANTED);
    });

    it('surfaces an auto-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: the auto-fetch has no caller to reject to. Without the catch a native rejection
      // escapes the primitive entirely as an unhandled promise rejection and leaves `status` at
      // null — indistinguishable from "still fetching".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );

      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      const unhandled = await collectUnhandledRejections(async () => {
        await vi.waitFor(() =>
          expect(permissions.error()?.message).toBe('native call failed'),
        );
      });

      expect(unhandled).toEqual([]);
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(permissions.status()).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed auto-fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      const { value: permissions, dispose } = inRoot(createPermissions);
      disposeRoot = dispose;
      await vi.waitFor(() => expect(permissions.error()).not.toBe(null));

      await permissions.get();

      expect(permissions.error()).toBe(null);
      expect(permissions.status()).toEqual(GRANTED);
    });
  });
});
