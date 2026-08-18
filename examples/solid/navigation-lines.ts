import { ROUTE_NAME } from './routes';
import type { ITourRouteName } from './routes';

// The @symbiote-native/navigation demo suite groups its tour screens into 5 thematic "lines" —
// which part of the package each screen exercises — carried through MenuScreen's row badges, each
// demo screen's own line tag, and (where the native header/tab bar already takes a tint color) the
// OS chrome itself.
//
// Ported from examples/svelte/navigation-lines.ts. ROUTE_LINE_INFO stays exhaustive over every
// tour route even though only the registered ones appear in MENU_ROWS, so adding a screen needs no
// edit here.
export const NAV_LINE = {
  Primitives: 'primitives',
  Presentation: 'presentation',
  Structure: 'structure',
  Introspection: 'introspection',
  Routing: 'routing',
} as const;

export type INavLine = (typeof NAV_LINE)[keyof typeof NAV_LINE];

export const LINE_COLOR: Record<INavLine, string> = {
  // Solid's own logo blue (the light stop of the solidjs.com mark) — CanaryScreen is the "every
  // @symbiote-native/solid primitive" showcase, so its line wears Solid's color the way the Svelte
  // port wears #ff3e00 and the React port #149eca. The one deliberate per-framework difference;
  // every other line below is byte-identical across the canaries.
  [NAV_LINE.Primitives]: '#76b3e1',
  [NAV_LINE.Presentation]: '#5ec8f2',
  [NAV_LINE.Structure]: '#4fd1a5',
  [NAV_LINE.Introspection]: '#b18cf5',
  [NAV_LINE.Routing]: '#f2789a',
};

export type INavLineInfo = {
  line: INavLine;
  code: string;
  label: string;
};

export const ROUTE_LINE_INFO: Record<ITourRouteName, INavLineInfo> = {
  [ROUTE_NAME.Canary]: {
    line: NAV_LINE.Primitives,
    code: 'CN',
    label: 'PRIMITIVES LINE',
  },
  [ROUTE_NAME.ApiPlayground]: {
    line: NAV_LINE.Primitives,
    code: 'AP',
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
};
