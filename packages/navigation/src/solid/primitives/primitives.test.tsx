// Co-located test for the navigation primitives, the Solid twin of react/hooks/hooks.test.tsx and
// vue/composables/composables.test.ts. Drives them through a real Stack so the scope they read is
// the one a navigator actually provides, rather than a hand-built fake.
//
// The pub/sub itself is core's (navigation-events, covered by core's suite). What is proved here is
// the SOLID half: every primitive hands back an ACCESSOR (a value would freeze at mount, since a
// screen body runs once), the subscriptions are set up synchronously in the body rather than from
// an onMount that would race the navigator's own deferred first emit, and each one is torn down by
// Solid's ordinary disposal when the screen unmounts.
//
// Negative group: every primitive throws a named error when called outside a navigator.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { Stack } from '../stack';
import type { INavigatorHandle } from '../stack';
import { Tab } from '../tabs';
import {
  createFocusEffect,
  createIsFocused,
  createNavigationState,
  useNavigation,
  useRoute,
  useStackNavigation,
  useTabNavigation,
} from './index';

const ROOT_TAG = 7704;
const SCREEN_VIEW = 'RNSScreen';

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  [SCREEN_VIEW]: {
    directEventTypes: {
      topAppear: { registrationName: 'onAppear' },
      topDisappear: { registrationName: 'onDisappear' },
      topDismissed: { registrationName: 'onDismissed' },
      topHeaderBackButtonClicked: {
        registrationName: 'onHeaderBackButtonClicked',
      },
    },
    validAttributes: { screenId: true, activityState: true },
  },
  RNSScreenStack: {
    directEventTypes: {
      topFinishTransitioning: {
        registrationName: 'onFinishTransitioning',
      },
    },
    validAttributes: {},
  },
  RNSScreenStackHeaderConfig: {
    directEventTypes: {},
    validAttributes: { title: true, hidden: true },
  },
};

const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

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

const texts = (): string[] =>
  findAll(node => typeof node.props.text === 'string').map(node =>
    String(node.props.text),
  );

const Blank = () => <symbiote-text>blank</symbiote-text>;

