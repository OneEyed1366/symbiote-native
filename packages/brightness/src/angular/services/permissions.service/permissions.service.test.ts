// Co-located Angular-driven test (ADR 0025) for PermissionsService. See battery's
// battery-state.service.test.ts for the shared rationale.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/angular/services/battery-state.service's
// test uses for BatteryState. Mocking core here means the actual permission-request/native-call
// logic (throw/clamp/platform contracts) stays out of scope — that's core/brightness.test.ts's
// job. This file tests only the service's own lifecycle wiring around whatever core resolves or
// rejects with.
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

const ROOT_TAG = 973;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService: PermissionsService | undefined;

// Node only reports an unhandled rejection a macrotask after the promise settles, so a plain
// `await tick()` on the service's own signals is too early to prove one did not happen.
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

@Component({
  selector: 'symbiote-permissions-host',
  standalone: true,
  template: '',
})
class PermissionsHost {
  readonly service = inject(PermissionsService);
  readonly status = this.service.connect();

  constructor() {
    capturedStatus = this.status;
    capturedService = this.service;
  }
}

beforeEach(() => {
  capturedStatus = undefined;
  capturedService = undefined;
  vi.clearAllMocks();
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('PermissionsService.connect', () => {
  describe('Positive', () => {
    // why: the status must read as "not yet known" (null), not a stale/default granted value,
    // during the gap between connect() and the async fetch resolving.
    it('reports null before the initial fetch resolves', () => {
      mount(ROOT_TAG, PermissionsHost);

      expect(capturedStatus?.()).toBe(null);
    });

    // why: connect()'s whole purpose is auto-fetching current status the first time it's called,
    // so a consuming component never has to remember to call get() itself.
    it('reports the fetched status once getPermissionsAsync() resolves', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      expect(capturedStatus?.()).toEqual(GRANTED);
      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    // why: connect() guards its auto-fetch behind `this.status() === null` (index.ts:20) — a
    // second connect() call (e.g. a second component injecting the same root-provided service)
    // must reuse the already-fetched status rather than re-querying native on every injection.
    it('does not re-fetch on a second connect() once status is already known', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedStatus?.()).toEqual(GRANTED);

      const secondStatus = capturedService?.connect();
      await tick();

      expect(secondStatus?.()).toEqual(GRANTED);
      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    // why: request() is how a consumer triggers the OS permission prompt — its result must
    // become the service's new status so every signal reader reflects the user's actual decision.
    it('request() delegates to core.requestPermissionsAsync and updates the signal', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      requestPermissionsAsync.mockResolvedValueOnce(DENIED);
      await capturedService?.request();

      expect(capturedStatus?.()).toEqual(DENIED);
    });

    // why: get() is the manual re-check path (e.g. after the user flips permission in OS
    // settings and returns to the app) — it must refresh status on demand, not just once at
    // first connect().
    it('get() re-fetches and updates the signal', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      getPermissionsAsync.mockResolvedValueOnce(DENIED);
      await capturedService?.get();

      expect(capturedStatus?.()).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    // why: the service must not swallow a permission-call failure behind a resolved signal — a
    // caller awaiting request()/get() needs to see the real rejection to show an error, not a
    // silently-stuck GRANTED/DENIED value.
    it('request() propagates a native rejection instead of swallowing it', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedStatus?.()).toEqual(GRANTED);

      requestPermissionsAsync.mockRejectedValueOnce(
        new Error('permission request failed'),
      );

      await expect(capturedService?.request()).rejects.toThrow(
        'permission request failed',
      );
      // status must stay at the last known-good value, not be clobbered by the failed call
      expect(capturedStatus?.()).toEqual(GRANTED);
    });

    it('get() propagates a native rejection instead of swallowing it', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedStatus?.()).toEqual(GRANTED);

      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      await expect(capturedService?.get()).rejects.toThrow(
        'permission query failed',
      );
      expect(capturedStatus?.()).toEqual(GRANTED);
    });

    // why: connect()'s auto-fetch has no caller to reject to. It used to be `void this.get()`, so
    // a native rejection escaped the service entirely as an unhandled promise rejection and left
    // the signal at null — indistinguishable from "still fetching".
    it('surfaces an auto-fetch rejection as `error` instead of leaving it unhandled', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      mount(ROOT_TAG, PermissionsHost);
      const unhandled = await collectUnhandledRejections(async () => {
        await tick();
      });

      expect(unhandled).toEqual([]);
      expect(capturedService?.error()?.message).toBe('permission query failed');
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(capturedStatus?.()).toBe(null);
    });

    // why: the auto-fetch used to be guarded on `status() === null`, which a failed fetch never
    // clears — so every later connect() fired another native call, unbounded once connect() is
    // reached from a change-detected expression instead of a field initializer.
    it('does not retry the auto-fetch on a later connect() after it failed', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      capturedService?.connect();
      await tick();

      expect(getPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(capturedStatus?.()).toBe(null);
    });

    // why: a consumer that retries by hand after a failed auto-fetch must end up with a clean
    // slate — a stale error next to a freshly fetched status would keep reading as "broken".
    it('clears the recorded error once a later get() succeeds', async () => {
      getPermissionsAsync.mockRejectedValueOnce(
        new Error('permission query failed'),
      );
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedService?.error()).not.toBe(null);

      await capturedService?.get();

      expect(capturedService?.error()).toBe(null);
      expect(capturedStatus?.()).toEqual(GRANTED);
    });
  });
});
