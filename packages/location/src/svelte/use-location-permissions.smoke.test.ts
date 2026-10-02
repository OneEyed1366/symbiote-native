// Svelte twin of `../react`'s location permission hooks test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const core = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
  getBackgroundPermissionsAsync: vi.fn(),
  requestBackgroundPermissionsAsync: vi.fn(),
  getMotionActivityPermissionsAsync: vi.fn(),
  requestMotionActivityPermissionsAsync: vi.fn(),
}));

vi.mock('../core/location', () => core);

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_941;
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

const CASES = [
  {
    name: 'useForegroundPermissions',
    get: core.getForegroundPermissionsAsync,
    request: core.requestForegroundPermissionsAsync,
  },
  {
    name: 'useBackgroundPermissions',
    get: core.getBackgroundPermissionsAsync,
    request: core.requestBackgroundPermissionsAsync,
  },
  {
    name: 'useMotionActivityPermissions',
    get: core.getMotionActivityPermissionsAsync,
    request: core.requestMotionActivityPermissionsAsync,
  },
];

let harness = createSvelteHarness('location-permissions');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('location-permissions');
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

const probeApp = (hookName: string): string => `<script lang="ts">
   import { ${hookName} } from './use-location-permissions.svelte';
   const permissions = ${hookName}();
   Object.assign(globalThis, {
     __capturedStatus: () => permissions.status,
     __requestPermission: () => permissions.requestPermission(),
   });
 </script>`;

describe.each(CASES)(
  '$name (Positive: resolves and requests permission)',
  ({ name, get, request }) => {
    beforeEach(() => {
      get.mockResolvedValue(DENIED);
      request.mockResolvedValue(GRANTED);
    });

    it('resolves the current status on mount by default', async () => {
      await mountApp(`${name}-probe-app`, probeApp(name));
      const captured = (globalThis as { __capturedStatus?: () => unknown })
        .__capturedStatus;

      expect(get).toHaveBeenCalledTimes(1);
      expect(captured?.()).toEqual(DENIED);
    });

    it('updates the status when requestPermission is called imperatively', async () => {
      await mountApp(`${name}-request-app`, probeApp(name));
      const requestPermission = (
        globalThis as { __requestPermission?: () => Promise<unknown> }
      ).__requestPermission;
      const captured = (globalThis as { __capturedStatus?: () => unknown })
        .__capturedStatus;

      await requestPermission?.();
      await tick();

      expect(request).toHaveBeenCalledTimes(1);
      expect(captured?.()).toEqual(GRANTED);
    });
  },
);
