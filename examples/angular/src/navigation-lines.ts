import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// MenuScreen's tour groups its screens into thematic "lines" — carried through each row's badge,
// the demo screen's own line tag, and (where the native header/tab bar already takes a tint color)
// the OS chrome itself. Which part of @symbiote-native/navigation a screen exercises. Kept in sync
// BY HAND with App.css's `:root` `--line-*` tokens — CSS custom properties and this module are
// different runtimes with no shared import path.
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
  Performance: 'performance',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Angular's own brand red (#DD0031, angular.dev's shield/wordmark color) — CanaryScreen is the
  // "every primitive" showcase, so its line wears Angular's real color instead of an arbitrary
  // pick. Every other line color below stays byte-identical to the React canary's
  // navigation-lines.ts — only this one framework-identity swap is deliberate.
  [NAV_LINE.Primitives]: '#dd0031',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
  // The only warm hue in the set — the benchmark stop is not a navigation line and should not
  // read as one at a glance.
  [NAV_LINE.Performance]: '#f5a524',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself. Deliberately excludes Details — it's a
// plain push-target off Canary, not one of the tour stops.
export type ITourRouteName = Exclude<
  IRouteName,
  typeof ROUTE_NAME.Menu | typeof ROUTE_NAME.Details
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
  [ROUTE_NAME.ReactiveStyle]: {
    line: NAV_LINE.Primitives,
    code: 'RS',
    label: 'PRIMITIVES LINE',
  },
  [ROUTE_NAME.ApiPlayground]: {
    line: NAV_LINE.Primitives,
    code: 'AP',
    label: 'PRIMITIVES LINE',
  },
  [ROUTE_NAME.Benchmark]: {
    line: NAV_LINE.Performance,
    code: 'BM',
    label: 'PERFORMANCE LINE',
  },
  [ROUTE_NAME.Probe]: {
    line: NAV_LINE.Performance,
    code: 'PR',
    label: 'PERFORMANCE LINE',
  },
};
