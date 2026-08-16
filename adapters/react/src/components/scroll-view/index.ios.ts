// ScrollView (iOS): RefreshControl renders as a sibling BEFORE the content container, matching
// RN's ScrollView.js ({refreshControl}{contentContainer}). Also the base export
// (scroll-view.ts re-exports it) for headless / web.

import { createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { buildScrollViewHandle } from '@symbiote-native/components';
import {
  usePreparedScrollView,
  useNativeStickyScrollAttach,
  type IScrollViewHandle,
  type IScrollViewProps,
} from './shared';
export type { IScrollViewProps, IScrollViewHandle } from './shared';

export const ScrollView = forwardRef<IScrollViewHandle, IScrollViewProps>((props, forwardedRef) => {
  const {
    scrollViewIntrinsic,
    scrollViewBaseStyle,
    outerProps,
    style,
    content,
    refreshControl,
    scrollAnimatedValue,
    nativeStickyAvailable,
  } = usePreparedScrollView(props);
  // Backs the imperative handle; passing `ref` through createElement props binds it to the
  // SymbioteNode below, as TextInput does.
  const ref = useRef<ISymbioteNode | null>(null);
  // Lazy getter: the node is null until commit, so the handle reads ref.current per call
  // instead of capturing eagerly, which would freeze null.
  useImperativeHandle(forwardedRef, () => buildScrollViewHandle(() => ref.current), []);
  // Drives sticky scroll on the native UI thread (RN attachNativeEvent); no-ops without the
  // native animated module, falling back to the JS sticky path.
  useNativeStickyScrollAttach(ref, scrollAnimatedValue, nativeStickyAvailable);

  // Base style stays under user style so an explicit value wins; undefined base (vertical)
  // passes the user style through unchanged.
  const scrollStyle = scrollViewBaseStyle ? [scrollViewBaseStyle, style] : style;
  const scrollProps = { ...outerProps, style: scrollStyle, ref };

  if (refreshControl === undefined) {
    return createElement(scrollViewIntrinsic, scrollProps, content);
  }
  return createElement(scrollViewIntrinsic, scrollProps, refreshControl, content);
});

ScrollView.displayName = 'ScrollView';
