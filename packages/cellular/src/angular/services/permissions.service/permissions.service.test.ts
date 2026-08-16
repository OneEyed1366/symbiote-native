// Co-located Angular-driven test (ADR 0025) for PermissionsService. See
// packages/battery/src/angular/services/battery-state.service/battery-state.service.test.ts for
// the shared rationale, adapted here to test the get/request permission pair instead of a
// listener subscription.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';

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

// This service must defer the actual permission decision to core/cellular.ts — mocking `../../../
// core` (not expo-modules-core) proves the service's own lifecycle in isolation from that logic,
// which core's own test suite already covers exhaustively.
vi.mock('../../../core', () => ({
  getPermissionsAsync: () => getPermissionsAsyncMock(),
  requestPermissionsAsync: () => requestPermissionsAsyncMock(),
}));

const ROOT_TAG = 973;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedResult: Signal<IPermissionResponse | null> | undefined;
let capturedService: PermissionsService | undefined;

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await tick()` on the service's own signals is too early to prove one did not happen.
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

@Component({
  selector: 'symbiote-permissions-host',
  standalone: true,
  template: '',
})
class PermissionsHost {
  private readonly service = inject(PermissionsService);
  readonly status = this.service.connect();

  constructor() {
    capturedResult = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  fabric.reset();
  capturedResult = undefined;
  capturedService = undefined;
  getPermissionsAsyncMock.mockClear();
  requestPermissionsAsyncMock.mockClear();
  getPermissionsAsyncMock.mockResolvedValue(GRANTED);
  requestPermissionsAsyncMock.mockResolvedValue(GRANTED);
});

afterEach(() => unmount(ROOT_TAG));

describe('PermissionsService.connect', () => {
  describe('Positive', () => {
    it('starts at null before the initial get() resolves', () => {
      // why: a signal consumer's template must render a defined "unknown yet" state, not the
      // stale/undefined value React or Vue would leave, since Angular signals require an initial
      // value at construction time.
      mount(ROOT_TAG, PermissionsHost);

      expect(capturedResult?.()).toBeNull();
    });

    it('fetches the permission status once connect() is called', async () => {
      // why: connect() is the one lifecycle trigger — a consumer must not have to call get()
      // itself just to see the current status.
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      expect(capturedResult?.()).toEqual(GRANTED);
      expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch on a second connect() while a status is already cached', async () => {
      // why: connect() only calls get() when the signal is still null — a second injection point
      // reading the same service must reuse the cached status, not trigger a duplicate native
      // permission check.
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      getPermissionsAsyncMock.mockClear();

      capturedService?.connect();
      await tick();

      expect(getPermissionsAsyncMock).not.toHaveBeenCalled();
    });

    it('request() re-fetches and updates the signal', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      requestPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await capturedService?.request();

      expect(capturedResult?.()).toEqual(DENIED);
    });

    it('get() re-fetches and updates the signal', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      getPermissionsAsyncMock.mockResolvedValueOnce(DENIED);
      await capturedService?.get();

      expect(capturedResult?.()).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    it('propagates a rejection from request() without swallowing it, leaving the signal unchanged', async () => {
      // why: the service must defer error handling to the caller, same as core — silently
      // catching a denied/failed permission request here would hide it from the app.
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      requestPermissionsAsyncMock.mockRejectedValueOnce(new Error('permission request failed'));

      await expect(capturedService?.request()).rejects.toThrow('permission request failed');
      expect(capturedResult?.()).toEqual(GRANTED);
    });

    it('propagates a rejection from get() without swallowing it, leaving the signal unchanged', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      getPermissionsAsyncMock.mockRejectedValueOnce(new Error('permission check failed'));

      await expect(capturedService?.get()).rejects.toThrow('permission check failed');
      expect(capturedResult?.()).toEqual(GRANTED);
    });

    it('surfaces an auto-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: connect()'s auto-fetch has no caller to reject to. It used to be `void this.get()`,
      // so a native rejection escaped the service entirely as an unhandled promise rejection and
      // left the signal at null — indistinguishable from "still fetching".
      getPermissionsAsyncMock.mockRejectedValueOnce(new Error('permission check failed'));

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      mount(ROOT_TAG, PermissionsHost);
      const unhandled = await collectUnhandledRejections(async () => {
        await tick();
      });

      expect(unhandled).toEqual([]);
      expect(capturedService?.error()?.message).toBe('permission check failed');
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(capturedResult?.()).toBeNull();
    });

    it('does not retry the auto-fetch on a later connect() after it failed', async () => {
      // why: the auto-fetch used to be guarded on `status() === null`, which a failed fetch never
      // clears — so every later connect() fired another native call, unbounded once connect() is
      // reached from a change-detected expression instead of a field initializer.
      getPermissionsAsyncMock.mockRejectedValueOnce(new Error('permission check failed'));
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      capturedService?.connect();
      await tick();

      expect(getPermissionsAsyncMock).toHaveBeenCalledTimes(1);
      expect(capturedResult?.()).toBeNull();
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed auto-fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getPermissionsAsyncMock.mockRejectedValueOnce(new Error('permission check failed'));
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedService?.error()).not.toBeNull();

      await capturedService?.get();

      expect(capturedService?.error()).toBeNull();
      expect(capturedResult?.()).toEqual(GRANTED);
    });
  });
});
