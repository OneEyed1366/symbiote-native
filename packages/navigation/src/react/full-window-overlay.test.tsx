// React `FullWindowOverlay` against an injected ViewConfig, headless runs as iOS
// Core's own tests cover the Android fallback, this file proves the window size wiring

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import { Dimensions } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { FullWindowOverlay } from './full-window-overlay';

const ROOT_TAG = 7_120;
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

function overlayNode() {
  return fabric.find(node => node.viewName === OVERLAY_VIEW);
}

describe('React FullWindowOverlay', () => {
  it('mounts the native overlay with its children inside', () => {
    act(() => {
      mount(
        ROOT_TAG,
        createElement(
          FullWindowOverlay,
          {},
          createElement('view', { testID: 'inside' }),
        ),
      );
    });

    const overlay = overlayNode();
    expect(overlay).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('sizes the overlay to the window', () => {
    act(() => {
      mount(ROOT_TAG, createElement(FullWindowOverlay, {}));
    });

    const { width, height } = Dimensions.get('window');
    const entries = [overlayNode()?.props.style].flat(Infinity);
    expect(entries).toContainEqual({ width, height });
  });

  it('sends the modal flag under its native name', () => {
    act(() => {
      mount(
        ROOT_TAG,
        createElement(FullWindowOverlay, {
          unstable_accessibilityContainerViewIsModal: false,
        }),
      );
    });

    expect(overlayNode()?.props.accessibilityContainerViewIsModal).toBe(false);
  });
});
