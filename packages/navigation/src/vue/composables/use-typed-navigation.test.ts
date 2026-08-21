// Co-located Vue-driven test for useStackNavigation/useTabNavigation/useDrawerNavigation - the
// narrowed twins of useNavigation() that hide the union guard. Vue twin of
// react/hooks/use-typed-navigation.test.tsx.

import { defineComponent, h } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
  Dimensions,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import { Tab } from '../tabs';
import { Drawer } from '../drawer';
import {
  useDrawerNavigation,
  useStackNavigation,
  useTabNavigation,
} from './index';

const ROOT_TAG = 4613;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: { registrationName: 'onAppear' },
      topDisappear: { registrationName: 'onDisappear' },
      topWillAppear: { registrationName: 'onWillAppear' },
      topWillDisappear: { registrationName: 'onWillDisappear' },
      topDismissed: { registrationName: 'onDismissed' },
      topHeaderBackButtonClicked: {
        registrationName: 'onHeaderBackButtonClicked',
      },
    },
    validAttributes: {
      screenId: true,
      activityState: true,
      gestureEnabled: true,
      stackAnimation: true,
      stackPresentation: true,
      transitionDuration: true,
    },
  },
  [STACK_VIEW]: {
    directEventTypes: {
      topFinishTransitioning: { registrationName: 'onFinishTransitioning' },
    },
    validAttributes: {},
  },
};

// Drawer reads the screen width off useWindowDimensions() to resolve its swipe edge zone;
// headless has no DeviceInfo native module, so seed a concrete width once - same fixture as
// drawer.test.ts.
Dimensions.set({ window: { width: 375, height: 812, scale: 1, fontScale: 1 } });

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function textScreen(label: string) {
  return () => h('symbiote-text', {}, label);
}

// Each of the three composables below is a THIN union-narrowing wrapper over useNavigation() (see
// use-stack-navigation.ts's header): same shared logic, same shared guard
// (isStackNavigatorHandle/isTabNavigatorHandle/isDrawerNavigatorHandle from core), one composable
// per navigator kind. Each gets its own Positive (correct navigator -> concretely-typed handle, no
// union-narrowing needed at the call site) and Negative (wrong navigator -> throws instead of
// silently handing back a handle missing the methods the caller expects) pair.

// `mount()` no longer lets a render error escape: adapters/vue/src/render.ts installs a default
// `app.config.errorHandler` that routes it to the engine's shared reporter, so on a device the
// error reaches the redbox instead of aborting the AppRegistry runnable mid-bring-up. The
// contract these tests guard is unchanged — a mismatched navigator still fails loudly and names
// the mismatch — only the channel moved, so the assertion follows it.
function expectReportedError(mountApp: () => void, pattern: RegExp): void {
  const reportError = vi.fn();
  Object.assign(globalThis, { ErrorUtils: { reportError } });

  mountApp();

  expect(reportError).toHaveBeenCalled();
  expect(String(reportError.mock.calls[0]?.[0])).toMatch(pattern);
}

describe('useStackNavigation', () => {
  describe('Positive', () => {
    // why: the whole point of this composable over useNavigation() is that a caller who KNOWS it
    // only ever renders under a Stack gets a concretely-typed handle back, with `push` available
    // with no `'push' in navigation` guard at the call site.
    it('returns a concretely-typed Stack handle with push, no narrowing needed', async () => {
      let canPush = false;
      const TrackedHomeScreen = defineComponent(() => {
        const navigation = useStackNavigation();
        return () => {
          canPush = typeof navigation.value.push === 'function';
          return h('symbiote-text', {}, 'home');
        };
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, {
                name: 'Details',
                component: textScreen('details'),
              }),
            ]),
        }),
      );
      await tick();
      expect(canPush).toBe(true);
    });
  });

  describe('Negative', () => {
    // why: silently handing back a Tab handle typed as a Stack handle would let a caller invoke
    // `.push()` and get a runtime TypeError far from the real mistake - failing immediately, at the
    // composable call site, with a message naming the actual mismatch, is the fail-closed contract.
    it('throws when the nearest navigator is a Tab, not a Stack', () => {
      const TrackedHomeTab = defineComponent(() => {
        const navigation = useStackNavigation();
        return () => {
          void navigation.value;
          return h('symbiote-text', {}, 'home');
        };
      });

      expectReportedError(
        () =>
          mount(
            ROOT_TAG,
            defineComponent({
              setup: () => () =>
                h(Tab, { initialRouteName: 'Home' }, () => [
                  h(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
                  h(Tab.Screen, {
                    name: 'Search',
                    component: textScreen('search'),
                  }),
                ]),
            }),
          ),
        /nearest navigator is not a Stack/,
      );
    });
  });
});

