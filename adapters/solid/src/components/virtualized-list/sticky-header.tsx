// Sticky headers, the Solid lifecycle half of the JS layer RN keeps in `ScrollViewStickyHeader`
//
// Private to VirtualizedList: it hand-builds its scroll host, so `shared.tsx` wraps the cell here
// The math and the decisions live in `@symbiote-native/components`, the binding in `sticky-binding`

import type { JSX } from '../../jsx-runtime';
import {
  STICKY_HEADER_Z_INDEX,
  type IStickyHeaderProps,
} from '@symbiote-native/components';
import { createStickyBinding } from './sticky-binding';

// The framework-agnostic sticky inputs plus Solid's own children slot and focus hook
export type IStickyHeaderComponentProps = IStickyHeaderProps & {
  children?: JSX.Element;
  // Focus inside the header, the list keeps the cells around it mounted
  onFocus?: () => void;
};

// Pins a cell to the top (or the bottom, inverted) until the next header collides with it
// `collapsable: false` keeps it a real Yoga node, the zIndex paints it over the rows under it
export function ScrollViewStickyHeader(
  props: IStickyHeaderComponentProps,
): JSX.Element {
  const binding = createStickyBinding(props);
  return (
    <view
      style={[
        {
          transform: [{ translateY: binding.animatedTranslateY() }],
          zIndex: STICKY_HEADER_Z_INDEX,
        },
        binding.committedStyle(),
      ]}
      onLayout={binding.onLayout}
      onFocus={props.onFocus}
      collapsable={false}
    >
      {props.children}
    </view>
  );
}
