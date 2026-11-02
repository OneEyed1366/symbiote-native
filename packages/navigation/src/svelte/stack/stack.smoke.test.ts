// `Stack` through the compiled `index.svelte` and `stack-screen.svelte` against a fake Fabric
// Covers what `tsc --build` cannot: the screen collector filling routes in the paint pass,
// `hostProps` landing on the capitalized views, the `bind:this` handle and the search bar ref

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { installRecordingFabric } from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { ILiveNode } from '@symbiote-native/test-utils';
import type { INavigatorHandle } from '../../core';
import type { ISearchBarCommands } from '../../core';
import { createNavigationLiveTree } from '../fabric-tree.test-helper';
import {
  createSvelteHarness,
  loadComponent,
} from '../svelte-compile.test-helper';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined) {
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });
}

// The react-native-screens ViewConfigs, INJECTED rather than imported: the real ones come from
// ../../register, whose codegen specs import react-native itself (Flow source vitest cannot
// parse). Same shape and same reason as vue/stack/stack.test.ts's own injection - without them
// the engine has no direct-event map, so onAppear/onDismissed would never reach a handler.
function directEvent(registrationName: string): { registrationName: string } {
  return { registrationName };
}

const VIEW_CONFIGS: Record<string, INativeViewConfig> = {
  RNSScreen: {
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
  RNSModalScreen: {
    directEventTypes: { topDismissed: directEvent('onDismissed') },
    validAttributes: {
      screenId: true,
      activityState: true,
      stackPresentation: true,
    },
  },
  RNSScreenStack: {
    directEventTypes: {
      topFinishTransitioning: directEvent('onFinishTransitioning'),
    },
    validAttributes: { nativeContainerBackgroundColor: true },
  },
  RNSScreenStackHeaderConfig: {
    directEventTypes: {
      topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem'),
    },
    validAttributes: {
      title: true,
      hidden: true,
      largeTitle: true,
      backTitleVisible: true,
    },
  },
  RNSScreenStackHeaderSubview: {
    directEventTypes: {},
    validAttributes: { type: true },
  },
  RNSSearchBar: {
    directEventTypes: { topChangeText: directEvent('onChangeText') },
    validAttributes: { placeholder: true },
  },
  RNSScreenContentWrapper: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
  RNSScreenFooter: {
    directEventTypes: {},
    validAttributes: { collapsable: true },
  },
};

const ROOT_TAG = 91_701;
const fabric = installRecordingFabric();
const {
  appRoot,
  countLive,
  findAllLive,
  findLive,
  findLiveByTestId,
  outline,
  rawTextsOutsideTextContainer,
} = createNavigationLiveTree(fabric);
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

let harness = createSvelteHarness('stack');

beforeEach(() => {
  fabric.reset();
  harness = createSvelteHarness('stack');
});

afterEach(() => {
  unmount(ROOT_TAG);
  harness.cleanup();
});

const HOME_SOURCE = `<script lang="ts">
     import { useRoute } from '../runes/use-route.svelte';
     import { useIsFocused } from '../runes/use-is-focused.svelte';
     const route = useRoute();
     const focused = useIsFocused();
   </script>
   <view p={{ testID: 'home', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;

const DETAILS_SOURCE = `<view p={{ testID: 'details' }} />`;

// The markers sit on separate lines on purpose, the usual formatting that Svelte turns into
// stray text nodes. The collapsed `text` registry host keeps that legal, the outline asserts it
function appSource(stackAttributes: string, screenAttributes: string): string {
  return `<script lang="ts">
     import Stack from './index.svelte';
     import Screen from '../screen.svelte';
     import Home from './home-fixture.svelte';
     import Details from './details-fixture.svelte';
     let { onReady }: { onReady?: (handle: unknown) => void } = $props();
     let navigator = $state.raw<unknown>(null);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
   </script>
   <Stack bind:this={navigator} ${stackAttributes}>
     <Screen name="home" component={Home} ${screenAttributes} />
     <Screen name="details" component={Details} />
   </Stack>`;
}

function isNavigatorHandle(value: unknown): value is INavigatorHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'push' in value &&
    'pop' in value
  );
}

// `variant` gives each fixture its own compiled filename, as Node caches `import()` by path
// and a reused path would hand back the stale module
async function mountStack(
  variant = 'default',
  stackAttributes = '',
  screenAttributes = '',
): Promise<INavigatorHandle> {
  const dir = __dirname;
  harness.compileSource(dir, 'home-fixture', HOME_SOURCE);
  harness.compileSource(dir, 'details-fixture', DETAILS_SOURCE);
  const app = harness.compileSource(
    dir,
    `stack-app-${variant}`,
    appSource(stackAttributes, screenAttributes),
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
  });
  await tick();
  await tick();
  if (!isNavigatorHandle(handle))
    throw new Error('Stack did not expose a navigator handle');
  return handle;
}

type IHeaderControls = { show: () => void };

function isHeaderControls(value: unknown): value is IHeaderControls {
  return typeof value === 'object' && value !== null && 'show' in value;
}

// One home route whose options come from the test. `snippets` sit beside the marker, as an app
// declares header views, and `isShown` lets an option appear after mount
async function mountWithHeaderViews(
  variant: string,
  snippets: string,
  options: string,
): Promise<IHeaderControls> {
  const dir = __dirname;
  harness.compileSource(dir, 'home-fixture', HOME_SOURCE);
  const app = harness.compileSource(
    dir,
    `stack-header-${variant}`,
    `<script lang="ts">
     import Stack from './index.svelte';
     import Screen from '../screen.svelte';
     import Home from './home-fixture.svelte';
     let { onControls }: { onControls?: (controls: unknown) => void } = $props();
     let isShown = $state(false);
     onControls?.({ show: () => { isShown = true; } });
   </script>
   ${snippets}
   <Stack><Screen name="home" component={Home} options={${options}} /></Stack>`,
  );
  const App = await loadComponent(app);
  let controls: unknown = null;
  mount(ROOT_TAG, App, {
    onControls: (value: unknown) => {
      controls = value;
    },
  });
  await tick();
  await tick();
  if (!isHeaderControls(controls))
    throw new Error('the header fixture exposed no controls');
  return controls;
}

// A fixture whose marker set SHRINKS at runtime - the Svelte shape of "a <Screen> behind an
// {#if}", which appSource's fixed marker list cannot express. `onControls` hands the flip out to
// the test, the same escape hatch `onReady` already uses for the navigator handle.
const DYNAMIC_APP_SOURCE = `<script lang="ts">
     import Stack from './index.svelte';
     import Screen from '../screen.svelte';
     import Home from './home-fixture.svelte';
     import Details from './details-fixture.svelte';
     import Profile from './profile-fixture.svelte';
     let { onReady, onControls }: {
       onReady?: (handle: unknown) => void;
       onControls?: (controls: { hideDetails: () => void }) => void;
     } = $props();
     let navigator = $state.raw<unknown>(null);
     let isDetailsRegistered = $state(true);
     $effect(() => { if (navigator !== null) onReady?.(navigator); });
     onControls?.({ hideDetails: () => { isDetailsRegistered = false; } });
   </script>
   <Stack bind:this={navigator}>
     <Screen name="home" component={Home} />
     {#if isDetailsRegistered}<Screen name="details" component={Details} />{/if}
     <Screen name="profile" component={Profile} />
   </Stack>`;

const PROFILE_SOURCE = `<view p={{ testID: 'profile' }} />`;

function isDynamicControls(
  value: unknown,
): value is { hideDetails: () => void } {
  return typeof value === 'object' && value !== null && 'hideDetails' in value;
}

async function mountDynamicStack(): Promise<{
  handle: INavigatorHandle;
  hideDetails: () => void;
}> {
  const dir = __dirname;
  harness.compileSource(dir, 'home-fixture', HOME_SOURCE);
  harness.compileSource(dir, 'details-fixture', DETAILS_SOURCE);
  harness.compileSource(dir, 'profile-fixture', PROFILE_SOURCE);
  const app = harness.compileSource(
    dir,
    'stack-app-dynamic',
    DYNAMIC_APP_SOURCE,
  );
  const App = await loadComponent(app);
  let handle: unknown = null;
  let controls: unknown = null;
  mount(ROOT_TAG, App, {
    onReady: (value: unknown) => {
      handle = value;
    },
    onControls: (value: unknown) => {
      controls = value;
    },
  });
  await tick();
  await tick();
  if (!isNavigatorHandle(handle))
    throw new Error('Stack did not expose a navigator handle');
  if (!isDynamicControls(controls))
    throw new Error('the dynamic fixture exposed no controls');
  return { handle, hideDetails: controls.hideDetails };
}

// No Negative group: nothing in this lifecycle layer is meant to reject or throw
// The `isNavigatorHandle` check in `mountStack` guards a broken fixture, not a product contract
describe('Stack (real compiled index.svelte)', () => {
  describe('Positive', () => {
    it('paints the react-native-screens chrome for the initial route', async () => {
      // The lone `RCTRawText` is the whitespace between the markers, it must sit in the collapsed
      // registry host and not become a raw-text child of `RNSScreenStack`
      await mountStack();

      // The root reads `#surface`, the app root is created as `RCTView` and then set to the
      // surface component, which is what Fabric commits
      expect(outline(appRoot())).toEqual([
        '#surface',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RNSScreenStack',
        '        RNSScreen',
        '          RNSScreenStackHeaderConfig',
        '          RNSScreenContentWrapper',
        '            RCTView',
      ]);
    });

    it('registers every marker and can push/pop the second route through bind:this', async () => {
      // A push that reaches a route registered moments earlier proves the collector fills the
      // registry in the paint pass, and `canGoBack()` must follow the `RNSScreen` count
      const handle = await mountStack();
      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);

      handle.push('details');
      await tick();
      await tick();
      expect(countLive(appRoot(), 'RNSScreen')).toBe(2);
      expect(handle.canGoBack()).toBe(true);

      handle.pop();
      await tick();
      await tick();
      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);
      expect(handle.canGoBack()).toBe(false);
    });

    it('replaces the top route without growing the stack', async () => {
      // why: replace() must swap the top route's content in place - a caller relying on "replace,
      // not push" (e.g. a login screen replaced by home) would regress if this silently grew the
      // stack instead.
      const handle = await mountStack();
      handle.replace('details');
      await tick();
      await tick();

      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);
      const screen = findLive(appRoot(), 'RNSScreenContentWrapper');
      expect(screen?.children?.[0]?.props?.testID).toBe('details');
    });

    it('paints the stack container with nativeContainerStyle.backgroundColor', async () => {
      await mountStack(
        'container-style',
        `nativeContainerStyle={{ backgroundColor: '#112233' }}`,
      );

      const stack = findLive(appRoot(), 'RNSScreenStack');
      expect(stack?.props?.nativeContainerBackgroundColor).toBeDefined();
    });

    it('honours initialRouteName over registration order', async () => {
      // why: initialRouteName must win over "whichever <Screen> registered first" - the second
      // registered screen ("details") mounts as the initial route when named explicitly.
      await mountStack('initial-route', 'initialRouteName="details"');
      const wrapper = findLive(appRoot(), 'RNSScreenContentWrapper');
      expect(wrapper?.children?.[0]?.props?.testID).toBe('details');
    });

    it('folds screen options into the native header config', async () => {
      // why: per-screen `options` must reach the native RNSScreenStackHeaderConfig view's props
      // (title/largeTitle), not stay trapped in JS state - this is the only way a screen actually
      // gets a native header.
      await mountStack(
        'options',
        '',
        'options={{ title: "Home screen", headerLargeTitle: true }}',
      );
      const header = findLive(appRoot(), 'RNSScreenStackHeaderConfig');
      expect(header?.props?.title).toBe('Home screen');
      expect(header?.props?.largeTitle).toBe(true);
    });

    // A demo panel steers the header with route params, so `setParams` has to re-run the resolver
    it('setParams re-runs an options resolver, the header follows the params', async () => {
      const handle = await mountStack(
        'resolver',
        '',
        'options={({ route }) => ({ title: String(route.params ?? "none") })}',
      );
      expect(
        findLive(appRoot(), 'RNSScreenStackHeaderConfig')?.props?.title,
      ).toBe('none');

      handle.setParams('second');
      await tick();
      await tick();
      expect(
        findLive(appRoot(), 'RNSScreenStackHeaderConfig')?.props?.title,
      ).toBe('second');
    });

    it('drives useIsFocused from the native onAppear/onDisappear events', async () => {
      // `useIsFocused` follows the native appear and disappear events one to one, starting false
      await mountStack();
      expect(
        findLiveByTestId(appRoot(), 'home')?.props?.accessibilityLabel,
      ).toBe('home:false');

      const screen = findLive(appRoot(), 'RNSScreen');
      expect(screen).toBeDefined();
      if (screen === undefined) return;

      fabric.fireEvent(screen.instanceHandle, 'topAppear', {});
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'home')?.props?.accessibilityLabel,
      ).toBe('home:true');

      fabric.fireEvent(screen.instanceHandle, 'topDisappear', {});
      await tick();
      await tick();
      expect(
        findLiveByTestId(appRoot(), 'home')?.props?.accessibilityLabel,
      ).toBe('home:false');
    });

    it('pops one route when the native screen reports a dismissal', async () => {
      // A swipe-back reports `topDismissed` with no JS pop call, the stack must pop one route
      const handle = await mountStack();
      handle.push('details');
      await tick();
      await tick();

      const topScreen = findAllLive(appRoot(), 'RNSScreen')[1];
      expect(topScreen).toBeDefined();
      if (topScreen === undefined) return;

      fabric.fireEvent(topScreen.instanceHandle, 'topDismissed', {});
      await tick();
      await tick();
      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);
    });

    it('mounts the search bar and wires its imperative ref to real view commands', async () => {
      // The ref must resolve to the live `RNSSearchBar` and dispatch a real Fabric command
      const searchBarRef: { current: ISearchBarCommands | null } = {
        current: null,
      };
      const dir = __dirname;
      harness.compileSource(dir, 'home-fixture', HOME_SOURCE);
      harness.compileSource(dir, 'details-fixture', DETAILS_SOURCE);
      const app = harness.compileSource(
        dir,
        'stack-search-app',
        `<script lang="ts">
         import Stack from './index.svelte';
         import Screen from '../screen.svelte';
         import Home from './home-fixture.svelte';
         let { searchBarRef }: { searchBarRef: unknown } = $props();
       </script>
       <Stack><Screen name="home" component={Home} options={{ headerSearchBarOptions: { placeholder: 'Find', ref: searchBarRef } }} /></Stack>`,
      );
      const App = await loadComponent(app);
      mount(ROOT_TAG, App, { searchBarRef });
      await tick();
      await tick();

      const searchBar = findLive(appRoot(), 'RNSSearchBar');
      expect(searchBar?.props?.placeholder).toBe('Find');
      const subview = findLive(appRoot(), 'RNSScreenStackHeaderSubview');
      expect(subview?.props?.type).toBe('searchBar');
      expect(subview?.props?.style).toContainEqual({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      });

      expect(searchBarRef.current).not.toBeNull();
      searchBarRef.current?.setText('hello');
      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('setText');
      expect(fabric.commands[0]?.args).toEqual(['hello']);
    });

    describe('custom header views', () => {
      const subviewOfType = (type: string): ILiveNode | undefined =>
        findAllLive(appRoot(), 'RNSScreenStackHeaderSubview').find(
          node => node.props.type === type,
        );

      it.each([
        ['headerLeft', 'left'],
        ['headerRight', 'right'],
        ['headerTitle', 'center'],
      ] as const)(
        'mounts the %s snippet inside a %s subview',
        async (option, type) => {
          await mountWithHeaderViews(
            option,
            `{#snippet view()}<view p={{ testID: 'custom' }} />{/snippet}`,
            `{ ${option}: view }`,
          );

          const subview = subviewOfType(type);
          expect(subview?.children?.[0]?.props?.testID).toBe('custom');
        },
      );

      it('sends the side priority and background options to the matching subview', async () => {
        await mountWithHeaderViews(
          'side-options',
          `{#snippet view()}<view p={{ testID: 'more' }} />{/snippet}`,
          `{ headerRight: view, headerRightVisibilityPriority: 'low', headerRightBackgroundVisible: false }`,
        );

        expect(subviewOfType('right')?.props?.visibilityPriority).toBe('low');
        expect(subviewOfType('right')?.props?.hidesSharedBackground).toBe(true);
      });

      it('hosts the back image source in a back subview holding an image', async () => {
        await mountWithHeaderViews(
          'back-image',
          '',
          `{ headerBackImageSource: { uri: 'https://example.test/b.png' } }`,
        );

        expect(
          subviewOfType('back')?.children.map(child => child.viewName),
        ).toEqual(['RCTImageView']);
      });

      it('keeps the search bar subview next to a custom one', async () => {
        await mountWithHeaderViews(
          'with-search',
          `{#snippet view()}<view p={{ testID: 'menu' }} />{/snippet}`,
          `{ headerLeft: view, headerSearchBarOptions: { placeholder: 'Search' } }`,
        );

        expect(subviewOfType('left')).toBeDefined();
        expect(subviewOfType('searchBar')).toBeDefined();
      });

      it('adds no subview when the app sets no custom view', async () => {
        await mountWithHeaderViews('none', '', `{ title: 'Home' }`);

        expect(findAllLive(appRoot(), 'RNSScreenStackHeaderSubview')).toEqual(
          [],
        );
      });

      it('adds the subview when a view option appears after mount', async () => {
        const controls = await mountWithHeaderViews(
          'late',
          `{#snippet view()}<view p={{ testID: 'late' }} />{/snippet}`,
          `{ headerRight: isShown ? view : undefined }`,
        );
        expect(subviewOfType('right')).toBeUndefined();

        controls.show();
        await tick();
        await tick();

        expect(subviewOfType('right')?.children?.[0]?.props?.testID).toBe(
          'late',
        );
      });
    });

    describe('sheet footer', () => {
      const FOOTER_SNIPPET = `{#snippet footer()}<view p={{ testID: 'bar' }} />{/snippet}`;
      const footerNode = (): ILiveNode | undefined =>
        findLive(appRoot(), 'RNSScreenFooter');
      const kidNames = (viewName: string): string[] =>
        findLive(appRoot(), viewName)?.children.map(kid => kid.viewName) ?? [];

      it('mounts the footer snippet inside a native footer on a form sheet', async () => {
        await mountWithHeaderViews(
          'footer',
          FOOTER_SNIPPET,
          `{ stackPresentation: 'formSheet', sheetFooter: footer }`,
        );

        expect(footerNode()?.children?.[0]?.props?.testID).toBe('bar');
      });

      it('keeps the footer a real view, as native finds it by class', async () => {
        await mountWithHeaderViews(
          'footer-real',
          FOOTER_SNIPPET,
          `{ stackPresentation: 'formSheet', sheetFooter: footer }`,
        );

        expect(footerNode()?.props?.collapsable).toBe(false);
      });

      it('puts the footer in the inner screen that holds the header', async () => {
        await mountWithHeaderViews(
          'footer-inner',
          FOOTER_SNIPPET,
          `{ stackPresentation: 'formSheet', sheetFooter: footer }`,
        );

        expect(kidNames('RNSScreen')).toContain('RNSScreenFooter');
      });

      it('puts the footer straight in the screen when the header is hidden', async () => {
        await mountWithHeaderViews(
          'footer-hidden',
          FOOTER_SNIPPET,
          `{ stackPresentation: 'formSheet', headerShown: false, sheetFooter: footer }`,
        );

        expect(kidNames('RNSModalScreen')).toContain('RNSScreenFooter');
      });

      it.each(['push', 'modal', 'pageSheet'] as const)(
        'has no footer on a %s screen',
        async stackPresentation => {
          await mountWithHeaderViews(
            `footer-${stackPresentation}`,
            FOOTER_SNIPPET,
            `{ stackPresentation: '${stackPresentation}', sheetFooter: footer }`,
          );

          expect(footerNode()).toBeUndefined();
        },
      );

      it('has no footer when the sheet sets none', async () => {
        await mountWithHeaderViews(
          'footer-none',
          '',
          `{ stackPresentation: 'formSheet' }`,
        );

        expect(footerNode()).toBeUndefined();
      });
    });

    it('nests an inner stack so a modally presented screen can host a header', async () => {
      // why: a `stackPresentation: "formSheet"` screen must mount inside its OWN nested
      // RNSScreenStack (wrapped in RNSModalScreen) so it can still carry a native header - this is
      // architecturally distinct from a plain pushed screen, not just a style variant.
      await mountStack(
        'modal',
        '',
        'options={{ stackPresentation: "formSheet" }}',
      );

      // `#surface` at the root, for the reason spelled out on the first outline above.
      expect(outline(appRoot())).toEqual([
        '#surface',
        '  RCTView',
        '    RCTView',
        '      RCTText',
        '        RCTRawText',
        '      RNSScreenStack',
        '        RNSModalScreen',
        '          RNSScreenStack',
        '            RNSScreen',
        '              RNSScreenStackHeaderConfig',
        '              RNSScreenContentWrapper',
        '                RCTView',
      ]);
    });

    it('drops a pushed route whose <Screen> marker unregisters', async () => {
      // A marker that unregisters while its route is pushed must not leave a phantom entry
      // that every back press walks through, reconciling against the registry drops it
      const { handle, hideDetails } = await mountDynamicStack();
      handle.push('details');
      await tick();
      await tick();
      expect(countLive(appRoot(), 'RNSScreen')).toBe(2);

      hideDetails();
      await tick();
      await tick();

      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);
      expect(findLiveByTestId(appRoot(), 'home')).toBeDefined();
      expect(findLiveByTestId(appRoot(), 'details')).toBeUndefined();
      expect(handle.canGoBack()).toBe(false);
    });

    it('keeps the pruned history when a new route is pushed afterwards', async () => {
      // The pruning must reach the pushed state, else the next push rebuilds on the phantom and
      // back needs two presses
      const { handle, hideDetails } = await mountDynamicStack();
      handle.push('details');
      await tick();
      await tick();
      hideDetails();
      await tick();
      await tick();
      handle.push('profile');
      await tick();
      await tick();
      handle.pop();
      await tick();
      await tick();

      expect(countLive(appRoot(), 'RNSScreen')).toBe(1);
      expect(findLiveByTestId(appRoot(), 'home')).toBeDefined();
      expect(handle.canGoBack()).toBe(false);
    });
  });

  // Tree-shape invariant, not a behavior scenario: Svelte emits a space text node between sibling
  // tags and only the shim keeps it out of Fabric. The modal route mounts too, its branch differs
  describe('committed-tree hygiene', () => {
    it('commits no raw text outside a text container', async () => {
      await mountStack();
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);
    });

    it('commits no raw text outside a text container for a modal route', async () => {
      await mountStack(
        'hygiene-modal',
        '',
        'options={{ stackPresentation: "formSheet" }}',
      );
      expect(rawTextsOutsideTextContainer(appRoot())).toEqual([]);
    });
  });
});
