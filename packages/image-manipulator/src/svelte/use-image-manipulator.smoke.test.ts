// Svelte twin of `../react`'s `useImageManipulator` test, driven through the real compiler

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { manipulate } = vi.hoisted(() => ({ manipulate: vi.fn() }));

vi.mock('../core', () => ({ manipulate }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_950;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('image-manipulator');

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('image-manipulator');
  manipulate.mockImplementation(() => ({ release: vi.fn() }));
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
   import { useImageManipulator } from './use-image-manipulator.svelte';
   let source = $state('uri-1');
   const manipulator = useImageManipulator(() => source);
   Object.assign(globalThis, {
     __capturedContext: () => manipulator.current,
     __setSource: (next: string) => { source = next; },
   });
 </script>`;

describe('useImageManipulator (Positive: creates once, recreates on source change, releases the stale one)', () => {
  it('creates a context for the initial source', async () => {
    await mountApp('probe-app', PROBE_APP);

    expect(manipulate).toHaveBeenCalledWith('uri-1');
  });

  it('recreates and releases the stale context when the source changes', async () => {
    await mountApp('change-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedContext?: () => { release: () => void } }
    ).__capturedContext;
    const setSource = (globalThis as { __setSource?: (next: string) => void })
      .__setSource;
    const stale = captured?.();

    setSource?.('uri-2');
    await tick();

    expect(captured?.()).not.toBe(stale);
    expect(stale?.release).toHaveBeenCalledTimes(1);
  });

  it('releases the current context on unmount', async () => {
    await mountApp('unmount-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedContext?: () => { release: () => void } }
    ).__capturedContext;
    const current = captured?.();

    unmount(ROOT_TAG);

    expect(current?.release).toHaveBeenCalledTimes(1);
  });
});
