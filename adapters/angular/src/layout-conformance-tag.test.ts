// `<layout-conformance>` through Angular's own renderer (JIT). Labels are `nativeID` because the
// element is a bare intrinsic tag, as in `touchable-native-feedback-tag.test.ts`
import '@angular/compiler';
import { Component, type Type } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

import './register';
import { SYMBIOTE_ELEMENTS } from './elements';
import { mount, unmount } from './render';

const ROOT_TAG = 9_981;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function flushUntilSettled(): Promise<void> {
  await tick();
  await tick();
  await tick();
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('Angular: the layout-conformance tag', () => {
  it('commits a LayoutConformance with its mode and its children', async () => {
    @Component({
      selector: 'layout-conformance-tag-fixture',
      standalone: true,
      imports: [SYMBIOTE_ELEMENTS],
      template: `
        <layout-conformance id="lc" mode="strict">
          <view id="inner"></view>
        </layout-conformance>
      `,
    })
    class Fixture {}

    mount(ROOT_TAG, Fixture satisfies Type<unknown>);
    await flushUntilSettled();

    const wrapper = live.findLive(
      live.appRoot(),
      node => node.payload.nativeID === 'lc',
    );
    const inner = live.findLive(
      live.appRoot(),
      node => node.payload.nativeID === 'inner',
    );

    expect(wrapper?.viewName).toBe('LayoutConformance');
    expect(wrapper?.payload.mode).toBe('strict');
    expect(wrapper?.children).toHaveLength(1);
    expect(inner?.viewName).toBe('RCTView');
    expect(inner).toBeDefined();
  });
});
