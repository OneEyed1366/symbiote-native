// `layout-conformance` as a tag: the committed payload carries `mode` and keeps the children,
// `display: contents` is a C++ rule asserted in `layout-conformance-payload.itest.ts`
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_979;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Solid: the layout-conformance tag', () => {
  it('commits a LayoutConformance with its mode and its children', async () => {
    mount(ROOT_TAG, () => (
      <layout-conformance testID="lc" mode="strict">
        <view testID="inner" />
      </layout-conformance>
    ));
    await tick();

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
