// Co-located Vue-driven test, the Vue twin of react/hooks/hooks.test.tsx. Mirrors
// ../stack.test.ts's fixture (an injected codegen-shaped RNSScreen ViewConfig exposing
// onAppear/onDisappear/onWillAppear/onWillDisappear) and drives the same native events stack.ts
// wires to emit 'focus'/'blur', proving the composables react to the real RNS lifecycle, not to a
// synthetic shortcut.
//
// Router-state transitions (push/pop/reset reducer logic) are core's own responsibility and are
// covered by core's test suite - this file only proves each composable's OWN lifecycle wiring
// (onMounted/onUnmounted subscribe/unsubscribe timing, what value it surfaces) against a real
// mounted Stack.

import { defineComponent, h, ref } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/vue';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import type { INavigatorHandle } from '../stack';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
  useNavigationState,
  useRoute,
} from './index';

const ROOT_TAG = 4513;
const SCREEN_VIEW = 'RNSScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';

function directEvent(registrationName: string) {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDisappear: directEvent('onDisappear'),
      topWillAppear: directEvent('onWillAppear'),
      topWillDisappear: directEvent('onWillDisappear'),
      topDismissed: directEvent('onDismissed'),
      topHeaderBackButtonClicked: directEvent('onHeaderBackButtonClicked'),
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
      topFinishTransitioning: directEvent('onFinishTransitioning'),
    },
    validAttributes: {},
  },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: {
      topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem'),
    },
    validAttributes: {
      title: true,
      hidden: true,
      backTitle: true,
      backTitleVisible: true,
    },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function screenNodes(): IFakeNode[] {
  const found: IFakeNode[] = [];
  const collect = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      if (node.viewName === SCREEN_VIEW) found.push(node);
      collect(node.children);
    }
  };
  collect(fabric.committed);
  return found;
}

function HomeScreen() {
  return h('symbiote-text', {}, 'home');
}

function DetailsScreen() {
  return h('symbiote-text', {}, 'details');
}

