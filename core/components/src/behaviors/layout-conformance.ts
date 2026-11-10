// RN's `experimental_LayoutConformance` renders its native component with `display: contents`
// (LayoutConformance.js), so the wrapper takes no box of its own. A tag has no component body for
// that style, so the rule lives in `SymbioteFabricProps.cpp` and this only declares the tag

import { registerHostBehavior } from '@symbiote-native/engine';

export const LAYOUT_CONFORMANCE_TAG = 'layout-conformance';

// RN's `LayoutConformanceProps['mode']`
export type ILayoutConformanceMode = 'strict' | 'compatibility';

// Idempotent: an adapter entry may be imported more than once in a bundle
export function registerLayoutConformanceBehavior(): void {
  registerHostBehavior(LAYOUT_CONFORMANCE_TAG, {
    attach() {},
    detach() {},
  });
}
