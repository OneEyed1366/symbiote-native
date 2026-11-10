// Route names shared by the `symbioteScreen` registrations in App.ts and every `push` call
// One source of truth, so a typo cannot create a dead route on one side only
// ReactiveStyle is Angular only, it guards a defect of this adapter

export const ROUTE_NAME = {
  Menu: 'Menu',
  Canary: 'Canary',
  Details: 'Details',
  HeaderOptions: 'HeaderOptions',
  SheetDemo: 'SheetDemo',
  TabsDemo: 'TabsDemo',
  NativeTabs: 'NativeTabs',
  HeaderViews: 'HeaderViews',
  Gestures: 'Gestures',
  Events: 'Events',
  OverlayContainers: 'OverlayContainers',
  TransitionProgress: 'TransitionProgress',
  InsetsStatusBar: 'InsetsStatusBar',
  StackTransitions: 'StackTransitions',
  RuntimeConfig: 'RuntimeConfig',
  DrawerDemo: 'DrawerDemo',
  NestedNavigators: 'NestedNavigators',
  HooksDemo: 'HooksDemo',
  DeepLinking: 'DeepLinking',
  StatePersistence: 'StatePersistence',
  ReactiveStyle: 'ReactiveStyle',
  ApiPlayground: 'ApiPlayground',
  Benchmark: 'Benchmark',
  StyleShowcase: 'StyleShowcase',
  Reanimated: 'Reanimated',
  FrameworkHub: 'FrameworkHub',
  NavigationHub: 'NavigationHub',
  PackagesHub: 'PackagesHub',
  BenchmarksHub: 'BenchmarksHub',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
