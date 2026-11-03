import type { Component } from 'solid-js';
import type {
  IScreenOptionsResolver,
  ISolidScreenOptions,
} from '@symbiote-native/navigation/solid';
import { ROUTE_NAME } from '../routes';
import type { IRouteName } from '../routes';
import {
  DeepLinkingScreen,
  deepLinkingScreenOptions,
} from './DeepLinkingScreen';
import { DrawerDemoScreen, drawerDemoScreenOptions } from './DrawerDemoScreen';
import { EventsScreen, eventsScreenOptions } from './EventsScreen';
import { GesturesScreen, gesturesScreenOptions } from './GesturesScreen';
import {
  HeaderViewsScreen,
  headerViewsScreenOptions,
} from './HeaderViewsScreen';
import { NativeTabsScreen, nativeTabsScreenOptions } from './NativeTabsScreen';
import {
  NestedNavigatorsScreen,
  nestedNavigatorsScreenOptions,
} from './NestedNavigatorsScreen';
import {
  InsetsStatusBarScreen,
  insetsStatusBarScreenOptions,
} from './InsetsStatusBarScreen';
import {
  OverlayContainersScreen,
  overlayContainersScreenOptions,
} from './OverlayContainersScreen';
import {
  RuntimeConfigScreen,
  runtimeConfigScreenOptions,
} from './RuntimeConfigScreen';
import {
  StackTransitionsScreen,
  stackTransitionsScreenOptions,
} from './StackTransitionsScreen';
import {
  StatePersistenceScreen,
  statePersistenceScreenOptions,
} from './StatePersistenceScreen';
import { TabsDemoScreen, tabsDemoScreenOptions } from './TabsDemoScreen';
import {
  TransitionProgressScreen,
  transitionProgressScreenOptions,
} from './TransitionProgressScreen';

type IDemoScreen = {
  name: IRouteName;
  component: Component;
  options: ISolidScreenOptions | IScreenOptionsResolver;
};

// The recipe screens, App.tsx registers each one on the stack beside the older demos
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
