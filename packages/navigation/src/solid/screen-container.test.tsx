// Solid `ScreenContainer` against injected ViewConfigs, headless runs as iOS

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenContainer } from './screen-container';

const ROOT_TAG = 7_124;
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

const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const viewNamed = (viewName: string) =>
  fabric.find(node => node.viewName === viewName);

describe('Solid ScreenContainer', () => {
  it('mounts the native container with its children inside', async () => {
    mount(ROOT_TAG, () => (
      <ScreenContainer>
        <view testID="inside" />
      </ScreenContainer>
    ));
    await flush();

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('uses the two-state container on iOS for navigators showing one screen', async () => {
    mount(ROOT_TAG, () => <ScreenContainer hasTwoStates />);
    await flush();

    expect(viewNamed(NAVIGATION_CONTAINER_VIEW)).toBeDefined();
    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
  });

  it('renders a plain view when the app turns screens off', async () => {
    mount(ROOT_TAG, () => (
      <ScreenContainer enabled={false}>
        <view testID="inside" />
      </ScreenContainer>
    ));
    await flush();

    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('passes the view props through to the native container', async () => {
    mount(ROOT_TAG, () => <ScreenContainer testID="screens" />);
    await flush();

    expect(viewNamed(CONTAINER_VIEW)?.props.testID).toBe('screens');
  });

  it('keeps the container flags off the native view', async () => {
    mount(ROOT_TAG, () => <ScreenContainer enabled hasTwoStates={false} />);
    await flush();

    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('enabled');
    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('hasTwoStates');
  });
});
