// ScrollView, the Angular lifecycle half. The Fabric tree is nested: a scroll view wraps a
// content view holding the children (RN's ScrollView.js shape). The platform-invariant math
// (decelerationRate, per-axis intrinsics, content-size dedupe, imperative handle, native sticky
// scroll-attach, aria/role fold) lives in @symbiote-native/components, shared with React/Vue.
// Angular supplies only the lifecycle: the host node held by IDENTITY through a directive's
// ElementRef, a forwarded-prop bag set via Renderer2 (-> routeProp), and the native sticky attach
// wired through whenCommitted.
//
// RefreshControl integration diverges per platform (.ios/.android, Metro filename-selected): iOS
// renders it as a SIBLING before the content container; Android WRAPS the scroll view in an
// AndroidSwipeRefreshLayout.
//
// Angular cannot transform <ng-content> children the way React children.map / Vue slots() can, so
// ScrollView owns a projection bridge: the content host registers a ScrollViewProjectionController
// with the Angular renderer, which wraps projected children whose indices match
// stickyHeaderIndices. Android RefreshControl projection re-renders the projected component as the
// wrapper around the scroll view (RN's Android shape), excluding it from the content slot.

import {
  Directive,
  computed,
  signal,
  ElementRef,
  EventEmitter,
  Output,
  ViewChild,
  ContentChild,
  inject,
  type AfterContentChecked,
  type AfterViewInit,
  type DoCheck,
  type OnChanges,
  type OnDestroy,
} from '@angular/core';
import {
  attachStickyScroll,
  buildScrollViewHandle,
  didContentSizeChange,
  forwardScrollEvent,
  readLayoutDimension,
  resolveAccessibilityProps,
  resolveDecelerationRate,
  resolveScrollForwarding,
  selectScrollIntrinsics,
  splitLayoutProps,
  type IAccessibilityProps,
  type IAccessibilityStateValue,
  type IAriaProps,
  type IContentSize,
  type IScrollViewHandle,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  resolveClassName,
  whenCommitted,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { anchorHostStyle, SymbioteHostPropsDirective } from '../../primitives';
import { RefreshControl } from '../refresh-control';
import { ScrollViewProjectionController } from './projection';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;
type IContentSizeHandler = (width: number, height: number) => void;

// The inputs every platform ScrollView accepts, listed on each concrete @Component (the adapter
// convention, mirroring Switch/Animated) so the base fields bind consistently. The aria-* /
// role aliases ride here too and are folded by resolveAccessibilityProps before reaching native.
export const SCROLL_VIEW_INPUTS = [
  'style',
  'contentContainerStyle',
  'horizontal',
  'scrollEnabled',
  'showsVerticalScrollIndicator',
  'showsHorizontalScrollIndicator',
  'pagingEnabled',
  'bounces',
  'decelerationRate',
  'scrollEventThrottle',
  'contentInset',
  'contentOffset',
  'removeClippedSubviews',
  'snapToInterval',
  'snapToOffsets',
  'snapToAlignment',
  'snapToStart',
  'snapToEnd',
  'disableIntervalMomentum',
  'stickyHeaderIndices',
  'invertStickyHeaders',
  'StickyHeaderComponent',
  'keyboardDismissMode',
  'keyboardShouldPersistTaps',
  'maintainVisibleContentPosition',
  'alwaysBounceHorizontal',
  'alwaysBounceVertical',
  'centerContent',
  'scrollIndicatorInsets',
  'indicatorStyle',
  'directionalLockEnabled',
  'automaticallyAdjustKeyboardInsets',
  'contentInsetAdjustmentBehavior',
  'minimumZoomScale',
  'maximumZoomScale',
  'zoomScale',
  'bouncesZoom',
  'pinchGestureEnabled',
  'nestedScrollEnabled',
  'overScrollMode',
  'fadingEdgeLength',
  'persistentScrollbar',
  'endFillColor',
  'onScroll',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'testID',
  'nativeID',
  'accessible',
  'accessibilityLabel',
  'accessibilityHint',
  'accessibilityRole',
  'accessibilityState',
  'accessibilityValue',
  'accessibilityActions',
  'accessibilityLabelledBy',
  'importantForAccessibility',
  'accessibilityLiveRegion',
  'screenReaderFocusable',
  'accessibilityViewIsModal',
  'accessibilityElementsHidden',
  'accessibilityIgnoresInvertColors',
  'accessibilityLanguage',
  'accessibilityRespondsToUserInteraction',
  'accessibilityShowsLargeContentViewer',
  'accessibilityLargeContentTitle',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-live',
  'aria-hidden',
  'aria-busy',
  'aria-checked',
  'aria-disabled',
  'aria-expanded',
  'aria-selected',
  'aria-modal',
  'aria-valuemax',
  'aria-valuemin',
  'aria-valuenow',
  'aria-valuetext',
];

// The Angular-facing prop surface: React's IScrollViewProps minus the React-coupled fields
// (ReactNode children, ReactElement refreshControl) — Angular takes children via <ng-content> and
// composes RefreshControl through projection instead. Declared per-adapter over the shared
// accessibility base since a framework element/ref field can't live in a shared agnostic type.
export interface IAngularScrollViewProps
  extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // A bare string resolves through the shared style registry, like `class` on the host node.
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
  horizontal?: boolean;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  pagingEnabled?: boolean;
  bounces?: boolean;
  decelerationRate?: 'normal' | 'fast' | number;
  scrollEventThrottle?: number;
  contentInset?: {
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
  contentOffset?: { x: number; y: number };
  removeClippedSubviews?: boolean;
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // Sticky headers: RN implements stickiness PURELY IN JS (ScrollView.js wraps each flagged child
  // in ScrollViewStickyHeader, driven by the scroll offset). The native scroll view does NOT honor
  // an index array. See the header note on the Angular projection boundary for the auto-wrap.
  stickyHeaderIndices?: number[];
  invertStickyHeaders?: boolean;
  // Angular auto projection is renderer-node based, so this input is intentionally explicit-
  // composition only: custom sticky wrappers must be written in the template; auto stickyHeaderIndices
  // uses the built-in wrapper to stay AOT-safe.
  StickyHeaderComponent?: unknown;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props (harmless on Android: its manager ignores unknown props).
  alwaysBounceHorizontal?: boolean;
  alwaysBounceVertical?: boolean;
  centerContent?: boolean;
  scrollIndicatorInsets?: {
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
  };
  indicatorStyle?: 'default' | 'black' | 'white';
  directionalLockEnabled?: boolean;
  automaticallyAdjustKeyboardInsets?: boolean;
  contentInsetAdjustmentBehavior?:
    'automatic' | 'scrollableAxes' | 'never' | 'always';
  minimumZoomScale?: number;
  maximumZoomScale?: number;
  zoomScale?: number;
  bouncesZoom?: boolean;
  pinchGestureEnabled?: boolean;
  // Android-only forwarding props (harmless on iOS).
  nestedScrollEnabled?: boolean;
  overScrollMode?: 'auto' | 'always' | 'never';
  fadingEdgeLength?: number;
  persistentScrollbar?: boolean;
  endFillColor?: string;
  onLayout?: IScrollHandler;
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  // iOS-only: user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: IScrollHandler;
  // Synthesized in JS from the content view's onLayout (RN _handleContentOnLayout); deduped.
  onContentSizeChange?: IContentSizeHandler;
  onAccessibilityAction?: (event: ISymbioteEvent) => void;
  onAccessibilityTap?: (event: ISymbioteEvent) => void;
  onMagicTap?: (event: ISymbioteEvent) => void;
  onAccessibilityEscape?: (event: ISymbioteEvent) => void;
}

// What ScrollView itself takes as plain @Input()s: the full surface minus the layout/content-size/
// accessibility events it exposes as real @Output() EventEmitters instead (see ScrollViewBase below).
// onScroll and the drag/momentum family stay callback @Input()s permanently — they must also accept
// an Animated.event(...) native-driver marker, which no @Output() binding can carry.
export type IAngularScrollViewInputs = Omit<
  IAngularScrollViewProps,
  | 'onLayout'
  | 'onScrollToTop'
  | 'onContentSizeChange'
  | 'onAccessibilityAction'
  | 'onAccessibilityTap'
  | 'onMagicTap'
  | 'onAccessibilityEscape'
>;

// Strip undefined entries so a prop the user never set is not forwarded to the host (an undefined
// reaching Fabric is at best a no-op, at worst clears a default). The Angular twin of React/Vue
// destructuring `...rest` past the defined props.
function compact(bag: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(bag)) {
    if (bag[key] !== undefined) result[key] = bag[key];
  }
  return result;
}

