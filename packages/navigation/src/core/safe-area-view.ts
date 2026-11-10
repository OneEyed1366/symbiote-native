// The safe area view around a screen's content, which iOS 26 lays out under the navigation bar
// Core decides whether it exists and which edges it insets, an adapter renders the content inside

import { RNS_SAFE_AREA_VIEW_NAME } from './constants';
import type {
  INavigatorPlatform,
  ISafeAreaEdge,
  IScreenOptions,
} from './navigator-props';

export type ISafeAreaHost = {
  viewName: string;
  props: Record<string, unknown>;
};

const SAFE_AREA_EDGES = [
  'top',
  'right',
  'bottom',
  'left',
] as const satisfies readonly ISafeAreaEdge[];

const FILL_STYLE = { flex: 1 };

// An opaque visible header keeps the content below it, a translucent or hidden one lets it go under
// A present-but-undefined edge counts as off in native, so only the edges the app set override
function resolveEdges(options: IScreenOptions): Record<ISafeAreaEdge, boolean> {
  const isUnderBar =
    options.headerTranslucent === true || options.headerShown === false;
  const defaults = {
    top: !isUnderBar,
    right: false,
    bottom: false,
    left: false,
  };
  const edges = { ...defaults };
  for (const edge of SAFE_AREA_EDGES) {
    edges[edge] = options.safeAreaEdges?.[edge] ?? defaults[edge];
  }
  return edges;
}

export function resolveSafeAreaHost(
  options: IScreenOptions,
  platform: INavigatorPlatform,
): ISafeAreaHost | undefined {
  if (!platform.isIOS26OrHigher) return undefined;
  return {
    viewName: RNS_SAFE_AREA_VIEW_NAME,
    props: { edges: resolveEdges(options), style: FILL_STYLE },
  };
}
