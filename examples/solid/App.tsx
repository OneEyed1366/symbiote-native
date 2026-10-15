// Solid canary app entry: the native stack navigator over the demo screens
// Menu is the initial route and Canary is its first row
// Details has no menu row, the DeepLinking stop resolves to it (symbiotecanarysolid://details/:id)

// SCREEN DISCOVERY, as on Svelte: Solid cannot inspect its children
// `<Stack.Screen>` markers register themselves on a collector the navigator publishes on context
// The registry is still empty while the Stack body runs, so marker order is declaration order

// THE LINKING HANDLE, which neither the React nor the Svelte shape ports
// `createLinkingIntegration` reads an Accessor in `onMount`, and a `ref` is called while its
// component is created, before any effect, so one plain signal wired through is enough

import { createSignal, onMount } from 'solid-js';
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
import { DeepLinkingScreen } from './screens/DeepLinkingScreen';
import { DetailsScreen } from './screens/DetailsScreen';
import { DrawerDemoScreen } from './screens/DrawerDemoScreen';
import { HeaderOptionsScreen } from './screens/HeaderOptionsScreen';
import { headerOptionsScreenOptions } from './screens/header-options-screen-options';
import { HooksDemoScreen } from './screens/HooksDemoScreen';
import { MenuScreen } from './screens/MenuScreen';
import { NestedNavigatorsScreen } from './screens/NestedNavigatorsScreen';
import {
  SheetDemoScreen,
  sheetDemoScreenOptions,
} from './screens/SheetDemoScreen';
import { ReanimatedScreen } from './screens/ReanimatedScreen';
import { StatePersistenceScreen } from './screens/StatePersistenceScreen';
import { StyleShowcaseScreen } from './screens/StyleShowcaseScreen';
import { TabsDemoScreen } from './screens/TabsDemoScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import './App.css';

// App.css's ground color, so a translucent header blends into the screen behind it instead of
// banding against it.
const HEADER_BACKGROUND = '#0b1020';
const DETAILS_TRANSITION_DURATION_MS = 300;

// Nine of the thirteen headers differ only in title and tint, so they share this builder. Menu
// (no tint, no headerShown) and Details (a pinned transition) deviate below; HeaderOptions and
// SheetDemo own their options next to their screens, because those bags carry behavior — a live
// navigation handle and the formSheet detents — rather than just chrome.
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

const canaryScreenOptions = darkHeader(
  'Symbiote Canary',
  LINE_COLOR.primitives,
);
const apiPlaygroundScreenOptions = darkHeader(
  'API Playground',
  LINE_COLOR.primitives,
);
const tabsDemoScreenOptions = darkHeader('Tabs Demo', LINE_COLOR.structure);
const drawerDemoScreenOptions = darkHeader('Drawer Demo', LINE_COLOR.structure);
const nestedNavigatorsScreenOptions = darkHeader(
  'Nested Navigators',
  LINE_COLOR.structure,
);
const hooksDemoScreenOptions = darkHeader(
  'Hooks Demo',
  LINE_COLOR.introspection,
);
const deepLinkingScreenOptions = darkHeader('Deep Linking', LINE_COLOR.routing);
const statePersistenceScreenOptions = darkHeader(
  'State Persistence',
  LINE_COLOR.routing,
);
const benchmarkScreenOptions = darkHeader('Benchmark', LINE_COLOR.performance);
const styleShowcaseScreenOptions = darkHeader(
  'Styling Showcase',
  LINE_COLOR.styling,
);
const reanimatedScreenOptions = darkHeader(
  'Reanimated',
  LINE_COLOR.performance,
);

// Not darkHeader(): Details is the one screen arrived at by deep link rather than by tap, so it
// pins its own push animation instead of inheriting whatever the OS default is.
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
      <Stack.Screen
        name={ROUTE_NAME.Canary}
        component={CanaryScreen}
        options={canaryScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.ApiPlayground}
        component={ApiPlaygroundScreen}
        options={apiPlaygroundScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.StyleShowcase}
        component={StyleShowcaseScreen}
        options={styleShowcaseScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.Reanimated}
        component={ReanimatedScreen}
        options={reanimatedScreenOptions}
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
      <Stack.Screen
        name={ROUTE_NAME.SheetDemo}
        component={SheetDemoScreen}
        options={sheetDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.TabsDemo}
        component={TabsDemoScreen}
        options={tabsDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.DrawerDemo}
        component={DrawerDemoScreen}
        options={drawerDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.NestedNavigators}
        component={NestedNavigatorsScreen}
        options={nestedNavigatorsScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.HooksDemo}
        component={HooksDemoScreen}
        options={hooksDemoScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.DeepLinking}
        component={DeepLinkingScreen}
        options={deepLinkingScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.StatePersistence}
        component={StatePersistenceScreen}
        options={statePersistenceScreenOptions}
      />
      <Stack.Screen
        name={ROUTE_NAME.Benchmark}
        component={BenchmarkScreen}
        options={benchmarkScreenOptions}
      />
    </Stack>
  );
}
