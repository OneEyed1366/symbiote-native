// Svelte twin of `../react`'s `useMediaLibraryPermissions` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { getMediaLibraryPermissionsAsync, requestMediaLibraryPermissionsAsync } =
  vi.hoisted(() => ({
    getMediaLibraryPermissionsAsync: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
  }));

vi.mock('../core', () => ({
  getMediaLibraryPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
}));

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
  accessPrivileges: 'all',
};
const DENIED = {
  ...GRANTED,
  granted: false,
  status: 'denied',
  accessPrivileges: 'none',
};

let harness = createSvelteHarness('image-picker-media-library');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('image-picker-media-library');
  getMediaLibraryPermissionsAsync.mockResolvedValue(DENIED);
  requestMediaLibraryPermissionsAsync.mockResolvedValue(GRANTED);
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

describe('useMediaLibraryPermissions (Positive: resolves, requests, and forwards writeOnly)', () => {
  it('resolves the current status on mount by default', async () => {
    await mountApp(
      'probe-app',
      `<script lang="ts">
         import { useMediaLibraryPermissions } from './use-media-library-permissions.svelte';
         const permissions = useMediaLibraryPermissions();
         Object.assign(globalThis, { __capturedStatus: () => permissions.status });
       </script>`,
    );
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(undefined);
    expect(captured?.()).toEqual(DENIED);
  });

  it('forwards writeOnly to the dispatched method on mount', async () => {
    await mountApp(
      'write-only-app',
      `<script lang="ts">
         import { useMediaLibraryPermissions } from './use-media-library-permissions.svelte';
         useMediaLibraryPermissions({ writeOnly: true });
       </script>`,
    );

    expect(getMediaLibraryPermissionsAsync).toHaveBeenCalledWith(true);
  });
});
