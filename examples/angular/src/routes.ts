// Route names shared by the `symbioteScreen` registrations in App.ts and every `push` call
// One source of truth, so a typo cannot create a dead route on one side only
// The surface matches the React canary, except ReactiveStyle: it guards an Angular-only defect

export const ROUTE_NAME = {
  Menu: 'Menu',
  Canary: 'Canary',
  Details: 'Details',
  HeaderOptions: 'HeaderOptions',
  SheetDemo: 'SheetDemo',
  TabsDemo: 'TabsDemo',
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
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
