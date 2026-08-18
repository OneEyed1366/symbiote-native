// Route-name constants shared between a navigator's <Screen name="..."> registrations and every
// screen's navigation.push(...)/navigation.jumpTo(...) calls — a single source of truth so a
// typo can't silently create a dead route on one side only. Verbatim port of
// examples/vue-sfc/routes.ts (itself a verbatim port of examples/react/routes.ts) — the route
// names/keys are framework-agnostic.
//
// Read by App.svelte's <Screen name={...}> registrations, by every screen's
// navigation.current.push(...), and by CanaryScreen's own "you are here" line tag.

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
} as const;

export type IRouteName = (typeof ROUTE_NAME)[keyof typeof ROUTE_NAME];
