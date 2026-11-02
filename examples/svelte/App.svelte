<script lang="ts">
  // The native stack over every demo screen, starting at Menu
  // Menu lists four sections, each opens a hub with its stops, Details is reached by deep link
  // Each `<Screen>` marker registers itself on a collector the navigator publishes on context
  import './App.css';
  import './navigation.css';
  import {
    Screen,
    Stack,
    useLinkingIntegration,
  } from '@symbiote-native/navigation/svelte';
  import type {
    INavigatorHandle,
    ISvelteScreenOptions,
  } from '@symbiote-native/navigation/svelte';
  import { hide } from '@symbiote-native/splash-screen/svelte';

  import MenuScreen from './screens/MenuScreen.svelte';
  import CanaryScreen from './screens/CanaryScreen.svelte';
  import ApiPlaygroundScreen from './screens/ApiPlaygroundScreen.svelte';
  import DetailsScreen from './screens/DetailsScreen.svelte';
  import HeaderOptionsScreen, {
    headerOptionsScreenOptions,
  } from './screens/HeaderOptionsScreen.svelte';
  import SheetDemoScreen, {
    sheetDemoScreenOptions,
  } from './screens/SheetDemoScreen.svelte';
  import HooksDemoScreen from './screens/HooksDemoScreen.svelte';
  import BenchmarkScreen from './screens/BenchmarkScreen.svelte';
  import PrimitiveBenchScreen from './screens/PrimitiveBenchScreen.svelte';
  import StyleShowcaseScreen from './screens/StyleShowcaseScreen.svelte';
  import ReanimatedScreen from './screens/ReanimatedScreen.svelte';
  import { DEMO_SCREENS } from './screens/demo-screens';
  import { HUB_SCREENS } from './screens/hub-screens';
  import { APP_LINKING_CONFIG } from './navigation-linking';
  import { ROUTE_NAME } from './routes';
  import { LINE_COLOR } from './navigation-lines';

  const HEADER_BACKGROUND = '#0b1622';
  const DETAILS_TRANSITION_DURATION_MS = 300;

  // Most headers differ only in title and tint, so they share this builder
  function darkHeader(title: string, tint: string): ISvelteScreenOptions {
    return {
      title,
      headerShown: true,
      headerTranslucent: true,
      headerTintColor: tint,
      headerTitleColor: '#ffffff',
      headerStyle: { backgroundColor: HEADER_BACKGROUND },
      headerUserInterfaceStyle: 'dark',
    };
  }

  const menuScreenOptions: ISvelteScreenOptions = {
    title: 'Navigation Demos',
    headerTranslucent: true,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
  };

  const canaryScreenOptions = darkHeader('Symbiote Canary', LINE_COLOR.primitives);
  const hooksDemoScreenOptions = darkHeader(
    'Hooks Demo',
    LINE_COLOR.introspection,
  );
  const apiPlaygroundScreenOptions = darkHeader(
    'API Playground',
    LINE_COLOR.introspection,
  );
  const reanimatedScreenOptions = darkHeader(
    'Reanimated',
    LINE_COLOR.performance,
  );
  const benchmarkScreenOptions = darkHeader('Benchmark', LINE_COLOR.performance);
  const primitiveBenchScreenOptions = darkHeader(
    'Primitive benchmark',
    LINE_COLOR.performance,
  );
  const styleShowcaseScreenOptions = darkHeader(
    'Styling showcase',
    LINE_COLOR.styling,
  );

  // Pinned, `default` resolves to a native transition of about 480ms
  const detailsScreenOptions: ISvelteScreenOptions = {
    title: 'Navigation Demo',
    headerTranslucent: true,
    headerTintColor: LINE_COLOR.primitives,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: HEADER_BACKGROUND },
    headerUserInterfaceStyle: 'dark',
    stackAnimation: 'slide_from_right',
    transitionDuration: DETAILS_TRANSITION_DURATION_MS,
  };

  // The `bind:this` target is an opaque component type, so it is narrowed on read
  let stackInstance = $state.raw<unknown>(null);

  function isNavigatorHandle(value: unknown): value is INavigatorHandle {
    return (
      typeof value === 'object' &&
      value !== null &&
      'push' in value &&
      'replace' in value
    );
  }

  // A getter, as `bind:this` only lands during mount and the rune reads it inside its effect
  useLinkingIntegration(APP_LINKING_CONFIG, () =>
    isNavigatorHandle(stackInstance) ? stackInstance : null,
  );

  // Bare `hide()` at the root, as the first route mounted is Menu
  $effect(() => {
    hide();
  });
</script>

<Stack bind:this={stackInstance} initialRouteName={ROUTE_NAME.Menu}>
  <Screen
    name={ROUTE_NAME.Menu}
    component={MenuScreen}
    options={menuScreenOptions}
  />
  {#each HUB_SCREENS as hub (hub.name)}
    <Screen name={hub.name} component={hub.component} options={hub.options} />
  {/each}
  <Screen
    name={ROUTE_NAME.Canary}
    component={CanaryScreen}
    options={canaryScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.Details}
    component={DetailsScreen}
    options={detailsScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.HeaderOptions}
    component={HeaderOptionsScreen}
    options={headerOptionsScreenOptions}
  />
  {#each DEMO_SCREENS as demo (demo.name)}
    <Screen name={demo.name} component={demo.component} options={demo.options} />
  {/each}
  <Screen
    name={ROUTE_NAME.SheetDemo}
    component={SheetDemoScreen}
    options={sheetDemoScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.HooksDemo}
    component={HooksDemoScreen}
    options={hooksDemoScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.ApiPlayground}
    component={ApiPlaygroundScreen}
    options={apiPlaygroundScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.Reanimated}
    component={ReanimatedScreen}
    options={reanimatedScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.Benchmark}
    component={BenchmarkScreen}
    options={benchmarkScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.PrimitiveBench}
    component={PrimitiveBenchScreen}
    options={primitiveBenchScreenOptions}
  />
  <Screen
    name={ROUTE_NAME.StyleShowcase}
    component={StyleShowcaseScreen}
    options={styleShowcaseScreenOptions}
  />
</Stack>
