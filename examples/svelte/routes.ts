// Route names shared by the `<Screen name>` markers in App.svelte and every `push` call
// One source of truth, so a typo cannot create a dead route on one side only
// CanaryScreen reads them too, for its own line tag

export const ROUTE_NAME = {
  Menu: 'Menu',
  Canary: 'Canary',
  ApiPlayground: 'ApiPlayground',
  Details: 'Details',
  HeaderOptions: 'HeaderOptions',
  SheetDemo: 'SheetDemo',
  TabsDemo: 'TabsDemo',
  DrawerDemo: 'DrawerDemo',
  NestedNavigators: 'NestedNavigators',
  HooksDemo: 'HooksDemo',
  DeepLinking: 'DeepLinking',
  StatePersistence: 'StatePersistence',
  Benchmark: 'Benchmark',
  PrimitiveBench: 'PrimitiveBench',
  StyleShowcase: 'StyleShowcase',
  Reanimated: 'Reanimated',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
