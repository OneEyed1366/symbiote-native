// On iOS 26 the content of a compiled Svelte Stack screen sits in a safe area view in its wrapper

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import { childrenOf, setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig, ISymbioteNode } from '@symbiote-native/engine';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

vi.mock('../../core/screens-config', async importOriginal => ({
  ...(await importOriginal<object>()),
  isIOS26OrHigherForCurrentPlatform: true,
}));

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

const ROOT_TAG = 91_717;
const SAFE_AREA_VIEW = 'RNSSafeAreaView';
const WRAPPER_VIEW = 'RNSScreenContentWrapper';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {},
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: {} },
  [WRAPPER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
  [SAFE_AREA_VIEW]: {
    directEventTypes: {},
    validAttributes: { edges: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('safe-area');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('safe-area');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

function contains(root: ISymbioteNode, target: ISymbioteNode): boolean {
  return childrenOf(root).some(
    child => child === target || contains(child, target),
  );
}

describe('safe area view in a Svelte Stack screen on iOS 26', () => {
  it('wraps the screen component inside the content wrapper', async () => {
    const dir = __dirname;
    harness.compileSource(
      dir,
      'safe-area-leaf',
      `<view p={{ testID: 'leaf' }} />`,
    );
    const app = harness.compileSource(
      dir,
      'safe-area-app',
      `<script lang="ts">
         import Stack from './index.svelte';
         import Screen from '../screen.svelte';
         import Leaf from './safe-area-leaf.svelte';
       </script>
       <Stack><Screen name="home" component={Leaf} /></Stack>`,
    );
    mount(ROOT_TAG, await loadComponent(app));
    await tick();
    await tick();
    const wrapper = fabric.find(node => node.viewName === WRAPPER_VIEW);
    const safeArea = fabric.find(node => node.viewName === SAFE_AREA_VIEW);
    const leaf = fabric.find(node => node.props.testID === 'leaf');
    if (!wrapper || !safeArea || !leaf)
      throw new Error('screen did not render');

    expect(safeArea.props.edges).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    });
    expect(contains(wrapper.handle, safeArea.handle)).toBe(true);
    expect(contains(safeArea.handle, leaf.handle)).toBe(true);
  });
});
