// RN's `experimental_LayoutConformance`: a native wrapper that takes `mode` and holds its children.
// `display: contents` is a C++ tag rule, asserted in `layout-conformance-payload.itest.ts`
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { installRecordingFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 90_460;
const VIEW_NAME = 'LayoutConformance';
const TAG = 'layout-conformance';
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('the layout-conformance tag', () => {
  it('commits a LayoutConformance with the mode it was given', async () => {
    mount(ROOT_TAG, createElement(TAG, { mode: 'strict' }));
    await tick();
    const wrapper = fabric.find(node => node.tagName === TAG);

    expect(wrapper?.viewName).toBe(VIEW_NAME);
    expect(wrapper?.props.mode).toBe('strict');
  });

  it('holds its children', async () => {
    mount(
      ROOT_TAG,
      createElement(
        TAG,
        { mode: 'strict' },
        createElement('view', { testID: 'inner' }),
      ),
    );
    await tick();

    expect(fabric.find(node => node.props.testID === 'inner')).toBeDefined();
  });
});
