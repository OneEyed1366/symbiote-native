// VirtualizedList logic: the framework-agnostic windowing engine every adapter drives the same
// math from, so a windowing/viewability/edge-reached bug is fixed once for all. The adapter
// supplies only its lifecycle, the imperative handle wiring, and per-cell element creation.

// What stays in the adapter: the cell CONTENT is the framework's own children (renderItem ->
// ReactNode / VNode), so there is no Descriptor render fn for a list — this state/logic module is
// the shared layer, not a view/render-*.ts.

import { dlog, Platform } from '@symbiote-native/engine';
import type { IViewStyle } from '@symbiote-native/engine';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import type { IScrollRoutingHandle } from './scroll-routing-handle';

// Defaults match RN. windowSize is in viewport-lengths (21 => ten screens of buffer each side).
// initialNumToRender bounds the first paint before any layout is measured.
export const DEFAULT_WINDOW_SIZE = 21;
export const DEFAULT_INITIAL_NUM_TO_RENDER = 10;
export const DEFAULT_MAX_TO_RENDER_PER_BATCH = 10;
export const DEFAULT_UPDATE_CELLS_BATCHING_PERIOD = 50;
export const DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD = 0;
// RN's own fallback for whether to actually FIRE onEndReached/onStartReached when the app gives no
// threshold — a flat 2 PIXELS, distinct from the windowing-only `?? 2` MULTIPLE elsewhere in RN;
// conflating the two fires the callback two whole screens early.
export const DEFAULT_EDGE_REACHED_THRESHOLD_PX = 2;
export const FIRST_INDEX = 0;
export const EMPTY_OFFSET = 0;
export const NO_INDEX = -1;
export const FULLY_VISIBLE_PERCENT = 100;
// RN floors sub-pixel end distances to 0 so a debounced scroll that stops a fraction
// of a pixel from the bottom still counts as "reached the end" (RN VirtualizedList.js).
export const ON_EDGE_REACHED_EPSILON = 0.001;
// Sentinel for "onEndReached / onStartReached has not fired for any content length
// yet". Real content lengths are >= 0, so -1 can never collide with one.
export const NO_CONTENT_LENGTH_SENT = -1;
// Inversion flips the content container along the scroll axis; each cell re-flips so its own
// content stays upright. Android flips with `scale: -1` since `scaleY: -1` can ANR on API 33+.
export function invertedYStyleFor(os: string): IViewStyle {
  return os === 'android'
    ? { transform: [{ scale: -1 }] }
    : { transform: [{ scaleY: -1 }] };
}

export const INVERTED_Y_STYLE: IViewStyle = invertedYStyleFor(Platform.OS);
export const INVERTED_X_STYLE: IViewStyle = { transform: [{ scaleX: -1 }] };

export interface ICellLayout {
  length: number;
  offset: number;
}

// The props RN hands ItemSeparatorComponent: the highlight flag the cell can toggle, the items on
// either side of the gap, and (for section lists) the section. `section` stays optional since a
// flat VirtualizedList has none.
export interface ISeparatorProps<ItemT> {
  highlighted: boolean;
  leadingItem?: ItemT;
  trailingItem?: ItemT;
  section?: unknown;
  [key: string]: unknown;
}

// The imperative separator handle passed to renderItem: highlight/unhighlight flip the flanking
// separators' highlighted flag; updateProps merges props onto the leading or trailing separator.
export interface ISeparators {
  highlight(): void;
  unhighlight(): void;
  updateProps(
    select: 'leading' | 'trailing',
    newProps: Record<string, unknown>,
  ): void;
}

// A viewable item, as reported to onViewableItemsChanged. Mirrors RN's IViewToken
// (item + key + index + isViewable), minus the section field VirtualizedSectionList adds.
export interface IViewToken<ItemT> {
  item: ItemT;
  key: string;
  index: number;
  isViewable: boolean;
}

export interface IViewableItemsChangedInfo<ItemT> {
  viewableItems: IViewToken<ItemT>[];
  changed: IViewToken<ItemT>[];
  // The config of the pair that triggered this call (`ViewabilityHelper.js`'s `_onUpdateSync`,
  // `viewabilityConfig: this._config`) — lets one callback shared across several
  // viewabilityConfigCallbackPairs tell which config fired.
  viewabilityConfig?: IViewabilityConfig;
}

