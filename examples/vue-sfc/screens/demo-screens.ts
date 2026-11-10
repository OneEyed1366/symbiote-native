import type { Component } from 'vue';
import type {
  IScreenOptionsResolver,
  IVueScreenOptions,
} from '@symbiote-native/navigation/vue';
import { ROUTE_NAME } from '../routes';
import type { IRouteName } from '../routes';
import DeepLinkingScreen, {
  deepLinkingScreenOptions,
} from './DeepLinkingScreen.vue';
import DrawerDemoScreen, {
  drawerDemoScreenOptions,
} from './DrawerDemoScreen.vue';
import EventsScreen, { eventsScreenOptions } from './EventsScreen.vue';
import GesturesScreen, { gesturesScreenOptions } from './GesturesScreen.vue';
import HeaderViewsScreen, {
  headerViewsScreenOptions,
} from './HeaderViewsScreen.vue';
import InsetsStatusBarScreen, {
  insetsStatusBarScreenOptions,
} from './InsetsStatusBarScreen.vue';
import NativeTabsScreen, {
  nativeTabsScreenOptions,
} from './NativeTabsScreen.vue';
import NestedNavigatorsScreen, {
  nestedNavigatorsScreenOptions,
} from './NestedNavigatorsScreen.vue';
import OverlayContainersScreen, {
  overlayContainersScreenOptions,
} from './OverlayContainersScreen.vue';
import RuntimeConfigScreen, {
  runtimeConfigScreenOptions,
} from './RuntimeConfigScreen.vue';
import StackTransitionsScreen, {
  stackTransitionsScreenOptions,
} from './StackTransitionsScreen.vue';
import StatePersistenceScreen, {
  statePersistenceScreenOptions,
} from './StatePersistenceScreen.vue';
import TabsDemoScreen, { tabsDemoScreenOptions } from './TabsDemoScreen.vue';
import TransitionProgressScreen, {
  transitionProgressScreenOptions,
} from './TransitionProgressScreen.vue';

type IDemoScreen = {
  name: IRouteName;
  component: Component;
  options: IVueScreenOptions | IScreenOptionsResolver;
};

// The recipe screens, App.vue registers each one on the stack beside the older demos
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
