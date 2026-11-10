// React `ScreenContainer` against injected ViewConfigs, headless runs as iOS

import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenContainer } from './screen-container';

const ROOT_TAG = 7_122;
const CONTAINER_VIEW = 'RNSScreenContainer';
const NAVIGATION_CONTAINER_VIEW = 'RNSScreenNavigationContainer';

const NATIVE_CONFIG: INativeViewConfig = {
  directEventTypes: {},
  validAttributes: { testID: true },
};
const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [CONTAINER_VIEW]: NATIVE_CONFIG,
  [NAVIGATION_CONTAINER_VIEW]: NATIVE_CONFIG,
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const viewNamed = (viewName: string) =>
  fabric.find(node => node.viewName === viewName);

function mountContainer(props: Record<string, unknown>): void {
  act(() => {
    mount(
      ROOT_TAG,
      createElement(
        ScreenContainer,
        props,
        createElement('view', { testID: 'inside' }),
      ),
    );
  });
}

describe('React ScreenContainer', () => {
  it('mounts the native container with its children inside', () => {
    mountContainer({});

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('uses the two-state container on iOS for navigators showing one screen', () => {
    mountContainer({ hasTwoStates: true });

    expect(viewNamed(NAVIGATION_CONTAINER_VIEW)).toBeDefined();
    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
  });

  it('renders a plain view when the app turns screens off', () => {
    mountContainer({ enabled: false });

    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native container', () => {
    mountContainer({ testID: 'screens' });

    expect(viewNamed(CONTAINER_VIEW)?.props.testID).toBe('screens');
  });

  it('keeps the container flags off the native view', () => {
    mountContainer({ enabled: true, hasTwoStates: false });

    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('enabled');
    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('hasTwoStates');
  });
});
