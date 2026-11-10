// Angular `ScreenFooter` against an injected ViewConfig, driven through `mount`

import '@angular/compiler';
import { Component } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenFooter } from './screen-footer';

const ROOT_TAG = 5_122;
const FOOTER_VIEW = 'RNSScreenFooter';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true, testID: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(done => setTimeout(done, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

@Component({
  selector: 'footer-test-host',
  standalone: true,
  imports: [ScreenFooter],
  template: `
    <ScreenFooter [viewProps]="{ testID: 'sheet-footer', collapsable: false }">
      <view testID="inside"></view>
    </ScreenFooter>
  `,
})
class FooterTestHost {}

@Component({
  selector: 'bare-footer-test-host',
  standalone: true,
  imports: [ScreenFooter],
  template: ` <ScreenFooter><view testID="inside"></view></ScreenFooter> `,
})
class BareFooterTestHost {}

const footerNode = () => fabric.find(node => node.viewName === FOOTER_VIEW);

describe('Angular ScreenFooter', () => {
  it('mounts the native footer with its content inside', async () => {
    mount(ROOT_TAG, BareFooterTestHost);
    await tick();

    expect(footerNode()).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native footer', async () => {
    mount(ROOT_TAG, FooterTestHost);
    await tick();

    expect(footerNode()?.props.testID).toBe('sheet-footer');
    expect(footerNode()?.props.collapsable).toBe(false);
  });
});