// Viewability tuning, mirroring RN. Either a coverage percentage OR a minimum visible pixel
// height qualifies a cell as viewable; waitForInteraction gates a config so nothing reports
// viewable until the first scroll interaction.
export interface IViewabilityConfig {
  minimumViewTime?: number;
  viewAreaCoveragePercentThreshold?: number;
  itemVisiblePercentThreshold?: number;
  waitForInteraction?: boolean;
}

export interface IViewabilityConfigCallbackPair<ItemT> {
  viewabilityConfig: IViewabilityConfig;
  onViewableItemsChanged: (info: IViewableItemsChangedInfo<ItemT>) => void;
}

// The imperative API RN exposes on a VirtualizedList/FlatList ref. The scrollTo* family is this
// handle's own surface; the flash/get*/record tail extends IScrollRoutingHandle, shared with
// VirtualizedSectionList, so the two handle types can't drift apart.
export interface IVirtualizedListHandle extends IScrollRoutingHandle {
  scrollToOffset(params: { offset: number; animated?: boolean }): void;
  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void;
  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void;
  scrollToEnd(params?: { animated?: boolean }): void;
}

// nativeEvent payload guards. The payloads arrive as `unknown` off the wire, so they
// are narrowed with runtime checks rather than cast.
function readNumber(
  source: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = source[key];
  return typeof value === 'number' ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? { ...value } : undefined;
}

export function readScrollOffset(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  const native = asRecord(event.nativeEvent);
  if (native === undefined) return undefined;
  const offset = asRecord(native.contentOffset);
  if (offset === undefined) return undefined;
  return readNumber(offset, horizontal ? 'x' : 'y');
}

// The cell's own position in the scroll content, as the host reported it — the value buildOffsets
// stores VERBATIM, so the table describes where content actually is, not a sum of heights.
export function readLayoutOffset(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  const native = asRecord(event.nativeEvent);
  if (native === undefined) return undefined;
  const layout = asRecord(native.layout);
  if (layout === undefined) return undefined;
  return readNumber(layout, horizontal ? 'x' : 'y');
}

export function readLayoutLength(
  event: ISymbioteEvent,
  horizontal: boolean,
): number | undefined {
  const native = asRecord(event.nativeEvent);
  if (native === undefined) return undefined;
  const layout = asRecord(native.layout);
  if (layout === undefined) return undefined;
  return readNumber(layout, horizontal ? 'width' : 'height');
}

// Resolve every cell offset/length from the cache (or getItemLayout), filling gaps with the
// running average so an unmeasured tail still has a plausible total.

// The coordinate space is the HOST's, not a model's: a measured cell is placed at onLayout's raw
// value VERBATIM, never rebased onto a running sum — differencing two measurements would compound
// a Yoga `gap` shift unboundedly once buildListPlan feeds a sized spacer back through this table.

// Unmeasured cells advance by the average STRIDE (origin to origin), not the average LENGTH —
// separators/gaps live between cells, so heights alone fall short. A fixed getItemLayout skips
// all of it, authoritative by contract.
export function buildOffsets(
  count: number,
  measured: Map<number, number>,
  measuredOffsets: Map<number, number>,
  fixedLayout: ((index: number) => ICellLayout) | undefined,
  averageLength: number,
  averageStride: number,
): { offsets: number[]; lengths: number[]; total: number } {
  const offsets: number[] = new Array<number>(count);
  const lengths: number[] = new Array<number>(count);
  // What the average stride leaves over once the average cell is accounted for: the chrome drawn
  // BETWEEN two cells, used only for the part nobody measured.
  const interCellChrome = Math.max(EMPTY_OFFSET, averageStride - averageLength);
  // Where the next cell goes when its own position has never been reported.
  let cursor = EMPTY_OFFSET;
  for (let index = FIRST_INDEX; index < count; index += 1) {
    const layout = fixedLayout?.(index);
    const known = layout?.offset ?? measuredOffsets.get(index);
    offsets[index] = known ?? cursor;
    lengths[index] = layout?.length ?? measured.get(index) ?? averageLength;
    cursor = offsets[index] + lengths[index] + interCellChrome;
  }
  const last = count - 1;
  const total =
    count > FIRST_INDEX ? offsets[last] + lengths[last] : EMPTY_OFFSET;
  return { offsets, lengths, total };
}

