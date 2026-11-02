import type { Component } from 'svelte';
import type {
  IScreenOptionsResolver,
  ISvelteScreenOptions,
} from '@symbiote-native/navigation/svelte';
import { ROUTE_NAME } from '../routes';
import type { IRouteName } from '../routes';
import DeepLinkingScreen, {
  deepLinkingScreenOptions,
} from './DeepLinkingScreen.svelte';
import DrawerDemoScreen, {
  drawerDemoScreenOptions,
} from './DrawerDemoScreen.svelte';
import EventsScreen, { eventsScreenOptions } from './EventsScreen.svelte';
import GesturesScreen, { gesturesScreenOptions } from './GesturesScreen.svelte';
import HeaderViewsScreen, {
  headerViewsScreenOptions,
} from './HeaderViewsScreen.svelte';
import InsetsStatusBarScreen, {
  insetsStatusBarScreenOptions,
} from './InsetsStatusBarScreen.svelte';
import NativeTabsScreen, {
  nativeTabsScreenOptions,
} from './NativeTabsScreen.svelte';
import NestedNavigatorsScreen, {
  nestedNavigatorsScreenOptions,
} from './NestedNavigatorsScreen.svelte';
import OverlayContainersScreen, {
  overlayContainersScreenOptions,
} from './OverlayContainersScreen.svelte';
import RuntimeConfigScreen, {
  runtimeConfigScreenOptions,
} from './RuntimeConfigScreen.svelte';
import StackTransitionsScreen, {
  stackTransitionsScreenOptions,
} from './StackTransitionsScreen.svelte';
import StatePersistenceScreen, {
  statePersistenceScreenOptions,
} from './StatePersistenceScreen.svelte';
import TabsDemoScreen, { tabsDemoScreenOptions } from './TabsDemoScreen.svelte';
import TransitionProgressScreen, {
  transitionProgressScreenOptions,
} from './TransitionProgressScreen.svelte';

type IDemoScreen = {
  name: IRouteName;
  component: Component;
  options: ISvelteScreenOptions | IScreenOptionsResolver;
};

// The recipe screens, App.svelte registers each one on the stack beside the older demos
export const DEMO_SCREENS: readonly IDemoScreen[] = [
  {
    name: ROUTE_NAME.NativeTabs,
    component: NativeTabsScreen,
    options: nativeTabsScreenOptions,
  },
  {
    name: ROUTE_NAME.HeaderViews,
    component: HeaderViewsScreen,
    options: headerViewsScreenOptions,
  },
  {
    name: ROUTE_NAME.Gestures,
    component: GesturesScreen,
    options: gesturesScreenOptions,
  },
  {
    name: ROUTE_NAME.Events,
    component: EventsScreen,
    options: eventsScreenOptions,
  },
  {
    name: ROUTE_NAME.OverlayContainers,
    component: OverlayContainersScreen,
    options: overlayContainersScreenOptions,
  },
  {
    name: ROUTE_NAME.TransitionProgress,
    component: TransitionProgressScreen,
    options: transitionProgressScreenOptions,
  },
  {
    name: ROUTE_NAME.InsetsStatusBar,
    component: InsetsStatusBarScreen,
    options: insetsStatusBarScreenOptions,
  },
  {
    name: ROUTE_NAME.StackTransitions,
    component: StackTransitionsScreen,
    options: stackTransitionsScreenOptions,
  },
  {
    name: ROUTE_NAME.RuntimeConfig,
    component: RuntimeConfigScreen,
    options: runtimeConfigScreenOptions,
  },
  {
    name: ROUTE_NAME.TabsDemo,
    component: TabsDemoScreen,
    options: tabsDemoScreenOptions,
  },
  {
    name: ROUTE_NAME.DrawerDemo,
    component: DrawerDemoScreen,
    options: drawerDemoScreenOptions,
  },
  {
    name: ROUTE_NAME.NestedNavigators,
    component: NestedNavigatorsScreen,
    options: nestedNavigatorsScreenOptions,
  },
  {
    name: ROUTE_NAME.DeepLinking,
    component: DeepLinkingScreen,
    options: deepLinkingScreenOptions,
  },
  {
    name: ROUTE_NAME.StatePersistence,
    component: StatePersistenceScreen,
    options: statePersistenceScreenOptions,
  },
];
