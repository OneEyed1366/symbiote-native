import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The @symbiote-native/navigation demo suite groups its tour screens into thematic "lines" — which
// part of the package each screen exercises, plus a Performance line for the benchmark stop and a
// Styling line for the CSS-compiler showcase — carried through MenuScreen's row badges, each demo
// screen's own line tag, and (where the native header/tab bar already takes a tint color) the OS
// chrome itself. One color per line replaces the single flat accent every row/button used to share.
// Kept in sync by hand with App.css's `:root` `--line-*` tokens — CSS custom properties and this
// module are different runtimes with no shared import path.
//
// Composition is the odd one out: ApiPlayground doesn't exercise @symbiote-native/navigation at
// all — it's a live demo of Vue's OWN template/Composition API surface running under Symbiote's
// renderer (see .docs/framework-api-surface/vue.md). It still gets a line entry so it can reuse
// the exact same wayfinding pill/badge/row language as every other tour stop.
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
  Composition: 'composition',
  Performance: 'performance',
  Styling: 'styling',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Vue's own brand green (vuejs.org's logo/accent green) — CanaryScreen is the "every
  // @symbiote-native/vue primitive" showcase, so its line wears Vue's actual color instead of
  // React's. The ONE deliberate difference vs the React port's navigation-lines.ts (which uses
  // React's brand blue #149eca here) — every other line below stays byte-identical across
  // frameworks. #42b883 is vuejs.org's primary green, already used throughout this app's
  // pre-existing canary content (App.vue, before this navigation port).
  [NAV_LINE.Primitives]: '#42b883',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
  // Warm orange — visually distinct from every navigation-package line above, since this line
  // isn't about @symbiote-native/navigation at all. Deliberately lighter than Performance's
  // amber below: the two sit next to each other in the menu and must read apart.
  [NAV_LINE.Composition]: '#f6ad55',
  // Amber — the only line color tied to timing rather than to a package feature.
  [NAV_LINE.Performance]: '#f5a524',
  // Yellow-green, the one wide hue gap the lines above leave open — far enough from Structure's
  // mint (#4fd1a5) and Performance's amber (#f5a524) to read apart at badge size, and the CSS
  // showcase is not a navigation line either.
  [NAV_LINE.Styling]: '#a3d94f',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself. Deliberately excludes Details — it's a
// plain push-target off Canary, not one of the 12 tour stops.
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
  [ROUTE_NAME.ApiPlayground]: {
    line: NAV_LINE.Composition,
    code: 'AP',
    label: 'COMPOSITION LINE',
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
};
