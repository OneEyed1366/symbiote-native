// RN's `experimental_LayoutConformance` renders its native component with `display: contents`
// (LayoutConformance.js), so the wrapper takes no box of its own. A tag has no component body for
// that style, so the fold below writes it, after the app's own style as RN does

import {
  registerHostBehavior,
  type IPayloadFold,
} from '@symbiote-native/engine';

export const LAYOUT_CONFORMANCE_TAG = 'layout-conformance';

// RN's `LayoutConformanceProps['mode']`
export type ILayoutConformanceMode = 'strict' | 'compatibility';

const CONTENTS_STYLE = { display: 'contents' } as const;

// The style in the payload is a flat object or absent, an app style array is folded before it
// gets here. Spreading `undefined` or a non-object adds nothing
const foldPayload: IPayloadFold = props => ({
  ...props,
  style: { ...Object(props.style), ...CONTENTS_STYLE },
});

// Idempotent: an adapter entry may be imported more than once in a bundle
export function registerLayoutConformanceBehavior(): void {
  registerHostBehavior(LAYOUT_CONFORMANCE_TAG, {
    attach() {},
    detach() {},
    foldPayload,
  });
}