describe('navigation composables', () => {
  describe('Positive', () => {
    // why: useIsFocused must start false and only flip once RNSScreen's native onAppear actually
    // lands - a screen genuinely isn't focused yet at the instant it mounts (same async gap real
    // native transitions have), and must flip back on the matching onDisappear.
    it("useIsFocused reflects the route's native appear/disappear events", async () => {
      let latestIsFocused: boolean | undefined;
      // Plain functions used as `component:` are stateless functional components - Vue calls them
      // fresh on every render and treats their return value as vnodes directly, NOT as a "setup
      // returns a render fn" component. A screen calling a composable needs a real setup-based
      // component, hence defineComponent here instead of a bare function.
      const TrackedHomeScreen = defineComponent(() => {
        const isFocused = useIsFocused();
        return () => {
          latestIsFocused = isFocused.value;
          return h('symbiote-text', {}, 'home');
        };
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
            ]),
        }),
      );
      await tick();
      expect(latestIsFocused).toBe(false);

      const home = screenNodes()[0];
      fabric.fireEvent(home.instanceHandle, 'topAppear', {});
      await tick();
      expect(latestIsFocused).toBe(true);

      fabric.fireEvent(home.instanceHandle, 'topDisappear', {});
      await tick();
      expect(latestIsFocused).toBe(false);
    });

    // why: useFocusEffect re-arms on every focus/blur pair (unlike a plain onMounted, which runs
    // once on mount) - its own cleanup must fire on blur, not just on unmount, so a screen that
    // stays mounted but loses focus (e.g. a sibling pushed on top) still tears down listeners it
    // registered while focused.
    it('useFocusEffect runs its effect on focus and its cleanup on blur', async () => {
      const events: string[] = [];
      const TrackedHomeScreen = defineComponent(() => {
        useFocusEffect(() => {
          events.push('effect');
          return () => events.push('cleanup');
        });
        return () => h('symbiote-text', {}, 'home');
      });

      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
            ]),
        }),
      );
      await tick();
      expect(events).toEqual([]);

      const home = screenNodes()[0];
      fabric.fireEvent(home.instanceHandle, 'topAppear', {});
      await tick();
      expect(events).toEqual(['effect']);

      fabric.fireEvent(home.instanceHandle, 'topDisappear', {});
      await tick();
      expect(events).toEqual(['effect', 'cleanup']);
    });

    // why: useNavigation().addListener is the escape hatch for a screen that wants a raw
    // subscription rather than a composable (mirrors @react-navigation's navigation.addListener);
    // useRoute must expose the SAME route object stack.ts built for this screen, including params
    // carried through push().
    it('useNavigation().addListener fires on focus and useRoute exposes name/params', async () => {
      let capturedName: string | undefined;
      let capturedParams: unknown;
      const focusEvents: string[] = [];

      const TrackedDetailsScreen = defineComponent(() => {
        const navigation = useNavigation();
        const route = useRoute();
        capturedName = route.value.name;
        capturedParams = route.value.params;
        navigation.value.addListener('focus', () => focusEvents.push('focus'));
        return () => h('symbiote-text', {}, 'details');
      });

      const handleRef = ref<INavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: HomeScreen }),
              h(Stack.Screen, {
                name: 'Details',
                component: TrackedDetailsScreen,
              }),
            ]),
        }),
      );
      await tick();
      handleRef.value?.push('Details', { id: 7 });
      await tick();
      expect(capturedName).toBe('Details');
      expect(capturedParams).toEqual({ id: 7 });

      const details = screenNodes()[1];
      fabric.fireEvent(details.instanceHandle, 'topAppear', {});
      await tick();
      expect(focusEvents).toEqual(['focus']);
    });

    // why: the call-site selector is typically a fresh inline arrow every render
    // (`useNavigationState(s => ...)`) - the composable must still track the LIVE route count as
    // the stack grows/shrinks, not a stale snapshot from first mount.
    it('useNavigationState reflects the route stack growing across a push', async () => {
      let routeCount: number | undefined;
      const TrackedHomeScreen = defineComponent(() => {
        const count = useNavigationState(state => state.routes.length);
        return () => {
          routeCount = count.value;
          return h('symbiote-text', {}, 'home');
        };
      });

      const handleRef = ref<INavigatorHandle | null>(null);
      mount(
        ROOT_TAG,
        defineComponent({
          setup: () => () =>
            h(Stack, { ref: handleRef, initialRouteName: 'Home' }, () => [
              h(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
              h(Stack.Screen, { name: 'Details', component: DetailsScreen }),
            ]),
        }),
      );
      await tick();
      expect(routeCount).toBe(1);

      handleRef.value?.push('Details');
      await tick();
      expect(routeCount).toBe(2);

      handleRef.value?.pop();
      await tick();
      expect(routeCount).toBe(1);
    });
  });

  // Every composable in this file (and useStackNavigation/useTabNavigation/useDrawerNavigation,
  // covered in use-typed-navigation.test.ts) delegates its "must be mounted under a navigator"
  // guard to the ONE shared throw in navigation-context.ts's requireNavigationScope. Exercised here
  // via useRoute as the simplest caller; the other composables share the exact same code path, not
  // a per-composable copy, so a second case per composable would prove nothing new.
  describe('Negative', () => {
    // why: a component that reads route/navigation state without being mounted under a
    // <Stack>/<Tab>/<Drawer> screen must fail loudly at the call site instead of silently reading
    // `undefined` fields that get dereferenced later (route.name, navigation.push, ...) with no
    // null-check anywhere downstream - a fail-closed contract, not a permissive fallback.
    it('useRoute() throws when rendered outside any navigator screen', () => {
      const OrphanScreen = defineComponent(() => {
        useRoute();
        return () => h('symbiote-text', {}, 'orphan');
      });

      expect(() => mount(ROOT_TAG, OrphanScreen)).toThrow(
        /useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>/,
      );
    });
  });
});