// Pick the resident window: every index whose box overlaps
// [offset - buffer, offset + viewport + buffer]. The buffer is (windowSize - 1) / 2
// viewport-lengths on each side, matching RN's symmetric leading/trailing overscan.
export function computeWindow(
  count: number,
  offsets: number[],
  lengths: number[],
  scrollOffset: number,
  viewportLength: number,
  windowSize: number,
  initialNumToRender: number,
): { first: number; last: number } {
  if (count === FIRST_INDEX) return { first: FIRST_INDEX, last: NO_INDEX };

  // Before the viewport is known, paint a bounded prefix.
  if (viewportLength <= EMPTY_OFFSET) {
    return {
      first: FIRST_INDEX,
      last: Math.min(count, initialNumToRender) - 1,
    };
  }

  const overscan = ((windowSize - 1) / 2) * viewportLength;
  const windowTop = scrollOffset - overscan;
  const windowBottom = scrollOffset + viewportLength + overscan;

  let first = FIRST_INDEX;
  while (first < count - 1 && offsets[first] + lengths[first] <= windowTop) {
    first += 1;
  }
  let last = first;
  while (last < count - 1 && offsets[last] + lengths[last] < windowBottom) {
    last += 1;
  }
  return { first, last };
}

// RN's `VirtualizedList._initialRenderRegion`: `initialNumToRender` cells from
// `initialScrollIndex`, clamped to the data. What a list paints before it has a window of its own.
export function initialRenderRegion(
  count: number,
  initialScrollIndex: number | undefined,
  initialNumToRender: number,
): { first: number; last: number } {
  const first = Math.max(
    FIRST_INDEX,
    Math.min(count - 1, Math.floor(initialScrollIndex ?? FIRST_INDEX)),
  );
  return { first, last: Math.min(count, first + initialNumToRender) - 1 };
}

// Clamp a freshly computed window against the previously-committed one so at most
// maxToRenderPerBatch new cells are added on each side per tick — the window grows toward the
// target over successive ticks rather than snapping in one render.

// With NO previous window, RN paints its initial region and grows from there even when the
// viewport is already known; snapping to the target instead mounts far more rows than RN would.
export function throttleWindow(
  target: { first: number; last: number },
  previous: { first: number; last: number },
  maxToRenderPerBatch: number,
  initialRegion: { first: number; last: number },
): { first: number; last: number } {
  if (previous.last < previous.first)
    return initialRegion.last < initialRegion.first ? target : initialRegion;
  const first = Math.max(target.first, previous.first - maxToRenderPerBatch);
  const last = Math.min(target.last, previous.last + maxToRenderPerBatch);
  // Never present an empty window when the target is non-empty.
  if (last < first) return target;
  return { first, last };
}

// A cell is viewable when its visible fraction clears the configured threshold. Two percents exist
// and are NOT interchangeable: viewAreaCoveragePercentThreshold is a fraction of the VIEWPORT,
// itemVisiblePercentThreshold a fraction of the CELL's own length. Area wins whenever set.
export function isCellViewable(
  cellOffset: number,
  cellLength: number,
  scrollOffset: number,
  viewportLength: number,
  config: IViewabilityConfig,
): boolean {
  const top = cellOffset - scrollOffset;
  const bottom = top + cellLength;
  // No overlap at all: RN's own caller loop never reaches `_isViewable` for such a cell
  // (`top < viewportHeight && bottom > 0` gates the whole scan), so this is exclusion by
  // construction, not a zero percent happening to clear a zero threshold.
  if (bottom <= EMPTY_OFFSET || top >= viewportLength) return false;
  // Fully inside the viewport is viewable in EITHER mode, or an area threshold sized to the
  // viewport could reject every fully-visible cell smaller than that share.
  if (top >= EMPTY_OFFSET && bottom <= viewportLength && bottom > top) {
    return true;
  }
  const visiblePixels =
    Math.min(bottom, viewportLength) - Math.max(top, EMPTY_OFFSET);
  const areaThreshold = config.viewAreaCoveragePercentThreshold;
  const areaMode = areaThreshold !== undefined;
  const threshold = areaMode
    ? areaThreshold
    : (config.itemVisiblePercentThreshold ??
      DEFAULT_VIEW_AREA_COVERAGE_PERCENT_THRESHOLD);
  const denominator = areaMode ? viewportLength : cellLength;
  if (denominator <= EMPTY_OFFSET) return false;
  const percent = (visiblePixels / denominator) * FULLY_VISIBLE_PERCENT;
  return percent >= threshold;
}

