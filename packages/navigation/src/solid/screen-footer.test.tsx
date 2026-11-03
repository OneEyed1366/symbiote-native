// Solid `ScreenFooter` against an injected ViewConfig, headless runs as iOS

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenFooter } from './screen-footer';

const ROOT_TAG = 7_123;
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

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const footerNode = () => fabric.find(node => node.viewName === FOOTER_VIEW);

describe('Solid ScreenFooter', () => {
  it('mounts the native footer with its children inside', async () => {
    mount(ROOT_TAG, () => (
      <ScreenFooter>
        <view testID="inside" />
      </ScreenFooter>
    ));
    await flush();

    expect(footerNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native footer', async () => {
    mount(ROOT_TAG, () => (
      <ScreenFooter testID="sheet-footer" collapsable={false} />
    ));
    await flush();

    expect(footerNode()?.props.testID).toBe('sheet-footer');
    expect(footerNode()?.props.collapsable).toBe(false);
  });
});
