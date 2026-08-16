// Co-located React-driven test (ADR 0025) for the focus/event hooks layer. Mirrors
// ../stack.test.tsx's fixture (an injected codegen-shaped RNSScreen ViewConfig exposing
// onAppear/onDisappear/onWillAppear/onWillDisappear) and drives the same native events stack.ts
// wires to emit 'focus'/'blur' - proving the hooks react to the real RNS lifecycle, not to a
// synthetic shortcut.
//
// Router-state transitions (push/pop/reset reducer logic) are core's own responsibility and are
// covered by core's test suite - this file only proves each hook's OWN lifecycle wiring (effect
// subscribe/unsubscribe timing, what value it surfaces) against a real mounted Stack.

import { act, createElement, createRef, useCallback, useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount, setNativeViewConfigSource } from '@symbiote-native/react';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import type { INavigatorHandle } from '../stack';
import { useFocusEffect, useIsFocused, useNavigation, useNavigationState, useRoute } from './index';

const ROOT_TAG = 513;
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
    directEventTypes: { topFinishTransitioning: directEvent('onFinishTransitioning') },
    validAttributes: {},
  },
  [HEADER_CONFIG_VIEW]: {
    directEventTypes: { topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem') },
    validAttributes: { title: true, hidden: true, backTitle: true, backTitleVisible: true },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

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

function HomeScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'home');
}

function DetailsScreen(): ReturnType<typeof createElement> {
  return createElement('symbiote-text', {}, 'details');
}

describe('navigation hooks', () => {
  describe('Positive', () => {
    // why: useIsFocused must start false and only flip once RNSScreen's native onAppear actually
    // lands - a screen genuinely isn't focused yet at the instant it mounts (same async gap real
    // native transitions have), and must flip back on the matching onDisappear.
    it("useIsFocused reflects the route's native appear/disappear events", () => {
      let latestIsFocused: boolean | undefined;
      function TrackedHomeScreen(): ReturnType<typeof createElement> {
        latestIsFocused = useIsFocused();
        return createElement('symbiote-text', {}, 'home');
      }

      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
          createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
        ),
      );
      expect(latestIsFocused).toBe(false);

      const home = screenNodes()[0];
      act(() => fabric.fireEvent(home.instanceHandle, 'topAppear', {}));
      expect(latestIsFocused).toBe(true);

      act(() => fabric.fireEvent(home.instanceHandle, 'topDisappear', {}));
      expect(latestIsFocused).toBe(false);
    });

    // why: useFocusEffect re-arms on every focus/blur pair (unlike a plain useEffect, which runs
    // once on mount) - its own cleanup must fire on blur, not just on unmount, so a screen that
    // stays mounted but loses focus (e.g. a sibling pushed on top) still tears down listeners it
    // registered while focused.
    it('useFocusEffect runs its effect on focus and its cleanup on blur', () => {
      const events: string[] = [];
      function TrackedHomeScreen(): ReturnType<typeof createElement> {
        useFocusEffect(
          useCallback(() => {
            events.push('effect');
            return () => events.push('cleanup');
          }, []),
        );
        return createElement('symbiote-text', {}, 'home');
      }

      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
          createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
        ),
      );
      expect(events).toEqual([]);

      const home = screenNodes()[0];
      act(() => fabric.fireEvent(home.instanceHandle, 'topAppear', {}));
      expect(events).toEqual(['effect']);

      act(() => fabric.fireEvent(home.instanceHandle, 'topDisappear', {}));
      expect(events).toEqual(['effect', 'cleanup']);
    });

    // why: useNavigation().addListener is the escape hatch for a screen that wants a raw
    // subscription rather than a hook (mirrors @react-navigation's navigation.addListener); useRoute
    // must expose the SAME route object stack.ts built for this screen, including params carried
    // through push().
    it('useNavigation().addListener fires on focus and useRoute exposes name/params', () => {
      let capturedName: string | undefined;
      let capturedParams: unknown;
      const focusEvents: string[] = [];

      function TrackedDetailsScreen(): ReturnType<typeof createElement> {
        const navigation = useNavigation();
        const route = useRoute();
        capturedName = route.name;
        capturedParams = route.params;
        useEffect(
          () => navigation.addListener('focus', () => focusEvents.push('focus')),
          [navigation],
        );
        return createElement('symbiote-text', {}, 'details');
      }

      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: HomeScreen }),
          createElement(Stack.Screen, { name: 'Details', component: TrackedDetailsScreen }),
        ),
      );
      act(() => ref.current?.push('Details', { id: 7 }));
      expect(capturedName).toBe('Details');
      expect(capturedParams).toEqual({ id: 7 });

      const details = screenNodes()[1];
      act(() => fabric.fireEvent(details.instanceHandle, 'topAppear', {}));
      expect(focusEvents).toEqual(['focus']);
    });

    // why: the call-site selector is typically a fresh inline arrow every render
    // (`useNavigationState(s => ...)`) - the hook must still track the LIVE route count as the
    // stack grows/shrinks, not a stale snapshot from first mount.
    it('useNavigationState reflects the route stack growing across a push', () => {
      let routeCount: number | undefined;
      function TrackedHomeScreen(): ReturnType<typeof createElement> {
        routeCount = useNavigationState(state => state.routes.length);
        return createElement('symbiote-text', {}, 'home');
      }

      const ref = createRef<INavigatorHandle>();
      mount(
        ROOT_TAG,
        createElement(
          Stack,
          { ref, initialRouteName: 'Home' },
          createElement(Stack.Screen, { name: 'Home', component: TrackedHomeScreen }),
          createElement(Stack.Screen, { name: 'Details', component: DetailsScreen }),
        ),
      );
      expect(routeCount).toBe(1);

      act(() => ref.current?.push('Details'));
      expect(routeCount).toBe(2);

      act(() => ref.current?.pop());
      expect(routeCount).toBe(1);
    });
  });

  // Every hook in this file (and useStackNavigation/useTabNavigation/useDrawerNavigation, covered
  // in use-typed-navigation.test.tsx) delegates its "must be mounted under a navigator" guard to
  // the ONE shared throw in navigation-context.ts's useRequiredNavigationContext. Exercised here via
  // useRoute as the simplest caller; the other hooks share the exact same code path, not a
  // per-hook copy, so a second case per hook would prove nothing new.
  describe('Negative', () => {
    // why: a component that reads route/navigation state without being mounted under a
    // <Stack>/<Tab>/<Drawer> screen must fail loudly at the call site instead of silently reading
    // `undefined` fields that get dereferenced later (route.name, navigation.push, ...) with no
    // null-check anywhere downstream - a fail-closed contract, not a permissive fallback.
    it('useRoute() throws when rendered outside any navigator screen', () => {
      function OrphanScreen(): ReturnType<typeof createElement> {
        useRoute();
        return createElement('symbiote-text', {}, 'orphan');
      }

      expect(() => {
        act(() => mount(ROOT_TAG, createElement(OrphanScreen)));
      }).toThrow(/useRoute must be used within a screen rendered by <Stack>, <Tab>, or <Drawer>/);
    });
  });
});
