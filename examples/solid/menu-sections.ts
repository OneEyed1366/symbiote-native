import { ROUTE_NAME } from './routes';
import { NAV_LINE, ROUTE_LINE_INFO } from './navigation-lines';
import type {
  IHubRouteName,
  INavLine,
  ITourRouteName,
} from './navigation-lines';

export type IMenuItem = {
  label: string;
  route: ITourRouteName;
  hint: string;
};

export type IMenuSectionKey =
  'framework' | 'navigation' | 'packages' | 'benchmarks';

export type IMenuSection = {
  key: IMenuSectionKey;
  title: string;
  hint: string;
  route: IHubRouteName;
  // Colour and badge of the section's row on the root menu
  line: INavLine;
  code: string;
  // The hub titles each run of stops by their line instead of listing one flat column
  groupByLine?: boolean;
  items: readonly IMenuItem[];
};

export type IMenuGroup = {
  line: INavLine | undefined;
  items: readonly IMenuItem[];
};

// Groups keep the order their line first appears in, stops keep the menu order inside a group
export function sectionGroups(section: IMenuSection): readonly IMenuGroup[] {
  if (!section.groupByLine) return [{ line: undefined, items: section.items }];
  const byLine = new Map<INavLine, IMenuItem[]>();
  for (const item of section.items) {
    const { line } = ROUTE_LINE_INFO[item.route];
    byLine.set(line, [...(byLine.get(line) ?? []), item]);
  }
  return [...byLine].map(([line, items]) => ({ line, items }));
}

export const MENU_SECTIONS: readonly IMenuSection[] = [
  {
    key: 'framework',
    title: 'Framework',
    hint: 'primitives, Solid APIs, CSS styling',
    route: ROUTE_NAME.FrameworkHub,
    line: NAV_LINE.Primitives,
    code: 'FW',
    items: [
      {
        label: 'All primitives (Canary)',
        route: ROUTE_NAME.Canary,
        hint: 'every @symbiote-native/solid primitive',
      },
      {
        label: 'API Playground',
        route: ROUTE_NAME.ApiPlayground,
        hint: 'signals, stores, control flow, Suspense — solid-js itself, live',
      },
      {
        label: 'Styling showcase',
        route: ROUTE_NAME.StyleShowcase,
        hint: 'CSS · Modules · SCSS/Less/Stylus — and what is refused',
      },
    ],
  },
  {
    key: 'navigation',
    title: 'Navigation',
    hint: 'stack, tabs, drawer, sheets, hooks, linking',
    route: ROUTE_NAME.NavigationHub,
    line: NAV_LINE.Structure,
    code: 'NV',
    groupByLine: true,
    items: [
      {
        label: 'Header options',
        route: ROUTE_NAME.HeaderOptions,
        hint: 'bar buttons, menu, search bar, large title',
      },
      {
        label: 'Header views',
        route: ROUTE_NAME.HeaderViews,
        hint: 'custom title and buttons, back button, blur, shadow, glass',
      },
      {
        label: 'Gestures',
        route: ROUTE_NAME.Gestures,
        hint: 'swipe back, swipe area, prevent dismiss, hardware back',
      },
      {
        label: 'Sheet presentation',
        route: ROUTE_NAME.SheetDemo,
        hint: 'formSheet + multiple detents',
      },
      {
        label: 'Tabs',
        route: ROUTE_NAME.TabsDemo,
        hint: 'bottom-tabs — icon, badge, tint',
      },
      {
        label: 'Native tabs',
        route: ROUTE_NAME.NativeTabs,
        hint: 'UITabBarController, minimize on scroll, accessory, search tab',
      },
      {
        label: 'Overlays and containers',
        route: ROUTE_NAME.OverlayContainers,
        hint: 'toast above a modal, screen container',
      },
      {
        label: 'Drawer',
        route: ROUTE_NAME.DrawerDemo,
        hint: 'swipeable drawer — right side, slide type',
      },
      {
        label: 'Nested navigators',
        route: ROUTE_NAME.NestedNavigators,
        hint: 'Tab nested in a Stack screen + getParent()',
      },
      {
        label: 'Hooks',
        route: ROUTE_NAME.HooksDemo,
        hint: 'useFocusEffect / useIsFocused / useNavigationState',
      },
      {
        label: 'Events',
        route: ROUTE_NAME.Events,
        hint: 'focus, blur, state, transition progress, header attach',
      },
      {
        label: 'Transition progress',
        route: ROUTE_NAME.TransitionProgress,
        hint: 'animate with a push, swipe back, header height',
      },
      {
        label: 'Status bar and insets',
        route: ROUTE_NAME.InsetsStatusBar,
        hint: 'status bar, orientation, safe area edges, scroll edge',
      },
      {
        label: 'Stack transitions',
        route: ROUTE_NAME.StackTransitions,
        hint: 'presentation, animation, push, pop, popTo, replace, reset',
      },
      {
        label: 'Runtime config',
        route: ROUTE_NAME.RuntimeConfig,
        hint: 'feature flags, compatibility flags, enableScreens',
      },
      {
        label: 'Deep linking',
        route: ROUTE_NAME.DeepLinking,
        hint: 'resolveRouteFromUrl against a typed URL',
      },
      {
        label: 'State persistence',
        route: ROUTE_NAME.StatePersistence,
        hint: 'serialize/deserialize the Stack state',
      },
    ],
  },
  {
    key: 'packages',
    title: 'Packages',
    hint: 'companion @symbiote-native packages',
    route: ROUTE_NAME.PackagesHub,
    line: NAV_LINE.Styling,
    code: 'PK',
    items: [
      {
        label: 'Reanimated',
        route: ROUTE_NAME.Reanimated,
        hint: 'spring, derived values, entering and exiting, layout, scroll offset',
      },
    ],
  },
  {
    key: 'benchmarks',
    title: 'Benchmarks',
    hint: 'engine commit path and JS-thread frame rate',
    route: ROUTE_NAME.BenchmarksHub,
    line: NAV_LINE.Performance,
    code: 'BM',
    items: [
      {
        label: 'Benchmark',
        route: ROUTE_NAME.Benchmark,
        hint: 'js-framework-benchmark ops + JS-thread FPS',
      },
    ],
  },
];
