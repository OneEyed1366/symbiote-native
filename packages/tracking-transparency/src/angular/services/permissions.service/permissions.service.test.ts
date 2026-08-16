// Co-located Angular-driven test (ADR 0025) for PermissionsService. See battery's
// battery-state.service.test.ts for the shared rationale.
//
// PermissionsService is a thin Angular lifecycle wrapper over
// core/tracking-transparency.ts's getTrackingPermissionsAsync/requestTrackingPermissionsAsync —
// the native-vs-platform branching, the all-zero-UUID mapping, and the UnavailabilityError
// contract are core's job and are covered by tracking-transparency.test.ts. These tests verify
// only the wrapper's own contract: the signal's null-until-resolved lifecycle, the single
// auto-fetch on connect(), and that get()/request() both update the signal and hand their result
// back to the caller.

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installFabric } from '@symbiote-native/test-utils';
import { PermissionsService } from './index';
import { PermissionStatus, type PermissionResponse } from '../../../core';

const { getTrackingPermissionsAsync, requestTrackingPermissionsAsync } = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

// Same enum-shaped-object mock trick packages/battery/src/angular/services/battery-state.service's
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

const ROOT_TAG = 974;
const fabric = installFabric();
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
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
  getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('PermissionsService.connect', () => {
  describe('Positive', () => {
    it('reports null before the initial fetch resolves', () => {
      // why: connect() kicks the fetch off but returns synchronously — a template reading the
      // signal on first render must see an explicit "not yet known" value, not stale/undefined.
      mount(ROOT_TAG, PermissionsHost);

      expect(capturedStatus?.()).toBe(null);
    });

    it('reports the fetched status once getTrackingPermissionsAsync() resolves', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      expect(capturedStatus?.()).toEqual(GRANTED);
      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch on a second connect() call once a status is already known', async () => {
      // why: the class comment documents this as an "auto-fetch once" service, unlike
      // BatteryStateService's ongoing subscription — a second inject().connect() (e.g. from a
      // sibling component) must reuse the already-fetched signal instead of firing a redundant
      // native permissions check.
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      await tick();

      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Negative', () => {
    it('surfaces an auto-fetch rejection as `error` instead of leaving it unhandled', async () => {
      // why: connect()'s auto-fetch has no caller to reject to. It used to be `void this.get()`,
      // so a native rejection escaped the service entirely as an unhandled promise rejection and
      // left the signal at null — indistinguishable from "still fetching".
      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));

      // mounted before the listener goes up, but the rejection can only be reported once the
      // microtask queue drains — no turn passes between these two lines
      mount(ROOT_TAG, PermissionsHost);
      const unhandled = await collectUnhandledRejections(async () => {
        await tick();
      });

      expect(unhandled).toEqual([]);
      expect(capturedService?.error()?.message).toBe('native call failed');
      // null status + non-null error is the pair a consumer reads as "the fetch failed"
      expect(capturedStatus?.()).toBe(null);
    });

    it('does not retry the auto-fetch on a later connect() after it failed', async () => {
      // why: the auto-fetch used to be guarded on `status() === null`, which a failed fetch never
      // clears — so every later connect() fired another native call, unbounded once connect() is
      // reached from a change-detected expression instead of a field initializer.
      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      capturedService?.connect();
      await tick();

      expect(getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(capturedStatus?.()).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      // why: a consumer that retries by hand after a failed auto-fetch must end up with a clean
      // slate — a stale error next to a freshly fetched status would keep reading as "broken".
      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      mount(ROOT_TAG, PermissionsHost);
      await tick();
      expect(capturedService?.error()).not.toBe(null);

      await capturedService?.get();

      expect(capturedService?.error()).toBe(null);
      expect(capturedStatus?.()).toEqual(GRANTED);
    });
  });
});

describe('PermissionsService.get', () => {
  describe('Positive', () => {
    it('re-fetches, updates the signal, and resolves with the fetched status', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await expect(capturedService?.get()).resolves.toEqual(DENIED);

      expect(capturedStatus?.()).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    it('propagates a native failure to the caller without touching the signal', async () => {
      // why: get() is called directly (unlike connect()'s fire-and-forget auto-fetch) — a
      // rejection here must reach the caller who can decide how to handle it, and the last-known
      // status must not be silently overwritten by a failed attempt.
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      getTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      await expect(capturedService?.get()).rejects.toThrow('native call failed');

      expect(capturedStatus?.()).toEqual(GRANTED);
    });
  });
});

describe('PermissionsService.request', () => {
  describe('Positive', () => {
    it('delegates to requestTrackingPermissionsAsync, updates the signal, and resolves with the result', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
      await expect(capturedService?.request()).resolves.toEqual(DENIED);

      expect(capturedStatus?.()).toEqual(DENIED);
    });
  });

  describe('Negative', () => {
    it('propagates a native failure to the caller without touching the signal', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      requestTrackingPermissionsAsync.mockRejectedValueOnce(new Error('native call failed'));
      await expect(capturedService?.request()).rejects.toThrow('native call failed');

      expect(capturedStatus?.()).toEqual(GRANTED);
    });
  });
});
