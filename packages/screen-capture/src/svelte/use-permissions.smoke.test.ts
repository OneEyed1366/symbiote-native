// Svelte twin of `../react`'s `usePermissions` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { getPermissionsAsync, requestPermissionsAsync } = vi.hoisted(() => ({
  getPermissionsAsync: vi.fn(),
  requestPermissionsAsync: vi.fn(),
}));

vi.mock('../core', () => ({ getPermissionsAsync, requestPermissionsAsync }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_962;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};

let harness = createSvelteHarness('screen-capture-permissions');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('screen-capture-permissions');
  getPermissionsAsync.mockResolvedValue(GRANTED);
  requestPermissionsAsync.mockResolvedValue(GRANTED);
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

async function mountApp(name: string, appSource: string): Promise<void> {
  const app = harness.compileSource(__dirname, name, appSource);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

const PROBE_APP = `<script lang="ts">
   import { usePermissions } from './use-permissions.svelte';
   const permissions = usePermissions();
   Object.assign(globalThis, {
     __capturedStatus: () => permissions.status,
     __capturedError: () => permissions.error,
   });
 </script>`;

describe('usePermissions (Positive: auto-fetches on mount)', () => {
  it('resolves the current status', async () => {
    await mountApp('probe-app', PROBE_APP);
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(captured?.()).toEqual(GRANTED);
  });
});

describe('usePermissions (Negative: an auto-fetch failure surfaces as `error`)', () => {
  it('surfaces an auto-fetch rejection as `error` and leaves status null', async () => {
    getPermissionsAsync.mockRejectedValueOnce(
      new Error('permission query failed'),
    );

    await mountApp('error-app', PROBE_APP);
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;
    const capturedError = (
      globalThis as { __capturedError?: () => { message: string } | null }
    ).__capturedError;

    expect(capturedError?.()?.message).toBe('permission query failed');
    expect(captured?.()).toBeNull();
  });
});