// Resolve an index to a pixel offset, optionally biasing where in the viewport the item
// lands (viewPosition 0=top, 1=bottom, 0.5=center) and an absolute viewOffset nudge,
// mirroring RN's scrollToIndex options.
export function offsetForIndex(
  index: number,
  viewPosition: number,
  viewOffset: number,
  count: number,
  offsets: number[],
  lengths: number[],
  viewportLength: number,
): number {
  const clamped = Math.max(FIRST_INDEX, Math.min(index, count - 1));
  const cellOffset = offsets[clamped] ?? EMPTY_OFFSET;
  const cellLength = lengths[clamped] ?? EMPTY_OFFSET;
  const positioned = cellOffset - viewPosition * (viewportLength - cellLength);
  return Math.max(EMPTY_OFFSET, positioned - viewOffset);
}

// Two layout readings are the SAME measurement unless they differ by more than this — a relayout
// doesn't reproduce a float bit-for-bit, so comparing with === loops at frame rate on noise no
// screen can show. One device pixel (a third of a point at @3x) sits far above that noise.
export const LAYOUT_EPSILON = 0.01;

// `known` is optional because a first measurement has nothing to settle against, and must count as
// a change.
export function isSettledLayout(
  known: number | undefined,
  reported: number,
): boolean {
  return known !== undefined && Math.abs(known - reported) < LAYOUT_EPSILON;
}

// Running average of known cell lengths, used to size not-yet-measured cells and the
// trailing spacer so the total is plausible before full measurement.
export function averageMeasuredLength(measured: Map<number, number>): number {
  if (measured.size === EMPTY_OFFSET) return EMPTY_OFFSET;
  let sum = EMPTY_OFFSET;
  for (const length of measured.values()) sum += length;
  return sum / measured.size;
}

// Average origin-to-origin distance between two ADJACENT measured cells — length plus whatever
// chrome the list draws in the gap. Only adjacent pairs qualify: across a hole the distance
// covers cells nobody measured.

// Deliberately not averageMeasuredLength: sizing an unmeasured region by heights alone makes the
// model shorter than the content, so its spacer under-reserves and everything below slides up.
// Falls back to the length average while no adjacent pair has been measured yet.
export function averageMeasuredStride(
  measuredOffsets: Map<number, number>,
  fallback: number,
): number {
  let sum = EMPTY_OFFSET;
  let pairs = EMPTY_OFFSET;
  for (const [index, offset] of measuredOffsets) {
    const next = measuredOffsets.get(index + 1);
    if (next === undefined) continue;
    sum += next - offset;
    pairs += 1;
  }
  return pairs === EMPTY_OFFSET ? fallback : sum / pairs;
}

// The largest index whose length has actually been measured (RN
// ListMetricsAggregator.getHighestMeasuredCellIndex). NO_INDEX when nothing is measured.
export function highestMeasuredIndex(measured: Map<number, number>): number {
  let highest = NO_INDEX;
  for (const index of measured.keys()) {
    if (index > highest) highest = index;
  }
  return highest;
}

// onEndReached distance + threshold test. The adapter still gates on "the last cell is actually
// rendered" and dedups by content length via its own ref; this returns only the pure geometry.

// `thresholdMultiplier` undefined means the app gave no onEndReachedThreshold — RN's own answer
// is a flat DEFAULT_EDGE_REACHED_THRESHOLD_PX, never a viewport-length multiple.
export function computeEndReached(
  total: number,
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number | undefined,
): { distanceFromEnd: number; withinThreshold: boolean } {
  let distanceFromEnd = total - (scrollOffset + viewportLength);
  if (distanceFromEnd < ON_EDGE_REACHED_EPSILON) distanceFromEnd = EMPTY_OFFSET;
  const threshold =
    thresholdMultiplier != null
      ? thresholdMultiplier * viewportLength
      : DEFAULT_EDGE_REACHED_THRESHOLD_PX;
  return { distanceFromEnd, withinThreshold: distanceFromEnd <= threshold };
}

