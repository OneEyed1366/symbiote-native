// Svelte twin of `../react`'s `useScreenshotListener` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { addScreenshotListener } = vi.hoisted(() => ({
  addScreenshotListener: vi.fn(),
}));

vi.mock('../core', () => ({ addScreenshotListener }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_961;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('screen-capture-listener');
let removeSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('screen-capture-listener');
  removeSpy = vi.fn();
  addScreenshotListener.mockReturnValue({ remove: removeSpy });
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

const APP_SOURCE = `<script lang="ts">
   import { useScreenshotListener } from './use-screenshot-listener.svelte';
   let calls = 0;
   useScreenshotListener(() => { calls += 1; });
   Object.assign(globalThis, { __calls: () => calls });
 </script>`;

describe('useScreenshotListener (Positive: subscribes on mount, unsubscribes on unmount)', () => {
  it('subscribes a listener on mount', async () => {
    await mountApp('mount-app', APP_SOURCE);

    expect(addScreenshotListener).toHaveBeenCalledTimes(1);
  });

  it('removes the subscription on unmount', async () => {
    await mountApp('unmount-app', APP_SOURCE);

    unmount(ROOT_TAG);

    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