// ScrollView's forwarded surface (scroll events + the snap/keyboard/zoom families) is exactly the
// flat-bag shape SymbioteHostPropsDirective spreads onto a host element via Renderer2 (-> routeProp).
// The scroll-event callbacks ride this bag (not the (event) channel) because routeProp must be free
// to wire onScroll as an Animated.event when sticky headers drive the value natively, which the
// listen()/setEventListener channel cannot carry. This mirrors React/Vue putting onScroll on
// outerProps.
@Directive({
  selector: '[symbioteScrollViewProjection]',
  standalone: true,
  inputs: ['symbioteScrollViewProjection'],
})
export class ScrollViewProjectionDirective {
  private readonly elementRef = inject<ElementRef<unknown>>(ElementRef);

  set symbioteScrollViewProjection(controller: ScrollViewProjectionController) {
    const node = this.elementRef.nativeElement;
    if (isSymbioteNode(node)) controller.bindContentNode(node);
  }
}

// @Directive() (no selector) is the Angular-sanctioned decorator for an abstract base that
// declares lifecycle hooks and @ViewChild queries (mirrors AnimatedComponentBase) — without it
// ngtsc rejects the inherited hooks/queries (NG2007). The concrete platform @Components add ONLY a
// decorator + their platform template; all behavior lives here.
@Directive()
export abstract class ScrollViewBase
  implements
    IAngularScrollViewInputs,
    AfterContentChecked,
    AfterViewInit,
    DoCheck,
    OnChanges,
    OnDestroy
{
  style: IStyleProp<IViewStyle> | undefined;
  contentContainerStyle: IStyleProp<IViewStyle> | string | undefined;
  horizontal: boolean | undefined;
  scrollEnabled: boolean | undefined;
  showsVerticalScrollIndicator: boolean | undefined;
  showsHorizontalScrollIndicator: boolean | undefined;
  pagingEnabled: boolean | undefined;
  bounces: boolean | undefined;
  decelerationRate: 'normal' | 'fast' | number | undefined;
  scrollEventThrottle: number | undefined;
  contentInset: IAngularScrollViewProps['contentInset'];
  contentOffset: IAngularScrollViewProps['contentOffset'];
  removeClippedSubviews: boolean | undefined;
  snapToInterval: number | undefined;
  snapToOffsets: number[] | undefined;
  snapToAlignment: IAngularScrollViewProps['snapToAlignment'];
  snapToStart: boolean | undefined;
  snapToEnd: boolean | undefined;
  disableIntervalMomentum: boolean | undefined;
  stickyHeaderIndices: number[] | undefined;
  invertStickyHeaders: boolean | undefined;
  StickyHeaderComponent: unknown;
  keyboardDismissMode: IAngularScrollViewProps['keyboardDismissMode'];
  keyboardShouldPersistTaps: IAngularScrollViewProps['keyboardShouldPersistTaps'];
  maintainVisibleContentPosition: IAngularScrollViewProps['maintainVisibleContentPosition'];
  alwaysBounceHorizontal: boolean | undefined;
  alwaysBounceVertical: boolean | undefined;
  centerContent: boolean | undefined;
  scrollIndicatorInsets: IAngularScrollViewProps['scrollIndicatorInsets'];
  indicatorStyle: IAngularScrollViewProps['indicatorStyle'];
  directionalLockEnabled: boolean | undefined;
  automaticallyAdjustKeyboardInsets: boolean | undefined;
  contentInsetAdjustmentBehavior: IAngularScrollViewProps['contentInsetAdjustmentBehavior'];
  minimumZoomScale: number | undefined;
  maximumZoomScale: number | undefined;
  zoomScale: number | undefined;
  bouncesZoom: boolean | undefined;
  pinchGestureEnabled: boolean | undefined;
  nestedScrollEnabled: boolean | undefined;
  overScrollMode: IAngularScrollViewProps['overScrollMode'];
  fadingEdgeLength: number | undefined;
  persistentScrollbar: boolean | undefined;
  endFillColor: string | undefined;
  onScroll: IScrollHandler | undefined;
  onScrollBeginDrag: IScrollHandler | undefined;
  onScrollEndDrag: IScrollHandler | undefined;
  onMomentumScrollBegin: IScrollHandler | undefined;
  onMomentumScrollEnd: IScrollHandler | undefined;

  // The layout/content-size/accessibility events as real Angular events: `(layout)="…"`, not
  // `[onLayout]="…"`. onScroll and the drag/momentum family stay plain @Input() callbacks above —
  // they must also accept an Animated.event(...) native-driver marker (see the file header note),
  // which no @Output() binding can carry.
  @Output() readonly layout = new EventEmitter<ISymbioteEvent>();
  @Output() readonly scrollToTop = new EventEmitter<ISymbioteEvent>();
  @Output() readonly contentSizeChange = new EventEmitter<IContentSize>();
  @Output() readonly accessibilityAction = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly magicTap = new EventEmitter<ISymbioteEvent>();
  @Output() readonly accessibilityEscape = new EventEmitter<ISymbioteEvent>();

  testID: string | undefined;
  nativeID: string | undefined;
  accessible: boolean | undefined;
  accessibilityLabel: string | undefined;
  accessibilityHint: string | undefined;
  accessibilityRole: IAccessibilityProps['accessibilityRole'];
  accessibilityState: IAccessibilityStateValue | undefined;
  accessibilityValue: IAccessibilityProps['accessibilityValue'];
  accessibilityActions: IAccessibilityProps['accessibilityActions'];
  accessibilityLabelledBy: string | string[] | undefined;
  importantForAccessibility: IAccessibilityProps['importantForAccessibility'];
  accessibilityLiveRegion: IAccessibilityProps['accessibilityLiveRegion'];
  screenReaderFocusable: boolean | undefined;
  accessibilityViewIsModal: boolean | undefined;
  accessibilityElementsHidden: boolean | undefined;
  accessibilityIgnoresInvertColors: boolean | undefined;
  accessibilityLanguage: string | undefined;
  accessibilityRespondsToUserInteraction: boolean | undefined;
  accessibilityShowsLargeContentViewer: boolean | undefined;
  accessibilityLargeContentTitle: string | undefined;
  role: IAriaProps['role'];
  'aria-label': string | undefined;
  'aria-labelledby': string | undefined;
  'aria-live': IAriaProps['aria-live'];
  'aria-hidden': boolean | undefined;
  'aria-busy': boolean | undefined;
  'aria-checked': boolean | 'mixed' | undefined;
  'aria-disabled': boolean | undefined;
  'aria-expanded': boolean | undefined;
  'aria-selected': boolean | undefined;
  'aria-modal': boolean | undefined;
  'aria-valuemax': number | undefined;
  'aria-valuemin': number | undefined;
  'aria-valuenow': number | undefined;
  'aria-valuetext': string | undefined;

  // The host directive on the scroll-view intrinsic; `.node` is the committed SymbioteNode held by
  // IDENTITY (Renderer2.createElement returned the engine node, ElementRef hands it back unwrapped).
  // Inherited by the decorated subclass — Angular collects base-class @ViewChild queries.
  @ViewChild('host', { read: SymbioteHostPropsDirective })
  private hostDirective?: SymbioteHostPropsDirective;

  @ContentChild(RefreshControl)
  protected projectedRefreshControl?: RefreshControl;

  // This component's OWN anchor host — where a `class="..."` at the use site resolves (see
  // anchorHostStyle's doc comment) — NOT `#host` in the platform templates, which targets the real
  // inner scroll-view primitive one level down. Injected in the BASE because both platform
  // subclasses merged the identical anchor style into their `scrollProps` override.
  private readonly elementRef = inject<ElementRef<unknown>>(ElementRef);

  // The anchor's class-derived style is written by the RENDERER (addClass/removeClass ->
  // commitClassStyle), never through an @Input, so `inputsRevision` cannot cover it and a bag
  // memoized on plain reads of it would keep a stale class forever. It gets its own signal, polled
  // in ngDoCheck below: that hook runs on exactly the checks that could have changed it (Angular
  // applies the parent's class bindings before flushing this directive's pre-order hooks), which is
  // the same cadence the old `scrollProps` getter was re-read at.
  protected readonly anchorStyle = signal<unknown>(undefined);

  // A single AnimatedValue tracks the scroll offset and drives every sticky header's translateY
  // (RN's _scrollAnimatedValue). A stable field (allocated once, held by identity — Angular does
  // not proxy class fields, so no markRaw needed); the native attach below feeds it on the UI
  // thread. Allocated unconditionally; inert until a sticky header consumes it.
  protected readonly scrollAnimatedValue = new AnimatedValue(0);

  // The last-seen content size, used to dedupe onContentSizeChange: RN fires the content onLayout
  // on every layout pass; only real size changes emit (didContentSizeChange).
  private lastContentSize: IContentSize | null = null;
  // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN _handleLayout).
  private viewportHeight: number | undefined = undefined;
  // What the projection controller was last told about the projected RefreshControl, so
  // ngAfterContentChecked can tell a real content change from an ordinary check.
  private lastHasProjectedRefreshControl = false;

  protected readonly projectionController = new ScrollViewProjectionController({
    stickyHeaderIndices: undefined,
    invertStickyHeaders: undefined,
    scrollViewHeight: undefined,
    scrollAnimatedValue: this.scrollAnimatedValue,
    customStickyHeaderComponent: undefined,
    excludeRefreshControl: false,
  });

  // Native sticky-scroll attach (RN attachNativeEvent): when the native module is available the
  // scroll value is driven on the UI thread so the interpolations ride scroll natively (no JS
  // jitter). Through whenCommitted because under Angular's zoneless batched CD the host's Fabric
  // tag does not exist yet at ngAfterViewInit time (the async-commit gotcha Vue documents); the
  // bind runs now if committed, else after the commit that assigns the tag. Detached on destroy.
  private detachStickyScroll: (() => void) | undefined;
  private cancelStickyBind: (() => void) | undefined;
  // What the current attach was made for, so a re-run that changes nothing stays a no-op.
  private stickyAttachedEnabled = false;
  private stickyAttachedNode: ISymbioteNode | null = null;

  private lastLoggedIsHorizontal: boolean | undefined = undefined;

  // Stable reference (bound once): inverted sticky headers need the viewport height captured off
  // the scroll-view's own onLayout before forwarding to the user (RN _handleLayout). A getter that
  // built this arrow function fresh on every `scrollProps` access would hand `[symbioteHostProps]`
  // a new function reference every change-detection pass touching this component — jsonEqual
  // (commit.ts) falls back to Object.is on a function leaf, so even a structurally-identical bag
  // reads as "props changed" and forces a real Fabric re-clone that cascades up every ancestor
  // (see AnimatedComponentBase.reconcile()'s identical warning).
  private readonly handleInvertedStickyLayout = (
    event: ISymbioteEvent,
  ): void => {
    const height = readLayoutDimension(event, 'height');
    // The projection controller is pushed from here rather than picked up on the next prop-bag
    // read: viewportHeight is internal mutable state, so once `scrollProps` became a memoized
    // computed nothing would re-read it. Guarded on a real change - an onLayout that reports the
    // same height must not cost a sticky reconcile walk.
    if (height !== undefined && height !== this.viewportHeight) {
      this.viewportHeight = height;
      this.updateProjectionController();
    }
    this.layout.emit(event);
  };

  // Same reasoning as handleInvertedStickyLayout: the content view's onLayout synthesizes
  // onContentSizeChange (deduped) and must stay a stable reference across `contentProps` re-reads.
  private readonly handleContentLayout = (event: ISymbioteEvent): void => {
    const width = readLayoutDimension(event, 'width');
    const height = readLayoutDimension(event, 'height');
    if (width === undefined || height === undefined) return;
    if (!didContentSizeChange(this.lastContentSize, { width, height })) return;
    this.lastContentSize = { width, height };
    dlog(`Angular ScrollView contentSizeChange ${width}x${height}`);
    this.contentSizeChange.emit({ width, height });
  };

  // Memoizes the wrapper each `emitterCallback` builds, keyed by the emitter it closes over.
  // Without this, `scrollProps`/`refreshControlProps` would hand a fresh closure to the forwarded
  // prop bag on every evaluation — the same jsonEqual/Object.is function-leaf problem as the arrow
  // fields above. `.observed` is checked BEFORE the cache so an unbound event still resolves to
  // `undefined` rather than a stale wrapper from before the last unsubscribe.
  private readonly emitterCallbackCache = new WeakMap<
    EventEmitter<ISymbioteEvent>,
    IScrollHandler
  >();

  // The sticky JS-path Animated.event handler depends on a REAL input (onScroll), so it can't be a
  // plain stable field the way handleInvertedStickyLayout/handleContentLayout are — it must track
  // `this.onScroll` genuinely changing, mirroring sticky-header.ts's own rebuildInterpolation cache
  // (rebuild only when the tracked dependency's reference actually differs, not on every getter
  // read). A fresh `animatedEvent(...)` call every `scrollProps` access would otherwise construct a
  // new listener wrapper (and a new AnimatedEvent walking `collectMappedValues`) on every unrelated
  // change-detection pass while sticky headers are active.
  private cachedStickyOnScrollSource: IScrollHandler | undefined;
  private cachedStickyOnScrollHandler:
    ((...args: readonly unknown[]) => void) | undefined;

  get isHorizontal(): boolean {
    const value = this.horizontal === true;
    if (value !== this.lastLoggedIsHorizontal) {
      this.lastLoggedIsHorizontal = value;
      dlog(
        `Angular ScrollView isHorizontal changed to ${value} (horizontal input=${this.horizontal})`,
      );
    }
    return value;
  }

  private get hasStickyHeaders(): boolean {
    return (
      this.stickyHeaderIndices !== undefined &&
      this.stickyHeaderIndices.length > 0
    );
  }

  // A class-name string resolves through the shared registry before it reaches
  // selectScrollIntrinsics, which only understands style objects/arrays.
  private get resolvedContentContainerStyle():
    IStyleProp<IViewStyle> | undefined {
    return typeof this.contentContainerStyle === 'string'
      ? resolveClassName(this.contentContainerStyle)
      : this.contentContainerStyle;
  }

  private get scrollViewBaseStyle(): IViewStyle {
    return selectScrollIntrinsics(
      this.isHorizontal,
      this.resolvedContentContainerStyle,
    ).scrollViewBaseStyle;
  }

  // Bridges non-reactive @Input fields into the reactive graph, so a computed() can memoize a
  // bag derived from them. Signal inputs would make this unnecessary, but `input()` is visible
  // only to the AOT compiler and this package's unit suite runs on JIT - see the
  // `angular-adapter-change-detection` skill, §6. `signal()`/`computed()` themselves are plain
  // runtime APIs and need no compiler support, which is what makes this bridge possible at all.
  //
  // ONLY safe for a bag whose every dependency is an @Input. A bag that also reads internal
  // mutable state (viewportHeight, lastContentSize, the anchor's class-derived style) would go
  // stale, because nothing bumps this for those - make that state its own signal (see
  // `anchorStyle`) instead of widening this one.
  private readonly inputsRevision = signal(0);

  // The forwarded host-prop bag for the scroll-view node: aria/role folded, the native pass-through
  // families, the scroll-event callbacks, then the lifecycle-managed overrides (nestedScrollEnabled
  // default ON, horizontal when defined, decelerationRate resolved per-platform, the sticky onScroll
  // path). Base style UNDER user style so an explicit user value still wins. Mirrors Vue's outerProps
  // + scrollProps assembly.
  //
  // MEASURED 2026-08-16: as a getter this rebuilt the whole bag on every refresh of this view, so
  // the `symbioteHostProps` reference check failed every time and every key was re-pushed through
  // the renderer - once per scroll frame per host binding (2 before `contentProps` was memoized,
  // 1 after, 0 now; the pin lives in prop-bag-stability.test.ts).
  //
  // It is a `computed` on the BASE and no longer overridable: a subclass getter cannot override a
  // field. The platform subclasses used to override it with byte-identical bodies (merge the
  // anchor's class-derived style ahead of the resolved style), so that merge moved down here
  // rather than into a `decorateScrollProps` hook both of them would implement the same way.
  readonly scrollProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    const bag: Record<string, unknown> = compact({
      ...resolveAccessibilityProps(this.accessibilityInputs()),
      scrollEnabled: this.scrollEnabled,
      showsVerticalScrollIndicator: this.showsVerticalScrollIndicator,
      showsHorizontalScrollIndicator: this.showsHorizontalScrollIndicator,
      pagingEnabled: this.pagingEnabled,
      bounces: this.bounces,
      contentInset: this.contentInset,
      contentOffset: this.contentOffset,
      removeClippedSubviews: this.removeClippedSubviews,
      snapToInterval: this.snapToInterval,
      snapToOffsets: this.snapToOffsets,
      snapToAlignment: this.snapToAlignment,
      snapToStart: this.snapToStart,
      snapToEnd: this.snapToEnd,
      disableIntervalMomentum: this.disableIntervalMomentum,
      keyboardDismissMode: this.keyboardDismissMode,
      keyboardShouldPersistTaps: this.keyboardShouldPersistTaps,
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      alwaysBounceHorizontal: this.alwaysBounceHorizontal,
      alwaysBounceVertical: this.alwaysBounceVertical,
      centerContent: this.centerContent,
      scrollIndicatorInsets: this.scrollIndicatorInsets,
      indicatorStyle: this.indicatorStyle,
      directionalLockEnabled: this.directionalLockEnabled,
      automaticallyAdjustKeyboardInsets: this.automaticallyAdjustKeyboardInsets,
      contentInsetAdjustmentBehavior: this.contentInsetAdjustmentBehavior,
      minimumZoomScale: this.minimumZoomScale,
      maximumZoomScale: this.maximumZoomScale,
      zoomScale: this.zoomScale,
      bouncesZoom: this.bouncesZoom,
      pinchGestureEnabled: this.pinchGestureEnabled,
      overScrollMode: this.overScrollMode,
      fadingEdgeLength: this.fadingEdgeLength,
      persistentScrollbar: this.persistentScrollbar,
      endFillColor: this.endFillColor,
      onScrollBeginDrag: this.onScrollBeginDrag,
      onScrollEndDrag: this.onScrollEndDrag,
      onMomentumScrollBegin: this.onMomentumScrollBegin,
      onMomentumScrollEnd: this.onMomentumScrollEnd,
      onScrollToTop: this.emitterCallback(this.scrollToTop),
      onAccessibilityAction: this.emitterCallback(this.accessibilityAction),
      onAccessibilityTap: this.emitterCallback(this.accessibilityTap),
      onMagicTap: this.emitterCallback(this.magicTap),
      onAccessibilityEscape: this.emitterCallback(this.accessibilityEscape),
    });

    // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`); Android needs
    // it to scroll a nested scrollable independently, iOS handles nesting natively (a no-op there).
    bag.nestedScrollEnabled = this.nestedScrollEnabled ?? true;
    // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated manager ignores it.
    if (this.horizontal !== undefined) bag.horizontal = this.horizontal;
    if (this.decelerationRate !== undefined) {
      bag.decelerationRate = resolveDecelerationRate(this.decelerationRate);
    }

    // onScroll: when sticky headers are active, the offset must reach the AnimatedValue (RN
    // _scrollAnimatedValueAttachment). With the native module, the post-commit attach below drives
    // it on the UI thread (throttle 1, ScrollView.js:1798); without it, Animated.event drives the
    // value each frame (JS jitter). The DECISIONS (which path, throttle defaults, whether to
    // capture viewport height) are folded out to the shared resolveScrollForwarding; Angular only
    // EXECUTES them, keeping stable-reference handlers so a fresh closure never forces a re-clone.
    const nativeStickyAvailable =
      this.hasStickyHeaders && isNativeAnimatedAvailable();
    const forwarding = resolveScrollForwarding({
      hasStickyHeaders: this.hasStickyHeaders,
      nativeStickyAvailable,
      invertStickyHeaders: this.invertStickyHeaders,
      scrollEventThrottle: this.scrollEventThrottle,
      maintainVisibleContentPosition: this.maintainVisibleContentPosition,
      snapToAlignment: this.snapToAlignment,
    });
    // onScroll: the JS-fallback path uses the cached Animated.event handler; the native + plain paths
    // forward the user handler as-is (the native driver attaches the value on the UI thread).
    if (forwarding.mode === 'sticky-js') {
      bag.onScroll = this.stickyOnScrollHandler(this.onScroll);
    } else if (this.onScroll !== undefined) {
      bag.onScroll = this.onScroll;
    }
    if (forwarding.scrollEventThrottle !== undefined) {
      bag.scrollEventThrottle = forwarding.scrollEventThrottle;
    }
    // Inverted sticky headers need the viewport height (RN _handleLayout): capture it on the
    // scroll-view onLayout, then call the user's handler. Otherwise forward the layout emitter.
    if (forwarding.capturesViewportHeight) {
      bag.onLayout = this.handleInvertedStickyLayout;
    } else {
      const layoutCallback = this.emitterCallback(this.layout);
      if (layoutCallback !== undefined) bag.onLayout = layoutCallback;
    }

    // Thunks, not strings: an eagerly built message would be paid with logging off (see dlog's own
    // comment). Less often than it used to fire now that this bag is memoized, but the recompute
    // still rides every real input change.
    dlog(
      () =>
        `Angular ScrollView -> ${this.isHorizontal ? 'horizontal' : 'vertical'} (sticky=${this.hasStickyHeaders})`,
    );
    dlog(
      () =>
        `STICKY[sv] forwarding mode=${forwarding.mode} throttle=${forwarding.scrollEventThrottle} ` +
        `nativeStickyAvailable=${nativeStickyAvailable} onScrollBound=${bag.onScroll !== undefined}`,
    );

    // The anchor's class-derived style goes FIRST: flattenStyle's later-wins collapse keeps an
    // explicit [style] winning over the ambient class. Flat rather than the nested
    // `[anchor, [base, style]]` the platform overrides used to build - flattenStyle folds nested
    // arrays in the same order, so the resolved value is unchanged.
    bag.style = [this.anchorStyle(), this.scrollViewBaseStyle, this.style];
    return bag;
  });

  // Overridable hook, NOT `this.style` directly: `splitLayoutProps` below decides which layout
  // properties (flex/height/gap/…) go on the Android outer refresh-control wrapper vs. the inner
  // scroll view. `this.style` alone only carries the explicit `[style]` @Input — a composed
  // component's own anchor host can hold ADDITIONAL class-derived layout style invisible to this
  // split, so the wrapper collapses to zero size on real Android devices. Angular's Android
  // ScrollView (index.android.ts) overrides this to merge in `anchorHostStyle` (mirrors Vue's
  // identical `layoutSplitStyle` field and the device bug it fixes).
  protected get layoutSplitStyle(): IStyleProp<IViewStyle> {
    return this.style;
  }

  // Memoizable for the same reasons `scrollProps` is: `layoutSplitStyle` resolves to @Input `style`
  // plus (on Android) the `anchorStyle` signal, both covered. The anchor style is deliberately NOT
  // re-merged into `props.style` here - `splitLayoutProps` already routed its layout half to the
  // outer refresh-control wrapper and left the rest in `inner`.
  readonly androidWrappedScrollProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    const props = { ...this.scrollProps() };
    const { inner, outer } = splitLayoutProps(this.layoutSplitStyle);
    dlog(
      () =>
        `Angular ScrollView splitProbe layoutSplitStyle=${JSON.stringify(this.layoutSplitStyle)} ` +
        `outer=${JSON.stringify(outer)} inner=${JSON.stringify(inner)}`,
    );
    props.style = [this.scrollViewBaseStyle, inner];
    props.nestedScrollEnabled = true;
    return props;
  });

  // Deliberately still GETTERS, unlike every other bag on this class. Their whole content comes
  // from the PROJECTED RefreshControl's own @Input()s (refreshing, tintColor, colors, …), which
  // Angular routes through THAT component's ngOnChanges - `inputsRevision` here never moves for
  // them. Memoizing on it would freeze `refreshing` at its first value and strand the native
  // spinner forever, which is exactly the silent-staleness class this file avoids elsewhere.
  // Making them memoizable means giving RefreshControl its own revision signal to read here.
  get iosRefreshControlProps(): Record<string, unknown> {
    return this.refreshControlProps();
  }

  get androidRefreshControlProps(): Record<string, unknown> {
    const { outer } = splitLayoutProps(this.layoutSplitStyle);
    dlog(
      () =>
        `Angular ScrollView refreshControlProbe outer=${JSON.stringify(outer)} ` +
        `hasRefresh=${this.projectedRefreshControl !== undefined}`,
    );
    return this.refreshControlProps(outer);
  }

  protected handleProjectedRefresh(nativeNode: unknown): void {
    this.projectedRefreshControl?.handleRefresh(nativeNode);
  }

  private refreshControlProps(
    style?: IStyleProp<IViewStyle>,
  ): Record<string, unknown> {
    const refresh = this.projectedRefreshControl;
    if (refresh === undefined) return {};
    return compact({
      ...refresh.folded,
      refreshing: refresh.refreshing,
      tintColor: refresh.tintColor,
      title: refresh.title,
      titleColor: refresh.titleColor,
      progressViewOffset: refresh.progressViewOffset,
      colors: refresh.colors,
      progressBackgroundColor: refresh.progressBackgroundColor,
      size: refresh.size,
      enabled: refresh.enabled,
      style,
      testID: refresh.testID,
      nativeID: refresh.nativeID,
      accessible: refresh.accessible,
      onAccessibilityAction: this.emitterCallback(refresh.accessibilityAction),
      onAccessibilityTap: this.emitterCallback(refresh.accessibilityTap),
      onMagicTap: this.emitterCallback(refresh.magicTap),
      onAccessibilityEscape: this.emitterCallback(refresh.accessibilityEscape),
    });
  }

  get hasProjectedRefreshControl(): boolean {
    return this.projectedRefreshControl !== undefined;
  }

  // The content (inner) view's prop bag. `collapsable: false` keeps the layout-only content view a
  // real native view (Android Fabric view-flattens it away otherwise, hoisting cells as direct
  // children of a scroll view that hosts exactly one — an addViewAt crash). collapsableChildren
  // false preserves the cell views maintainVisibleContentPosition/snapToAlignment anchor against.
  // onLayout synthesizes onContentSizeChange (deduped). iOS never flattens; both are no-ops there.
  readonly contentProps = computed<Record<string, unknown>>(() => {
    this.inputsRevision();
    const { contentStyle } = selectScrollIntrinsics(
      this.isHorizontal,
      this.resolvedContentContainerStyle,
    );
    const bag: Record<string, unknown> = {
      style: contentStyle,
      collapsable: false,
    };
    if (
      this.maintainVisibleContentPosition !== undefined ||
      this.snapToAlignment !== undefined
    ) {
      bag.collapsableChildren = false;
    }
    bag.onLayout = this.handleContentLayout;
    return bag;
  });

  // Wraps an @Output() as a plain callback only while it has a subscriber, so an unbound event
  // still leaves the forwarded prop bag key absent — the same "undefined means nobody cares"
  // contract the old @Input() callbacks had. Mirrors Pressable's emitterHandler. The wrapper itself
  // is memoized per emitter (emitterCallbackCache) rather than rebuilt on every call: see that
  // field's comment for why an unstable closure here breaks the forwarded prop bag.
  //
  // `.observed` is NOT reactive, and `scrollProps` memoizes over it. That is sound because Angular
  // subscribes a template's (event) listeners in its CREATION pass, before any input is written and
  // before this component's own view is first refreshed - so `observed` is already settled at the
  // first evaluation and cannot flip afterwards without destroying the whole component.
  private emitterCallback(
    emitter: EventEmitter<ISymbioteEvent>,
  ): IScrollHandler | undefined {
    if (!emitter.observed) return undefined;
    let cached = this.emitterCallbackCache.get(emitter);
    if (cached === undefined) {
      cached = (event: ISymbioteEvent) => emitter.emit(event);
      this.emitterCallbackCache.set(emitter, cached);
    }
    return cached;
  }

  // Rebuilds the JS-path Animated.event handler only when the tracked `onScroll` input actually
  // changes reference (see cachedStickyOnScrollHandler's comment).
  private stickyOnScrollHandler(
    userOnScroll: IScrollHandler | undefined,
  ): (...args: readonly unknown[]) => void {
    if (
      this.cachedStickyOnScrollHandler === undefined ||
      this.cachedStickyOnScrollSource !== userOnScroll
    ) {
      this.cachedStickyOnScrollSource = userOnScroll;
      this.cachedStickyOnScrollHandler = animatedEvent(
        [{ nativeEvent: { contentOffset: { y: this.scrollAnimatedValue } } }],
        userOnScroll === undefined
          ? undefined
          : {
              listener: (...args: readonly unknown[]) =>
                forwardScrollEvent(userOnScroll, args),
            },
      );
    }
    return this.cachedStickyOnScrollHandler;
  }

  // The committed scroll-view node held by IDENTITY (the directive's ElementRef). null until the
  // element commits; the imperative handle and the sticky attach both read it through this getter.
  private get hostNode(): ISymbioteNode | null {
    const native = this.hostDirective?.node;
    return isSymbioteNode(native) ? native : null;
  }

  // The imperative API a parent reaches via @ViewChild(ScrollView). buildScrollViewHandle is the
  // shared, proven handle (React/Vue use it verbatim); it reads the node through the LAZY getter on
  // every call, so a command before commit no-ops rather than freezing a null node.
  private readonly handle: IScrollViewHandle = buildScrollViewHandle(
    () => this.hostNode,
  );

  scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    this.handle.scrollTo(options);
  }

  scrollToEnd(options?: { animated?: boolean }): void {
    this.handle.scrollToEnd(options);
  }

  flashScrollIndicators(): void {
    this.handle.flashScrollIndicators();
  }

  getScrollNode(): ISymbioteNode | null {
    return this.handle.getScrollNode();
  }

  ngAfterViewInit(): void {
    dlog('STICKY[sv] ngAfterViewInit');
    // Runs once the template has bound the content node, so this is the reconcile that actually
    // wraps the sticky children (the ngOnChanges one above fires before the content node exists).
    this.updateProjectionController();
    this.attachSticky();
  }

  // Re-read the anchor's class-derived style. It is written by the renderer's addClass/removeClass,
  // never through an @Input, so this poll is the only thing that can invalidate a bag holding it -
  // ngOnChanges alone would strand a class toggled after mount (covered by
  // scroll-view-class-style.test.ts's toggle case, which goes red the moment this hook stops
  // polling). ngDoCheck is the right hook, not a near-enough one: render3's `callHooks` flushes a
  // node's pre-order hooks at the next `ɵɵadvance` PAST it, which is after the parent wrote this
  // element's `ɵɵclassProp` and before this component's own view refreshes. It also runs under
  // `setActiveConsumer(null)`, so the write registers no dependency on the caller's view and cannot
  // throw NG0600. And `commitClassStyle` allocates a fresh style array only when a class token
  // actually moved, so `signal.set`'s own Object.is check makes an unchanged poll dirty nothing.
  ngDoCheck(): void {
    this.anchorStyle.set(anchorHostStyle(this.elementRef));
    // The attach can want a node that does not exist yet, and nothing else would ask again.
    // ngOnChanges covers "indices arrived late"; it does NOT cover "indices arrived late AND the host
    // node had not committed yet", which is exactly what a VirtualizedList does - it derives
    // stickyHeaderIndices from the measured window, so they land after this component's
    // ngAfterViewInit and before its host node resolves. Device-diagnosed 2026-08-18 on
    // examples/angular BenchmarkScreen STICKY PATH B, whose log ends on `attachSticky NOT attaching
    // (wantsAttach=true hasNode=false)` - sticky never turned on, while PATH A (literal indices in
    // the template) worked because ngAfterViewInit already saw a node. Retried ONLY from that stuck
    // state, so a settled ScrollView pays nothing per check. Device-verified the same day.
    // Not covered headless: sticky-native-attach.test.ts's late-indices case has its node resolved by
    // the time the indices land, and the deferred-creation ordering under `@if` never rendered the
    // ScrollView at all.
    if (this.stickyAttachedEnabled && this.stickyAttachedNode === null)
      this.attachSticky();
  }

  // The projected RefreshControl is a @ContentChild, not an @Input, so ngOnChanges never fires when
  // one is added or removed at the use site - and `excludeRefreshControl` decides whether the
  // projection walk pulls it out of the scroll content. Angular resolves the query before this
  // hook. Guarded on the flag itself so a check that changed nothing skips the reconcile walk,
  // which the old getter-driven update could not do.
  ngAfterContentChecked(): void {
    if (this.hasProjectedRefreshControl === this.lastHasProjectedRefreshControl)
      return;
    this.lastHasProjectedRefreshControl = this.hasProjectedRefreshControl;
    this.updateProjectionController();
  }

  // `stickyHeaderIndices` is an ordinary @Input, so it can arrive AFTER the first change-detection
  // pass - any app deriving it from data rather than writing a literal in the template does exactly
  // that. ngAfterViewInit runs once, so without this the native attach below would be skipped on
  // that first pass and never retried: the wrapper still projects (that half self-heals), the
  // header sits at the right place with the right z-index, and simply never moves. Device-reported
  // 2026-08-16, regression-covered in sticky-native-attach.test.ts. The other three adapters never
  // had this hole because they re-run the attach from a reactive effect keyed on the same
  // condition (Svelte's `$effect` in index.svelte, React's useEffect deps, Vue's watcher).
  ngOnChanges(): void {
    dlog('STICKY[sv] ngOnChanges');
    // Every computed() prop bag below reads plain @Input fields, which are NOT reactive on their
    // own - this bump is what tells them an input changed. It must stay in ngOnChanges: that is
    // the single moment Angular has finished writing every changed input for this pass.
    this.inputsRevision.update(revision => revision + 1);
    // stickyHeaderIndices / invertStickyHeaders / StickyHeaderComponent are @Inputs, so this is
    // where the projection controller learns about them. It used to be a side effect of reading
    // the `scrollProps` getter - which a memoized computed no longer performs per pass.
    this.updateProjectionController();
    this.attachSticky();
  }

  // Wire the native sticky-scroll attach once the view exists AND sticky is actually on. Re-runs
  // on every input change, so it must be idempotent: see the guard below.
  private attachSticky(): void {
    const wantsAttach = this.hasStickyHeaders && isNativeAnimatedAvailable();
    const node = wantsAttach ? this.hostNode : null;
    dlog(
      () =>
        `STICKY[sv] attachSticky indices=${JSON.stringify(this.stickyHeaderIndices)} ` +
        `hasSticky=${this.hasStickyHeaders} nativeAvailable=${isNativeAnimatedAvailable()} ` +
        `wantsAttach=${wantsAttach} hasNode=${node !== null} ` +
        `wasEnabled=${this.stickyAttachedEnabled} nodeChanged=${node !== this.stickyAttachedNode}`,
    );
    // Nothing that decides the attach has changed - return rather than detach and rebind the
    // native scroll event, which every unrelated @Input change would otherwise churn now that
    // ngOnChanges drives this too.
    if (
      wantsAttach === this.stickyAttachedEnabled &&
      node === this.stickyAttachedNode
    ) {
      dlog(
        'STICKY[sv] attachSticky skipped (nothing about the attach changed)',
      );
      return;
    }

    this.cancelStickyBind?.();
    this.cancelStickyBind = undefined;
    if (this.detachStickyScroll !== undefined) {
      this.detachStickyScroll();
      this.detachStickyScroll = undefined;
    }
    // Recorded even when the node is not resolved yet, so the NEXT call (which will see a real
    // node) reads as a change and attaches.
    this.stickyAttachedEnabled = wantsAttach;
    this.stickyAttachedNode = node;
    if (!wantsAttach || node === null) {
      dlog(
        `STICKY[sv] attachSticky NOT attaching (wantsAttach=${wantsAttach} hasNode=${node !== null})`,
      );
      return;
    }
    dlog(
      'STICKY[sv] attachSticky waiting for commit to bind the native scroll event',
    );
    this.cancelStickyBind = whenCommitted(node, () => {
      dlog('STICKY[sv] attachSticky node committed -> attachStickyScroll');
      this.detachStickyScroll = attachStickyScroll(
        node,
        this.scrollAnimatedValue,
      );
    });
  }

  ngOnDestroy(): void {
    this.cancelStickyBind?.();
    this.cancelStickyBind = undefined;
    if (this.detachStickyScroll !== undefined) this.detachStickyScroll();
  }

  private updateProjectionController(): void {
    this.projectionController.update({
      stickyHeaderIndices: this.stickyHeaderIndices,
      invertStickyHeaders: this.invertStickyHeaders,
      scrollViewHeight: this.viewportHeight,
      scrollAnimatedValue: this.scrollAnimatedValue,
      customStickyHeaderComponent: this.StickyHeaderComponent,
      excludeRefreshControl: this.hasProjectedRefreshControl,
    });
  }

  // Typed as the a11y intersection WITH the string index so resolveAccessibilityProps's result
  // stays assignable into the forwarded bag (a genuine narrowing, built at that type — no cast).
  private accessibilityInputs(): IAccessibilityProps &
    IAriaProps &
    Record<string, unknown> {
    return {
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
      'aria-label': this['aria-label'],
      'aria-labelledby': this['aria-labelledby'],
      'aria-live': this['aria-live'],
      'aria-hidden': this['aria-hidden'],
      'aria-busy': this['aria-busy'],
      'aria-checked': this['aria-checked'],
      'aria-disabled': this['aria-disabled'],
      'aria-expanded': this['aria-expanded'],
      'aria-selected': this['aria-selected'],
      'aria-modal': this['aria-modal'],
      'aria-valuemax': this['aria-valuemax'],
      'aria-valuemin': this['aria-valuemin'],
      'aria-valuenow': this['aria-valuenow'],
      'aria-valuetext': this['aria-valuetext'],
    };
  }
}
