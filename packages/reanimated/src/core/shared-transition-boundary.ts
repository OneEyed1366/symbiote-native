import SpecComponent from 'react-native-reanimated/src/specs/SharedTransitionBoundaryNativeComponent';

// The spec import registers the view config the engine derives its props from, and what it
// returns is the name of the native view, which a host tag is
const view: unknown = SpecComponent;
if (typeof view !== 'string') {
  throw new Error('[Reanimated] The boundary spec is not the name of a view.');
}
export const SHARED_TRANSITION_BOUNDARY_VIEW: string = view;

const CONTENTS_STYLE = { overflow: 'visible', display: 'contents' } as const;

// The props of the native boundary view, the same in every adapter
export function sharedTransitionBoundaryProps(isActive: boolean) {
  return {
    style: CONTENTS_STYLE,
    isActive,
    pointerEvents: 'box-none',
  } as const;
}
