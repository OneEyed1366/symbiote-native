// Stack, driven through the REAL compiled index.svelte/stack-screen.svelte against a fake
// Fabric. What this proves that `tsc --build` structurally cannot:
//  - the context-based screen collector actually populates the route list during the SAME
//    synchronous mount pass that paints it (Svelte hands a component an opaque Snippet, so this
//    replaces React's/Vue's children scan and is the single riskiest piece of the port),
//  - `<svelte:element this={'RNSScreen'}>` + an `{@attach hostProps(...)}` really does create the
//    capitalized react-native-screens views and land the object bag on them,
//  - the `export function` navigator handle reached through `bind:this` drives push/pop/replace,
//  - the search bar's imperative ref attachment dispatches real native view commands.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { installFabric } from '@symbiote-native/test-utils';
import { setNativeViewConfigSource } from '@symbiote-native/engine';
import type { INativeViewConfig } from '@symbiote-native/engine';
import { mount, unmount } from '@symbiote-native/svelte/native-view-bridge';
import type { INavigatorHandle } from '../../core';
import type { ISearchBarCommands } from '../../core';
import {
  countLive,
  findAllLive,
  findLive,
  findLiveByTestId,
  outline,
} from '../fabric-tree.test-helper';
import { createSvelteHarness, loadComponent } from '../svelte-compile.test-helper';

if (globalThis.window === undefined) Object.assign(globalThis, { window: globalThis });
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
    validAttributes: { screenId: true, activityState: true, stackPresentation: true },
  },
  RNSScreenStack: {
    directEventTypes: { topFinishTransitioning: directEvent('onFinishTransitioning') },
    validAttributes: {},
  },
  RNSScreenStackHeaderConfig: {
    directEventTypes: { topPressHeaderBarButtonItem: directEvent('onPressHeaderBarButtonItem') },
    validAttributes: { title: true, hidden: true, largeTitle: true, backTitleVisible: true },
  },
  RNSScreenStackHeaderSubview: { directEventTypes: {}, validAttributes: { type: true } },
  RNSSearchBar: {
    directEventTypes: { topChangeText: directEvent('onChangeText') },
    validAttributes: { placeholder: true },
  },
  RNSScreenContentWrapper: { directEventTypes: {}, validAttributes: { collapsable: true } },
};

