// On iOS 26 the content of an Angular Stack screen sits in a safe area view inside its wrapper

import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/angular';
import { childrenOf } from '@symbiote-native/engine';
import type { INativeViewConfig, ISymbioteNode } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';
import { ScreenDirective } from '../screen.directive';

vi.mock('../../core/screens-config', async importOriginal => ({
  ...(await importOriginal<object>()),
  isIOS26OrHigherForCurrentPlatform: true,
}));

const ROOT_TAG = 5_117;
const SAFE_AREA_VIEW = 'RNSSafeAreaView';
const WRAPPER_VIEW = 'RNSScreenContentWrapper';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
    directEventTypes: {},
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: { directEventTypes: {}, validAttributes: {} },
  RNSScreenStackHeaderConfig: { directEventTypes: {}, validAttributes: {} },
  [WRAPPER_VIEW]: { directEventTypes: {}, validAttributes: {} },
  [SAFE_AREA_VIEW]: {
    directEventTypes: {},
    validAttributes: { edges: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function contains(root: ISymbioteNode, target: ISymbioteNode): boolean {
  return childrenOf(root).some(
    child => child === target || contains(child, target),
  );
}

@Component({
  selector: 'leaf-screen',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `<text>leaf</text>`,
})
class LeafScreen {}

@Component({
  selector: 'safe-area-host',
  standalone: true,
  imports: [Stack, ScreenDirective],
  template: `
    <Stack initialRouteName="Home">
      <ng-template symbioteScreen name="Home" [component]="leaf"></ng-template>
    </Stack>
  `,
})
class SafeAreaHost {
  readonly leaf = LeafScreen;
}

describe('safe area view in an Angular Stack screen on iOS 26', () => {
  it('wraps the screen component inside the content wrapper', async () => {
    mount(ROOT_TAG, SafeAreaHost);
    await tick();
    const wrapper = fabric.find(node => node.viewName === WRAPPER_VIEW);
    const safeArea = fabric.find(node => node.viewName === SAFE_AREA_VIEW);
    const leaf = fabric.find(
      node => node.viewName === 'RCTRawText' && node.props.text === 'leaf',
    );
    if (!wrapper || !safeArea || !leaf)
      throw new Error('screen did not render');

    expect(safeArea.props.edges).toEqual({
      top: true,
      right: false,
      bottom: false,
      left: false,
    });
    expect(contains(wrapper.handle, safeArea.handle)).toBe(true);
    expect(contains(safeArea.handle, leaf.handle)).toBe(true);
  });
});