// onStartReached twin of computeEndReached. distanceFromStart is just the scroll offset.
export function computeStartReached(
  scrollOffset: number,
  viewportLength: number,
  thresholdMultiplier: number | undefined,
): { distanceFromStart: number; withinThreshold: boolean } {
  let distanceFromStart = scrollOffset;
  if (distanceFromStart < ON_EDGE_REACHED_EPSILON)
    distanceFromStart = EMPTY_OFFSET;
  const threshold =
    thresholdMultiplier != null
      ? thresholdMultiplier * viewportLength
      : DEFAULT_EDGE_REACHED_THRESHOLD_PX;
  return { distanceFromStart, withinThreshold: distanceFromStart <= threshold };
}

// Fold the single-config and pairs forms into one list (RN supports either, not both).
export function buildViewabilityPairs<ItemT>(
  onViewableItemsChanged:
    ((info: IViewableItemsChangedInfo<ItemT>) => void) | undefined,
  viewabilityConfig: IViewabilityConfig | undefined,
  pairs: IViewabilityConfigCallbackPair<ItemT>[] | undefined,
): IViewabilityConfigCallbackPair<ItemT>[] {
  const result: IViewabilityConfigCallbackPair<ItemT>[] = [];
  if (onViewableItemsChanged !== undefined) {
    result.push({
      viewabilityConfig: viewabilityConfig ?? {},
      onViewableItemsChanged,
    });
  }
  if (pairs !== undefined) result.push(...pairs);
  return result;
}

export interface IViewableSetParams<ItemT> {
  first: number;
  last: number;
  count: number;
  offsets: number[];
  lengths: number[];
  scrollOffset: number;
  viewportLength: number;
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  keyExtractor?: (item: ItemT, index: number) => string;
  pairs: IViewabilityConfigCallbackPair<ItemT>[];
  hasInteracted: boolean;
}

// Classify every rendered cell against the viewability configs. A cell counts as
// viewable if ANY config says so (RN's broadest classification); a config with
// waitForInteraction classifies nothing until the first scroll has happened.
export function computeViewableSet<ItemT>(params: IViewableSetParams<ItemT>): {
  tokens: IViewToken<ItemT>[];
  map: Map<string, IViewToken<ItemT>>;
} {
  const tokens: IViewToken<ItemT>[] = [];
  const map = new Map<string, IViewToken<ItemT>>();
  for (
    let index = params.first;
    index <= params.last && index < params.count;
    index += 1
  ) {
    const item = params.getItem(params.data, index);
    const key = resolveItemKey(item, index, params.keyExtractor);
    let anyViewable = false;
    for (const pair of params.pairs) {
      if (
        pair.viewabilityConfig.waitForInteraction === true &&
        !params.hasInteracted
      ) {
        continue;
      }
      if (
        isCellViewable(
          params.offsets[index],
          params.lengths[index],
          params.scrollOffset,
          params.viewportLength,
          pair.viewabilityConfig,
        )
      ) {
        anyViewable = true;
        break;
      }
    }
    if (anyViewable) {
      const token: IViewToken<ItemT> = { item, key, index, isViewable: true };
      map.set(key, token);
      tokens.push(token);
    }
  }
  return { tokens, map };
}

// The `changed` delta between two viewable sets: newly viewable (true) and newly hidden (false).
// hasChanged is false when the viewable KEY set is identical, so the adapter can skip firing.
export function diffViewable<ItemT>(
  previous: Map<string, IViewToken<ItemT>>,
  current: Map<string, IViewToken<ItemT>>,
  currentTokens: IViewToken<ItemT>[],
): { changed: IViewToken<ItemT>[]; hasChanged: boolean } {
  let hasChanged = previous.size !== current.size;
  if (!hasChanged) {
    for (const key of current.keys()) {
      if (!previous.has(key)) {
        hasChanged = true;
        break;
      }
    }
  }
  if (!hasChanged) return { changed: [], hasChanged: false };
  const changed: IViewToken<ItemT>[] = [];
  for (const token of currentTokens) {
    if (!previous.has(token.key)) changed.push(token);
  }
  for (const [key, token] of previous) {
    if (!current.has(key)) changed.push({ ...token, isViewable: false });
  }
  return { changed, hasChanged: true };
}

