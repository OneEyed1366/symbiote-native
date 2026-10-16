// RN's `unstable_NativeText` and `unstable_NativeView` are its raw host components, the element
// types for `RCTText` and `RCTView`. Here the intrinsic tags already are those
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  unstable_NativeText,
  unstable_NativeView,
} from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_450;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('the raw host components', () => {
  it('unstable_NativeView commits an RCTView', async () => {
    mount(ROOT_TAG, createElement(unstable_NativeView));
    await tick();

    expect(fabric.find(node => node.viewName === 'RCTView')).toBeDefined();
  });

  it('unstable_NativeText commits an RCTText', async () => {
    mount(ROOT_TAG, createElement(unstable_NativeText, null, 'hi'));
    await tick();

    expect(fabric.find(node => node.viewName === 'RCTText')).toBeDefined();
  });
});
