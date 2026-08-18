// Route-name constants shared between App.ts's <ng-template symbioteScreen name="..."> registrations
// and every screen's navigation.push(...)/navigation.jumpTo(...) calls — a single source of truth so
// a typo can't silently create a dead route on one side only. Otherwise identical to the React
// canary's routes.ts (../react/routes.ts) — the route surface is framework-agnostic, only the
// wiring differs. The one exception is ReactiveStyle: a regression canary for an Angular-only
// styling-instruction defect (see screens/ReactiveStyleScreen.ts), so React has no twin of it.

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
  Probe: 'Probe',
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
