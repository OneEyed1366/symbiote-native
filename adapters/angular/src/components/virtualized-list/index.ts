// VirtualizedList, the Angular lifecycle half. The windowing engine (offset table, window
// compute, batch throttle, viewability, edge-reached, the child PLAN, the imperative-handle
// geometry) lives in @symbiote-native/components/state, shared verbatim with the React and Vue adapters
// so every adapter keeps the same feature surface. Here Angular supplies only the lifecycle: plain fields
// for scroll offset / viewport / measurement bumps, a once-per-CD metrics + view recompute in
// ngDoCheck (the Angular twin of React render / Vue `computed` — it owns the controlled
// committedWindow throttle and assembles the windowed cells before the template bindings are read),
// and the after-commit work (batch fill, onEndReached/onStartReached, viewability, initialScroll, MVCP)
// in ngAfterViewChecked. OnPush + ChangeDetectorRef.markForCheck() drives re-render off the native
// scroll/layout/measure callbacks (they fire outside Angular's own event bindings, so they must
// mark the view dirty). This is the Angular twin of the React useReducer/useEffect and Vue
// ref/computed/watch over the same shared functions. It composes the Angular ScrollView, exactly
// as the React/Vue lists drive their ScrollView.
//
// Per-item rendering is TEMPLATES, not a callback: React/Vue `renderItem: (info) => element` does
// not translate to Angular. The app supplies the cell via `<ng-template vListItem>` (and the
// header/footer/empty/separator slots via vListHeader/vListFooter/vListEmpty/vListSeparator); the
// list captures them with @ContentChild and stamps the WINDOWED slice through VListOutletDirective
// (a core-only NgTemplateOutlet twin — @angular/common is not a dependency). See ./directives.ts.
// Every React/Vue behavior is present (windowing, onEndReached, viewability, headers/footers/empty/
// separators, refresh, imperative scroll, horizontal, inverted, MVCP); only the cell AUTHORING
// shape differs, since a callback prop returning an element has no Angular equivalent.
//
// Lists have no Descriptor render fn — the cell content is the framework's own children.
// Cells/spacers are plain symbiote-view host elements.

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
  type AfterViewChecked,
  type DoCheck,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import {
  DEFAULT_END_REACHED_THRESHOLD,
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_START_REACHED_THRESHOLD,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  EMPTY_OFFSET,
  FIRST_INDEX,
  INVERTED_X_STYLE,
  INVERTED_Y_STYLE,
  buildListPlan,
  buildViewabilityPairs,
  computeWindow,
  createInitialListState,
  isSeparatorGapInRange,
  listEffectSignature,
  readLayoutLength,
  readLayoutOffset,
  readScrollOffset,
  reduceList,
  resolveAccessibilityProps,
  resolveItemKey,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IListAction,
  type IListEffect,
  type IListReducerInputs,
  type IListState,
  type ISeparatorProps,
  type ISeparators,
  type IScrollViewHandle,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import {
  dlog,
  flattenStyle,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { countAngular } from '../../diagnostics';
import { ScrollView } from '../scroll-view';
import { RefreshControl } from '../refresh-control';
import {
  anchorHostStyle,
  SymbioteStyleInputDirective,
  ViewHost,
} from '../../primitives';
import {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListOutletDirective,
  VListSeparatorDirective,
  type IVListItemContext,
  type IVListSeparatorContext,
} from './directives';

// Re-export the shared list types + the authoring directives so flat-list / section-list keep
// importing them from '../virtualized-list', exactly as the React/Vue adapters re-export them.
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export {
  VListEmptyDirective,
  VListFooterDirective,
  VListHeaderDirective,
  VListItemDirective,
  VListSeparatorDirective,
} from './directives';
export type { IVListItemContext, IVListSeparatorContext } from './directives';

// The Angular VirtualizedList prop surface. Mirrors React/Vue's IVirtualizedListProps MINUS the
// element-returning props (renderItem, ListHeader/Footer/Empty Component, ItemSeparatorComponent):
// those are the per-adapter children/render fields and become `<ng-template>` directives in Angular.
// Everything agnostic is the SAME surface.
export interface IVirtualizedListProps<ItemT>
  extends IAccessibilityProps, IAriaProps {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  horizontal?: boolean;
  inverted?: boolean;
  extraData?: unknown;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing?: boolean | null;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  onScrollToIndexFailed?: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
  initialNumToRender?: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch?: number;
  updateCellsBatchingPeriod?: number;
  windowSize?: number;
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  onScroll?: (event: ISymbioteEvent) => void;
  onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  onScrollEndDrag?: (event: ISymbioteEvent) => void;
  onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  scrollEventThrottle?: number;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
}

// What the VirtualizedList component itself takes as plain @Input()s: the full surface minus the
// events it exposes as real @Output() EventEmitters instead (see the class below), mirroring how
// pressable/index.ts derives IAngularPressableInputs from IAngularPressableProps.
export type IVirtualizedListInputs<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

// One in-window cell, assembled in ngDoCheck and stamped by the template's @for. The
// context object is fresh each pass; VListOutletDirective folds it onto the live embedded view, so
// the cell view is reused (the windowing recompute does not tear cells down).
interface IWindowCell<ItemT> {
  key: string;
  index: number;
  context: IVListItemContext<ItemT>;
  measure: (event: ISymbioteEvent) => void;
  separatorContext?: IVListSeparatorContext<ItemT>;
}

@Component({
  selector: 'VirtualizedList',
  standalone: true,
  hostDirectives: [
    { directive: SymbioteStyleInputDirective, inputs: ['style'] },
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  imports: [ScrollView, RefreshControl, VListOutletDirective, ViewHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ScrollView
      [horizontal]="isHorizontal"
      [style]="resolvedStyle"
      [contentContainerStyle]="resolvedContentContainerStyle"
      [testID]="foldedAccessibility().testID"
      [nativeID]="foldedAccessibility().nativeID"
      [accessible]="foldedAccessibility().accessible"
      [accessibilityLabel]="foldedAccessibility().accessibilityLabel"
      [accessibilityHint]="foldedAccessibility().accessibilityHint"
      [accessibilityRole]="foldedAccessibility().accessibilityRole"
      [accessibilityState]="foldedAccessibility().accessibilityState"
      [accessibilityValue]="foldedAccessibility().accessibilityValue"
      [accessibilityActions]="foldedAccessibility().accessibilityActions"
      [accessibilityLabelledBy]="foldedAccessibility().accessibilityLabelledBy"
      [importantForAccessibility]="
        foldedAccessibility().importantForAccessibility
      "
      [accessibilityLiveRegion]="foldedAccessibility().accessibilityLiveRegion"
      [screenReaderFocusable]="foldedAccessibility().screenReaderFocusable"
      [accessibilityViewIsModal]="
        foldedAccessibility().accessibilityViewIsModal
      "
      [accessibilityElementsHidden]="
        foldedAccessibility().accessibilityElementsHidden
      "
      [accessibilityIgnoresInvertColors]="
        foldedAccessibility().accessibilityIgnoresInvertColors
      "
      [accessibilityLanguage]="foldedAccessibility().accessibilityLanguage"
      [accessibilityRespondsToUserInteraction]="
        foldedAccessibility().accessibilityRespondsToUserInteraction
      "
      [accessibilityShowsLargeContentViewer]="
        foldedAccessibility().accessibilityShowsLargeContentViewer
      "
      [accessibilityLargeContentTitle]="
        foldedAccessibility().accessibilityLargeContentTitle
      "
      (accessibilityAction)="accessibilityActionTick($event)"
      (accessibilityTap)="accessibilityTapTick($event)"
      (magicTap)="magicTapTick($event)"
      (accessibilityEscape)="accessibilityEscapeTick($event)"
      [onScroll]="onScrollTick"
      (layout)="onLayoutTick($event)"
      [onScrollBeginDrag]="onScrollBeginDrag"
      [onScrollEndDrag]="onScrollEndDrag"
      [onMomentumScrollBegin]="onMomentumScrollBegin"
      [onMomentumScrollEnd]="onMomentumScrollEnd"
      [scrollEventThrottle]="scrollEventThrottle"
      [keyboardShouldPersistTaps]="keyboardShouldPersistTaps"
      [keyboardDismissMode]="keyboardDismissMode"
      [contentOffset]="commandedOffset"
      [stickyHeaderIndices]="renderedStickyIndices"
      [maintainVisibleContentPosition]="resolvedMaintainVisibleContentPosition"
    >
      @if (shouldRenderRefreshControl) {
        <RefreshControl
          [refreshing]="refreshing ?? false"
          (refresh)="handleRefresh()"
          [progressViewOffset]="progressViewOffset"
        />
      }

      @if (headerDir !== undefined) {
        <symbiote-view>
          <ng-container [vListOutlet]="headerDir.templateRef"></ng-container>
        </symbiote-view>
      }

      @if (itemCount === 0) {
        @if (emptyDir !== undefined) {
          <symbiote-view>
            <ng-container [vListOutlet]="emptyDir.templateRef"></ng-container>
          </symbiote-view>
        }
      } @else {
        @if (leadingSpacerStyle !== null) {
          <symbiote-view [style]="leadingSpacerStyle"></symbiote-view>
        }
        @if (forcedStickyCell !== null) {
          <symbiote-view
            (layout)="handleCellLayout(forcedStickyCell.measure, $event)"
            [style]="cellStyle"
          >
            <ng-container
              [vListOutlet]="itemDir?.templateRef"
              [vListOutletContext]="forcedStickyCell.context"
            ></ng-container>
          </symbiote-view>
        }
        @if (gapSpacerStyle !== null) {
          <symbiote-view [style]="gapSpacerStyle"></symbiote-view>
        }
        <!-- The separator sits INSIDE the measuring view, as RN's own cell renderer places it
             (VirtualizedListCellRenderer.js:218-221). As a sibling it is an extra flex child, so
             the chrome between two cells is gap + separator + gap while a spacer collapsing that
             region replaces it with a single gap — every cell below the leading spacer then lands
             short by (separator + gap) and the content jumps by that much whenever the window's
             first index moves. Measured at exactly 17px on device 2026-08-19; see
             .claude/rules/list-geometry-feedback-loop.md. -->
        @for (cell of windowCells; track cell.key) {
          <symbiote-view
            (layout)="handleCellLayout(cell.measure, $event)"
            [style]="cellStyle"
          >
            <ng-container
              [vListOutlet]="itemDir?.templateRef"
              [vListOutletContext]="cell.context"
            ></ng-container>
            @if (cell.separatorContext !== undefined) {
              <ng-container
                [vListOutlet]="separatorDir?.templateRef"
                [vListOutletContext]="cell.separatorContext"
              ></ng-container>
            }
          </symbiote-view>
        }
        @if (trailingSpacerStyle !== null) {
          <symbiote-view [style]="trailingSpacerStyle"></symbiote-view>
        }
      }

      @if (footerDir !== undefined) {
        <symbiote-view>
          <ng-container [vListOutlet]="footerDir.templateRef"></ng-container>
        </symbiote-view>
      }
    </ScrollView>
  `,
})
export class VirtualizedList<ItemT = unknown>
  implements
    IVirtualizedListInputs<ItemT>,
    IVirtualizedListHandle,
    DoCheck,
    AfterViewChecked,
    OnChanges,
    OnDestroy
{
  // The list's edge/viewability/failure events as real Angular events: `(endReached)="…"`, not
  // `[onEndReached]="…"`. See handleRefresh/accessibility*Tick below for how the still-callback-
  // shaped ScrollView/RefreshControl @Input()s are fed from these.
  @Output() readonly endReached = new EventEmitter<{
    distanceFromEnd: number;
  }>();
  @Output() readonly startReached = new EventEmitter<{
    distanceFromStart: number;
  }>();
  @Output() readonly refresh = new EventEmitter<void>();
  @Output() readonly viewableItemsChanged = new EventEmitter<
    IViewableItemsChangedInfo<ItemT>
  >();
  @Output() readonly scrollToIndexFailed = new EventEmitter<{
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();
  @Input({ required: true }) data!: unknown;
  @Input({ required: true }) getItem!: (data: unknown, index: number) => ItemT;
  @Input({ required: true }) getItemCount!: (data: unknown) => number;
  @Input() keyExtractor?: (item: ItemT, index: number) => string;
  @Input() getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  @Input() horizontal?: boolean;
  @Input() inverted?: boolean;
  @Input() extraData?: unknown;
  @Input() onEndReachedThreshold?: number;
  @Input() onStartReachedThreshold?: number;
  @Input() refreshing?: boolean | null;
  @Input() progressViewOffset?: number;
  // Set explicitly by a wrapper (FlatList/VirtualizedSectionList) that ALWAYS binds
  // `(refresh)="refresh.emit()"` on this component to re-forward the event outward — that binding
  // itself makes `this.refresh.observed` permanently true (Angular subscribes unconditionally the
  // moment a template writes `(refresh)="…"`, regardless of what the handler does), so `.observed`
  // can no longer tell "the app actually wants pull-to-refresh" from "a wrapper is just forwarding
  // the event". A wrapper passes its OWN public `refresh.observed` here instead; direct usage
  // (no wrapper) falls back to this component's own `.observed`, unchanged from before.
  @Input() refreshRequested?: boolean;
  @Input() viewabilityConfig?: IViewabilityConfig;
  @Input()
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  @Input() initialNumToRender?: number;
  @Input() initialScrollIndex?: number;
  @Input() maxToRenderPerBatch?: number;
  @Input() updateCellsBatchingPeriod?: number;
  @Input() windowSize?: number;
  @Input() stickyHeaderIndices?: number[];
  @Input() maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  @Input() onScroll?: (event: ISymbioteEvent) => void;
  @Input() onScrollBeginDrag?: (event: ISymbioteEvent) => void;
  @Input() onScrollEndDrag?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
  @Input() onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
  @Input() scrollEventThrottle?: number;
  @Input() keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  @Input() keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  @Input() style?: IStyleProp<IViewStyle>;
  @Input() contentContainerStyle?: IStyleProp<IViewStyle>;
  @Input() testID?: string;
  @Input() nativeID?: string;
  @Input() accessible?: boolean;
  @Input() accessibilityLabel?: string;
  @Input() accessibilityHint?: string;
  @Input() accessibilityRole?: IAccessibilityProps['accessibilityRole'];
  @Input() accessibilityState?: IAccessibilityStateValue;
  @Input() accessibilityValue?: IAccessibilityProps['accessibilityValue'];
  @Input() accessibilityActions?: IAccessibilityProps['accessibilityActions'];
  @Input() accessibilityLabelledBy?: string | string[];
  @Input()
  importantForAccessibility?: IAccessibilityProps['importantForAccessibility'];
  @Input()
  accessibilityLiveRegion?: IAccessibilityProps['accessibilityLiveRegion'];
  @Input() screenReaderFocusable?: boolean;
  @Input() accessibilityViewIsModal?: boolean;
  @Input() accessibilityElementsHidden?: boolean;
  @Input() accessibilityIgnoresInvertColors?: boolean;
  @Input() accessibilityLanguage?: string;
  @Input() accessibilityRespondsToUserInteraction?: boolean;
  @Input() accessibilityShowsLargeContentViewer?: boolean;
  @Input() accessibilityLargeContentTitle?: string;
  @Input() role?: IAriaProps['role'];
  @Input() ariaLabel?: string;
  @Input() ariaLabelledBy?: string;
  @Input() ariaLive?: IAriaProps['aria-live'];
  @Input() ariaHidden?: boolean;
  @Input() ariaBusy?: boolean;
  @Input() ariaChecked?: boolean | 'mixed';
  @Input() ariaDisabled?: boolean;
  @Input() ariaExpanded?: boolean;
  @Input() ariaSelected?: boolean;
  @Input() ariaModal?: boolean;
  @Input() ariaValueMax?: number;
  @Input() ariaValueMin?: number;
  @Input() ariaValueNow?: number;
  @Input() ariaValueText?: string;

  // The cell + slot templates the app authors (the Angular twin of renderItem / ListHeaderComponent
  // / ListFooterComponent / ListEmptyComponent / ItemSeparatorComponent), captured from projected
  // <ng-template> content. Resolved by ngAfterContentInit, read each ngDoCheck (from the 2nd CD on).
  @ContentChild(VListItemDirective) itemDir?: VListItemDirective<ItemT>;
  @ContentChild(VListHeaderDirective) headerDir?: VListHeaderDirective;
  @ContentChild(VListFooterDirective) footerDir?: VListFooterDirective;
  @ContentChild(VListEmptyDirective) emptyDir?: VListEmptyDirective;
  @ContentChild(VListSeparatorDirective)
  separatorDir?: VListSeparatorDirective<ItemT>;

  // The composed inner scroll view. Its instance IS an IScrollViewHandle (scrollTo / scrollToEnd /
  // flashScrollIndicators / getScrollNode), so the imperative handle delegates straight to it.
  // Available from ngAfterViewInit on; the handle reads the node lazily and no-ops before commit.
  @ViewChild(ScrollView) private scrollView?: ScrollView;

  // --- template-bound view state, assembled in ngDoCheck (recomputeView) ---
  itemCount = EMPTY_OFFSET;
  windowCells: IWindowCell<ItemT>[] = [];
  // The nearest sticky-header cell force-mounted outside [first,last] (plan.forcedStickyCell), the
  // Angular twin of RN's _ensureClosestStickyHeader. Rendered ahead of windowCells, right after the
  // leading spacer, with gapSpacerStyle filling the gap to the window's own first cell — see
  // buildListPlan's doc comment for the exact child order this assumes.
  forcedStickyCell: IWindowCell<ItemT> | null = null;
  leadingSpacerStyle: IViewStyle | null = null;
  gapSpacerStyle: IViewStyle | null = null;
  trailingSpacerStyle: IViewStyle | null = null;
  cellStyle: IViewStyle | undefined = undefined;
  renderedStickyIndices: number[] | undefined = undefined;
  // Bound to the template's `[style]="resolvedStyle"`, which Angular compiles to the built-in
  // ɵɵstyleMap instruction — it only understands a flat object, never an array (RN's own
  // `style={[a, b]}` composition idiom crashes deep inside Angular's styling engine), so this
  // is always pre-flattened via the engine's own flattenStyle, never left as an array.
  resolvedStyle: IViewStyle | undefined = undefined;
  resolvedContentContainerStyle: IStyleProp<IViewStyle> | undefined = undefined;
  resolvedMaintainVisibleContentPosition:
    | { minIndexForVisible: number; autoscrollToTopThreshold?: number }
    | undefined = undefined;
  // The offset we are imperatively driving native to before the scroll handle attaches (rides down
  // as contentOffset). A fresh object identity each push so the commit re-applies a repeated value.
  commandedOffset: { x: number; y: number } | undefined = undefined;

  // The one folded state cell (the Angular twin of React's stateRef): scroll offset, viewport,
  // measured lengths, committed window, edge/viewability dedup, MVCP anchor — all in IListState,
  // driven by the shared reduceList. `renderVersion` bumps whenever a transition changes render
  // state, so ngDoCheck's recompute-dedup can detect it (listState is a plain object, not tracked).
  private readonly listState: IListState<ItemT> =
    createInitialListState<ItemT>();
  private renderVersion = EMPTY_OFFSET;

  private readonly cellMeasures = new Map<
    number,
    (event: ISymbioteEvent) => void
  >();
  // A cell's context object is the ONLY thing its stamped view reads, and VListOutletDirective
  // refreshes that view whenever the object's IDENTITY changes. recomputeView runs on every frame
  // the window moves, so minting a fresh context per cell made a four-row slide cost a refresh of
  // EVERY cell in the window. MEASURED on PATH B geometry (544 entries, 320px viewport, RN
  // defaults), per fling frame: 233-cell window, 4 cells genuinely entering, 228 outlet updates —
  // each one a copyContextFields plus a markForCheck that walks to the root. Solid, same geometry,
  // same shared reducer, same engine output: 4. Handing back the SAME object for a cell whose item
  // and index did not move keeps `[vListOutletContext]` reference-equal, so ngOnChanges never fires
  // for it. The fast adapters get this by construction — Solid's <For> is keyed on the cell KEY
  // strings precisely so "the plan's freshly-built cell objects" cannot rebuild every row
  // (adapters/solid/src/components/virtualized-list/shared.tsx, the cellKeys memo).
  private cellContexts = new Map<string, IVListItemContext<ItemT>>();
  private nextCellContexts = new Map<string, IVListItemContext<ItemT>>();
  // Everything a cell's CONTENT can depend on that is not its own item identity. RN's contract for
  // "re-render the cells, the data object itself did not change" is extraData; without it here an
  // extraData flip would reuse every context and repaint nothing.
  private cellContextEpoch: unknown[] | undefined = undefined;
  private readonly separatorOverrides = new Map<
    number,
    Partial<ISeparatorProps<unknown>>
  >();
  // The adapter-owned debounce (minimumViewTime) and incremental-fill timers; the reducer only
  // hands back a delay.
  private viewableTimer: ReturnType<typeof setTimeout> | null = null;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  // Dedupes the after-commit effects: they run only when the windowing signature changed.
  private lastEffectSignature = '';
  // Dedupes ngDoCheck's own recompute. WITHOUT this, recomputeView() unconditionally rebuilds
  // windowCells (and each cell's `separators` handle — fresh closures every call) on EVERY CD pass,
  // including ones triggered by something else entirely in the app. A fresh context object flows
  // into VListOutletDirective, which (correctly) sees its `context` @Input() change and calls
  // `viewRef.markForCheck()` — which reschedules ANOTHER change-detection tick via the zoneless
  // scheduler (adapters/angular/src/render.ts). Recomputing unconditionally therefore free-runs
  // forever the moment a list actually has cells to stamp (a real, previously-dormant bug only
  // exposed once flat-list.test.ts's projection fix let cells render for the first time — see that
  // test's comment). Guarding recompute behind "did anything relevant actually change" breaks the
  // cycle: unrelated CD passes reuse the same windowCells/context identities, so
  // VListOutletDirective's ngOnChanges sees no change and never reschedules.
  private lastRecompute: unknown[] | undefined = undefined;

  private readonly cdr = inject(ChangeDetectorRef);
  // This component's OWN host — the non-painting anchor `class="..."` at the use site resolves
  // onto (see anchorHostStyle's doc comment) — NOT `scrollView` above, which targets the real
  // inner `<ScrollView>` one level down (itself its own separate anchor host).
  private readonly elementRef = inject(ElementRef);

  // Bridges the non-reactive @Input fields into the reactive graph so the computed below can
  // memoize a bag derived from them (the same bridge ScrollView's shared.ts uses - read its comment
  // for why signal inputs are not an option while this package's unit suite runs on JIT).
  //
  // ONLY safe for a bag whose every dependency is an @Input. This list's window machinery
  // (listState, renderVersion, windowCells, the measured metrics) is driven from scroll/layout
  // callbacks that never touch ngOnChanges, so nothing derived from it may ride this signal - it
  // would memoize a window that stops re-computing mid-scroll. Make that state its own signal
  // instead of widening this one.
  private readonly inputsRevision = signal(0);

  // MEASURED: the template feeds 20 separate <ScrollView> inputs off this one bag, and Angular does
  // not cache a getter across binding expressions - as a getter it rebuilt the object 20 times per
  // refresh, and every consumer saw a fresh reference, so all 20 reported "changed" and wrote
  // through to the ScrollView. A computed evaluates once and hands back the SAME object until an
  // input actually changes. Every dependency below is an @Input, which is what makes
  // inputsRevision a complete dependency set here.
  readonly foldedAccessibility = computed<
    IAccessibilityProps & IAriaProps & Record<string, unknown>
  >(() => {
    this.inputsRevision();
    return resolveAccessibilityProps({
      testID: this.testID,
      nativeID: this.nativeID,
      accessible: this.accessible,
      accessibilityLabel: this.accessibilityLabel,
      accessibilityHint: this.accessibilityHint,
      accessibilityRole: this.accessibilityRole,
      accessibilityState: this.accessibilityState,
      accessibilityValue: this.accessibilityValue,
      accessibilityActions: this.accessibilityActions,
      accessibilityLabelledBy: this.accessibilityLabelledBy,
      importantForAccessibility: this.importantForAccessibility,
      accessibilityLiveRegion: this.accessibilityLiveRegion,
      screenReaderFocusable: this.screenReaderFocusable,
      accessibilityViewIsModal: this.accessibilityViewIsModal,
      accessibilityElementsHidden: this.accessibilityElementsHidden,
      accessibilityIgnoresInvertColors: this.accessibilityIgnoresInvertColors,
      accessibilityLanguage: this.accessibilityLanguage,
      accessibilityRespondsToUserInteraction:
        this.accessibilityRespondsToUserInteraction,
      accessibilityShowsLargeContentViewer:
        this.accessibilityShowsLargeContentViewer,
      accessibilityLargeContentTitle: this.accessibilityLargeContentTitle,
      role: this.role,
      'aria-label': this.ariaLabel,
      'aria-labelledby': this.ariaLabelledBy,
      'aria-live': this.ariaLive,
      'aria-hidden': this.ariaHidden,
      'aria-busy': this.ariaBusy,
      'aria-checked': this.ariaChecked,
      'aria-disabled': this.ariaDisabled,
      'aria-expanded': this.ariaExpanded,
      'aria-selected': this.ariaSelected,
      'aria-modal': this.ariaModal,
      'aria-valuemax': this.ariaValueMax,
      'aria-valuemin': this.ariaValueMin,
      'aria-valuenow': this.ariaValueNow,
      'aria-valuetext': this.ariaValueText,
    });
  });

  get shouldRenderRefreshControl(): boolean {
    return this.refreshRequested ?? this.refresh.observed;
  }

  get isHorizontal(): boolean {
    return this.horizontal === true;
  }
  private get isInverted(): boolean {
    return this.inverted === true;
  }
  private get windowSizeValue(): number {
    return this.windowSize ?? DEFAULT_WINDOW_SIZE;
  }
  private get initialNumToRenderValue(): number {
    return this.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER;
  }
  private get maxToRenderPerBatchValue(): number {
    return this.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH;
  }
  private get updateCellsBatchingPeriodValue(): number {
    return (
      this.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD
    );
  }
  private get onEndReachedThresholdValue(): number {
    return this.onEndReachedThreshold ?? DEFAULT_END_REACHED_THRESHOLD;
  }
  private get onStartReachedThresholdValue(): number {
    return this.onStartReachedThreshold ?? DEFAULT_START_REACHED_THRESHOLD;
  }

  // ScrollView's onScroll stays an @Input() callback (an Animated.event(...) target must be able to
  // flow through it, which an @Output() can't carry), so this is a stable arrow field passed
  // straight to [onScroll]. onLayout is a real @Output() now, bound via (layout)="onLayoutTick($event)".
  onScrollTick = (event: ISymbioteEvent): void => {
    countAngular('scrollTicks');
    const offset = readScrollOffset(event, this.isHorizontal);
    if (offset === undefined) return;
    dlog(`Angular VirtualizedList onScroll offset=${offset}`);
    // A real native scroll supersedes any pending commanded offset.
    this.commandedOffset = undefined;
    this.dispatch({ kind: 'scroll', offset });
    // Compose, don't clobber: internal windowing ran first, now the user's onScroll.
    this.onScroll?.(event);
  };

  onLayoutTick = (event: ISymbioteEvent): void => {
    const length = readLayoutLength(event, this.isHorizontal);
    if (length === undefined) return;
    dlog(`Angular VirtualizedList onLayout viewport=${length}`);
    this.dispatch({ kind: 'layout', length });
  };

  // RefreshControl's refresh and ScrollView's accessibility events are real @Output()s now, bound
  // via (refresh)="handleRefresh()" / (accessibilityAction)="accessibilityActionTick($event)" etc.
  // — these fields just adapt VirtualizedList's own @Output() into a plain re-emit callback.
  handleRefresh = (): void => {
    this.refresh.emit();
  };

  accessibilityActionTick = (event: ISymbioteEvent): void => {
    this.accessibilityAction.emit(event);
  };

  accessibilityTapTick = (event: ISymbioteEvent): void => {
    this.accessibilityTap.emit(event);
  };

  magicTapTick = (event: ISymbioteEvent): void => {
    this.magicTap.emit(event);
  };

  accessibilityEscapeTick = (event: ISymbioteEvent): void => {
    this.accessibilityEscape.emit(event);
  };

  private keyFor = (index: number): string => {
    const item = this.getItem(this.data, index);
    return resolveItemKey(item, index, this.keyExtractor);
  };

  // The reducer inputs, folded off the @Input()s each call. The edge/viewability listeners map to
  // `.observed` (Angular's "is anyone bound to this @Output()"), so the reducer emits only when the
  // consumer listens — the same on-demand gating the prop-callback era had.
  private buildInputs(): IListReducerInputs<ItemT> {
    return {
      data: this.data,
      getItem: this.getItem,
      getItemCount: this.getItemCount,
      keyExtractor: this.keyExtractor,
      getItemLayout: this.getItemLayout,
      horizontal: this.isHorizontal,
      windowSize: this.windowSizeValue,
      initialNumToRender: this.initialNumToRenderValue,
      maxToRenderPerBatch: this.maxToRenderPerBatchValue,
      updateCellsBatchingPeriod: this.updateCellsBatchingPeriodValue,
      onEndReachedThreshold: this.onEndReachedThresholdValue,
      onStartReachedThreshold: this.onStartReachedThresholdValue,
      onEndReachedActive: this.endReached.observed,
      onStartReachedActive: this.startReached.observed,
      viewabilityPairs: buildViewabilityPairs(
        this.viewableItemsChanged.observed
          ? (info: IViewableItemsChangedInfo<ItemT>): void =>
              this.viewableItemsChanged.emit(info)
          : undefined,
        this.viewabilityConfig,
        this.viewabilityConfigCallbackPairs,
      ),
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      initialScrollIndex: this.initialScrollIndex,
    };
  }

  // Map a native event / imperative call to an action, run the returned effects, and mark the view
  // dirty when render state changed (the native callbacks fire outside Angular's own bindings).
  private dispatch(action: IListAction<ItemT>): void {
    const inputs = this.buildInputs();
    const result = reduceList(this.listState, action, inputs);
    this.runEffects(result.effects, inputs);
    if (!result.changed) return;
    this.renderVersion += 1;
    if (this.isWindowSettled(action)) return;
    countAngular('listMarks');
    this.cdr.markForCheck();
  }

  // The reducer reports `changed` for EVERY scroll offset - it has to, since the offset feeds
  // end-reached distance, viewability and the batch-fill timer, all handled by runEffects. The
  // TEMPLATE reads none of those; it reads the window. Marking on the offset repainted the whole
  // ancestor chain 60 times a second on a sticky screen for a window that had not moved.
  //
  // So the question here is "would a render leave the window exactly where it is", and it is asked
  // of the state as it is NOW. It must NOT be answered by comparing the last-rendered window with
  // the one before it: that window was derived from the PREVIOUS scroll offset, so once two
  // consecutive derives agree the comparison reads "settled" for every offset that ever follows -
  // no mark, no CD, no ngDoCheck, no refresh-metrics, so the window can never move again and the
  // list goes permanently deaf mid-scroll (device: examples/angular Benchmark sticky path B froze
  // at exactly the window the first viewport asked for, blank below it).
  //
  // computeWindow re-run over the CACHED offset table answers it directly. Two scans, no
  // allocation - buildOffsets, the O(count) allocating half, still runs once per render only. It is
  // the same function the render will use, so this cannot drift away from the window it predicts.
  private isWindowSettled(action: IListAction<ItemT>): boolean {
    // A measurement rewrites the very offset table the prediction reads, so it has no cached
    // geometry to answer from.
    if (action.kind === 'measure') return false;
    const m = this.listState.metrics;
    // Mid-fill: the committed window is still climbing toward target one batch step per render, and
    // only a render advances it. Skipping the mark here is what stalls the incremental fill.
    if (m.first !== m.target.first || m.last !== m.target.last) return false;
    const next = computeWindow(
      m.count,
      m.offsets,
      m.lengths,
      this.listState.scrollOffset,
      this.listState.viewportLength,
      this.windowSizeValue,
      this.initialNumToRenderValue,
    );
    const isSettled =
      next.first === m.target.first && next.last === m.target.last;
    if (!isSettled)
      dlog(
        `Angular VirtualizedList window moves [${m.first}, ${m.last}] -> ` +
          `[${next.first}, ${next.last}] at offset ${this.listState.scrollOffset}`,
      );
    return isSettled;
  }

  private runEffects(
    effects: IListEffect<ItemT>[],
    inputs: IListReducerInputs<ItemT>,
  ): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'scroll-to':
          this.scrollToPixel(effect.offset, effect.animated);
          break;
        case 'fire-end-reached':
          this.endReached.emit({ distanceFromEnd: effect.distanceFromEnd });
          break;
        case 'fire-start-reached':
          this.startReached.emit({
            distanceFromStart: effect.distanceFromStart,
          });
          break;
        case 'fire-scroll-to-index-failed':
          this.scrollToIndexFailed.emit({
            index: effect.index,
            highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
            averageItemLength: effect.averageItemLength,
          });
          break;
        case 'schedule-refill': {
          if (this.batchTimer !== null) clearTimeout(this.batchTimer);
          this.batchTimer = setTimeout(() => {
            this.batchTimer = null;
            this.dispatch({ kind: 'batch-tick' });
          }, effect.delay);
          break;
        }
        case 'fire-viewable': {
          const pairs = inputs.viewabilityPairs;
          const info = effect.info;
          const map = effect.map;
          const fire = (): void => {
            for (const pair of pairs) pair.onViewableItemsChanged(info);
            this.dispatch({ kind: 'viewable-fired', map });
          };
          if (this.viewableTimer !== null) {
            clearTimeout(this.viewableTimer);
            this.viewableTimer = null;
          }
          if (effect.delay > EMPTY_OFFSET) {
            this.viewableTimer = setTimeout(() => {
              this.viewableTimer = null;
              fire();
            }, effect.delay);
          } else {
            fire();
          }
          break;
        }
      }
    }
  }

  // foldedAccessibility reads plain @Input fields, which are NOT reactive on their own - this bump
  // is what tells that computed an input changed. It must stay in ngOnChanges: that is the single
  // moment Angular has finished writing every changed input for this pass, and it runs before
  // ngDoCheck below, so the recompute already sees the current values.
  ngOnChanges(): void {
    this.inputsRevision.update(revision => revision + 1);
  }

  // Once-per-CD recompute, BEFORE the template bindings are read (so the freshly computed
  // template-bound fields render this pass — computing them in ngAfterContentChecked instead would
  // trip ExpressionChangedAfterItHasBeenChecked). The dedup guard runs refresh-metrics (which owns
  // the controlled committedWindow throttle) only when something relevant changed, so the window
  // grows exactly one step per meaningful CD. The projected templates (ContentChild) are resolved
  // from the second CD on; the first paint (count/viewport still 0) corrects on the layout-driven CD.
  ngDoCheck(): void {
    countAngular('listChecks');
    const recomputeInputs: unknown[] = [
      this.data,
      this.extraData,
      this.getItemLayout,
      this.keyExtractor,
      this.isHorizontal,
      this.isInverted,
      this.windowSizeValue,
      this.initialNumToRenderValue,
      this.maxToRenderPerBatchValue,
      this.stickyHeaderIndices,
      this.maintainVisibleContentPosition,
      this.style,
      // `recomputeView` folds this into the committed style, but it arrives through
      // addClass/removeClass, never as an @Input - so without it here no entry moves on a class
      // toggle and the gate skips the recompute forever. Reference-stable, so the dedup holds.
      anchorHostStyle(this.elementRef),
      this.contentContainerStyle,
      // Folds scroll / layout / measure / batch-tick: dispatch bumps renderVersion on any change.
      this.renderVersion,
      this.headerDir !== undefined,
      this.footerDir !== undefined,
      this.emptyDir !== undefined,
      this.separatorDir !== undefined,
    ];
    const previous = this.lastRecompute;
    this.lastRecompute = recomputeInputs;
    if (
      previous !== undefined &&
      previous.length === recomputeInputs.length &&
      previous.every((value, index) => value === recomputeInputs[index])
    ) {
      return;
    }
    // The single derive-per-CD: recompute the window off the current state before the view reads it.
    countAngular('listRecomputes');
    reduceList(this.listState, { kind: 'refresh-metrics' }, this.buildInputs());
    this.recomputeView();
  }

  ngAfterViewChecked(): void {
    const signature = listEffectSignature(this.listState);
    if (signature === this.lastEffectSignature) return;
    this.lastEffectSignature = signature;
    const inputs = this.buildInputs();
    const result = reduceList(this.listState, { kind: 'commit' }, inputs);
    this.runEffects(result.effects, inputs);
  }

  ngOnDestroy(): void {
    if (this.viewableTimer !== null) clearTimeout(this.viewableTimer);
    if (this.batchTimer !== null) clearTimeout(this.batchTimer);
  }

  private recomputeView(): void {
    const m = this.listState.metrics;
    this.itemCount = m.count;
    const hasHeader = this.headerDir !== undefined;
    const hasSeparators = this.separatorDir !== undefined;
    const stickySet =
      this.stickyHeaderIndices !== undefined
        ? new Set(this.stickyHeaderIndices)
        : undefined;

    this.resolvedContentContainerStyle = this.isHorizontal
      ? [this.contentContainerStyle, { width: m.total }]
      : this.contentContainerStyle;
    this.resolvedStyle = flattenStyle([
      anchorHostStyle(this.elementRef),
      this.isInverted
        ? [this.style, this.isHorizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE]
        : this.style,
    ]);
    this.cellStyle = this.isInverted
      ? this.isHorizontal
        ? INVERTED_X_STYLE
        : INVERTED_Y_STYLE
      : undefined;
    this.resolvedMaintainVisibleContentPosition =
      this.maintainVisibleContentPosition === undefined
        ? undefined
        : {
            ...this.maintainVisibleContentPosition,
            minIndexForVisible:
              this.maintainVisibleContentPosition.minIndexForVisible +
              (hasHeader ? 1 : 0),
          };

    // A change in anything a cell's content reads other than its own item invalidates every cached
    // context: identity reuse is only sound while the reused object still describes the cell.
    const epoch: unknown[] = [
      this.data,
      this.extraData,
      this.getItem,
      this.keyExtractor,
    ];
    const previousEpoch = this.cellContextEpoch;
    this.cellContextEpoch = epoch;
    if (
      previousEpoch === undefined ||
      previousEpoch.length !== epoch.length ||
      !previousEpoch.every((value, index) => value === epoch[index])
    ) {
      this.cellContexts.clear();
    }

    if (m.count === FIRST_INDEX) {
      this.cellContexts.clear();
      this.nextCellContexts.clear();
      this.windowCells = [];
      this.forcedStickyCell = null;
      this.leadingSpacerStyle = null;
      this.gapSpacerStyle = null;
      this.trailingSpacerStyle = null;
      this.renderedStickyIndices = undefined;
      dlog(
        `Angular VirtualizedList empty (viewport=${this.listState.viewportLength})`,
      );
      return;
    }

    const plan = buildListPlan({
      count: m.count,
      first: m.first,
      last: m.last,
      offsets: m.offsets,
      lengths: m.lengths,
      total: m.total,
      keyFor: this.keyFor,
      stickyIndices: stickySet,
      hasHeader,
    });
    this.leadingSpacerStyle =
      plan.leadingExtent > EMPTY_OFFSET
        ? this.spacerStyle(plan.leadingExtent)
        : null;
    this.gapSpacerStyle =
      plan.gapExtent > EMPTY_OFFSET ? this.spacerStyle(plan.gapExtent) : null;
    this.trailingSpacerStyle =
      plan.trailingExtent > EMPTY_OFFSET
        ? this.spacerStyle(plan.trailingExtent)
        : null;
    this.renderedStickyIndices =
      stickySet !== undefined && plan.stickyChildPositions.length > 0
        ? plan.stickyChildPositions
        : undefined;
    dlog(
      `STICKY[list] stickySet=${stickySet === undefined ? 'undefined' : JSON.stringify([...stickySet])} ` +
        `childPositions=${JSON.stringify(plan.stickyChildPositions)} ` +
        `forcedStickyCell=${plan.forcedStickyCell === undefined ? 'none' : plan.forcedStickyCell.index} ` +
        `window=[${m.first},${m.last}] hasHeader=${this.headerDir !== undefined}`,
    );

    this.forcedStickyCell =
      plan.forcedStickyCell !== undefined
        ? this.buildWindowCell(
            plan.forcedStickyCell.index,
            plan.forcedStickyCell.key,
            false,
          )
        : null;

    const cells: IWindowCell<ItemT>[] = [];
    for (const planned of plan.cells) {
      // RN gates the separator on the last index of the DATA, not of the WINDOW
      // (VirtualizedList.js:793 `const end = getItemCount(data) - 1`), and now that the separator
      // lives INSIDE the measuring wrapper that distinction is load-bearing: gating on the window
      // would make a cell's own measured height change as the window slides past it. Device-measured
      // 2026-08-19 as a run of cells all shifting by exactly the divider's 1px.
      const includeSeparator = hasSeparators && planned.index < m.count - 1;
      cells.push(
        this.buildWindowCell(planned.index, planned.key, includeSeparator),
      );
    }
    this.windowCells = cells;
    // Swap, don't prune: a cell that left the window is simply absent from the pass that just ran,
    // so the old map is the garbage and the new one is exactly the live set.
    this.cellContexts = this.nextCellContexts;
    this.nextCellContexts = new Map<string, IVListItemContext<ItemT>>();

    dlog(
      `Angular VirtualizedList window [${m.first}, ${m.last}] of ${m.count} ` +
        `(offset=${this.listState.scrollOffset}, viewport=${this.listState.viewportLength}, rendered=${cells.length})`,
    );
  }

  // Assembles one cell (window or forced-sticky) — the context, measure closure, and optional
  // separator context — so both plan.cells and plan.forcedStickyCell build identically.
  private buildWindowCell(
    index: number,
    key: string,
    includeSeparator: boolean,
  ): IWindowCell<ItemT> {
    const item = this.getItem(this.data, index);
    return {
      key,
      index,
      context: this.contextFor(key, index, item),
      measure: this.cellMeasure(index),
      separatorContext: includeSeparator
        ? this.buildSeparatorContext(index, item)
        : undefined,
    };
  }

  // The context for one cell, reused by identity when the cell did not move. See cellContexts.
  private contextFor(
    key: string,
    index: number,
    item: ItemT,
  ): IVListItemContext<ItemT> {
    const cached = this.cellContexts.get(key);
    if (
      cached !== undefined &&
      cached.$implicit === item &&
      cached.index === index
    ) {
      this.nextCellContexts.set(key, cached);
      return cached;
    }
    const context: IVListItemContext<ItemT> = {
      $implicit: item,
      index,
      separators: this.makeSeparators(index),
    };
    this.nextCellContexts.set(key, context);
    return context;
  }

  private buildSeparatorContext(
    index: number,
    item: ItemT,
  ): IVListSeparatorContext<ItemT> {
    const overrides = this.separatorOverrides.get(index);
    const highlighted = overrides?.highlighted ?? false;
    const context: IVListSeparatorContext<ItemT> = {
      $implicit: highlighted,
      highlighted,
      leadingItem: item,
      trailingItem: this.getItem(this.data, index + 1),
    };
    // Fold any custom updateProps keys through the context's index signature (RN lets a row drive
    // arbitrary separator props); the typed fields above stay authoritative.
    if (overrides !== undefined) {
      for (const key of Object.keys(overrides)) {
        if (
          key === 'highlighted' ||
          key === 'leadingItem' ||
          key === 'trailingItem'
        )
          continue;
        context[key] = overrides[key];
      }
    }
    return context;
  }

  private spacerStyle(extent: number): IViewStyle {
    return this.isHorizontal ? { width: extent } : { height: extent };
  }

  private cellMeasure(index: number): (event: ISymbioteEvent) => void {
    const existing = this.cellMeasures.get(index);
    if (existing !== undefined) return existing;
    const measure = (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, this.isHorizontal);
      if (length === undefined) return;
      const offset = readLayoutOffset(event, this.isHorizontal);
      dlog(
        `Angular VirtualizedList cell ${index} measured length=${length} offset=${offset ?? 'none'}`,
      );
      // The reducer guards a fixed getItemLayout and a repeated length; a no-op leaves state and the
      // view untouched (dispatch marks for check only when something changed).
      this.dispatch({ kind: 'measure', index, length, offset });
    };
    this.cellMeasures.set(index, measure);
    return measure;
  }

  // Per-cell onLayout rides the engine's structural (layout) event channel — Angular forbids an
  // [onLayout] property binding (NG8002). $event arrives untyped, narrowed before reaching measure.
  handleCellLayout(
    measure: (event: ISymbioteEvent) => void,
    event: unknown,
  ): void {
    if (this.isSymbioteEvent(event)) measure(event);
  }

  private isSymbioteEvent(value: unknown): value is ISymbioteEvent {
    return (
      typeof value === 'object' && value !== null && 'nativeEvent' in value
    );
  }

  private mergeSeparator(
    gapIndex: number,
    patch: Partial<ISeparatorProps<unknown>>,
  ): void {
    const count = this.listState.metrics.count;
    if (!isSeparatorGapInRange(gapIndex, count)) return;
    this.separatorOverrides.set(gapIndex, {
      ...this.separatorOverrides.get(gapIndex),
      ...patch,
    });
    this.cdr.markForCheck();
  }

  private makeSeparators(index: number): ISeparators {
    return {
      highlight: (): void => {
        dlog(`Angular VirtualizedList separator highlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: true });
        this.mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`Angular VirtualizedList separator unhighlight cell=${index}`);
        this.mergeSeparator(index - 1, { highlighted: false });
        this.mergeSeparator(index, { highlighted: false });
      },
      updateProps: (
        select: 'leading' | 'trailing',
        newProps: Record<string, unknown>,
      ): void => {
        this.mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    };
  }

  // ---- imperative handle (the shared IVirtualizedListHandle surface) ----
  // Each scroll resolves to an offset (or a scroll-to-index failure) inside the reducer, then rides
  // the scroll-to effect through scrollToPixel.

  scrollToOffset(params: { offset: number; animated?: boolean }): void {
    this.dispatch({
      kind: 'scroll-to-offset',
      offset: params.offset,
      animated: params.animated ?? true,
    });
  }

  scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    this.dispatch({
      kind: 'scroll-to-index',
      index: params.index,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
      viewOffset: params.viewOffset ?? EMPTY_OFFSET,
    });
  }

  scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    this.dispatch({
      kind: 'scroll-to-item',
      item: params.item,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
    });
  }

  scrollToEnd(params?: { animated?: boolean }): void {
    this.dispatch({
      kind: 'scroll-to-end',
      animated: params?.animated ?? true,
    });
  }

  flashScrollIndicators(): void {
    this.scrollView?.flashScrollIndicators();
  }

  getNativeScrollRef(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollableNode(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollResponder(): IScrollViewHandle | null {
    return this.scrollView ?? null;
  }

  getScrollNode(): ISymbioteNode | null {
    return this.scrollView?.getScrollNode() ?? null;
  }

  recordInteraction(): void {
    this.dispatch({ kind: 'record-interaction' });
  }

  private scrollToPixel(offset: number, animated: boolean): void {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const target = this.isHorizontal
      ? { x: clamped, y: EMPTY_OFFSET }
      : { x: EMPTY_OFFSET, y: clamped };
    if (this.scrollView !== undefined) {
      dlog(
        `Angular VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${this.isHorizontal})`,
      );
      this.scrollView.scrollTo({ x: target.x, y: target.y, animated });
      return;
    }
    dlog(`Angular VirtualizedList scrollTo offset=${clamped} pending-ref`);
    this.commandedOffset = target;
    this.cdr.markForCheck();
  }
}
