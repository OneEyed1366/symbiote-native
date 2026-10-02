// Svelte twin of `../react`'s `usePreventScreenCapture` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { preventScreenCaptureAsync, allowScreenCaptureAsync } = vi.hoisted(
  () => ({
    preventScreenCaptureAsync: vi.fn(),
    allowScreenCaptureAsync: vi.fn(),
  }),
);

vi.mock('../core', () => ({
  preventScreenCaptureAsync,
  allowScreenCaptureAsync,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_960;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('screen-capture-prevent');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('screen-capture-prevent');
  preventScreenCaptureAsync.mockResolvedValue(undefined);
  allowScreenCaptureAsync.mockResolvedValue(undefined);
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

describe('usePreventScreenCapture (Positive: prevents on mount, allows on unmount)', () => {
  it('prevents screen capture with the default key on mount', async () => {
    await mountApp(
      'default-key-app',
      `<script lang="ts">
         import { usePreventScreenCapture } from './use-prevent-screen-capture.svelte';
         usePreventScreenCapture();
       </script>`,
    );

    expect(preventScreenCaptureAsync).toHaveBeenCalledWith('default');
  });

  it('allows screen capture with the same key on unmount', async () => {
    await mountApp(
      'custom-key-app',
      `<script lang="ts">
         import { usePreventScreenCapture } from './use-prevent-screen-capture.svelte';
         usePreventScreenCapture('my-key');
       </script>`,
    );

    unmount(ROOT_TAG);

    expect(allowScreenCaptureAsync).toHaveBeenCalledWith('my-key');
  });
});
