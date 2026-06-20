// VirtualizedList — real windowing over the existing ScrollView. Only the cells
// whose computed offset falls inside the visible window (plus a leading/trailing
// buffer) are rendered; everything above and below is collapsed into two spacer
// Views whose sizes sum to the off-screen extent, so the scroll thumb and total
// content size stay correct without mounting all N rows.
//
// Three inputs drive the window:
//   - scrollOffset    — from the ScrollView's onScroll (nativeEvent.contentOffset)
//   - viewportLength  — from the ScrollView's onLayout (nativeEvent.layout)
//   - per-cell extent — getItemLayout when provided, else measured via each
//                        rendered cell's onLayout and cached by index
//
// This is a faithful port of RN's VirtualizedList windowing adapted to our
// primitives: we keep `windowSize` viewport-lengths of cells resident, centered
// on the visible region. Unlike RN we do NOT cap new cells per batch
// (maxToRenderPerBatch); the whole window is snapped to the visible region on
// every scroll. All clone-on-write stays in shared; this file only emits host
// elements and reads back layout.

import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import { ScrollView, type ScrollViewProps } from './scroll-view'
import type { ViewStyle } from './styles'

// Defaults match RN. windowSize is measured in viewport-lengths (21 => ten
// screens of buffer on each side of the visible region). onEndReachedThreshold
// is a multiple of the visible length (RN's onEndReachedThresholdOrDefault
// returns `?? 2`, i.e. two viewports). initialNumToRender bounds the first paint
// before any layout has been measured.
const DEFAULT_WINDOW_SIZE = 21
const DEFAULT_INITIAL_NUM_TO_RENDER = 10
const DEFAULT_END_REACHED_THRESHOLD = 2
const FIRST_INDEX = 0
const EMPTY_OFFSET = 0
// RN floors sub-pixel end distances to 0 so a debounced scroll that stops a
// fraction of a pixel from the bottom still counts as "reached the end"
// (RN VirtualizedList.js: ON_EDGE_REACHED_EPSILON).
const ON_EDGE_REACHED_EPSILON = 0.001
// Sentinel for "onEndReached has not fired for any content length yet". Real
// content lengths are >= 0, so -1 can never collide with one.
const NO_CONTENT_LENGTH_SENT = -1

export interface CellLayout {
  length: number
  offset: number
}

type RenderItem<ItemT> = (info: { item: ItemT; index: number }) => ReactNode

export interface VirtualizedListProps<ItemT> {
  data: unknown
  getItem: (data: unknown, index: number) => ItemT
  getItemCount: (data: unknown) => number
  renderItem: RenderItem<ItemT>
  keyExtractor?: (item: ItemT, index: number) => string
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number }
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  horizontal?: boolean
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  initialNumToRender?: number
  windowSize?: number
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

// nativeEvent payload guards. The payloads arrive as `unknown` off the wire, so
// we narrow them with runtime checks rather than casting.
function readNumber(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? { ...value } : undefined
}

// onScroll -> the offset along the scroll axis. Vertical reads contentOffset.y,
// horizontal reads contentOffset.x.
function readScrollOffset(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const offset = asRecord(native.contentOffset)
  if (!offset) return undefined
  return readNumber(offset, horizontal ? 'x' : 'y')
}

// onLayout -> the cross-section length of the box along the scroll axis.
function readLayoutLength(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const layout = asRecord(native.layout)
  if (!layout) return undefined
  return readNumber(layout, horizontal ? 'width' : 'height')
}

// A measured cell reports its own box; we take the scroll-axis length.
function readCellLength(event: SymbioteEvent, horizontal: boolean): number | undefined {
  const native = asRecord(event.nativeEvent)
  if (!native) return undefined
  const layout = asRecord(native.layout)
  if (!layout) return undefined
  return readNumber(layout, horizontal ? 'width' : 'height')
}

function resolveElement(
  component: ComponentType<Record<string, never>> | ReactElement | undefined,
): ReactNode {
  if (component === undefined) return undefined
  if (typeof component === 'function') return createElement(component, {})
  return component
}

// Resolve every cell offset/length from the cache (or getItemLayout), filling
// gaps with the running average so an unmeasured tail still has a plausible
// total. Returns the per-index offset table plus the grand total extent.
function buildOffsets(
  count: number,
  measured: Map<number, number>,
  fixedLayout: ((index: number) => CellLayout) | undefined,
  averageLength: number,
): { offsets: number[]; lengths: number[]; total: number } {
  const offsets: number[] = new Array<number>(count)
  const lengths: number[] = new Array<number>(count)
  let running = EMPTY_OFFSET
  for (let index = FIRST_INDEX; index < count; index += 1) {
    offsets[index] = running
    let length: number
    if (fixedLayout) {
      length = fixedLayout(index).length
    } else {
      const cached = measured.get(index)
      length = cached !== undefined ? cached : averageLength
    }
    lengths[index] = length
    running += length
  }
  return { offsets, lengths, total: running }
}

