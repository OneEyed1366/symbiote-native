// Vue `ScreenFooter` against an injected ViewConfig, headless runs as iOS

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenFooter } from './screen-footer';

const ROOT_TAG = 7_122;
const FOOTER_VIEW = 'RNSScreenFooter';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true, testID: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const footerNode = () => fabric.find(node => node.viewName === FOOTER_VIEW);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountFooter(props: Record<string, unknown> = {}): Promise<void> {
  const App = defineComponent({
    setup: () => () =>
      h(ScreenFooter, props, {
        default: () => h('view', { testID: 'inside' }),
      }),
  });
  mount(ROOT_TAG, App);
  await tick();
}

describe('Vue ScreenFooter', () => {
  it('mounts the native footer with its slot inside', async () => {
    await mountFooter();

    expect(footerNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native footer', async () => {
    await mountFooter({ testID: 'sheet-footer', collapsable: false });

    expect(footerNode()?.props.testID).toBe('sheet-footer');
    expect(footerNode()?.props.collapsable).toBe(false);
  });
});
