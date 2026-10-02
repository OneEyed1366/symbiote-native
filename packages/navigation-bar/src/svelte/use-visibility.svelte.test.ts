// Svelte twin of the `../react`/`../vue`/`../solid` visibility hook tests, driven through the
// real compiler and slot

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

const { addVisibilityListener, getVisibilityAsync } = vi.hoisted(() => ({
  addVisibilityListener: vi.fn(),
  getVisibilityAsync: vi.fn(),
}));

vi.mock('../core', () => ({ addVisibilityListener, getVisibilityAsync }));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_931;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

type IVisibilityListener = (event: {
  visibility: string;
  rawVisibility: number;
}) => void;

let harness = createSvelteHarness('navigation-bar');
let capturedListener: IVisibilityListener | undefined;
let removeListenerSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fabric.reset();
  vi.clearAllMocks();
  harness = createSvelteHarness('navigation-bar');
  capturedListener = undefined;
  removeListenerSpy = vi.fn();
  getVisibilityAsync.mockResolvedValue('visible');
  addVisibilityListener.mockImplementation((listener: IVisibilityListener) => {
    capturedListener = listener;
    return { remove: removeListenerSpy };
  });
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
   import { useVisibility } from './use-visibility.svelte';
   const visibility = useVisibility();
   Object.assign(globalThis, { __capturedVisibility: () => visibility.current });
 </script>`;

describe('useVisibility (Positive: resolves, tracks, and cleans up)', () => {
  it('starts null before the initial async read resolves', async () => {
    const app = harness.compileSource(__dirname, 'probe-app', PROBE_APP);
    mount(ROOT_TAG, await loadComponent(app));
    const captured = (
      globalThis as { __capturedVisibility?: () => string | null }
    ).__capturedVisibility;

    expect(captured?.()).toBeNull();
    await tick();
    await tick();
  });

  it('resolves to the current visibility once the initial read completes', async () => {
    await mountApp('probe-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedVisibility?: () => string | null }
    ).__capturedVisibility;

    expect(captured?.()).toBe('visible');
  });

  it('updates when the listener fires', async () => {
    await mountApp('listener-app', PROBE_APP);
    const captured = (
      globalThis as { __capturedVisibility?: () => string | null }
    ).__capturedVisibility;

    capturedListener?.({ visibility: 'hidden', rawVisibility: 0 });
    await tick();

    expect(captured?.()).toBe('hidden');
  });

  it('removes the listener on unmount', async () => {
    await mountApp('cleanup-app', PROBE_APP);

    unmount(ROOT_TAG);

    expect(removeListenerSpy).toHaveBeenCalledTimes(1);
  });
});
