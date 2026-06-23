// ScrollView — shared core. The Fabric tree is nested: the scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Building that content
// node, resolving decelerationRate, and the prop plumbing are platform-invariant and
// live here. What diverges (ADR 0020) is how a RefreshControl integrates: on iOS it is a
// CHILD of the scroll view (sibling of the content), on Android it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent, ScrollView nested inside). So the .ios/.android
// files assemble the final element; the filename selects, no Platform.OS read.

import { createElement, type ReactElement, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { ViewStyle } from './styles'

type ScrollHandler = (event: SymbioteEvent) => void

const DECELERATION_RATE: Readonly<Record<string, number>> = {
  normal: 0.998,
  fast: 0.99,
}

export interface ScrollViewProps {
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
  horizontal?: boolean
  scrollEnabled?: boolean
  showsVerticalScrollIndicator?: boolean
  showsHorizontalScrollIndicator?: boolean
  pagingEnabled?: boolean
  bounces?: boolean
  decelerationRate?: 'normal' | 'fast' | number
  scrollEventThrottle?: number
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number }
  contentOffset?: { x: number; y: number }
  refreshControl?: ReactElement<ClonableRefreshControl>
  onScroll?: ScrollHandler
  onScrollBeginDrag?: ScrollHandler
  onScrollEndDrag?: ScrollHandler
  onMomentumScrollBegin?: ScrollHandler
  onMomentumScrollEnd?: ScrollHandler
  children?: ReactNode
}

function resolveDecelerationRate(rate: 'normal' | 'fast' | number): number {
  if (typeof rate === 'number') return rate
  return DECELERATION_RATE[rate]
}

// The shape the Android build clones onto a RefreshControl when wrapping the scroll view:
// a layout style and the scroll view as its single child. Typed so cloneElement accepts
// the added props without a cast; any RefreshControl element (its own props are a
// superset) satisfies it.
export interface ClonableRefreshControl {
  style?: ViewStyle
  children?: ReactNode
}

// The platform-invariant pieces: the scroll view's outer props (minus style, which the
// platform places differently), its style, and the built content node. The .ios/.android
// files take these and assemble the final element with their RefreshControl wiring.
export interface PreparedScrollView {
  outerProps: Record<string, unknown>
  style: ViewStyle | undefined
  content: ReactElement
  refreshControl: ReactElement<ClonableRefreshControl> | undefined
}

export function prepareScrollView(props: ScrollViewProps): PreparedScrollView {
  const {
    style,
    contentContainerStyle,
    horizontal,
    decelerationRate,
    refreshControl,
    children,
    ...outer
  } = props

  const contentStyle: ViewStyle = { ...contentContainerStyle }
  if (horizontal === true) contentStyle.flexDirection = 'row'

  const outerProps: Record<string, unknown> = { ...outer }
  if (horizontal !== undefined) outerProps.horizontal = horizontal
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate)
  }

  dlog('ScrollView -> RCTScrollView(RCTScrollContentView)')

  // `collapsable: false` is load-bearing on Android. The content container is a
  // layout-only View, which Android Fabric view-flattens away — hoisting the cells
  // up as DIRECT children of the scroll view, which strictly hosts exactly one
  // child ("ScrollView can host only one direct child" → addViewAt crash). RN pins
  // its own NativeScrollContentView the same way (ScrollView.js, collapsable={false};
  // ReactScrollView.java: "the 'content' View … non-collapsable so it will never be
  // View-flattened away"). iOS doesn't flatten, so this is a no-op there.
  const content = createElement(
    'symbiote-scroll-content',
    { style: contentStyle, collapsable: false },
    children,
  )

  return { outerProps, style, content, refreshControl }
}
