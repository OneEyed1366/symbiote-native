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
  propOf,
} from '@symbiote-native/engine';

import { splitScrollViewStyle } from '../../scroll-view-commands';
import { registerScrollViewBehaviors, type IScrollPlatform } from './shared';

// The owner under a wrap: the VISUAL half of its own style in place of the composed one. Everything
// ELSE the owner needs — the axis, the bounce pair, `nestedScrollEnabled`, `decelerationRate`, the
// two strips — is `foldScrollViewProps` in the engine now and has already run by the time this is
// called, which is why this no longer delegates to anything. None of it has to do with the wrap.
//
// IT READS THE OWNER'S STYLE OFF THE NODE, not off the bag it was handed, and that is Trap A rather
// than a preference: the engine's rule runs FIRST and replaces `style` with `[base, authored]`, so
// `props.style` here is the composed array and splitting it would put the base's own layout props on
// the wrapper. `propOf(owner, 'style')` is the authored value, which is what the split wants — the
// same correction `wrapperFold` below already made for the same reason.
function wrappedOwnerFold(
  owner: ISymbioteNode,
  base: IViewStyle,
): IPayloadFold {
  return props => ({
    ...props,
    style: splitScrollViewStyle(base, propOf(owner, 'style')).inner,
  });
}

// The wrapper: the LAYOUT half of the OWNER's style, read off the owner because that is where the
// app wrote it. Kept in step by `slotDerived` naming `style`, which marks the wrapper dirty on an
// owner style write.
function wrapperFold(owner: ISymbioteNode, base: IViewStyle): IPayloadFold {
  return props => ({
    ...props,
    style: splitScrollViewStyle(base, propOf(owner, 'style')).outer,
  });
}

const android: IScrollPlatform = {
  claimMode: 'wrap',
  slotDerived: ['style'],
  onWrapChange: base => (owner, wrapper) => {
    // Back to NO fold when the wrap goes away, which is now the honest answer rather than a loss:
    // the axis and the gesture props are the engine's rule, they run off the tag whatever this
    // field holds, and the only thing a fold was ever needed for here is the style split.
    owner.payloadFold =
      wrapper === undefined ? undefined : wrappedOwnerFold(owner, base);
    if (wrapper !== undefined) wrapper.payloadFold = wrapperFold(owner, base);
  },
};

export function registerScrollViewBehavior(): void {
  registerScrollViewBehaviors(android);
}
