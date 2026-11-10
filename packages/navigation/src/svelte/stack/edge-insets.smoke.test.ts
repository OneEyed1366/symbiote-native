// Inset application of a nested compiled Svelte Stack, the inner header reads the outer one

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_716;
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {},
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: {},
    validAttributes: {
      consumeTopInset: true,
      consumeLeftInset: true,
      consumeRightInset: true,
      consumeBottomInset: true,
    },
  },
  RNSScreenContentWrapper: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('edge-insets');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('edge-insets');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

// Each case compiles under its own name, as the loader caches a component by file name
async function mountNested(caseName: string, outerOptions: string) {
  const dir = __dirname;
  harness.compileSource(dir, `${caseName}-leaf`, '<text>leaf</text>');
  harness.compileSource(
    dir,
    `${caseName}-inner`,
    `<script lang="ts">
       import Stack from './index.svelte';
       import Screen from '../screen.svelte';
       import Leaf from './${caseName}-leaf.svelte';
     </script>
     <Stack><Screen name="leaf" component={Leaf} /></Stack>`,
  );
  const app = harness.compileSource(
    dir,
    `${caseName}-app`,
    `<script lang="ts">
       import Stack from './index.svelte';
       import Screen from '../screen.svelte';
       import Inner from './${caseName}-inner.svelte';
     </script>
     <Stack><Screen name="home" component={Inner} options={${outerOptions}} /></Stack>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
  return fabric
    .findAll(node => node.viewName === HEADER_CONFIG_VIEW)
    .map(node => node.props);
}

describe('inset application in a nested Svelte Stack', () => {
  it('leaves the top inset to the outer header', async () => {
    const [outer, inner] = await mountNested('top', '{}');

    expect(outer.consumeTopInset).toBe(true);
    expect(inner.consumeTopInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(true);
  });

  it('passes an edge the outer screen opted out of down to the inner header', async () => {
    const [outer, inner] = await mountNested(
      'left',
      '{ disableLeftInsetApplication: true }',
    );

    expect(outer.consumeLeftInset).toBe(false);
    expect(inner.consumeLeftInset).toBe(false);
    expect(inner.consumeRightInset).toBe(true);
  });
});