const ROOT_TAG = 91_701;
const fabric = installFabric();
setNativeViewConfigSource(name => VIEW_CONFIGS[name]);
const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

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
   <symbiote-view p={{ testID: 'home', accessibilityLabel: route.current.name + ':' + String(focused.current) }} />`;

const DETAILS_SOURCE = `<symbiote-view p={{ testID: 'details' }} />`;

// The app-level markers are written on SEPARATE LINES on purpose: that is how any reasonable
// author formats them, and it is exactly the shape svelte-adapter-dom-shim skill §16 turns into
// stray single-space text nodes. Rendering them inside the collapsed `symbiote-text` registry
// host is what keeps that legal - the assertion on the committed outline below is what proves it.
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
  return typeof value === 'object' && value !== null && 'push' in value && 'pop' in value;
}

// `variant` gives each differently-configured fixture its OWN compiled filename: Node caches
// `import()` by path, so writing new content to a path an earlier test already imported hands
// back the STALE module (svelte-adapter-dom-shim skill §15).
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
  if (!isNavigatorHandle(handle)) throw new Error('Stack did not expose a navigator handle');
  return handle;
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

const PROFILE_SOURCE = `<symbiote-view p={{ testID: 'profile' }} />`;

function isDynamicControls(value: unknown): value is { hideDetails: () => void } {
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
  const app = harness.compileSource(dir, 'stack-app-dynamic', DYNAMIC_APP_SOURCE);
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
  if (!isNavigatorHandle(handle)) throw new Error('Stack did not expose a navigator handle');
  if (!isDynamicControls(controls)) throw new Error('the dynamic fixture exposed no controls');
  return { handle, hideDetails: controls.hideDetails };
}

// No product-level Negative group: every export here (push/pop/replace/canGoBack, screen
// registration, options folding) accepts whatever it's given and composes it - there is no
// user-input validation path in this Svelte lifecycle layer that is meant to reject/throw
// (unlike runes/runes.smoke.test.ts's requireNavigationScope guards, or the core reducer's own
// tests). `mountStack`'s `isNavigatorHandle` check above is a TEST-HARNESS safeguard against a
// broken fixture, not a product contract under test, so it stays out of the grouping below.
describe('Stack (real compiled index.svelte)', () => {
  describe('Positive', () => {
    it('paints the react-native-screens chrome for the initial route', async () => {
      // why: the lone RCTRawText is the whitespace between the two `<Screen>` markers in the
      // fixture - it must land inside the collapsed RCTText registry host (../registry-host.ts)
      // rather than become an illegal raw-text child of RNSScreenStack, and the initial route's
      // screen must paint as RNSScreen > RNSScreenStackHeaderConfig + RNSScreenContentWrapper.
      await mountStack();

      expect(outline(fabric.appRoot())).toEqual([
        'RCTView',
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
      // why: the context-based screen collector must populate the registry during the SAME
      // synchronous mount pass that paints it (this file's header comment) - proven by push
      // immediately reaching a route the collector registered moments earlier - and the exported
      // handle's push/pop must move canGoBack() in lockstep with the actual RNSScreen count.
      const handle = await mountStack();
      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);

      handle.push('details');
      await tick();
      await tick();
      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(2);
      expect(handle.canGoBack()).toBe(true);

      handle.pop();
      await tick();
      await tick();
      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);
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

      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);
      const screen = findLive(fabric.appRoot(), 'RNSScreenContentWrapper');
      expect(screen?.children?.[0]?.props?.testID).toBe('details');
    });

    it('honours initialRouteName over registration order', async () => {
      // why: initialRouteName must win over "whichever <Screen> registered first" - the second
      // registered screen ("details") mounts as the initial route when named explicitly.
      await mountStack('initial-route', 'initialRouteName="details"');
      const wrapper = findLive(fabric.appRoot(), 'RNSScreenContentWrapper');
      expect(wrapper?.children?.[0]?.props?.testID).toBe('details');
    });

    it('folds screen options into the native header config', async () => {
      // why: per-screen `options` must reach the native RNSScreenStackHeaderConfig view's props
      // (title/largeTitle), not stay trapped in JS state - this is the only way a screen actually
      // gets a native header.
      await mountStack('options', '', 'options={{ title: "Home screen", headerLargeTitle: true }}');
      const header = findLive(fabric.appRoot(), 'RNSScreenStackHeaderConfig');
      expect(header?.props?.title).toBe('Home screen');
      expect(header?.props?.largeTitle).toBe(true);
    });

    it('drives useIsFocused from the native onAppear/onDisappear events', async () => {
      // why: useIsFocused has no synthetic timer of its own (see use-is-focused.svelte.ts) - it
      // must track the REAL native RNSScreen onAppear/onDisappear events one-to-one, starting
      // false, since a route genuinely isn't focused at the instant it mounts.
      await mountStack();
      expect(findLiveByTestId(fabric.appRoot(), 'home')?.props?.accessibilityLabel).toBe(
        'home:false',
      );

      const screen = findLive(fabric.appRoot(), 'RNSScreen');
      expect(screen).toBeDefined();
      if (screen === undefined) return;

      fabric.fireEvent(screen.instanceHandle, 'topAppear', {});
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'home')?.props?.accessibilityLabel).toBe(
        'home:true',
      );

      fabric.fireEvent(screen.instanceHandle, 'topDisappear', {});
      await tick();
      await tick();
      expect(findLiveByTestId(fabric.appRoot(), 'home')?.props?.accessibilityLabel).toBe(
        'home:false',
      );
    });

    it('pops one route when the native screen reports a dismissal', async () => {
      // why: an iOS swipe-back or native back-button press reports `topDismissed` on the native
      // screen, not a JS-driven pop() call - the stack must still respond by popping exactly one
      // route, keeping JS state in sync with what the user already saw happen natively.
      const handle = await mountStack();
      handle.push('details');
      await tick();
      await tick();

      const topScreen = findAllLive(fabric.appRoot(), 'RNSScreen')[1];
      expect(topScreen).toBeDefined();
      if (topScreen === undefined) return;

      fabric.fireEvent(topScreen.instanceHandle, 'topDismissed', {});
      await tick();
      await tick();
      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);
    });

    it('mounts the search bar and wires its imperative ref to real view commands', async () => {
      // why: `headerSearchBarOptions.ref` is an ESCAPE HATCH into imperative native view commands
      // (setText etc.) - this proves the ref actually resolves to a live RNSSearchBar tag and that
      // calling a method on it dispatches a REAL Fabric command, not a no-op stub.
      const searchBarRef: { current: ISearchBarCommands | null } = { current: null };
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

      const searchBar = findLive(fabric.appRoot(), 'RNSSearchBar');
      expect(searchBar?.props?.placeholder).toBe('Find');
      expect(findLive(fabric.appRoot(), 'RNSScreenStackHeaderSubview')?.props?.type).toBe(
        'searchBar',
      );

      expect(searchBarRef.current).not.toBeNull();
      searchBarRef.current?.setText('hello');
      expect(fabric.commands).toHaveLength(1);
      expect(fabric.commands[0]?.commandName).toBe('setText');
      expect(fabric.commands[0]?.args).toEqual(['hello']);
    });

    it('nests an inner stack so a modally presented screen can host a header', async () => {
      // why: a `stackPresentation: "formSheet"` screen must mount inside its OWN nested
      // RNSScreenStack (wrapped in RNSModalScreen) so it can still carry a native header - this is
      // architecturally distinct from a plain pushed screen, not just a style variant.
      await mountStack('modal', '', 'options={{ stackPresentation: "formSheet" }}');

      expect(outline(fabric.appRoot())).toEqual([
        'RCTView',
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
      // why: the route list is navigation HISTORY, not a projection of the registered markers, so
      // a marker unregistering (its `{#if}` going false, onDestroy firing) while its route is still
      // pushed used to leave a phantom entry - a route nothing can render, which the user cannot
      // see but every back press has to walk through. Reconciling against the registry must drop it
      // and leave the user on a real screen.
      const { handle, hideDetails } = await mountDynamicStack();
      handle.push('details');
      await tick();
      await tick();
      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(2);

      hideDetails();
      await tick();
      await tick();

      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);
      expect(findLiveByTestId(fabric.appRoot(), 'home')).toBeDefined();
      expect(findLiveByTestId(fabric.appRoot(), 'details')).toBeUndefined();
      expect(handle.canGoBack()).toBe(false);
    });

    it('keeps the pruned history when a new route is pushed afterwards', async () => {
      // why: the pruning must be PERSISTED, not just derived for the paint - a phantom left in the
      // pushed state has the next push rebuild the stack on top of it, and the user then has to
      // press back TWICE to leave a route they only visited once.
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

      expect(countLive(fabric.appRoot(), 'RNSScreen')).toBe(1);
      expect(findLiveByTestId(fabric.appRoot(), 'home')).toBeDefined();
      expect(handle.canGoBack()).toBe(false);
    });
  });

  // Not a Positive/Negative behavior scenario - a build-hygiene audit that the package's OWN
  // templates compile edge-to-edge with no stray whitespace text nodes (skill §16), distinct from
  // the deliberately-not-packed app fixture used by the tests above.
  describe('compilation hygiene', () => {
    it('compiles every navigator template with no stray whitespace text nodes', () => {
      const audit = createSvelteHarness('stack-audit');
      audit.compileFile(join(__dirname, 'index.svelte'));
      audit.compileFile(join(__dirname, '../navigation-scope.svelte'));
      audit.compileFile(join(__dirname, '../screen.svelte'));
      expect(audit.strayWhitespaceCount()).toBe(0);
      audit.cleanup();
    });
  });
});