// Pick the resident window: every index whose box overlaps
// [offset - buffer, offset + viewport + buffer]. The buffer is
// (windowSize - 1) / 2 viewport-lengths on each side, matching RN's symmetric
// leading/trailing overscan.
function computeWindow(
  count: number,
  offsets: number[],
  lengths: number[],
  scrollOffset: number,
  viewportLength: number,
  windowSize: number,
  initialNumToRender: number,
): { first: number; last: number } {
  if (count === FIRST_INDEX) return { first: FIRST_INDEX, last: -1 }

  // Before the viewport is known, paint a bounded prefix.
  if (viewportLength <= EMPTY_OFFSET) {
    return { first: FIRST_INDEX, last: Math.min(count, initialNumToRender) - 1 }
  }

  const overscan = ((windowSize - 1) / 2) * viewportLength
  const windowTop = scrollOffset - overscan
  const windowBottom = scrollOffset + viewportLength + overscan

  let first = FIRST_INDEX
  while (first < count - 1 && offsets[first] + lengths[first] <= windowTop) {
    first += 1
  }
  let last = first
  while (last < count - 1 && offsets[last] + lengths[last] < windowBottom) {
    last += 1
  }
  return { first, last }
}

export function VirtualizedList<ItemT>(
  props: VirtualizedListProps<ItemT>,
): ReactElement {
  const {
    data,
    getItem,
    getItemCount,
    renderItem,
    keyExtractor,
    getItemLayout,
    ItemSeparatorComponent,
    ListHeaderComponent,
    ListFooterComponent,
    ListEmptyComponent,
    horizontal = false,
    onEndReached,
    onEndReachedThreshold = DEFAULT_END_REACHED_THRESHOLD,
    initialNumToRender = DEFAULT_INITIAL_NUM_TO_RENDER,
    windowSize = DEFAULT_WINDOW_SIZE,
    style,
    contentContainerStyle,
  } = props

  const count = getItemCount(data)

  const [scrollOffset, setScrollOffset] = useState(EMPTY_OFFSET)
  const [viewportLength, setViewportLength] = useState(EMPTY_OFFSET)
  // Measured cell lengths by index. A ref-backed Map mutated in place plus a
  // version counter to request a re-render only when a NEW measurement lands,
  // so steady-state scrolling doesn't thrash on already-known cells.
  const measuredRef = useRef<Map<number, number>>(new Map())
  const [, setMeasureVersion] = useState(EMPTY_OFFSET)
  // The content length we last fired onEndReached for, mirroring RN's
  // _sentEndForContentLength: dedup by content length, not item count, so a
  // re-approach with the same content does not double-fire, but growing the
  // content (more rows measured/appended) re-arms the callback.
  const sentEndForContentLengthRef = useRef<number>(NO_CONTENT_LENGTH_SENT)

  const fixedLayout = useMemo(() => {
    if (getItemLayout === undefined) return undefined
    return (index: number): CellLayout => {
      const layout = getItemLayout(data, index)
      return { length: layout.length, offset: layout.offset }
    }
  }, [getItemLayout, data])

  // Running average of known cell lengths, used to size not-yet-measured cells
  // and the trailing spacer so the total is plausible before full measurement.
  const averageLength = useMemo(() => {
    if (fixedLayout) return fixedLayout(FIRST_INDEX).length
    const measured = measuredRef.current
    if (measured.size === EMPTY_OFFSET) return EMPTY_OFFSET
    let sum = EMPTY_OFFSET
    for (const length of measured.values()) sum += length
    return sum / measured.size
  }, [fixedLayout, scrollOffset, viewportLength])

  const { offsets, lengths, total } = buildOffsets(
    count,
    measuredRef.current,
    fixedLayout,
    averageLength,
  )

  const { first, last } = computeWindow(
    count,
    offsets,
    lengths,
    scrollOffset,
    viewportLength,
    windowSize,
    initialNumToRender,
  )

  dlog(
    `VirtualizedList window [${first}, ${last}] of ${count} ` +
      `(offset=${scrollOffset}, viewport=${viewportLength}, rendered=${Math.max(0, last - first + 1)})`,
  )

  const onScroll = useCallback(
    (event: SymbioteEvent): void => {
      const offset = readScrollOffset(event, horizontal)
      if (offset === undefined) return
      dlog(`VirtualizedList onScroll offset=${offset}`)
      setScrollOffset(offset)
    },
    [horizontal],
  )

  // onEndReached gating, ported from RN's _maybeCallOnEdgeReached. Run it as an
  // effect against the COMMITTED window (first/last/total just rendered for this
  // scrollOffset) rather than inside onScroll, where last/total still reflect the
  // previous render. Fire only when the actual last cell is rendered AND we are
  // within the threshold; dedup by content length (not item count); re-arm on
  // scroll away from the end.
  useEffect(() => {
    if (onEndReached === undefined || viewportLength <= EMPTY_OFFSET) return
    let distanceFromEnd = total - (scrollOffset + viewportLength)
    // Floor sub-pixel distances so a debounced near-bottom scroll still counts.
    if (distanceFromEnd < ON_EDGE_REACHED_EPSILON) {
      distanceFromEnd = EMPTY_OFFSET
    }
    const threshold = onEndReachedThreshold * viewportLength
    const isWithinEndThreshold = distanceFromEnd <= threshold
    const lastCellRendered = last === count - 1
    if (
      isWithinEndThreshold &&
      lastCellRendered &&
      sentEndForContentLengthRef.current !== total
    ) {
      sentEndForContentLengthRef.current = total
      dlog(
        `VirtualizedList onEndReached distanceFromEnd=${distanceFromEnd} ` +
          `(last=${last} of ${count}, contentLength=${total})`,
      )
      onEndReached({ distanceFromEnd })
    }
    // Scroll away from the end re-arms the callback for the next approach.
    if (!isWithinEndThreshold) {
      sentEndForContentLengthRef.current = NO_CONTENT_LENGTH_SENT
    }
  }, [onEndReached, onEndReachedThreshold, viewportLength, scrollOffset, total, last, count])

  const onViewportLayout = useCallback(
    (event: SymbioteEvent): void => {
      const length = readLayoutLength(event, horizontal)
      if (length === undefined) return
      dlog(`VirtualizedList onLayout viewport=${length}`)
      setViewportLength(length)
    },
    [horizontal],
  )

  const makeCellMeasure = useCallback(
    (index: number) =>
      (event: SymbioteEvent): void => {
        if (fixedLayout) return
        const length = readCellLength(event, horizontal)
        if (length === undefined) return
        const measured = measuredRef.current
        if (measured.get(index) === length) return
        measured.set(index, length)
        dlog(`VirtualizedList cell ${index} measured length=${length}`)
        setMeasureVersion((version) => version + 1)
      },
    [fixedLayout, horizontal],
  )

  // ---- assemble the windowed child list ----------------------------------

  const children: ReactNode[] = []

  const header = resolveElement(ListHeaderComponent)
  if (header !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-header' }, header))
  }

  if (count === FIRST_INDEX) {
    const empty = resolveElement(ListEmptyComponent)
    if (empty !== undefined) {
      children.push(createElement('symbiote-view', { key: 'list-empty' }, empty))
    }
  } else {
    // Leading spacer collapses every cell above the window into one box.
    const leadingExtent = first > FIRST_INDEX ? offsets[first] : EMPTY_OFFSET
    if (leadingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-leading',
          style: horizontal ? { width: leadingExtent } : { height: leadingExtent },
        }),
      )
    }

    for (let index = first; index <= last; index += 1) {
      const item = getItem(data, index)
      const key = keyExtractor ? keyExtractor(item, index) : String(index)
      const cell = renderItem({ item, index })
      // Wrap each cell in a measuring View. onLayout is a direct event the
      // shared node-prop scanner picks up automatically; getItemLayout short-
      // circuits measurement (makeCellMeasure returns early when fixedLayout).
      children.push(
        createElement(
          'symbiote-view',
          { key: `cell-${key}`, onLayout: makeCellMeasure(index) },
          cell,
        ),
      )
      const separator = resolveElement(ItemSeparatorComponent)
      if (separator !== undefined && index < last) {
        children.push(
          createElement('symbiote-view', { key: `sep-${key}` }, separator),
        )
      }
    }

    // Trailing spacer collapses every cell below the window.
    const renderedExtent =
      last >= first ? offsets[last] + lengths[last] - offsets[first] : EMPTY_OFFSET
    const trailingExtent = total - leadingExtent - renderedExtent
    if (trailingExtent > EMPTY_OFFSET) {
      children.push(
        createElement('symbiote-view', {
          key: 'spacer-trailing',
          style: horizontal ? { width: trailingExtent } : { height: trailingExtent },
        }),
      )
    }
  }

  const footer = resolveElement(ListFooterComponent)
  if (footer !== undefined) {
    children.push(createElement('symbiote-view', { key: 'list-footer' }, footer))
  }

  // onLayout is not on the ScrollViewProps surface, but ScrollView spreads its
  // unknown props straight onto the outer RCTScrollView node, where the shared
  // node-prop scanner turns onLayout into a direct `layout` listener. Type the
  // extra prop explicitly rather than widening ScrollViewProps from here.
  const scrollProps: ScrollViewProps & { onLayout: (event: SymbioteEvent) => void } = {
    style,
    contentContainerStyle,
    horizontal,
    onScroll,
    onLayout: onViewportLayout,
  }

  return createElement(ScrollView, scrollProps, ...children)
}
