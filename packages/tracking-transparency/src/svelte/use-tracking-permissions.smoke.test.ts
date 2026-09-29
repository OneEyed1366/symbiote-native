// Svelte twin of `../react`'s `useTrackingPermissions` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const core = vi.hoisted(() => ({
  getTrackingPermissionsAsync: vi.fn(),
  requestTrackingPermissionsAsync: vi.fn(),
}));

vi.mock('../core/tracking-transparency', () => core);

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_957;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const GRANTED = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};
const DENIED = { ...GRANTED, granted: false, status: 'denied' };

let harness = createSvelteHarness('tracking-permissions');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('tracking-permissions');
  core.getTrackingPermissionsAsync.mockResolvedValue(DENIED);
  core.requestTrackingPermissionsAsync.mockResolvedValue(GRANTED);
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
   import { useTrackingPermissions } from './use-tracking-permissions.svelte';
   const permissions = useTrackingPermissions();
   Object.assign(globalThis, {
     __capturedStatus: () => permissions.status,
     __requestPermission: () => permissions.requestPermission(),
   });
 </script>`;

describe('useTrackingPermissions (Positive: resolves and requests permission)', () => {
  it('resolves the current status on mount by default', async () => {
    await mountApp('probe-app', PROBE_APP);
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(core.getTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(captured?.()).toEqual(DENIED);
  });

  it('updates the status when requestPermission is called imperatively', async () => {
    await mountApp('request-app', PROBE_APP);
    const requestPermission = (
      globalThis as { __requestPermission?: () => Promise<unknown> }
    ).__requestPermission;
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    await requestPermission?.();
    await tick();

    expect(core.requestTrackingPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(captured?.()).toEqual(GRANTED);
  });
});
