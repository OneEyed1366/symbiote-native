// ScrollView's behavior on Android, where a RefreshControl is not a child at all.
//
// An Android ScrollView holds exactly ONE child, so a sibling refresh control is an `addViewAt`
// crash rather than a layout mistake. RN inverts the tree instead: `AndroidSwipeRefreshLayout`
// WRAPS the scroll view, and the scroll view's style is split across the two boxes — layout on the
// wrapper's frame, visual on the scroller (`ScrollView.js:1856`). `nestedScrollEnabled` goes on the
// inner view so it consumes the gesture before the refresh parent sees it.
//
// The two folds below are what neither node can work out alone: the wrapper is the APP's node, so
// it carries whatever the app wrote on `<RefreshControl>` and knows nothing about the scroll view's
// style. RN reaches the same place through `cloneElement`, which likewise OVERRIDES the refresh
// control's own `style` — so replacing it here is parity, not a liberty.

import {
  type IPayloadFold,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import { splitScrollViewStyle } from '../../scroll-view-commands';
import {
  ownerFold,
  registerScrollViewBehaviors,
  type IScrollPlatform,
} from './shared';

// The owner under a wrap: the ordinary fold with the VISUAL half of its own style in place of the
// composed one. Delegating rather than restating is what keeps `decelerationRate`, `horizontal` and
// `nestedScrollEnabled` in ONE place — none of the three has anything to do with the wrap, and the
// hand-written copy this replaced had already lost the first of them.
function wrappedOwnerFold(base: IViewStyle, horizontal: boolean): IPayloadFold {
  const plain = ownerFold(base, horizontal);
  return props => ({
    ...plain(props),
    style: splitScrollViewStyle(base, props.style).inner,
  });
}

// The wrapper: the LAYOUT half of the OWNER's style, read off the owner because that is where the
// app wrote it. Kept in step by `slotDerived` naming `style`, which marks the wrapper dirty on an
// owner style write.
function wrapperFold(owner: ISymbioteNode, base: IViewStyle): IPayloadFold {
  return props => ({
    ...props,
    style: splitScrollViewStyle(base, owner.props.style).outer,
  });
}

const android: IScrollPlatform = {
  claimMode: 'wrap',
  slotDerived: ['style'],
  onWrapChange: (base, horizontal) => (owner, wrapper) => {
    // Back to the ordinary composition, not to `undefined` — the plain fold carries the axis and
    // the gesture props, which have nothing to do with the wrap.
    owner.payloadFold =
      wrapper === undefined
        ? ownerFold(base, horizontal)
        : wrappedOwnerFold(base, horizontal);
    if (wrapper !== undefined) wrapper.payloadFold = wrapperFold(owner, base);
  },
};

export function registerScrollViewBehavior(): void {
  registerScrollViewBehaviors(android);
}
