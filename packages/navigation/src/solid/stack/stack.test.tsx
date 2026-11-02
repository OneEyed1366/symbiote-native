// Solid twin of the React and Vue `Stack` tests, real compiled JSX through the universal renderer
// into the fake Fabric slot. Imported from `./index`, not the package barrel, so `../../register`
// never loads headless

// Reducer transitions are core's own tests, this file proves the lifecycle wiring and the
// Solid-specific hazards named in the `Stack` header

// No Negative group: popping the last route is a no-op the reducer already fails closed on

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  setNativeViewConfigSource,
} from '@symbiote-native/solid';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { childrenOf, type ISymbioteNode } from '@symbiote-native/engine';
import {
  installRecordingFabric,
  type IAuthoredNode,
} from '@symbiote-native/test-utils';
import { Stack } from './index';
import type { INavigatorHandle } from './index';
import { useRoute } from '../primitives';
import type { ISolidScreenOptions } from '../screen-props';
import type { IScreenOptionsResolver } from '../../core';

const ROOT_TAG = 7_701;
const SCREEN_VIEW = 'RNSScreen';
const MODAL_SCREEN_VIEW = 'RNSModalScreen';
const STACK_VIEW = 'RNSScreenStack';
const HEADER_CONFIG_VIEW = 'RNSScreenStackHeaderConfig';
const HEADER_SUBVIEW_VIEW = 'RNSScreenStackHeaderSubview';
const SEARCH_BAR_VIEW = 'RNSSearchBar';
const SHEET_FOOTER_VIEW = 'RNSScreenFooter';

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
    validAttributes: { nativeContainerBackgroundColor: true },
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
  [SHEET_FOOTER_VIEW]: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const fabric = installRecordingFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);

// The engine commits on a microtask and the navigators defer their focus/state emits by another
// one, so a macrotask turn is what reliably drains both.
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// A POP is the subject of half this file, so every walk below descends the LIVE child links from
// the stack container down. A recording keeps every node it ever saw created, so a popped screen
// is still in the record and only the tree says it is gone.
function stackRoot(): ISymbioteNode {
  const stack = fabric.find(node => node.viewName === STACK_VIEW);
  if (stack === undefined) throw new Error('no screen stack created');
  return stack.handle;
}

function findAll(
  predicate: (node: IAuthoredNode) => boolean,
  handle: ISymbioteNode = stackRoot(),
): IAuthoredNode[] {
  const found: IAuthoredNode[] = [];
  for (const child of childrenOf(handle)) {
    const recorded = fabric.find(one => one.handle === child);
    if (recorded !== undefined && predicate(recorded)) found.push(recorded);
    found.push(...findAll(predicate, child));
  }
  return found;
}

const screenNodes = (): IAuthoredNode[] =>
  findAll(node => node.viewName === SCREEN_VIEW);

function headerConfigOf(screen: IAuthoredNode): IAuthoredNode {
  const header = findAll(
    node => node.viewName === HEADER_CONFIG_VIEW,
    screen.handle,
  )[0];
  if (header === undefined) throw new Error('no header config under screen');
  return header;
}

const HomeScreen = () => <text>home</text>;
const DetailsScreen = () => <text>details</text>;