// The largest configured minimumViewTime across all pairs (RN gates the unified pass on
// the largest value, since we fold all pairs into one classification).
export function maxMinimumViewTime<ItemT>(
  pairs: IViewabilityConfigCallbackPair<ItemT>[],
): number {
  let max = EMPTY_OFFSET;
  for (const pair of pairs) {
    const configured = pair.viewabilityConfig.minimumViewTime;
    if (configured !== undefined && configured > max) max = configured;
  }
  return max;
}

export interface IListCellPlan {
  index: number;
  key: string;
}

export interface IListPlan {
  // Space before the very first rendered element: the forced sticky cell when one is
  // present, else the window's own first cell (the old, only, meaning).
  leadingExtent: number;
  // Space between the forced sticky cell and the window's first cell. Zero whenever
  // forcedStickyCell is undefined.
  gapExtent: number;
  trailingExtent: number;
  // The in-WINDOW cells only ([first..last]) — unchanged meaning from before forcedStickyCell
  // existed. Does NOT include forcedStickyCell; render that separately, ahead of these.
  cells: IListCellPlan[];
  // The nearest sticky index BELOW `first`, force-mounted outside the normal window. Without this
  // a pinned section's cell gets destroyed and recreated (losing its measured layout) every time
  // the window slides past it — the actual cause of a sticky header flickering mid-scroll.
  forcedStickyCell: IListCellPlan | undefined;
  // Child positions (in the final emitted child array) of the sticky headers that landed
  // in the window, INCLUDING forcedStickyCell (counted first, at position 0 or 1) when set.
  stickyChildPositions: number[];
}

export interface IListPlanParams {
  count: number;
  first: number;
  last: number;
  offsets: number[];
  lengths: number[];
  total: number;
  keyFor: (index: number) => string;
  stickyIndices?: ReadonlySet<number>;
  hasHeader: boolean;
}

// Find the nearest sticky index strictly below `first` — the RN _ensureClosestStickyHeader
// backward walk. Returns NO_INDEX when none exists (no sticky section applies yet, or the
// applicable one is already inside the window).
function findClosestStickyIndexBelow(
  first: number,
  stickyIndices: ReadonlySet<number>,
): number {
  for (let index = first - 1; index >= FIRST_INDEX; index -= 1) {
    if (stickyIndices.has(index)) return index;
  }
  return NO_INDEX;
}

// Compute the windowed child PLAN: spacer extents, in-window cells, the force-mounted sticky cell
// (if any), and sticky child positions. The adapter walks this and creates the host elements;
// only element creation and the user's renderItem stay per-adapter.
export function buildListPlan(params: IListPlanParams): IListPlan {
  const cells: IListCellPlan[] = [];
  const closestStickyIndex =
    params.stickyIndices !== undefined
      ? findClosestStickyIndexBelow(params.first, params.stickyIndices)
      : NO_INDEX;
  const forcedStickyCell: IListCellPlan | undefined =
    closestStickyIndex === NO_INDEX
      ? undefined
      : { index: closestStickyIndex, key: params.keyFor(closestStickyIndex) };

  // A spacer's extent is the distance from the first cell it replaces to the far edge of the
  // last — a difference between two host-reported positions, never a sum of heights, so the next
  // cell lands exactly where it was. Rebasing would reintroduce buildOffsets' feedback loop.
  const regionExtent = (from: number, to: number): number =>
    to < from
      ? EMPTY_OFFSET
      : params.offsets[to] + params.lengths[to] - params.offsets[from];

  const windowLeadingExtent = regionExtent(FIRST_INDEX, params.first - 1);
  const leadingExtent =
    forcedStickyCell === undefined
      ? windowLeadingExtent
      : regionExtent(FIRST_INDEX, closestStickyIndex - 1);
  const gapExtent =
    forcedStickyCell === undefined
      ? EMPTY_OFFSET
      : regionExtent(closestStickyIndex + 1, params.first - 1);
  const trailingExtent =
    params.last < params.count - 1
      ? params.total - params.offsets[params.last + 1]
      : EMPTY_OFFSET;

  const stickyChildPositions: number[] = [];
  // The header (when present) is child 0; the leading spacer is the next child; the forced sticky
  // cell plus its own gap spacer follow. Each cell is EXACTLY one child — an ItemSeparatorComponent
  // rides INSIDE the cell's own measuring wrapper, so it never shifts these positions.
  let childPosition =
    (params.hasHeader ? 1 : 0) + (leadingExtent > EMPTY_OFFSET ? 1 : 0);
  if (forcedStickyCell !== undefined) {
    stickyChildPositions.push(childPosition);
    childPosition += 1 + (gapExtent > EMPTY_OFFSET ? 1 : 0);
  }
  for (let index = params.first; index <= params.last; index += 1) {
    cells.push({ index, key: params.keyFor(index) });
    if (params.stickyIndices?.has(index) === true)
      stickyChildPositions.push(childPosition);
    childPosition += 1;
  }
  return {
    leadingExtent,
    gapExtent,
    trailingExtent,
    cells,
    forcedStickyCell,
    stickyChildPositions,
  };
}

