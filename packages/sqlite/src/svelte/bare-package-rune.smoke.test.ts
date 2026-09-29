// A `.svelte.ts` rune module reached through a bare package specifier must be desugared like
// Metro does, not loaded raw

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const getMethod = vi.fn();
const requestMethod = vi.fn();

const GRANTED = { granted: true };
const DENIED = { granted: false };

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_995;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('bare-package-rune');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('bare-package-rune');
  getMethod.mockResolvedValue(DENIED);
  requestMethod.mockResolvedValue(GRANTED);
  Object.assign(globalThis, {
    __getMethod: getMethod,
    __requestMethod: requestMethod,
  });
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const PROBE_APP = `<script lang="ts">
   import { createPermissionHook } from '@symbiote-native/svelte/runes/create-permission-hook';
   const usePermission = createPermissionHook({
     getMethod: (globalThis as any).__getMethod,
     requestMethod: (globalThis as any).__requestMethod,
   });
   const permission = usePermission();
   Object.assign(globalThis, {
     __capturedStatus: () => permission.status,
     __requestPermission: () => permission.requestPermission(),
   });
 </script>`;

async function mountProbe(): Promise<void> {
  const app = harness.compileSource(__dirname, 'probe-app', PROBE_APP);
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('rune module imported by package name (Positive)', () => {
  it('desugars `$state`/`$effect` so the hook resolves the status on mount', async () => {
    await mountProbe();
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    expect(getMethod).toHaveBeenCalledTimes(1);
    expect(captured?.()).toEqual(DENIED);
  });

  it('keeps the reactive box live after an imperative request', async () => {
    await mountProbe();
    const requestPermission = (
      globalThis as { __requestPermission?: () => Promise<unknown> }
    ).__requestPermission;
    const captured = (globalThis as { __capturedStatus?: () => unknown })
      .__capturedStatus;

    await requestPermission?.();
    await tick();

    expect(captured?.()).toEqual(GRANTED);
  });
});
