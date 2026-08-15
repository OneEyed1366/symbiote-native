<script lang="ts">
  // Symbiote Svelte canary app entry: composes the native stack navigator
  // (@symbiote-native/navigation/svelte, driven by react-native-screens' RNSScreen/RNSScreenStack
  // native views) over the full demo screen surface. Menu is the initial route — a menu of buttons,
  // one per navigator/feature @symbiote-native/navigation exports; Canary is the app's OWN former
  // root content (every @symbiote-native/svelte primitive), unchanged and reachable from the menu's
  // first row. Details has no menu row of its own — it's the DeepLinking demo's resolution target
  // (symbiotecanarysvelte://details/:id), reached only through that tour stop. Svelte twin of
  // examples/vue-sfc/App.vue: `<Screen>` (not the dotted `Stack.Screen`) is the same marker every
  // ./screens component imports standalone — @symbiote-native/navigation/svelte exports it at the
  // top level precisely so templates never need a dotted tag reference.
  //
  // HOW THE SCREENS ARE DISCOVERED differs from every other adapter, and it shows here: Svelte
  // hands a component its children as an opaque Snippet, so <Stack> cannot scan them the way React
  // reads a children array or Vue scans slot vnodes. Each <Screen> marker registers ITSELF on a
  // collector the navigator publishes on the context (packages/navigation/src/svelte/
  // screen-registry.ts). Authoring is unchanged; only the mechanism underneath is inverted.
  //
  // useLinkingIntegration takes a GETTER over the Stack's `bind:this` target, not the resolved
  // handle: a Svelte component's script runs exactly once and `bind:this` only lands during mount,
  // so the rune reads it inside its own $effect. Declaring the target with `$state.raw` makes that
  // read tracked, so the wiring re-runs the moment the binding resolves — no mount-ordering
  // guarantee needed at all. See packages/navigation/src/svelte/linking.svelte.ts's header.
  //
  // MARKUP FORMATTING IS LOAD-BEARING: sibling markers are packed edge-to-edge with zero
  // whitespace between them (svelte-adapter-dom-shim skill §16). The navigator parks the markers
  // inside a collapsed symbiote-text so a stray space could not crash a device, but the audit
  // (`node scripts/audit-svelte-stray-whitespace.mjs`) still expects zero.
  import './App.css';
  import { Screen, Stack, useLinkingIntegration } from '@symbiote-native/navigation/svelte';
  import type { INavigatorHandle, IScreenOptions } from '@symbiote-native/navigation/svelte';
  import { hide } from '@symbiote-native/splash-screen/svelte';

  import MenuScreen from './screens/MenuScreen.svelte';
  import CanaryScreen from './screens/CanaryScreen.svelte';
  import DetailsScreen from './screens/DetailsScreen.svelte';
  import HeaderOptionsScreen from './screens/HeaderOptionsScreen.svelte';
  import { headerOptionsScreenOptions } from './screens/header-options-screen-options';
  import SheetDemoScreen from './screens/SheetDemoScreen.svelte';
  import TabsDemoScreen from './screens/TabsDemoScreen.svelte';
  import DrawerDemoScreen from './screens/DrawerDemoScreen.svelte';
  import NestedNavigatorsScreen from './screens/NestedNavigatorsScreen.svelte';
  import HooksDemoScreen from './screens/HooksDemoScreen.svelte';
  import DeepLinkingScreen from './screens/DeepLinkingScreen.svelte';
  import StatePersistenceScreen from './screens/StatePersistenceScreen.svelte';
  import { APP_LINKING_CONFIG } from './navigation-linking';
  import { ROUTE_NAME } from './routes';
  import { LINE_COLOR } from './navigation-lines';

  // The surface every demo screen's header shares — one dark, translucent bar, only the tint
  // changing per line. Written once here rather than repeated inline on nine <Screen> markers.
  const HEADER_BACKGROUND = '#1a1a1a';
  const DETAILS_TRANSITION_DURATION_MS = 300;

  // Seven of the nine tour stops carry a byte-identical header apart from title and tint, so they
  // share this builder. Menu, Details, HeaderOptions and SheetDemo each deviate on purpose (no
  // headerShown, a transition, a large title, formSheet sizing) and are written out in full below.
  function darkHeader(title: string, headerTintColor: string): IScreenOptions {
    return {
      title,
      headerShown: true,
      headerTranslucent: true,
      headerTintColor,
      headerTitleColor: '#ffffff',
      headerStyle: { backgroundColor: HEADER_BACKGROUND },
      headerUserInterfaceStyle: 'dark',
    };
  }

  const menuScreenOptions: IScreenOptions = {
    title: 'Navigation Demos',
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
  };

  const canaryScreenOptions: IScreenOptions = darkHeader('Symbiote Canary', LINE_COLOR.primitives);

  const detailsScreenOptions: IScreenOptions = {
    title: 'Navigation Demo',
    headerTranslucent: true,
    headerTintColor: LINE_COLOR.primitives,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
    stackAnimation: 'slide_from_right',
    transitionDuration: DETAILS_TRANSITION_DURATION_MS,
  };

  // Registered below on <Screen name={ROUTE_NAME.SheetDemo}> — a plain options object is enough
  // here (unlike headerOptionsScreenOptions's resolver) since none of these fields need the live
  // navigation handle.
  const sheetDemoScreenOptions: IScreenOptions = {
    title: 'Sheet Demo',
    headerShown: true,
    // NOT translucent, unlike every other screen's headerStyle: formSheet has its own separate
    // header-height accounting in react-native-screens (RNSScreenContentWrapper's
    // headerHeightErrata walk). An opaque headerStyle still gets a dark, on-theme bar without
    // touching that formSheet sizing path.
    //
    // The real cause of a blank/translucent formSheet was never headerTranslucent but stack.ts's
    // RNSScreenContentWrapper style: it used to hardcode `{ flex: 1 }` for every presentation,
    // which react-native-screens' own ScreenStackItem.tsx never does for formSheet (see
    // resolveScreenContentWrapperStyle in core/render-stack.ts) — `flex: 1` (`bottom: 0`) forces a
    // strict frame on every native shadow-state update during a detent drag, the visible flicker
    // PR #1870 fixed by switching formSheet to `absoluteWithNoBottom` (sized bottom-up from
    // content). SheetDemoScreen wraps its content in a ScrollView specifically because of that:
    // react-native-screens' native fix for "content should still fill a taller detent" only
    // resizes a ScrollView child directly (RNSScreenContentWrapper.mm's
    // coerceChildScrollViewComponentSizeToSize), bypassing Yoga/flex entirely — a plain View would
    // stay sized to its own content and leave a plain-background gap below it on the 60%/100%
    // detents. The ScrollView must be the FIRST direct child of RNSScreenContentWrapper for that
    // native search to find it, which is why that screen skips SafeAreaView on purpose.
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
    stackPresentation: 'formSheet',
    sheetAllowedDetents: [0.3, 0.6, 1],
    sheetGrabberVisible: true,
    sheetCornerRadius: 20,
    sheetInitialDetentIndex: 0,
  };

  const tabsDemoScreenOptions: IScreenOptions = darkHeader('Tabs Demo', LINE_COLOR.structure);
  const drawerDemoScreenOptions: IScreenOptions = darkHeader('Drawer Demo', LINE_COLOR.structure);
  const nestedNavigatorsScreenOptions: IScreenOptions = darkHeader(
    'Nested Navigators',
    LINE_COLOR.structure,
  );
  const hooksDemoScreenOptions: IScreenOptions = darkHeader(
    'Hooks Demo',
    LINE_COLOR.introspection,
  );
  const deepLinkingScreenOptions: IScreenOptions = darkHeader('Deep Linking', LINE_COLOR.routing);
  const statePersistenceScreenOptions: IScreenOptions = darkHeader(
    'State Persistence',
    LINE_COLOR.routing,
  );

  // `unknown` + a runtime guard, not `INavigatorHandle | null` directly. @symbiote-native/navigation
  // ships Stack as a raw `.svelte` file, and TypeScript resolves an imported `.svelte` module from
  // node_modules through svelte's ambient `declare module '*.svelte'` fallback — a bare
  // `SvelteComponent<Record<string, any>>`, with the `export function` surface `bind:this` actually
  // hands back erased. So the binding target cannot be annotated as the handle; it is narrowed on
  // read instead. Same shape the navigator's own smoke test uses.
  let stackInstance = $state.raw<unknown>(null);

  function isNavigatorHandle(value: unknown): value is INavigatorHandle {
    return typeof value === 'object' && value !== null && 'push' in value && 'replace' in value;
  }

  useLinkingIntegration(APP_LINKING_CONFIG, () =>
    isNavigatorHandle(stackInstance) ? stackInstance : null,
  );

  // Bare hide(), matching examples/react's App.tsx and examples/vue-sfc's App.vue — this app has
  // no manifest/logo assets wired up for the full useHideAnimation fade, so a plain mount-time
  // hide() is the right-sized fix here. It lives at the root rather than inside a screen because
  // the first-mounted route is Menu, not the canary.
  $effect(() => {
    hide();
  });
