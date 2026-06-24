// Sticky headers — the JS layer RN implements in ScrollView.js / ScrollViewStickyHeader.js.
//
// VERDICT (source-based): RN does stickiness PURELY IN JS. ScrollView.js (render, ~line
// 1690) wraps each child whose index is in `stickyHeaderIndices` in a ScrollViewStickyHeader,
// fed by a single `_scrollAnimatedValue` an Animated.event drives from `onScroll`
// (ScrollView.js ~line 1095). The native Fabric scroll view does NOT honor the index array on
// its own — forwarding `stickyHeaderIndices` to native is a silent no-op. So we replicate the
// JS layer: subscribe each flagged child to the scroll offset and translate it to stay pinned.
// The interpolation mirrors ScrollViewStickyHeader.js (non-inverted + inverted branches).

import {
  Children,
  createElement,
  isValidElement,
  useEffect,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react'
import { AnimatedInterpolation, AnimatedValue, dlog, type SymbioteEvent } from '@symbiote/shared'
import { Animated } from './animated'

// RN gives the sticky wrapper zIndex:10 (ScrollViewStickyHeader.js styles.header) so the
// pinned header paints OVER the rows that scroll up under it. Without it the next rows (later
// siblings) paint on top and bleed through the header.
const STICKY_HEADER_Z_INDEX = 10

// The props RN passes a sticky header wrapper (ScrollViewStickyHeader.js). A custom
// StickyHeaderComponent must accept the same shape.
export interface StickyHeaderProps {
  children?: ReactNode
  // y of the NEXT sticky header in content space — the collision point past which this header
  // stops translating and scrolls off to make room. undefined when there is no next header.
  nextHeaderLayoutY: number | undefined
  onLayout: (event: SymbioteEvent) => void
  scrollAnimatedValue: AnimatedValue
  // Stick to the bottom instead of the top.
  inverted: boolean | undefined
  // Parent scroll view height — only needed (and only set) when inverted.
  scrollViewHeight: number | undefined
}

export type StickyHeaderComponentType = ComponentType<StickyHeaderProps>

export function readLayoutNumber(event: SymbioteEvent, key: 'y' | 'height'): number | undefined {
  const layout = event.nativeEvent.layout
  if (typeof layout !== 'object' || layout === null) return undefined
  const value = Reflect.get(layout, key)
  return typeof value === 'number' ? value : undefined
}

function readChildOnLayout(child: ReactElement): ((event: SymbioteEvent) => void) | undefined {
  const childProps = child.props
  if (typeof childProps !== 'object' || childProps === null) return undefined
  const handler = Reflect.get(childProps, 'onLayout')
  return typeof handler === 'function' ? handler : undefined
}

function firstChild(children: ReactNode): ReactElement | undefined {
  const first = Children.toArray(children)[0]
  return isValidElement(first) ? first : undefined
}

// One sticky header. Measures its own y/height via onLayout, then interpolates the shared
// scroll offset into a translateY that keeps it pinned to the top (or bottom, inverted) until
// the next header collides with it. Ported from ScrollViewStickyHeader.js — the per-frame
// debounce / Fabric setNativeProps paths are dropped (our Animated graph drives the transform
// directly through the AnimatedInterpolation binding).
export const ScrollViewStickyHeader: StickyHeaderComponentType = (props) => {
  const { inverted, scrollViewHeight, scrollAnimatedValue, nextHeaderLayoutY, children } = props
  const [measured, setMeasured] = useState(false)
  const [layoutY, setLayoutY] = useState(0)
  const [layoutHeight, setLayoutHeight] = useState(0)
  const [translateY, setTranslateY] = useState<AnimatedInterpolation>(() =>
    scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
  )

  useEffect(() => {
    const inputRange: number[] = [-1, 0]
    const outputRange: number[] = [0, 0]
    if (measured) {
      if (inverted === true) {
        // Inverted: the header sticks at the BOTTOM of the viewport. It starts sticking once
        // its bottom edge reaches the viewport bottom (stickStartPoint), then tracks scroll up
        // to the next header's collision point.
        if (scrollViewHeight !== undefined) {
          const stickStartPoint = layoutY + layoutHeight - scrollViewHeight
          if (stickStartPoint > 0) {
            inputRange.push(stickStartPoint, stickStartPoint + 1)
            outputRange.push(0, 1)
            const collisionPoint = (nextHeaderLayoutY ?? 0) - layoutHeight - scrollViewHeight
            if (collisionPoint > stickStartPoint) {
              inputRange.push(collisionPoint, collisionPoint + 1)
              outputRange.push(collisionPoint - stickStartPoint, collisionPoint - stickStartPoint)
            }
          }
        }
      } else {
        // Top: no translation until the header reaches the top (layoutY), then it tracks the
        // scroll 1:1 to stay pinned, until the next header pushes it back off.
        inputRange.push(layoutY)
        outputRange.push(0)
        const collisionPoint = (nextHeaderLayoutY ?? 0) - layoutHeight
        if (collisionPoint >= layoutY) {
          inputRange.push(collisionPoint, collisionPoint + 1)
          outputRange.push(collisionPoint - layoutY, collisionPoint - layoutY)
        } else {
          inputRange.push(layoutY + 1)
          outputRange.push(1)
        }
      }
    }
    setTranslateY(scrollAnimatedValue.interpolate({ inputRange, outputRange }))
  }, [measured, layoutY, layoutHeight, scrollViewHeight, nextHeaderLayoutY, inverted, scrollAnimatedValue])

  const onLayout = (event: SymbioteEvent): void => {
    const y = readLayoutNumber(event, 'y')
    const height = readLayoutNumber(event, 'height')
    if (y !== undefined) setLayoutY(y)
    if (height !== undefined) setLayoutHeight(height)
    setMeasured(true)
    props.onLayout(event)
    const child = firstChild(children)
    const childOnLayout = child === undefined ? undefined : readChildOnLayout(child)
    childOnLayout?.(event)
  }

  // collapsable:false so Yoga keeps the wrapper as a real node — its translateY must not be
  // flattened into the child (RN's sticky wrapper is likewise a real Animated.View). `style`
  // is `unknown` on Animated.View, so the AnimatedInterpolation transform passes with no cast.
  // TODO(jitter): RN drives this transform with useNativeDriver + Fabric setNativeProps so the
  // pin tracks scroll on the UI thread; our JS-driven Animated graph can lag/jitter under fast
  // scroll until that native path is wired.
  return createElement(
    Animated.View,
    { style: { transform: [{ translateY }], zIndex: STICKY_HEADER_Z_INDEX }, onLayout, collapsable: false },
    children,
  )
}
ScrollViewStickyHeader.displayName = 'ScrollViewStickyHeader'

// Wrap each child flagged by `stickyHeaderIndices` in the sticky header component, fed by the
// shared scroll AnimatedValue. Mirrors ScrollView.js's render-time children.map (~line 1690).
// Returns the children unchanged when no indices are flagged.
//
// Cross-talk plumbing (RN's _headerLayoutYs + _onStickyHeaderLayout, ScrollView.js:1115-1143):
// `headerLayoutYs` is a child-index→measured-y map the parent keeps; each header reports its own
// y through `onHeaderLayoutY` as it measures, and we feed every header the y of the NEXT flagged
// header (the collision point past which it scrolls off) by looking up its successor's index in
// `stickyHeaderIndices`. The LAST flagged header has no successor, so its `nextHeaderLayoutY`
// stays undefined and it sticks indefinitely (correct).
export function wrapStickyHeaders(
  children: ReactNode,
  stickyHeaderIndices: number[] | undefined,
  scrollAnimatedValue: AnimatedValue,
  invertStickyHeaders: boolean | undefined,
  scrollViewHeight: number | undefined,
  StickyHeaderComponent: StickyHeaderComponentType | undefined,
  headerLayoutYs: ReadonlyMap<number, number>,
  onHeaderLayoutY: (index: number, y: number) => void,
): ReactNode {
  if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0) return children
  const Wrapper = StickyHeaderComponent ?? ScrollViewStickyHeader
  return Children.toArray(children).map((child, index) => {
    const indexOfIndex = stickyHeaderIndices.indexOf(index)
    if (indexOfIndex === -1 || !isValidElement(child)) return child
    // The next flagged header's measured y, by index order in stickyHeaderIndices (RN
    // ScrollView.js:1695 nextIndex). undefined until that header has measured (or for the last).
    const nextIndex = stickyHeaderIndices[indexOfIndex + 1]
    const nextHeaderLayoutY = nextIndex === undefined ? undefined : headerLayoutYs.get(nextIndex)
    dlog(`ScrollView sticky-header wrap index=${index} next=${nextIndex} nextY=${nextHeaderLayoutY}`)
    return createElement(
      Wrapper,
      {
        key: child.key ?? `sticky-${index}`,
        nextHeaderLayoutY,
        // RN _onStickyHeaderLayout: record this header's own y, then push it to the previous
        // header as its nextHeaderLayoutY. We record into the parent map; the lookup above feeds
        // it forward on the resulting re-render.
        onLayout: (event: SymbioteEvent): void => {
          const y = readLayoutNumber(event, 'y')
          if (y !== undefined) onHeaderLayoutY(index, y)
        },
        scrollAnimatedValue,
        inverted: invertStickyHeaders,
        scrollViewHeight,
      },
      child,
    )
  })
}
