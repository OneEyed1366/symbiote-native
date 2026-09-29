// Platform branching lives in core, here only the signal contract of the service

import '@angular/compiler';
import { Component, inject, type Signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/angular';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from 'expo-modules-core';

const core = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

vi.mock('../core/tracking-transparency', () => core);

const { TrackingPermissionsService } =
  await import('./tracking-permissions.service');

const GRANTED: PermissionResponse = {
  status: 'granted' as PermissionResponse['status'],
  granted: true,
  canAskAgain: true,
  expires: 'never',
};
const DENIED: PermissionResponse = {
  ...GRANTED,
  status: 'denied' as PermissionResponse['status'],
  granted: false,
};

const ROOT_TAG = 974;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let capturedStatus: Signal<PermissionResponse | null> | undefined;
let capturedService:
  InstanceType<typeof TrackingPermissionsService> | undefined;

// Node reports an unhandled rejection a macrotask after the promise settles
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
  selector: 'symbiote-tracking-permissions-host',
  standalone: true,
  template: '',
})
class PermissionsHost {
  readonly service = inject(TrackingPermissionsService);
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
  core.getTrackingPermissionsAsync.mockResolvedValue(GRANTED);
  core.requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  fabric.reset();
});

describe('TrackingPermissionsService.connect', () => {
  describe('Positive', () => {
    it('reports null before the initial fetch resolves', () => {
      mount(ROOT_TAG, PermissionsHost);

      expect(capturedStatus?.()).toBe(null);
    });

    it('reports the fetched status once the get call resolves', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      expect(capturedStatus?.()).toEqual(GRANTED);
      expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });

    it('does not re-fetch on a second connect() once a status is known', async () => {
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      await tick();

      expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    });
  });

  describe('Negative', () => {
    it('surfaces an auto-fetch rejection as `error` instead of leaving it unhandled', async () => {
      core.getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );

      mount(ROOT_TAG, PermissionsHost);
      const unhandled = await collectUnhandledRejections(async () => {
        await tick();
      });

      expect(unhandled).toEqual([]);
      expect(capturedService?.error()?.message).toBe('native call failed');
      expect(capturedStatus?.()).toBe(null);
    });

    it('does not retry the auto-fetch on a later connect() after it failed', async () => {
      core.getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
      );
      mount(ROOT_TAG, PermissionsHost);
      await tick();

      capturedService?.connect();
      capturedService?.connect();
      await tick();

      expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
      expect(capturedStatus?.()).toBe(null);
    });

    it('clears the recorded error once a later get() succeeds', async () => {
      core.getTrackingPermissionsAsync.mockRejectedValueOnce(
        new Error('native call failed'),
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

describe('TrackingPermissionsService.get', () => {
  it('re-fetches, updates the signal, and resolves with the fetched status', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    core.getTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await expect(capturedService?.get()).resolves.toEqual(DENIED);

    expect(capturedStatus?.()).toEqual(DENIED);
  });

  it('propagates a native failure to the caller without touching the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    core.getTrackingPermissionsAsync.mockRejectedValueOnce(
      new Error('native call failed'),
    );
    await expect(capturedService?.get()).rejects.toThrow('native call failed');

    expect(capturedStatus?.()).toEqual(GRANTED);
  });
});

describe('TrackingPermissionsService.request', () => {
  it('updates the signal and resolves with the request result', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    core.requestTrackingPermissionsAsync.mockResolvedValueOnce(DENIED);
    await expect(capturedService?.request()).resolves.toEqual(DENIED);

    expect(capturedStatus?.()).toEqual(DENIED);
  });

  it('propagates a native failure to the caller without touching the signal', async () => {
    mount(ROOT_TAG, PermissionsHost);
    await tick();

    core.requestTrackingPermissionsAsync.mockRejectedValueOnce(
      new Error('native call failed'),
    );
    await expect(capturedService?.request()).rejects.toThrow(
      'native call failed',
    );

    expect(capturedStatus?.()).toEqual(GRANTED);
  });
});
