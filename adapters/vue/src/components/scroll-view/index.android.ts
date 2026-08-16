// ScrollView on Android. An Android ScrollView accepts only ONE child, so a RefreshControl can't
// be a sibling of the content the way iOS allows ("addViewAt: failed to insert view ... at index
// 1"). Instead the RefreshControl (AndroidSwipeRefreshLayout) WRAPS the scroll view, nested
// inside with nestedScrollEnabled so it handles the gesture before the refresh parent, mirroring
// RN's ScrollView.js android branch.
//
// React does this with cloneElement(refreshControl, {style}, scrollView). Vue has no
// cloneElement, so the analog is to RE-INVOKE the user's RefreshControl component type via h():
// same .type, its own .props plus the injected outer/layout style, and the inner scroll view as
// its DEFAULT SLOT. The node ref stays on the INNER scroll view (not the wrapper), so
// dispatchViewCommand targets it. Metro picks this file on an Android host; no Platform.OS read.
// device-verify-pending: the wrap shape mirrors RN, proven on a real host by the absence of the
// "addViewAt: failed to insert" crash.

import { h, isVNode, type Component, type VNode } from '@vue/runtime-core';
import { dlog } from '@symbiote-native/engine';
import { splitLayoutProps } from '@symbiote-native/components';
import { createScrollView } from './shared';
export type { IScrollViewProps, IScrollViewEmits, IScrollViewHandle } from './shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Narrows VNodeTypes (string | Component | nested VNode | the Fragment/Text/... symbol
// constants) to what h() accepts. refreshControl is always a real component element in practice.
function isHostType(type: VNode['type']): type is string | Component {
  if (typeof type === 'string') return true;
  return (
    (typeof type === 'object' || typeof type === 'function') && type !== null && !isVNode(type)
  );
}

export const ScrollView = createScrollView({
  assemble: input => {
    if (input.refreshControl === undefined) {
      dlog('Vue ScrollView.ANDROID refreshControl=NONE(1child)');
      return h(input.scrollViewIntrinsic, input.scrollProps, [input.content]);
    }

    // RN splits the flattened style across the two boxes: LAYOUT props (margin/flex/size/
    // position/...) drive the outer AndroidSwipeRefreshLayout frame; VISUAL props (background/
    // padding/border/...) paint the inner scroll view - not a hardcoded flex:1 that would
    // override an explicit user height/width.
    //
    // layoutSplitStyle (not userStyle): a class-only layout prop is invisible to userStyle (it
    // never carries the resolved `class` value - see isClassNameProp in shared.ts), so splitting
    // on userStyle alone would starve the wrapper of its layout style.
    const { outer, inner } = splitLayoutProps(input.layoutSplitStyle);
    // `class` is stripped here: layoutSplitStyle already folded its resolved value into
    // outer/inner above, so forwarding the raw prop too would re-apply its LAYOUT half a second time.
    const { class: _classAppliedViaSplit, ...innerScrollOuterProps } = input.scrollOuterProps;
    const innerScrollView = h(
      input.scrollViewIntrinsic,
      {
        ...innerScrollOuterProps,
        style: [input.scrollViewBaseStyle, inner],
        nestedScrollEnabled: true,
        ref: input.setNodeRef,
      },
      [input.content],
    );

    const rc = input.refreshControl;
    if (!isHostType(rc.type)) {
      // Degrade to the unwrapped scroll view rather than crash (the node ref is already on it).
      dlog(
        'Vue ScrollView.ANDROID refreshControl has no hostable type, rendering scroll view unwrapped',
      );
      return innerScrollView;
    }
    const rcProps = isRecord(rc.props) ? rc.props : {};
    dlog('Vue ScrollView.ANDROID refreshControl=WRAP');
    return h(rc.type, { ...rcProps, style: outer }, { default: () => [innerScrollView] });
  },
});
