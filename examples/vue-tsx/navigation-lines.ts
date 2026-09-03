import { ROUTE_NAME } from './routes';
import type { IRouteName } from './routes';

// The demo suite groups its tour screens into thematic "lines" — which part of the package each
// screen exercises, plus a Performance line for the benchmark stop and a Styling line for the
// CSS-compiler showcase — carried through MenuScreen's row badges, each demo screen's own line
// tag, and (where the native header/tab bar already takes a tint color) the OS chrome itself.
// Kept in sync by hand with App.css's `:root` `--line-*` tokens — CSS custom properties and this
// module are different runtimes with no shared import path.
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
  // Not a @symbiote-native/navigation line — the API Playground exercises Vue's OWN
  // Composition/render-function surface instead, so it earns its own line rather than being
  // mis-filed under an unrelated navigation-feature line.
  Framework: 'framework',
  Performance: 'performance',
  Styling: 'styling',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Vue's own brand green (vuejs.org's Ocean Green) — CanaryScreen is the "every
  // @symbiote-native/vue primitive" showcase, so its line wears Vue's actual color instead of an
  // arbitrary pick. The ONE line color that differs from the React/Angular canaries; every other
  // line below stays byte-identical across every framework's example app.
  [NAV_LINE.Primitives]: '#42b883',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
  [NAV_LINE.Framework]: '#f6ad55',
  // Amber — a shade deeper than Framework above, so the two warm badges (AP and BM, both
  // outside the navigation lines) still read apart in the menu.
  [NAV_LINE.Performance]: '#f5a524',
  // Yellow-green, the one wide hue gap the lines above leave open — far enough from
  // Structure's mint (#4fd1a5) and Performance's amber (#f5a524) to read apart at badge size,
  // and the CSS showcase is not a navigation line either.
  [NAV_LINE.Styling]: '#a3d94f',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

// Every route reachable from MenuScreen, minus Menu itself. Deliberately excludes Details — it's a
// plain push-target off Canary, not one of the 12 tour stops. StyleShowcase is the 12th: it rides
// on top of the 11-stop tour the other canaries share, showing the whole CSS-compiler surface.
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
    line: NAV_LINE.Framework,
    code: 'AP',
    label: 'FRAMEWORK LINE',
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
