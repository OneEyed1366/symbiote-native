// Vue `ScreenContainer` against injected ViewConfigs, headless runs as iOS

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { ScreenContainer } from './screen-container';

const ROOT_TAG = 7_123;
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
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

async function mountContainer(props: Record<string, unknown>): Promise<void> {
  const App = defineComponent({
    setup: () => () =>
      h(ScreenContainer, props, {
        default: () => h('view', { testID: 'inside' }),
      }),
  });
  mount(ROOT_TAG, App);
  await tick();
}

describe('Vue ScreenContainer', () => {
  it('mounts the native container with its slot inside', async () => {
    await mountContainer({});

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('uses the two-state container on iOS for navigators showing one screen', async () => {
    await mountContainer({ hasTwoStates: true });

    expect(viewNamed(NAVIGATION_CONTAINER_VIEW)).toBeDefined();
    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
  });

  it('renders a plain view when the app turns screens off', async () => {
    await mountContainer({ enabled: false });

    expect(viewNamed(CONTAINER_VIEW)).toBeUndefined();
    expect(fabric.find(node => node.props.testID === 'inside')).toBeDefined();
  });

  it('keeps screens on when the app sets no flag', async () => {
    await mountContainer({});

    expect(viewNamed(CONTAINER_VIEW)).toBeDefined();
  });

  it('passes the view props through to the native container', async () => {
    await mountContainer({ testID: 'screens' });

    expect(viewNamed(CONTAINER_VIEW)?.props.testID).toBe('screens');
  });

  it('keeps the container flags off the native view', async () => {
    await mountContainer({ enabled: true, hasTwoStates: false });

    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('enabled');
    expect(viewNamed(CONTAINER_VIEW)?.props).not.toHaveProperty('hasTwoStates');
  });
});
