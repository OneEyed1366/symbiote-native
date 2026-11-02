// Options of `Tab`, `Drawer` and `Stack` that a parent changes after mount
// A copy of the attrs taken once in setup would freeze them at the first paint

import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { Drawer } from './drawer';
import { Stack } from './stack';
import { Tab } from './tabs';

const ROOT_TAG = 4_707;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const BADGE_TEXT = 'NEW';
const DRAWER_OPACITY = 0.5;

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {},
    validAttributes: {
      screenId: true,
      activityState: true,
      gestureEnabled: true,
    },
  },
  [STACK_VIEW]: { directEventTypes: {}, validAttributes: {} },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: {},
    validAttributes: { title: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

const Home = () => h('text', {}, 'home');

function mountApp(render: () => ReturnType<typeof h>): Promise<void> {
  mount(ROOT_TAG, defineComponent({ setup: () => render }));
  return tick();
}

describe('navigator options that change after mount', () => {
  it('Tab paints a `screenOptions` badge that appears later', async () => {
    const isBadged = shallowRef(false);
    await mountApp(() =>
      h(
        Tab,
        {
          initialRouteName: 'Home',
          screenOptions: {
            tabBarBadge: isBadged.value ? BADGE_TEXT : undefined,
          },
        },
        () => [h(Tab.Screen, { name: 'Home', component: Home })],
      ),
    );
    const isShown = () =>
      fabric.find(node => node.props.text === BADGE_TEXT) !== undefined;
    expect(isShown()).toBe(false);

    isBadged.value = true;
    await tick();

    expect(isShown()).toBe(true);
  });

  it('Drawer applies a `drawerStyle` that changes later', async () => {
    const opacity = shallowRef(1);
    await mountApp(() =>
      h(
        Drawer,
        { initialRouteName: 'Home', drawerStyle: { opacity: opacity.value } },
        () => [h(Drawer.Screen, { name: 'Home', component: Home })],
      ),
    );
    const isDimmed = () =>
      fabric.find(node =>
        JSON.stringify(node.props.style ?? null).includes(
          `"opacity":${DRAWER_OPACITY}`,
        ),
      ) !== undefined;
    expect(isDimmed()).toBe(false);

    opacity.value = DRAWER_OPACITY;
    await tick();

    expect(isDimmed()).toBe(true);
  });

  it('Stack applies a `screenOptions` bag that changes later', async () => {
    const isSwipeable = shallowRef(false);
    await mountApp(() =>
      h(
        Stack,
        {
          initialRouteName: 'Home',
          screenOptions: { gestureEnabled: isSwipeable.value },
        },
        () => [h(Stack.Screen, { name: 'Home', component: Home })],
      ),
    );
    const screen = () => fabric.find(node => node.viewName === SCREEN_VIEW);
    expect(screen()?.props.gestureEnabled).toBe(false);

    isSwipeable.value = true;
    await tick();

    expect(screen()?.props.gestureEnabled).toBe(true);
  });
});