</script>

<Stack bind:this={stackInstance} initialRouteName={ROUTE_NAME.Menu}
  ><Screen name={ROUTE_NAME.Menu} component={MenuScreen} options={menuScreenOptions}
  /><Screen name={ROUTE_NAME.Canary} component={CanaryScreen} options={canaryScreenOptions}
  /><Screen name={ROUTE_NAME.Details} component={DetailsScreen} options={detailsScreenOptions}
  /><Screen
    name={ROUTE_NAME.HeaderOptions}
    component={HeaderOptionsScreen}
    options={headerOptionsScreenOptions}
  /><Screen
    name={ROUTE_NAME.SheetDemo}
    component={SheetDemoScreen}
    options={sheetDemoScreenOptions}
  /><Screen name={ROUTE_NAME.TabsDemo} component={TabsDemoScreen} options={tabsDemoScreenOptions}
  /><Screen
    name={ROUTE_NAME.DrawerDemo}
    component={DrawerDemoScreen}
    options={drawerDemoScreenOptions}
  /><Screen
    name={ROUTE_NAME.NestedNavigators}
    component={NestedNavigatorsScreen}
    options={nestedNavigatorsScreenOptions}
  /><Screen
    name={ROUTE_NAME.HooksDemo}
    component={HooksDemoScreen}
    options={hooksDemoScreenOptions}
  /><Screen
    name={ROUTE_NAME.DeepLinking}
    component={DeepLinkingScreen}
    options={deepLinkingScreenOptions}
  /><Screen
    name={ROUTE_NAME.StatePersistence}
    component={StatePersistenceScreen}
    options={statePersistenceScreenOptions}
  /></Stack
>
