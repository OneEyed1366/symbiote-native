// Solid canary app entry: the native stack navigator over every demo screen, starting at Menu
// Menu lists four sections, each opens a hub with its stops; Details is reached only by deep link

// SCREEN DISCOVERY, as on Svelte: Solid cannot inspect its children
// `<Stack.Screen>` markers register themselves on a collector the navigator publishes on context
// The registry is still empty while the Stack body runs, so marker order is declaration order

// THE LINKING HANDLE, which neither the React nor the Svelte shape ports
// `createLinkingIntegration` reads an Accessor in `onMount`, and a `ref` is called while its
// component is created, before any effect, so one plain signal wired through is enough

import { createSignal, For, onMount } from 'solid-js';
import {
  Stack,
  createLinkingIntegration,
} from '@symbiote-native/navigation/solid';
import type {
  INavigatorHandle,
  ISolidScreenOptions,
} from '@symbiote-native/navigation/solid';
import { hide } from '@symbiote-native/splash-screen';
import { ApiPlaygroundScreen } from './screens/ApiPlaygroundScreen';
import { BenchmarkScreen } from './screens/BenchmarkScreen';
import { CanaryScreen } from './screens/CanaryScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import {
  HeaderOptionsScreen,
  headerOptionsScreenOptions,
} from './screens/HeaderOptionsScreen';
import { DEMO_SCREENS } from './screens/demo-screens';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { MenuScreen } from './screens/MenuScreen';
import { HUB_SCREENS } from './screens/SectionHubScreen';
import {
  SheetDemoScreen,
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen';
import { ReanimatedScreen } from './screens/ReanimatedScreen';
import { StyleShowcaseScreen } from './screens/StyleShowcaseScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import './App.css';
import './navigation.css';
// Holds `scroll-content`, `text-input` and other classes every screen uses, and a screen's own
// import runs only on its first render, as Metro inlines the require
import './screens/CanaryScreen.css';

const HEADER_BACKGROUND = '#0b1622';
const DETAILS_TRANSITION_DURATION_MS = 300;

// Six of the headers differ only in title and tint, so they share this builder
function darkHeader(title: string, tint: string): ISolidScreenOptions {
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

const menuScreenOptions: ISolidScreenOptions = {
  title: 'Navigation Demos',
  headerTranslucent: true,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: HEADER_BACKGROUND },
  headerUserInterfaceStyle: 'dark',
};

const canaryScreenOptions = darkHeader('Symbiote Canary', LINE_COLOR.primitives);
const hooksDemoScreenOptions = darkHeader('Hooks Demo', LINE_COLOR.introspection);
const apiPlaygroundScreenOptions = darkHeader(
  'API Playground',
  LINE_COLOR.introspection,
);
const reanimatedScreenOptions = darkHeader('Reanimated', LINE_COLOR.performance);
const benchmarkScreenOptions = darkHeader('Benchmark', LINE_COLOR.performance);
const styleShowcaseScreenOptions = darkHeader(
  'Styling showcase',
  LINE_COLOR.styling,
);

// Pinned, `default` resolves to a native transition of about 480ms
const detailsScreenOptions: ISolidScreenOptions = {
  title: 'Navigation Demo',
  headerTranslucent: true,
  headerTintColor: LINE_COLOR.primitives,
  headerTitleColor: '#ffffff',
  headerStyle: { backgroundColor: HEADER_BACKGROUND },
  headerUserInterfaceStyle: 'dark',
  stackAnimation: 'slide_from_right',
  transitionDuration: DETAILS_TRANSITION_DURATION_MS,
};

export default function App() {
  const [stackHandle, setStackHandle] = createSignal<INavigatorHandle | null>(
    null,
  );

  createLinkingIntegration(APP_LINKING_CONFIG, stackHandle);

  // Bare `hide()` as in the other canaries, none of which wires the full `useHideAnimation` fade
  // It sits at the root, not in a screen, as the first route mounted is Menu
  onMount(() => {
    hide();
  });

  return (
    <Stack
      ref={handle => setStackHandle(handle)}
      initialRouteName={ROUTE_NAME.Menu}
    >
      <Stack.Screen
        name={ROUTE_NAME.Menu}
        component={MenuScreen}
        options={menuScreenOptions}
      />
      <For each={HUB_SCREENS}>
        {hub => (
          <Stack.Screen
            name={hub.name}
            component={hub.component}
            options={hub.options}
          />
        )}
      </For>
      <Stack.Screen
        name={ROUTE_NAME.Canary}
        component={CanaryScreen}
        options={canaryScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.Details}
        component={DetailsScreen}
        options={detailsScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.HeaderOptions}
        component={HeaderOptionsScreen}
        options={headerOptionsScreenOptions}
      />
      <For each={DEMO_SCREENS}>
        {demo => (
          <Stack.Screen
            name={demo.name}
            component={demo.component}
            options={demo.options}
          />
        )}
      </For>
      <Stack.Screen
        name={ROUTE_NAME.SheetDemo}
        component={SheetDemoScreen}
        options={sheetDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.HooksDemo}
        component={HooksDemoScreen}
        options={hooksDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.ApiPlayground}
        component={ApiPlaygroundScreen}
        options={apiPlaygroundScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.Reanimated}
        component={ReanimatedScreen}
        options={reanimatedScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.Benchmark}
        component={BenchmarkScreen}
        options={benchmarkScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.StyleShowcase}
        component={StyleShowcaseScreen}
        options={styleShowcaseScreenOptions}
      />
    </Stack>
  );
}
