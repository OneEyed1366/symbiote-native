// Route-name constants shared between the navigator's <Stack.Screen name="..."> registrations and
// every screen's navigation().push(...) calls — one source of truth so a typo cannot silently
// create a dead route on one side only. Ported from examples/react/routes.ts and
// examples/svelte/routes.ts; the names are framework-agnostic.
//
// ITourRouteName lives HERE rather than in navigation-lines.ts (where the React and Svelte ports
// keep it) because MENU_ROWS below needs it, and navigation-lines.ts already imports ROUTE_NAME
// from this file — the type would close a module cycle for no gain. Route identity belongs with
// the route names; navigation-lines.ts keeps only the visual line mapping.

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

// Every route reachable from MenuScreen, minus Menu itself. Excludes Details too: it is the
// DeepLinking demo's resolution target (symbiotecanarysolid://details/:id), not a tour stop.
export type ITourRouteName = Exclude<
  IRouteName,
  typeof ROUTE_NAME.Menu | typeof ROUTE_NAME.Details
>;

export type IMenuRow = {
  route: ITourRouteName;
  label: string;
  blurb: string;
};

// The menu is data-driven on purpose: adding a demo screen is one entry here plus one
// <Stack.Screen> marker in App.tsx, never an edit inside MenuScreen's JSX. Only routes that have a
// registered screen belong in this array — an entry whose marker does not exist yet renders a row
// that pushes a route the navigator cannot resolve.
// Order matches examples/react and examples/svelte row-for-row, so the three canaries can be read
// side by side. Only the two Solid-specific blurbs differ.
export const MENU_ROWS: readonly IMenuRow[] = [
  {
    route: ROUTE_NAME.Canary,
    label: 'All primitives (Canary)',
    blurb: 'every @symbiote-native/solid primitive',
  },
  {
    route: ROUTE_NAME.ApiPlayground,
    label: 'API Playground',
    blurb: 'signals, stores, control flow, Suspense — solid-js itself, live',
  },
  {
    route: ROUTE_NAME.HeaderOptions,
    label: 'Header options',
    blurb: 'bar buttons, menu, search bar, large title',
  },
  {
    route: ROUTE_NAME.SheetDemo,
    label: 'Sheet presentation',
    blurb: 'formSheet + multiple detents',
  },
  {
    route: ROUTE_NAME.TabsDemo,
    label: 'Tabs',
    blurb: 'bottom-tabs — icon, badge, tint',
  },
  {
    route: ROUTE_NAME.DrawerDemo,
    label: 'Drawer',
    blurb: 'swipeable drawer — right side, slide type',
  },
  {
    route: ROUTE_NAME.NestedNavigators,
    label: 'Nested navigators',
    blurb: 'Tab nested in a Stack screen + getParent()',
  },
  {
    route: ROUTE_NAME.HooksDemo,
    label: 'Hooks',
    blurb: 'useFocusEffect / useIsFocused / useNavigationState',
  },
  {
    route: ROUTE_NAME.DeepLinking,
    label: 'Deep linking',
    blurb: 'resolveRouteFromUrl against a typed URL',
  },
  {
    route: ROUTE_NAME.StatePersistence,
    label: 'State persistence',
    blurb: 'serialize/deserialize the Stack state',
  },
];