// maintainVisibleContentPosition JS anchor adjustment: native MVCP can't see prepended items
// collapsed into the leading SPACER above the window, so JS replicates the shift for those.

// The pure DECISION: track the key at minIndexForVisible, and when a prepend moves it down,
// return the inserted extent to add to scrollOffset. The adapter owns timing and the imperative
// scroll; this returns only WHAT to do, framework-agnostic.
export type IMvcpAction =
  | { kind: 'none' }
  | { kind: 'autoscroll-top' }
  | { kind: 'shift'; offset: number };

export interface IMvcpAdjustmentParams {
  // undefined when maintainVisibleContentPosition is off; the adapter unwraps the prop.
  minIndexForVisible: number | undefined;
  autoscrollToTopThreshold: number | undefined;
  count: number;
  committedFirst: number;
  offsets: number[];
  scrollOffset: number;
  prevFirstVisibleKey: string | null;
  keyFor: (index: number) => string;
}

export interface IMvcpAdjustmentResult {
  // the new firstVisibleKey the adapter stores back after acting.
  firstVisibleKey: string | null;
  action: IMvcpAction;
}

export function computeMvcpAdjustment(
  params: IMvcpAdjustmentParams,
): IMvcpAdjustmentResult {
  const { minIndexForVisible, count, keyFor } = params;
  if (minIndexForVisible === undefined || count === FIRST_INDEX) {
    return { firstVisibleKey: null, action: { kind: 'none' } };
  }
  const newFirstVisibleKey =
    count > minIndexForVisible ? keyFor(minIndexForVisible) : null;
  const prevKey = params.prevFirstVisibleKey;
  const settled: IMvcpAdjustmentResult = {
    firstVisibleKey: newFirstVisibleKey,
    action: { kind: 'none' },
  };

  if (
    prevKey === null ||
    newFirstVisibleKey === null ||
    prevKey === newFirstVisibleKey
  ) {
    return settled;
  }

  let anchorIndex = NO_INDEX;
  for (let index = minIndexForVisible; index < count; index += 1) {
    if (keyFor(index) === prevKey) {
      anchorIndex = index;
      break;
    }
  }
  if (anchorIndex <= minIndexForVisible) return settled;

  // Native MVCP shifts in-window cells itself; the JS shift covers ONLY the inserted items in the
  // leading SPACER (above the first rendered index). Counting the full inserted extent would
  // double-correct.
  const spacerEnd = Math.min(anchorIndex, params.committedFirst);
  const insertedExtent =
    spacerEnd > minIndexForVisible
      ? params.offsets[spacerEnd] - params.offsets[minIndexForVisible]
      : EMPTY_OFFSET;
  if (insertedExtent <= EMPTY_OFFSET) return settled;

  const autoThreshold = params.autoscrollToTopThreshold;
  const anchoredNearTop =
    autoThreshold !== undefined && params.scrollOffset <= autoThreshold;
  if (anchoredNearTop) {
    dlog(
      `VirtualizedList MVCP autoscroll-to-top (offset=${params.scrollOffset} <= ${autoThreshold})`,
    );
    return {
      firstVisibleKey: newFirstVisibleKey,
      action: { kind: 'autoscroll-top' },
    };
  }
  dlog(
    `VirtualizedList MVCP adjust +${insertedExtent}px ` +
      `(anchor "${prevKey}" moved ${minIndexForVisible}->${anchorIndex})`,
  );
  return {
    firstVisibleKey: newFirstVisibleKey,
    action: { kind: 'shift', offset: params.scrollOffset + insertedExtent },
  };
}

