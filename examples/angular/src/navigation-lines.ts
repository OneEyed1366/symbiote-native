import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The tour screens sit on thematic lines: the part of the package a screen exercises, plus
// Performance for the benchmarks and Styling for the CSS compiler demo
// Kept in sync by hand with the `--line-*` tokens of App.css, the two share no import path
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
  Performance: 'performance',
  Styling: 'styling',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // The red of the Angular shield, the one line colour that differs between the flavors
  [NAV_LINE.Primitives]: '#dd0031',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
  // Amber, the only warm hue in the set, so a timing screen never reads as a navigation line
  [NAV_LINE.Performance]: '#f5a524',
  // Yellow-green, far enough from Structure and Performance to read apart at badge size
  [NAV_LINE.Styling]: '#a3d94f',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Section hubs only list stops, they are no stops themselves
export const HUB_ROUTE_NAME = [
  ROUTE_NAME.FrameworkHub,
  ROUTE_NAME.NavigationHub,
  ROUTE_NAME.PackagesHub,
  ROUTE_NAME.BenchmarksHub,
] as const satisfies readonly IRouteName[];

export type IHubRouteName = (typeof HUB_ROUTE_NAME)[number];

// Every route a hub lists. Details is left out, it is a push target off a deep link
export type ITourRouteName = Exclude<
  IRouteName,
  typeof ROUTE_NAME.Menu | typeof ROUTE_NAME.Details | IHubRouteName
>;

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Canary]: {
    line: NAV_LINE.Primitives,
    code: 'CN',
    label: 'PRIMITIVES LINE',
  },
  [ROUTE_NAME.HeaderOptions]: {
    line: NAV_LINE.Presentation,
    code: 'HD',
    label: 'PRESENTATION LINE',
  },
  [ROUTE_NAME.HeaderViews]: {
    line: NAV_LINE.Presentation,
    code: 'HV',
    label: 'PRESENTATION LINE',
  },
  [ROUTE_NAME.Gestures]: {
    line: NAV_LINE.Presentation,
    code: 'GS',
    label: 'PRESENTATION LINE',
  },
  [ROUTE_NAME.SheetDemo]: {
    line: NAV_LINE.Presentation,
    code: 'SH',
    label: 'PRESENTATION LINE',
  },
  [ROUTE_NAME.TabsDemo]: {
    line: NAV_LINE.Structure,
    code: 'TB',
    label: 'STRUCTURE LINE',
  },
  [ROUTE_NAME.NativeTabs]: {
    line: NAV_LINE.Structure,
    code: 'NT',
    label: 'STRUCTURE LINE',
  },
  [ROUTE_NAME.DrawerDemo]: {
    line: NAV_LINE.Structure,
    code: 'DR',
    label: 'STRUCTURE LINE',
  },
  [ROUTE_NAME.NestedNavigators]: {
    line: NAV_LINE.Structure,
    code: 'NN',
    label: 'STRUCTURE LINE',
  },
  [ROUTE_NAME.HooksDemo]: {
    line: NAV_LINE.Introspection,
    code: 'HK',
    label: 'INTROSPECTION LINE',
  },
  [ROUTE_NAME.OverlayContainers]: {
    line: NAV_LINE.Structure,
    code: 'OC',
    label: 'STRUCTURE LINE',
  },
  [ROUTE_NAME.Events]: {
    line: NAV_LINE.Introspection,
    code: 'EV',
    label: 'INTROSPECTION LINE',
  },
  [ROUTE_NAME.TransitionProgress]: {
    line: NAV_LINE.Introspection,
    code: 'TP',
    label: 'INTROSPECTION LINE',
  },
  [ROUTE_NAME.InsetsStatusBar]: {
    line: NAV_LINE.Presentation,
    code: 'IS',
    label: 'PRESENTATION LINE',
  },
  [ROUTE_NAME.StackTransitions]: {
    line: NAV_LINE.Routing,
    code: 'ST',
    label: 'ROUTING LINE',
  },
  [ROUTE_NAME.RuntimeConfig]: {
    line: NAV_LINE.Introspection,
    code: 'RC',
    label: 'INTROSPECTION LINE',
  },
  [ROUTE_NAME.DeepLinking]: {
    line: NAV_LINE.Routing,
    code: 'DL',
    label: 'ROUTING LINE',
  },
  [ROUTE_NAME.StatePersistence]: {
    line: NAV_LINE.Routing,
    code: 'SP',
    label: 'ROUTING LINE',
  },
  // Angular only, it guards a defect of this adapter
  [ROUTE_NAME.ReactiveStyle]: {
    line: NAV_LINE.Primitives,
    code: 'RS',
    label: 'PRIMITIVES LINE',
  },
  [ROUTE_NAME.ApiPlayground]: {
    line: NAV_LINE.Introspection,
    code: 'AP',
    label: 'INTROSPECTION LINE',
  },
  [ROUTE_NAME.Benchmark]: {
    line: NAV_LINE.Performance,
    code: 'BM',
    label: 'PERFORMANCE LINE',
  },
  [ROUTE_NAME.StyleShowcase]: {
    line: NAV_LINE.Styling,
    code: 'ST',
    label: 'STYLING LINE',
  },
  [ROUTE_NAME.Reanimated]: {
    line: NAV_LINE.Performance,
    code: 'RA',
    label: 'PERFORMANCE LINE',
  },
};
