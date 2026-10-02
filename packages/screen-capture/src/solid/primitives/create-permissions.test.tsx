// Solid twin of `@symbiote-native/brightness`'s `createPermissions` test

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/solid';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from '../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../../core', () => ({ getPermissionsAsync, requestPermissionsAsync }));

const { createPermissions } = await import('./create-permissions');

const ROOT_TAG = 1006;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED: PermissionResponse = {
  granted: true,
  status: 'granted' as PermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};

let captured: ReturnType<typeof createPermissions> | undefined;

function Probe(): null {
  captured = createPermissions();
  return null;
}

function mountHarness(): void {
  mount(ROOT_TAG, () => <Probe />);
}

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  captured = undefined;
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
});

describe('createPermissions (Positive: fetches synchronously, request/get update status)', () => {
  it('resolves the current status', async () => {
    mountHarness();
    await tick();

    expect(captured?.status()).toEqual(GRANTED);
  });
});

describe('createPermissions (Negative: an auto-fetch failure surfaces as `error`)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mountHarness();
    await tick();

    expect(captured?.error()?.message).toBe('permission query failed');
    expect(captured?.status()).toBeNull();
  });
});
