// Svelte `FullWindowOverlay` through the real compiler against a fake Fabric, headless runs as iOS
// Core's own tests cover the Android fallback, this file proves the snippet and window size wiring

import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Dimensions, setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import {
  createSvelteHarness,
  loadComponent,
} from './svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_702;
const OVERLAY_VIEW = 'RNSFullWindowOverlay';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [OVERLAY_VIEW]: {
    directEventTypes: {},
    validAttributes: { accessibilityContainerViewIsModal: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

const WINDOW_RUNE = '@symbiote-native/svelte/runes/use-window-dimensions';
const WINDOW_RUNE_SOURCE = resolve(
  __dirname,
  '../../../../adapters/svelte/src/runes/use-window-dimensions.svelte',
);

let harness = createSvelteHarness('full-window-overlay');

// The rune is a `.svelte.ts` module reached by package subpath, so the harness aliases it to
// a twin it compiled itself, as a bare `$state` outside a compiled file throws at runtime
function createHarness() {
  const aliases: Record<string, string> = {};
  const created = createSvelteHarness('full-window-overlay', aliases);
  aliases[WINDOW_RUNE] = created.compileFile(WINDOW_RUNE_SOURCE);
  return created;
}

beforeEach(() => {
  fabric.reset();
  harness = createHarness();
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const overlayNode = () => fabric.find(node => node.viewName === OVERLAY_VIEW);

async function mountOverlay(attributes = ''): Promise<void> {
  const app = harness.compileSource(
    __dirname,
    `overlay-app-${attributes.length}`,
    `<script lang="ts">
     import FullWindowOverlay from './full-window-overlay.svelte';
   </script>
   <FullWindowOverlay ${attributes}><view p={{ testID: 'inside' }} /></FullWindowOverlay>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('Svelte FullWindowOverlay', () => {
  it('mounts the native overlay with its snippet inside', async () => {
    await mountOverlay();

    expect(overlayNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('sizes the overlay to the window', async () => {
    await mountOverlay();

    const { width, height } = Dimensions.get('window');
    const entries = [overlayNode()?.props.style].flat(Infinity);
    expect(entries).toContainEqual(expect.objectContaining({ width, height }));
  });

  it('sends the modal flag under its native name', async () => {
    await mountOverlay('unstable_accessibilityContainerViewIsModal={false}');

    expect(overlayNode()?.props.accessibilityContainerViewIsModal).toBe(false);
  });
});
