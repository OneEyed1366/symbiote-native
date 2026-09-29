// Vue twin of `@symbiote-native/brightness`'s `usePermissions` test

import { defineComponent, h, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import type { PermissionResponse } from '../../../core';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../../../core', () => ({
  getPermissionsAsync,
  requestPermissionsAsync,
}));

const { usePermissions } = await import('./index');

const ROOT_TAG = 1003;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED: PermissionResponse = {
  granted: true,
  status: 'granted' as PermissionResponse['status'],
  canAskAgain: true,
  expires: 'never',
};

let captured: ReturnType<typeof usePermissions> | undefined;

function mountHarness(): void {
  const Probe = defineComponent(() => {
    captured = usePermissions();
    return (): VNode => h('text', 'probe');
  });
  mount(ROOT_TAG, { render: (): VNode => h(Probe) });
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

describe('usePermissions (Positive: auto-fetches on mount, request/get update status)', () => {
  it('resolves the current status on mount', async () => {
    mountHarness();
    expect(captured?.status.value).toBeNull();

    await tick();

    expect(captured?.status.value).toEqual(GRANTED);
  });
});

describe('usePermissions (Negative: an auto-fetch failure surfaces as `error`)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    mountHarness();
    await tick();

    expect(captured?.error.value?.message).toBe('permission query failed');
    expect(captured?.status.value).toBeNull();
  });
});
