// On iOS 26 the content of a React Stack screen sits in a safe area view inside its wrapper

import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import { childrenOf } from '@symbiote-native/engine';
import type { INativeViewConfig, ISymbioteNode } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Stack } from './index';

vi.mock('../../core/screens-config', async importOriginal => ({
  ...(await importOriginal<object>()),
  isIOS26OrHigherForCurrentPlatform: true,
}));

const ROOT_TAG = 517;
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

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function contains(root: ISymbioteNode, target: ISymbioteNode): boolean {
  return childrenOf(root).some(
    child => child === target || contains(child, target),
  );
}

describe('safe area view in a React Stack screen on iOS 26', () => {
  it('wraps the screen component inside the content wrapper', () => {
    mount(
      ROOT_TAG,
      createElement(
        Stack,
        { initialRouteName: 'Home' },
        createElement(Stack.Screen, {
          name: 'Home',
          component: () => createElement('view', { testID: 'leaf' }),
        }),
      ),
    );
    const wrapper = fabric.find(node => node.viewName === WRAPPER_VIEW);
    const safeArea = fabric.find(node => node.viewName === SAFE_AREA_VIEW);
    const leaf = fabric.find(node => node.props.testID === 'leaf');
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
