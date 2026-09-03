// Co-located Solid-driven pipeline test, the Solid twin of react/stack.test.tsx and
// vue/stack/stack.test.ts. Drives REAL compiled Solid JSX (the vitest `solid` project runs the same
// babel-preset-solid options the app-facing preset pins) through the universal renderer into the
// fake Fabric slot, against an INJECTED codegen-shaped ViewConfig. Stack is imported from './index'
// (NOT the package barrel) so the third-party native-spec side-effect (../../register) never loads
// headless.
//
// Route-stack REDUCER logic is core's own responsibility and is covered by core's suite - this file
// proves Stack's OWN lifecycle wiring, plus the four Solid-specific hazards its header names. The
// last group is the reason this file is not ceremony: on React and Vue "params reach the screen"
// and "an options change repaints" are tautologies, because the framework re-runs the component. A
// Solid component body runs ONCE, so each of those is a real, silently-breakable claim, and each
// one below fails on the obvious naive port.
//
// No Negative group: Stack has no guard clause of its own that throws - "refuses to pop the last
// route" is a no-op the reducer fails closed on, observed as an unchanged screen count.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../primitives';

const ROOT_TAG = 7701;
const SCREEN_VIEW = 'RNSScreen';
const MODAL_SCREEN_VIEW = 'RNSModalScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const SEARCH_BAR_VIEW = 'RNSSearchBar';

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
  [MODAL_SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: directEvent('onAppear'),
      topDismissed: directEvent('onDismissed'),
    },
    validAttributes: {
      screenId: true,
      activityState: true,
      stackPresentation: true,
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
    validAttributes: { title: true, hidden: true, backTitle: true },
  },
  [SEARCH_BAR_VIEW]: {
    directEventTypes: {
      topChangeText: directEvent('onChangeText'),
    },
    validAttributes: { placeholder: true },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

// The engine commits on a microtask and the navigators defer their focus/state emits by another
// one, so a macrotask turn is what reliably drains both.
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function findAll(
  predicate: (node: IFakeNode) => boolean,
  nodes: readonly IFakeNode[] = fabric.committed,
): IFakeNode[] {
  const found: IFakeNode[] = [];
  for (const node of nodes) {
    if (predicate(node)) found.push(node);
    found.push(...findAll(predicate, node.children));
  }
  return found;
}

const screenNodes = (): IFakeNode[] =>
  findAll(node => node.viewName === SCREEN_VIEW);

function headerConfigOf(screen: IFakeNode): IFakeNode {
  const header = findAll(
    node => node.viewName === HEADER_CONFIG_VIEW,
    screen.children,
  )[0];
  if (header === undefined) throw new Error('no header config under screen');
  return header;
}

const HomeScreen = () => <symbiote-text>home</symbiote-text>;
const DetailsScreen = () => <symbiote-text>details</symbiote-text>;

describe('Solid Stack navigator', () => {
  describe('Positive', () => {
    // why: only the initial route mounts as a real RNSScreen, at the focused activityState (2), and
    // its header title reaches the native header config - the baseline every other case builds on.
    // It also proves the INVERTED registry: the markers register after Stack's body has already
    // run, so a naive eager read of them would leave the stack empty here.
    it('mounts only the initial route as an RNSScreen, focused', async () => {
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: 'Home' }}
          />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();

      const screens = screenNodes();
      expect(screens).toHaveLength(1);
      expect(screens[0].props.activityState).toBe(2);
      expect(findAll(node => node.viewName === STACK_VIEW)).not.toHaveLength(0);
      expect(headerConfigOf(screens[0]).props.title).toBe('Home');
    });

    // why: react-native-screens' native RNSScreen asserts an already-mounted screen's activityState
    // can never decrease - both routes must stay at 2 after a push, not just the new top.
    it('push() mounts a second RNSScreen and keeps the first at activityState 2', async () => {
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Details"
            component={DetailsScreen}
            options={{ title: 'Details' }}
          />
        </Stack>
      ));
      await flush();

      handle?.push('Details');
      await flush();

      const screens = screenNodes();
      expect(screens).toHaveLength(2);
      expect(screens[0].props.activityState).toBe(2);
      expect(screens[1].props.activityState).toBe(2);
      expect(headerConfigOf(screens[1]).props.title).toBe('Details');
      expect(handle?.canGoBack()).toBe(true);
    });

    // why: pop() must unmount the top RNSScreen - an ordinary child removal, no imperative native
    // command - and canGoBack() must reflect the new depth.
    it('pop() unmounts back down to the previous route', async () => {
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();
      handle?.push('Details');
      await flush();
      expect(screenNodes()).toHaveLength(2);

      handle?.pop();
      await flush();

      expect(screenNodes()).toHaveLength(1);
      expect(handle?.canGoBack()).toBe(false);
    });

    // why: popping the last route is a silent no-op (fail closed), not an empty stack.
    it('refuses to pop the last route', async () => {
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack>
      ));
      await flush();

      handle?.pop();
      await flush();

      expect(screenNodes()).toHaveLength(1);
    });

    // why: an iOS interactive swipe-back dismiss is entirely native-driven - RNSScreen fires
    // onDismissed with no JS-side pop() call, so Stack must treat the native event as equivalent.
    it('drives a pop from the native onDismissed event', async () => {
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();
      handle?.push('Details');
      await flush();

      fabric.fireEvent(screenNodes()[1].instanceHandle, 'topDismissed', {
        dismissCount: 1,
      });
      await flush();

      expect(screenNodes()).toHaveLength(1);
    });

    // why: the native header back button is a second, separately-wired pop trigger; both must reach
    // the same dispatch({ type: 'pop' }).
    it('drives a pop from the native onHeaderBackButtonClicked event', async () => {
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Details" component={DetailsScreen} />
        </Stack>
      ));
      await flush();
      handle?.push('Details');
      await flush();

      fabric.fireEvent(
        screenNodes()[1].instanceHandle,
        'topHeaderBackButtonClicked',
        {},
      );
      await flush();

      expect(screenNodes()).toHaveLength(1);
    });

    // why: Stack must mount the app's REGISTERED component as the screen content, not a
    // placeholder - proves the context-collector registry actually wires through to the build.
    it('mounts the registered screen component as the screen content', async () => {
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack>
      ));
      await flush();

      expect(findAll(node => node.props.text === 'home')).not.toHaveLength(0);
    });

    // why: a marker can appear or disappear after mount (behind a <Show>, or a data-driven screen
    // list). Registration is per-marker and undone on cleanup, so the registry has to follow -
    // Solid has no children array to re-scan, which is what makes this a real wiring claim.
    it('follows a marker that appears after mount', async () => {
      const [isRegistered, setIsRegistered] = createSignal(false);
      let handle: INavigatorHandle | null = null;
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={HomeScreen} />
          {isRegistered() ? (
            <Stack.Screen name="Details" component={DetailsScreen} />
          ) : null}
        </Stack>
      ));
      await flush();

      // Pushed while the marker is absent: the reducer records the route, and reconcileStackRoutes
      // hides it on read because nothing is registered to paint it.
      handle?.push('Details');
      await flush();
      expect(screenNodes()).toHaveLength(1);

      // The marker arrives - and the already-pushed route becomes paintable, with no second push.
      setIsRegistered(true);
      await flush();

      expect(screenNodes()).toHaveLength(2);
    });
  });

  // Everything below would pass trivially on React or Vue - the framework re-runs the screen. On
  // Solid each is a distinct way the port silently freezes or over-rebuilds.
  describe('Solid reactivity', () => {
    // why: THE central hazard. A screen body runs ONCE, so useRoute() must be an ACCESSOR reading a
    // live scope. Handing the scope a plain route object (the obvious port of React's context value)
    // paints the params the screen was pushed with and never updates again.
    it('setParams reaches a mounted screen through useRoute()', async () => {
      let handle: INavigatorHandle | null = null;
      const ParamScreen = () => {
        const route = useRoute();
        return (
          <symbiote-text>{String(route().params ?? 'none')}</symbiote-text>
        );
      };
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={ParamScreen} />
        </Stack>
      ));
      await flush();
      expect(findAll(node => node.props.text === 'none')).not.toHaveLength(0);

      handle?.setParams('after');
      await flush();

      expect(findAll(node => node.props.text === 'after')).not.toHaveLength(0);
    });

    // why: the flip side of the same hazard, and the one a passing "params reach the screen" test
    // hides. Keying <For> on the ROUTE OBJECT also makes params reach the screen - by rebuilding the
    // whole subtree, which destroys node identity (every ref, every native-owned state). The only
    // headless-observable trace is node churn, exactly as the render-prop trap documents.
    it('setParams does not rebuild the screen subtree', async () => {
      let handle: INavigatorHandle | null = null;
      const ParamScreen = () => {
        const route = useRoute();
        return (
          <symbiote-text>{String(route().params ?? 'none')}</symbiote-text>
        );
      };
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={ParamScreen} />
        </Stack>
      ));
      await flush();
      const before = fabric.counts.createNode;

      handle?.setParams('after');
      await flush();

      expect(fabric.counts.createNode).toBe(before);
    });

    // why: an options RESOLVER reads live app state. Resolving options once at build time would
    // freeze the native header at its first title - the same freeze one layer up from useRoute.
    it('a live options change repaints the header config in place', async () => {
      const [title, setTitle] = createSignal('First');
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              get title() {
                return title();
              },
            }}
          />
        </Stack>
      ));
      await flush();
      const screenBefore = screenNodes()[0].instanceHandle;
      expect(headerConfigOf(screenNodes()[0]).props.title).toBe('First');

      setTitle('Second');
      await flush();

      expect(headerConfigOf(screenNodes()[0]).props.title).toBe('Second');
      // Same native screen: a prop update, not a rebuild.
      expect(screenNodes()[0].instanceHandle).toBe(screenBefore);
    });

    // why: the one case where a rebuild IS correct and must be asked for by name. RN treats
    // RNSModalScreen as a different native view from RNSScreen, and descriptorToSolid fixes a node's
    // tag at build - without the explicit shape boundary this either paints a modal's props onto a
    // push screen or throws through the bridge's shape guard.
    it('rebuilds the native screen when the presentation flips it to RNSModalScreen', async () => {
      const [isModal, setIsModal] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{
              get stackPresentation() {
                return isModal() ? ('formSheet' as const) : ('push' as const);
              },
            }}
          />
        </Stack>
      ));
      await flush();
      expect(screenNodes()).toHaveLength(1);
      expect(findAll(node => node.viewName === MODAL_SCREEN_VIEW)).toHaveLength(
        0,
      );

      setIsModal(true);
      await flush();

      expect(findAll(node => node.viewName === MODAL_SCREEN_VIEW)).toHaveLength(
        1,
      );
    });
  });
});