describe('useTabNavigation', () => {
  describe('Positive', () => {
    // why: twin of useStackNavigation's own case - jumpTo is available with no narrowing.
    it('returns a concretely-typed Tab handle with jumpTo, no narrowing needed', async () => {
      let canJumpTo = false;
      const TrackedHomeTab = defineComponent(() => {
        const navigation = useTabNavigation();
        return () => {
          canJumpTo = typeof navigation.value.jumpTo === 'function';
          return h('symbiote-text', {}, 'home');
        };
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Tab, { initialRouteName: 'Home' }, () => [
              h(Tab.Screen, { name: 'Home', component: TrackedHomeTab }),
              h(Tab.Screen, {
                name: 'Search',
                component: textScreen('search'),
              }),
            ]),
        }),
      );
      await tick();
      expect(canJumpTo).toBe(true);
    });
  });

  describe('Negative', () => {
    // why: same fail-closed contract as useStackNavigation's Negative case, mirrored for Tab.
    it('throws when the nearest navigator is a Stack, not a Tab', () => {
      const TrackedHomeScreen = defineComponent(() => {
        const navigation = useTabNavigation();
        return () => {
          void navigation.value;
          return h('symbiote-text', {}, 'home');
        };
      });

      expectReportedError(
        () =>
          mount(
            ROOT_TAG,
            defineComponent({
              setup: () => () =>
                h(Stack, { initialRouteName: 'Home' }, () => [
                  h(Stack.Screen, {
                    name: 'Home',
                    component: TrackedHomeScreen,
                  }),
                  h(Stack.Screen, {
                    name: 'Details',
                    component: textScreen('details'),
                  }),
                ]),
            }),
          ),
        /nearest navigator is not a Tab/,
      );
    });
  });
});

describe('useDrawerNavigation', () => {
  describe('Positive', () => {
    // why: twin of useStackNavigation's own case - openDrawer is available with no narrowing.
    it('returns a concretely-typed Drawer handle with openDrawer, no narrowing needed', async () => {
      let canOpenDrawer = false;
      const TrackedHomeScreen = defineComponent(() => {
        const navigation = useDrawerNavigation();
        return () => {
          canOpenDrawer = typeof navigation.value.openDrawer === 'function';
          return h('symbiote-text', {}, 'home');
        };
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Drawer, { initialRouteName: 'Home' }, () => [
              h(Drawer.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Drawer.Screen, {
                name: 'Profile',
                component: textScreen('profile'),
              }),
            ]),
        }),
      );
      await tick();
      expect(canOpenDrawer).toBe(true);
    });
  });

  describe('Negative', () => {
    // why: same fail-closed contract as useStackNavigation's Negative case, mirrored for Drawer.
    it('throws when the nearest navigator is a Stack, not a Drawer', () => {
      const TrackedHomeScreen = defineComponent(() => {
        const navigation = useDrawerNavigation();
        return () => {
          void navigation.value;
          return h('symbiote-text', {}, 'home');
        };
      });

      expectReportedError(
        () =>
          mount(
            ROOT_TAG,
            defineComponent({
              setup: () => () =>
                h(Stack, { initialRouteName: 'Home' }, () => [
                  h(Stack.Screen, {
                    name: 'Home',
                    component: TrackedHomeScreen,
                  }),
                  h(Stack.Screen, {
                    name: 'Details',
                    component: textScreen('details'),
                  }),
                ]),
            }),
          ),
        /nearest navigator is not a Drawer/,
      );
    });
  });
});
