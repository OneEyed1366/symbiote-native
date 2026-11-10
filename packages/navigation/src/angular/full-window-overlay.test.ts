// Angular `FullWindowOverlay` against an injected ViewConfig, driven through `mount`
// Headless runs as iOS, core's own tests cover the Android fallback

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import { Dimensions } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { FullWindowOverlay } from './full-window-overlay';

const ROOT_TAG = 5_121;
const OVERLAY_VIEW = 'RNSFullWindowOverlay';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [OVERLAY_VIEW]: {
    directEventTypes: {},
    validAttributes: { accessibilityContainerViewIsModal: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

@Component({
  selector: 'overlay-test-host',
  standalone: true,
  imports: [FullWindowOverlay],
  template: `
    <FullWindowOverlay>
      <view testID="inside"></view>
    </FullWindowOverlay>
  `,
})
class OverlayTestHost {}

@Component({
  selector: 'modal-overlay-test-host',
  standalone: true,
  imports: [FullWindowOverlay],
  template: `
    <FullWindowOverlay [unstable_accessibilityContainerViewIsModal]="false">
      <view testID="inside"></view>
    </FullWindowOverlay>
  `,
})
class ModalOverlayTestHost {}

const overlayNode = () => fabric.find(node => node.viewName === OVERLAY_VIEW);

describe('Angular FullWindowOverlay', () => {
  it('mounts the native overlay with its content inside', async () => {
    mount(ROOT_TAG, OverlayTestHost);
    await tick();

    expect(overlayNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('sizes the overlay to the window', async () => {
    mount(ROOT_TAG, OverlayTestHost);
    await tick();

    const { width, height } = Dimensions.get('window');
    const entries = [overlayNode()?.props.style].flat(Infinity);
    expect(entries).toContainEqual(expect.objectContaining({ width, height }));
  });

  it('sends the modal flag under its native name', async () => {
    mount(ROOT_TAG, ModalOverlayTestHost);
    await tick();

    expect(overlayNode()?.props.accessibilityContainerViewIsModal).toBe(false);
  });
});