// RN's real default: an object item's own `key`, else its `id`, else the index. Most apps rely on
// this to keep list identity stable across inserts/removes — the index alone breaks on a swap.
export function defaultKeyExtractor<ItemT>(item: ItemT, index: number): string {
  if (typeof item === 'object' && item !== null) {
    const record = item as Record<string, unknown>;
    if (record.key !== undefined && record.key !== null)
      return String(record.key);
    if (record.id !== undefined && record.id !== null) return String(record.id);
  }
  return String(index);
}

// The default key extractor: the caller's keyExtractor when set, else `defaultKeyExtractor`.
// Centralized so every adapter's keyForIndex resolves keys identically.
export function resolveItemKey<ItemT>(
  item: ItemT,
  index: number,
  keyExtractor: ((item: ItemT, index: number) => string) | undefined,
): string {
  return (keyExtractor ?? defaultKeyExtractor)(item, index);
}

// Linear item -> index lookup for scrollToItem (RN scans by reference identity). NO_INDEX when the
// item is not in data.
export function indexOfItem(
  data: unknown,
  getItem: (data: unknown, index: number) => unknown,
  count: number,
  item: unknown,
): number {
  for (let index = FIRST_INDEX; index < count; index += 1) {
    if (getItem(data, index) === item) return index;
  }
  return NO_INDEX;
}

// The pixel offset that scrolls the last content to the bottom edge (scrollToEnd). Never negative
// when the content is shorter than the viewport.
export function offsetForEnd(total: number, viewportLength: number): number {
  return Math.max(EMPTY_OFFSET, total - viewportLength);
}

// A gap index addresses a real separator only inside [0, count-2]; outside it there is no gap and
// the write is a no-op (RN bails on the same bounds).
export function isSeparatorGapInRange(
  gapIndex: number,
  count: number,
): boolean {
  return gapIndex >= FIRST_INDEX && gapIndex <= count - 2;
}

// onEndReached / onStartReached fire decision + content-length dedup. The geometry comes from
// computeEndReached/computeStartReached; this folds in the "edge cell rendered" gate and the
// dedup against the last-fired content length.
export function decideEdgeReached(params: {
  withinThreshold: boolean;
  edgeCellRendered: boolean;
  total: number;
  sentForContentLength: number;
}): { shouldFire: boolean; nextSentForContentLength: number } {
  const { withinThreshold, edgeCellRendered, total, sentForContentLength } =
    params;
  if (withinThreshold && edgeCellRendered && sentForContentLength !== total) {
    return { shouldFire: true, nextSentForContentLength: total };
  }
  // Re-arm once out of threshold so the next approach can fire again.
  if (!withinThreshold) {
    return {
      shouldFire: false,
      nextSentForContentLength: NO_CONTENT_LENGTH_SENT,
    };
  }
  return { shouldFire: false, nextSentForContentLength: sentForContentLength };
}

// Section headers stick by default only on iOS (RN); the explicit prop overrides. Returns the
// header indices to stick, or undefined when sticking is off.
export function resolveStickySectionHeaders(
  enabled: boolean | undefined,
  headerIndices: number[],
  platformOS: string,
): number[] | undefined {
  const stickyEnabled = enabled ?? platformOS === 'ios';
  return stickyEnabled ? headerIndices : undefined;
}

// Wrap the user's getItemLayout into an (index) => ICellLayout resolver (dropping the `index` field
// RN's getItemLayout returns), or undefined when there is no getItemLayout.
export function wrapFixedLayout(
  data: unknown,
  getItemLayout:
    | ((
        data: unknown,
        index: number,
      ) => { length: number; offset: number; index: number })
    | undefined,
): ((index: number) => ICellLayout) | undefined {
  if (getItemLayout === undefined) return undefined;
  return (index: number): ICellLayout => {
    const layout = getItemLayout(data, index);
    return { length: layout.length, offset: layout.offset };
  };
}

// The average cell length that sizes unmeasured cells and the trailing spacer: the fixed layout's
// first cell length when getItemLayout is set (guarded against an empty list so it never calls
// fixedLayout on a non-existent cell), else the running average of the measured cells.
export function resolveAverageLength(
  fixedLayout: ((index: number) => ICellLayout) | undefined,
  count: number,
  measured: Map<number, number>,
): number {
  if (fixedLayout === undefined) return averageMeasuredLength(measured);
  return count > FIRST_INDEX ? fixedLayout(FIRST_INDEX).length : EMPTY_OFFSET;
}
