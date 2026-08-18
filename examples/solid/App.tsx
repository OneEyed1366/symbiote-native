// Solid canary app entry: composes the native stack navigator (@symbiote-native/navigation/solid,
// driven by react-native-screens' RNSScreen/RNSScreenStack native views) over the demo screen
// surface. Menu is the initial route; Canary — the app's whole former root content, the
// every-primitive tab surface — is the menu's first row. Details carries no menu row: it is the
// DeepLinking stop's resolution target (symbiotecanarysolid://details/:id) and nothing else.
//
// SCREEN DISCOVERY, as on Svelte: Solid cannot inspect its children, so <Stack.Screen> markers
// register THEMSELVES on a collector the navigator publishes on context. The registry is therefore
// still empty while the Stack body runs — the navigator seeds lazily from it, which is why marker
// order in here is declaration order and nothing else (packages/navigation/src/solid/stack, note 1).
//
// THE LINKING HANDLE. Neither the React nor the Svelte shape ports:
//   - React mounts a separate <LinkingRunner> child once the ref lands, because a ref is null on
//     the first render pass and React gets a SECOND pass to mount it on. Solid has no second pass.
//   - Svelte hands a GETTER over `bind:this` and re-runs an $effect when the binding resolves,
//     because `bind:this` only lands during mount.
// Solid needs neither, and the reason is an ordering guarantee the other two lack:
// createLinkingIntegration takes an Accessor and reads it inside onMount, while a `ref` on a
// component is invoked during that component's own creation — strictly before any effect runs. So
// the signal is already populated by the time linking reads it, and one plain signal wired straight
// through is the whole answer. It is called BEFORE the JSX below only because onMount just queues.

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
import { StatePersistenceScreen } from './screens/StatePersistenceScreen';
import { TabsDemoScreen } from './screens/TabsDemoScreen';
import { APP_LINKING_CONFIG } from './navigation-linking';
import { ROUTE_NAME } from './routes';
import { LINE_COLOR } from './navigation-lines';
import './App.css';

// App.css's ground color, so a translucent header blends into the screen behind it instead of
// banding against it.
const HEADER_BACKGROUND = '#0b1020';
const DETAILS_TRANSITION_DURATION_MS = 300;

// Eight of the twelve headers differ only in title and tint, so they share this builder. Menu
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

  // Bare hide(), matching examples/react's App.tsx, examples/vue-sfc's App.vue and
  // examples/svelte's App.svelte — none of the canaries wire the full useHideAnimation fade, so a
  // plain mount-time hide is the right-sized call. It sits at the root, not in a screen, because
  // the first route mounted is Menu.
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
    </Stack>
  );
}