describe('Solid navigation primitives', () => {
  describe('Positive', () => {
    // why: useRoute is the accessor every screen reads its own identity through - it must resolve
    // synchronously at build time, before any event has fired.
    it('useRoute resolves the screen route at build time', async () => {
      const RouteScreen = () => {
        const route = useRoute();
        return <symbiote-text>{`name:${route().name}`}</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={RouteScreen} />
        </Stack>
      ));
      await flush();

      expect(texts()).toContain('name:Home');
    });

    // why: createIsFocused starts false on purpose - a Stack screen is focused only once
    // RNSScreen's native onAppear lands, the same async gap a real transition has. Firing the
    // native event is the only way to make it true, which is exactly the wiring under test.
    it('createIsFocused flips on the native onAppear and back on onDisappear', async () => {
      const FocusScreen = () => {
        const isFocused = createIsFocused();
        return (
          <symbiote-text>{isFocused() ? 'focused' : 'blurred'}</symbiote-text>
        );
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={FocusScreen} />
        </Stack>
      ));
      await flush();
      expect(texts()).toContain('blurred');

      fabric.fireEvent(screenNodes()[0].instanceHandle, 'topAppear', {});
      await flush();
      expect(texts()).toContain('focused');

      fabric.fireEvent(screenNodes()[0].instanceHandle, 'topDisappear', {});
      await flush();
      expect(texts()).toContain('blurred');
    });

    // why: createFocusEffect's contract is effect-on-focus / cleanup-on-blur, and the cleanup slot
    // is the half that silently rots (a missed blur leaks a subscription per navigation).
    it('createFocusEffect runs on focus and cleans up on blur', async () => {
      const effect = vi.fn();
      const cleanup = vi.fn();
      const EffectScreen = () => {
        createFocusEffect(() => {
          effect();
          return cleanup;
        });
        return <symbiote-text>effect</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={EffectScreen} />
        </Stack>
      ));
      await flush();
      expect(effect).not.toHaveBeenCalled();

      fabric.fireEvent(screenNodes()[0].instanceHandle, 'topAppear', {});
      await flush();
      expect(effect).toHaveBeenCalledTimes(1);
      expect(cleanup).not.toHaveBeenCalled();

      fabric.fireEvent(screenNodes()[0].instanceHandle, 'topDisappear', {});
      await flush();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    // why: the state broadcast is DEFERRED by a microtask precisely so a screen built by the same
    // update has had time to subscribe. A selector must see the post-push router state, not just
    // the single-route seed it starts from.
    it('createNavigationState seeds from the route and follows the broadcast', async () => {
      let handle: INavigatorHandle | null = null;
      const StateScreen = () => {
        const depth = createNavigationState(state => state.routes.length);
        return <symbiote-text>{`depth:${depth()}`}</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={StateScreen} />
          <Stack.Screen name="Details" component={Blank} />
        </Stack>
      ));
      await flush();
      expect(texts()).toContain('depth:1');

      handle?.push('Details');
      await flush();

      expect(texts()).toContain('depth:2');
    });

    // why: useNavigation is the union handle; useStackNavigation is the narrowing that keeps a
    // `'push' in navigation` check out of every call site.
    it('useStackNavigation narrows the handle under a Stack', async () => {
      const PushScreen = () => {
        const navigation = useStackNavigation();
        navigation().push('Details');
        return <symbiote-text>pushed</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={PushScreen} />
          <Stack.Screen name="Details" component={Blank} />
        </Stack>
      ));
      await flush();

      expect(screenNodes()).toHaveLength(2);
    });

    // why: every primitive returns an accessor rather than a value, and a screen body runs once -
    // so an accessor that is not re-read on change is indistinguishable from a frozen value until
    // something actually changes. useNavigation()'s addListener is the seam a screen subscribes
    // through, and it has to come from the CURRENT scope.
    it('useNavigation exposes the route emitter through addListener', async () => {
      const seen: string[] = [];
      const ListenerScreen = () => {
        const navigation = useNavigation();
        navigation().addListener('focus', () => seen.push('focus'));
        return <symbiote-text>listening</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={ListenerScreen} />
        </Stack>
      ));
      await flush();

      fabric.fireEvent(screenNodes()[0].instanceHandle, 'topAppear', {});
      await flush();

      expect(seen).toEqual(['focus']);
    });

    // why: a popped screen's subscriptions are owned by its own Solid computation, so the pop must
    // tear them down - otherwise every pop leaks a listener onto the emitter and a later native
    // event re-runs an effect belonging to a screen that no longer exists.
    it('a popped screen stops receiving focus events', async () => {
      let handle: INavigatorHandle | null = null;
      const effect = vi.fn();
      const FocusScreen = () => {
        createFocusEffect(effect);
        return <symbiote-text>focus</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={Blank} />
          <Stack.Screen name="Details" component={FocusScreen} />
        </Stack>
      ));
      await flush();
      handle?.push('Details');
      await flush();

      const pushed = screenNodes()[1].instanceHandle;
      fabric.fireEvent(pushed, 'topAppear', {});
      await flush();
      expect(effect).toHaveBeenCalledTimes(1);

      handle?.pop();
      await flush();
      fabric.fireEvent(pushed, 'topAppear', {});
      await flush();

      expect(effect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Negative', () => {
    // why: the "outside a navigator" error is the one guard these primitives have. It names the
    // function so a misplaced call is readable without a stack.
    it('useRoute throws outside any navigator', () => {
      expect(() => mount(ROOT_TAG, () => useRoute() as never)).toThrow(
        /useRoute must be used within a screen/,
      );
    });

    it('createIsFocused throws outside any navigator', () => {
      expect(() => mount(ROOT_TAG, () => createIsFocused() as never)).toThrow(
        /createIsFocused must be used within a screen/,
      );
    });

    // why: the narrowing primitives have a SECOND guard - the nearest navigator being the wrong
    // KIND, which a union handle would otherwise let through to a runtime "push is not a function".
    it('useTabNavigation throws under a Stack', async () => {
      const errors: string[] = [];
      const WrongScreen = () => {
        try {
          useTabNavigation()();
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        return <symbiote-text>wrong</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Stack initialRouteName="Home">
          <Stack.Screen name="Home" component={WrongScreen} />
        </Stack>
      ));
      await flush();

      expect(errors[0]).toMatch(/nearest navigator is not a Tab/);
    });

    it('useStackNavigation throws under a Tab', async () => {
      const errors: string[] = [];
      const WrongScreen = () => {
        try {
          useStackNavigation()();
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
        return <symbiote-text>wrong</symbiote-text>;
      };
      mount(ROOT_TAG, () => (
        <Tab initialRouteName="Feed">
          <Tab.Screen name="Feed" component={WrongScreen} />
        </Tab>
      ));
      await flush();

      expect(errors[0]).toMatch(/nearest navigator is not a Stack/);
    });
  });
});
