// `layout-conformance` as a tag: the committed payload carries `mode` and keeps the children,
// `display: contents` is a C++ rule asserted in `layout-conformance-payload.itest.ts`
import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  seedWindowDimensions,
} from '@symbiote-native/test-utils';

import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_977;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const settle = async (): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

beforeEach(() => {
  fabric.reset();
  seedWindowDimensions();
});
afterEach(() => unmount(ROOT_TAG));

describe('Vue: the layout-conformance tag', () => {
  it('commits a LayoutConformance with its mode and its children', async () => {
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h('layout-conformance', { testID: 'lc', mode: 'strict' }, [
            h('view', { testID: 'inner' }),
          ]),
      }),
    );
    await settle();

    const wrapper = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'lc',
    );
    const inner = live.findLive(
      live.appRoot(),
      node => node.payload.testID === 'inner',
    );

    expect(wrapper?.viewName).toBe('LayoutConformance');
    expect(wrapper?.payload.mode).toBe('strict');
    expect(wrapper?.children).toHaveLength(1);
    expect(inner?.viewName).toBe('RCTView');
    expect(inner).toBeDefined();
  });
});
