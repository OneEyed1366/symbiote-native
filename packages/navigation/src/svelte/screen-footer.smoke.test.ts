// Svelte `ScreenFooter` through the real compiler against a fake Fabric, headless runs as iOS

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

const ROOT_TAG = 91_703;
const FOOTER_VIEW = 'RNSScreenFooter';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true, testID: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

let harness = createSvelteHarness('screen-footer');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('screen-footer');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const footerNode = () => fabric.find(node => node.viewName === FOOTER_VIEW);

async function mountFooter(attributes = ''): Promise<void> {
  const app = harness.compileSource(
    __dirname,
    `footer-app-${attributes.length}`,
    `<script lang="ts">
     import ScreenFooter from './screen-footer.svelte';
   </script>
   <ScreenFooter ${attributes}><view p={{ testID: 'inside' }} /></ScreenFooter>`,
  );
  mount(ROOT_TAG, await loadComponent(app));
  await tick();
  await tick();
}

describe('Svelte ScreenFooter', () => {
  it('mounts the native footer with its snippet inside', async () => {
    await mountFooter();

    expect(footerNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native footer', async () => {
    await mountFooter(`testID="sheet-footer" collapsable={false}`);

    expect(footerNode()?.props.testID).toBe('sheet-footer');
    expect(footerNode()?.props.collapsable).toBe(false);
  });
});
