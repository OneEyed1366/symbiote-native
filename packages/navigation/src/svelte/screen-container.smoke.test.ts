// Svelte `ScreenContainer` through the real compiler against a fake Fabric, headless runs as iOS

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
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

const ROOT_TAG = 91_704;
const CONTAINER_VIEW = 'RNSScreenContainer';
const NAVIGATION_CONTAINER_VIEW = 'RNSScreenNavigationContainer';

const NATIVE_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { testID: true },
};
const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [CONTAINER_VIEW]: NATIVE_CONFIG,
  [NAVIGATION_CONTAINER_VIEW]: NATIVE_CONFIG,
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

let harness = createSvelteHarness('screen-container');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('screen-container');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const viewNamed = (viewName: string) =>
  fabric.find(node => node.viewName === viewName);

async function mountContainer(attributes = ''): Promise<void> {
  const app = harness.compileSource(
    __dirname,
    `container-app-${attributes.length}`,
    `<script lang="ts">
     import ScreenContainer from './screen-container.svelte';
   </script>
   <ScreenContainer ${attributes}><view p={{ testID: 'inside' }} /></ScreenContainer>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('Svelte ScreenContainer', () => {
  it('mounts the native container with its snippet inside', async () => {
    await mountContainer();

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('uses the two-state container on iOS for navigators showing one screen', async () => {
    await mountContainer('hasTwoStates');

    expect(viewNamed(NAVIGATION_CONTAINER_VIEW)).toBeDefined();
    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
  });

  it('renders a plain view when the app turns screens off', async () => {
    await mountContainer('enabled={false}');

    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native container', async () => {
    await mountContainer('testID="screens"');

    expect(viewNamed(CONTAINER_VIEW)?.props.testID).toBe('screens');
  });

  it('keeps the container flags off the native view', async () => {
    await mountContainer('enabled hasTwoStates={false}');

    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('enabled');
    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('hasTwoStates');
  });
});
