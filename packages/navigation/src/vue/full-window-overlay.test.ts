// Vue `FullWindowOverlay` against an injected ViewConfig, headless runs as iOS
// Core's own tests cover the Android fallback, this file proves the slot and window size wiring

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import { Dimensions } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { FullWindowOverlay } from './full-window-overlay';

const ROOT_TAG = 7_121;
const OVERLAY_VIEW = 'RNSFullWindowOverlay';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [OVERLAY_VIEW]: {
    directEventTypes: {},
    validAttributes: { accessibilityContainerViewIsModal: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const overlayNode = () => fabric.find(node => node.viewName === OVERLAY_VIEW);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountOverlay(
  props: Record<string, unknown> = {},
): Promise<void> {
  const App = defineComponent({
    setup: () => () =>
      h(FullWindowOverlay, props, {
        default: () => h('view', { testID: 'inside' }),
      }),
  });
  mount(ROOT_TAG, App);
  await tick();
}

describe('Vue FullWindowOverlay', () => {
  it('mounts the native overlay with its slot inside', async () => {
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
    await mountOverlay({ unstable_accessibilityContainerViewIsModal: false });

    expect(overlayNode()?.props.accessibilityContainerViewIsModal).toBe(false);
  });
});