describe('Solid Stack navigator', () => {
  describe('Positive', () => {
    // Baseline for the rest: only the initial route mounts, focused, with its header title
    // Markers register after the `Stack` body ran, so an eager read would leave the stack empty
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
      // `stackRoot()` is where every walk above starts, so it throwing is the assertion — named
      // here so the case still says out loud that a stack view was committed.
      expect(fabric.find(node => node.viewName === STACK_VIEW)).toBeDefined();
      expect(headerConfigOf(screens[0]).props.title).toBe('Home');
    });

    it('paints the stack container with nativeContainerStyle.backgroundColor', async () => {
      mount(ROOT_TAG, () => (
        <Stack
          initialRouteName="Home"
          nativeContainerStyle={{ backgroundColor: '#112233' }}
        >
          <Stack.Screen name="Home" component={HomeScreen} />
        </Stack>
      ));
      await flush();

      const stack = fabric.find(node => node.viewName === STACK_VIEW);
      expect(stack?.props.nativeContainerBackgroundColor).toBeDefined();
    });

    // Native asserts a mounted screen's `activityState` never decreases, so both routes stay at 2
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
    // A screen body runs once, so `useRoute()` must be an accessor over a live scope
    // A plain route object would paint the pushed params and never update
    it('setParams reaches a mounted screen through useRoute()', async () => {
      let handle: INavigatorHandle | null = null;
      const ParamScreen = () => {
        const route = useRoute();
        return <text>{String(route().params ?? 'none')}</text>;
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

    // A demo panel steers the header with route params, so `setParams` has to re-run the resolver
    it('setParams re-runs an options resolver, the header follows the params', async () => {
      let handle: INavigatorHandle | null = null;
      const resolver: IScreenOptionsResolver = ({ route }) => ({
        title: String(route.params ?? 'none'),
      });
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={() => <text>home</text>} />
          <Stack.Screen
            name="Details"
            component={() => <text>details</text>}
            options={resolver}
          />
        </Stack>
      ));
      await flush();
      handle?.push('Details', 'first');
      await flush();
      expect(headerConfigOf(screenNodes()[1]).props.title).toBe('first');

      handle?.setParams('second');
      await flush();
      expect(headerConfigOf(screenNodes()[1]).props.title).toBe('second');
    });

    // Keying `<For>` on the route object would also deliver params, by rebuilding the subtree
    // and losing node identity, so the test compares node handles rather than a create count
    it('setParams does not rebuild the screen subtree', async () => {
      let handle: INavigatorHandle | null = null;
      const ParamScreen = () => {
        const route = useRoute();
        return <text>{String(route().params ?? 'none')}</text>;
      };
      mount(ROOT_TAG, () => (
        <Stack ref={h => (handle = h)} initialRouteName="Home">
          <Stack.Screen name="Home" component={ParamScreen} />
        </Stack>
      ));
      await flush();
      const before = findAll(() => true).map(node => node.handle);

      handle?.setParams('after');
      await flush();

      const after = findAll(() => true).map(node => node.handle);
      expect(after).toHaveLength(before.length);
      expect(after.every((node, index) => node === before[index])).toBe(true);
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

    // `RNSModalScreen` is a different native view from `RNSScreen` and `descriptorToSolid` fixes
    // the tag at build, so a presentation flip needs an explicit rebuild boundary
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

describe('Solid Stack custom header views', () => {
  async function mountHome(options: ISolidScreenOptions): Promise<void> {
    mount(ROOT_TAG, () => (
      <Stack initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={options} />
      </Stack>
    ));
    await flush();
  }

  const subviewsOf = (): IAuthoredNode[] =>
    findAll(
      node => node.viewName === HEADER_SUBVIEW_VIEW,
      headerConfigOf(screenNodes()[0]).handle,
    );

  const subviewOfType = (type: string): IAuthoredNode | undefined =>
    subviewsOf().find(node => node.props.type === type);

  it.each([
    ['headerLeft', 'left'],
    ['headerRight', 'right'],
    ['headerTitle', 'center'],
  ] as const)(
    'mounts the %s element inside a %s subview',
    async (option, type) => {
      await mountHome({ [option]: () => <text>custom</text> });

      const subview = subviewOfType(type);
      expect(subview).toBeDefined();
      expect(
        subview &&
          findAll(node => node.props.text === 'custom', subview.handle),
      ).toHaveLength(1);
    },
  );

  it('sends the side priority and background options to the matching subview', async () => {
    await mountHome({
      headerRight: () => <text>more</text>,
      headerRightVisibilityPriority: 'low',
      headerRightBackgroundVisible: false,
    });

    expect(subviewOfType('right')?.props.visibilityPriority).toBe('low');
    expect(subviewOfType('right')?.props.hidesSharedBackground).toBe(true);
  });

  it('hosts the back image source in a back subview holding an image', async () => {
    await mountHome({
      headerBackImageSource: { uri: 'https://example.test/b.png' },
    });

    const subview = subviewOfType('back');
    expect(subview).toBeDefined();
    expect(
      subview &&
        findAll(node => node.viewName === 'RCTImageView', subview.handle),
    ).toHaveLength(1);
  });

  it('keeps the search bar subview next to a custom one', async () => {
    await mountHome({
      headerLeft: () => <text>menu</text>,
      headerSearchBarOptions: { placeholder: 'Search' },
    });

    expect(subviewOfType('left')).toBeDefined();
    expect(subviewOfType('searchBar')).toBeDefined();
  });

  it('adds no subview when the app sets no custom view', async () => {
    await mountHome({ title: 'Home' });

    expect(subviewsOf()).toHaveLength(0);
  });

  it('repaints a live view in place without rebuilding its subview', async () => {
    const [label, setLabel] = createSignal('first');
    await mountHome({ headerTitle: () => <text>{label()}</text> });
    const before = subviewOfType('center')?.instanceHandle;

    setLabel('second');
    await flush();

    expect(findAll(node => node.props.text === 'second')).not.toHaveLength(0);
    expect(subviewOfType('center')?.instanceHandle).toBe(before);
  });

  it('adds the subview when a view option appears after mount', async () => {
    const [isShown, setIsShown] = createSignal(false);
    await mountHome({
      get headerRight() {
        return isShown() ? () => <text>late</text> : undefined;
      },
    });
    expect(subviewOfType('right')).toBeUndefined();

    setIsShown(true);
    await flush();

    expect(subviewOfType('right')).toBeDefined();
  });
});

describe('Solid Stack sheet footer', () => {
  async function mountHome(options: ISolidScreenOptions): Promise<void> {
    mount(ROOT_TAG, () => (
      <Stack initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} options={options} />
      </Stack>
    ));
    await flush();
  }

  const sheetFooter = () => <text>footer</text>;
  const footerNodes = (): IAuthoredNode[] =>
    findAll(node => node.viewName === SHEET_FOOTER_VIEW);
  const directKids = (node: IAuthoredNode | undefined): IAuthoredNode[] =>
    node === undefined
      ? []
      : childrenOf(node.handle).flatMap(child => {
          const recorded = fabric.find(one => one.handle === child);
          return recorded === undefined ? [] : [recorded];
        });

  it('mounts the footer content inside a native footer on a form sheet', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    expect(footerNodes()).toHaveLength(1);
    expect(
      findAll(node => node.props.text === 'footer', footerNodes()[0].handle),
    ).toHaveLength(1);
  });

  it('keeps the footer a real view, as native finds it by class', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    expect(footerNodes()[0]?.props.collapsable).toBe(false);
  });

  it('puts the footer in the inner screen that holds the header', async () => {
    await mountHome({ stackPresentation: 'formSheet', sheetFooter });

    expect(
      directKids(screenNodes()[0]).some(
        kid => kid.viewName === SHEET_FOOTER_VIEW,
      ),
    ).toBe(true);
  });

  it('puts the footer straight in the screen when the header is hidden', async () => {
    await mountHome({
      stackPresentation: 'formSheet',
      headerShown: false,
      sheetFooter,
    });

    const modal = findAll(node => node.viewName === MODAL_SCREEN_VIEW)[0];
    expect(
      directKids(modal).some(kid => kid.viewName === SHEET_FOOTER_VIEW),
    ).toBe(true);
  });

  it.each(['push', 'modal', 'pageSheet'] as const)(
    'has no footer on a %s screen',
    async stackPresentation => {
      await mountHome({ stackPresentation, sheetFooter });

      expect(footerNodes()).toHaveLength(0);
    },
  );

  it('has no footer when the sheet sets none', async () => {
    await mountHome({ stackPresentation: 'formSheet' });

    expect(footerNodes()).toHaveLength(0);
  });
});
