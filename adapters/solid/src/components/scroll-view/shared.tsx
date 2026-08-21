// ScrollView — the Solid lifecycle half. The Fabric tree is nested: a scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Everything platform- and
// framework-invariant already exists in @symbiote-native/components and is CALLED, never re-derived:
// `selectScrollIntrinsics` (per-axis tags + base styles), `resolveDecelerationRate`,
// `resolveScrollForwarding` (which onScroll path, the 1/16 throttle defaults, the inverted viewport
// capture, collapsableChildren), `didContentSizeChange`, `buildScrollViewHandle`,
// `splitLayoutProps`, `attachStickyScroll`, `forwardScrollEvent`, `resolveAccessibilityProps`.
// Solid supplies signals, effects and the element assembly.
//
// THREE THINGS ARE SOLID-SPECIFIC AND NONE OF THEM IS COSMETIC.
//
// 1. There is no reconciler between what this file returns and the host nodes. React diffs fibers,
//    Vue diffs vnodes, Svelte patches in place; Solid's `insert` REPLACES. So the tree is built ONCE
//    and every prop rides a `spread` render effect on the SAME node — the identity
//    dispatchViewCommand, the commit mirror and native-owned scroll offset all key on. The only
//    rebuild is when the host TAG itself has to change (see `treeShape` below).
// 2. A JSX element prop is a GETTER that CREATES the element on read, so `refreshControl` is read
//    exactly once. A second read would build a second refresh-control node.
// 3. The commit is microtask-coalesced (`requestCommit`), so at mount time the scroll node has no
//    Fabric tag. Anything native wired then — here, the sticky scroll attach — goes through
//    `whenCommitted` or it silently no-ops with no retry. The imperative handle is safe without it
//    for a different reason: `buildScrollViewHandle` takes a LAZY node getter and every command
//    re-reads it, so a handle handed out at setup keeps working once the node commits.
//
// NOTHING here destructures `props`. Solid props are getters and a component body runs ONCE;
// `splitProps` is the idiomatic split that keeps the rest reactive, and every read below sits inside
// an accessor, a memo, or an event handler.

import {
  children,
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  on,
  onCleanup,
  splitProps,
  untrack,
  type Ref,
} from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  attachStickyScroll,
  buildScrollViewHandle,
  didContentSizeChange,
  forwardScrollEvent,
  nextStickyHeaderY,
  readLayoutDimension,
  resolveAccessibilityProps,
  resolveDecelerationRate,
  resolveScrollForwarding,
  selectScrollIntrinsics,
  splitLayoutProps,
  type IAccessibilityProps,
  type IAriaProps,
  type IContentSize,
  type IScrollViewHandle,
  type ISymbioteIntrinsic,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  resolveClassName,
  whenCommitted,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  createElement,
  insert,
  insertNode,
  setProp,
  spread,
} from '../../renderer';
import { withStableKeys } from '../../utils/stable-keys';
import {
  wrapStickyHeaders,
  type IStickyHeaderComponentType,
} from './sticky-header';

export type { IScrollViewHandle } from '@symbiote-native/components';
export type {
  IStickyHeaderComponentType,
  IStickyHeaderComponentProps,
} from './sticky-header';

type IScrollHandler = (event: ISymbioteEvent) => void;

// How the .ios / .android files differ, and it is the ONLY difference between them: on iOS the
// RefreshControl (PullToRefreshView) is a childless SIBLING of the content container, both inside
// the scroll view; on Android it (AndroidSwipeRefreshLayout) WRAPS the scroll view, because an
// Android ScrollView hosts exactly one child ("addViewAt: failed to insert view … at index 1").
// Same neutral shape the Svelte adapter's scroll-view-platform-types.ts carries.
export type IScrollViewHostPlatform = {
  refreshControlMode: 'sibling' | 'wrap';
};

// Declared here, never imported from @symbiote-native/components and never from another adapter:
// `children`, `refreshControl`, `StickyHeaderComponent` and `ref` are all framework values, which is
// exactly the test <prop_types_split_agnostic_vs_per_adapter> applies — the agnostic FIELD BASE
// (IAccessibilityProps / IAriaProps, IStyleProp, ISymbioteEvent) is shared, the framework-flavoured
// fields are per-adapter. React's, Vue's and Svelte's IScrollViewProps are separate declarations for
// the same reason.
export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  // testID / nativeID are inherited from IAccessibilityProps (the shared host-anchor base).
  style?: IStyleProp<IViewStyle>;
  // Solid's spelling for a registered class name, matching View / Text / Pressable (React's is
  // `className`). Resolved through the shared style registry by routeProp's class+style merge.
  class?: IClassNameValue;
  // A bare STRING resolves through the same registry — not the full IClassNameValue union, because
  // IStyleProp is itself an object/array and that would be ambiguous with a real style. Mirrors
  // React's and Vue's own contentContainerStyle typing.
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
  // A rendered <RefreshControl> element. Read ONCE (see the module header): in Solid this prop is a
  // getter that builds the element, and the element is already a live engine node by the time this
  // component sees it — which is why the Android wrap nests imperatively rather than through
  // React's cloneElement or Vue's VNode re-invocation.
  refreshControl?: JSX.Element;
  removeClippedSubviews?: boolean;
  // Fired when the content container's size changes. RN synthesizes this in JS from an onLayout on
  // the inner content view; the native scroll view has no such event of its own. (width, height) in
  // points, deduped so only real size changes reach the caller.
  onContentSizeChange?: (width: number, height: number) => void;
  // Snap / paging family: forwarded straight to the native scroll view, which reads them directly.
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // RN implements stickiness PURELY IN JS — the native scroll view ignores this array, so it is
  // CONSUMED here (the flagged children get wrapped) and never forwarded, which would be a silent
  // no-op on native.
  stickyHeaderIndices?: number[];
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders), used by inverted lists.
  invertStickyHeaders?: boolean;
  // Override the wrapper component for sticky headers, e.g. a SectionList header. Defaults to the
  // built-in ScrollViewStickyHeader.
  StickyHeaderComponent?: IStickyHeaderComponentType;
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  // iOS-only forwarding props; harmless on Android (its manager ignores unknown props).
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
  // Android-only forwarding props; harmless on iOS.
  nestedScrollEnabled?: boolean;
  overScrollMode?: 'auto' | 'always' | 'never';
  fadingEdgeLength?: number;
  persistentScrollbar?: boolean;
  endFillColor?: string;
  // The scroll view's OWN frame layout (RN _handleLayout). Inverted sticky headers need the
  // viewport height off it; also an ordinary ScrollView prop.
  onLayout?: IScrollHandler;
  onScroll?: IScrollHandler;
  onScrollBeginDrag?: IScrollHandler;
  onScrollEndDrag?: IScrollHandler;
  onMomentumScrollBegin?: IScrollHandler;
  onMomentumScrollEnd?: IScrollHandler;
  // iOS-only: the user tapped the status bar to scroll to top. Inert on Android.
  onScrollToTop?: IScrollHandler;
  // The imperative handle (scrollTo / scrollToEnd / flashScrollIndicators / getScrollNode), NOT the
  // host node — the same thing React exposes through forwardRef+useImperativeHandle and Vue through
  // expose(). Solid's compiler turns `ref={scroller}` on a component into a callback prop, so a
  // plain variable at the call site receives the handle.
  ref?: Ref<IScrollViewHandle>;
  children?: JSX.Element;
}

// Consumed by the lifecycle itself; everything else forwards onto the scroll-view host node.
// onContentSizeChange is synthesized from the content view's onLayout and must never reach Fabric —
// a function prop crashes Android's folly::dynamic serializer. Same for the sticky props, which
// native ignores, and `refreshControl`, which is an element.
const HANDLED_PROPS = [
  'style',
  'class',
  'contentContainerStyle',
  'horizontal',
  'decelerationRate',
  'refreshControl',
  'stickyHeaderIndices',
  'invertStickyHeaders',
  'StickyHeaderComponent',
  'onContentSizeChange',
  'onLayout',
  'onScroll',
  'scrollEventThrottle',
  'children',
  'ref',
] as const;

// `maintainVisibleContentPosition`, `snapToAlignment` and `nestedScrollEnabled` are deliberately NOT
// in that list: the lifecycle READS them (for resolveScrollForwarding and RN's nested-scroll
// default) while native also needs them, so they forward through `rest` untouched.

function hostElement(tag: ISymbioteIntrinsic): ISymbioteNode {
  const node = createElement(tag);
  // Narrowing, not defensive: the renderer types createElement over its IHostNode union (which
  // includes the surface), while everything below needs a real host node.
  if (!isSymbioteNode(node))
    throw new Error(`ScrollView: ${tag} did not create a host node`);
  return node;
}

export function createScrollView(
  platform: IScrollViewHostPlatform,
): (props: IScrollViewProps) => JSX.Element {
  return function ScrollView(props: IScrollViewProps): JSX.Element {
    const [local, rest] = splitProps(props, HANDLED_PROPS);

    // The scroll-view host node, held by IDENTITY in a plain variable. A store or any proxy wrapper
    // would become a different key than the one the engine's commit mirror holds, and every
    // imperative command would silently no-op (symbiote-engine-core §3).
    let scrollNode: ISymbioteNode | null = null;
    // A LAZY getter, not the node captured once: it is null until buildTree runs, and null again
    // under it if the tree is ever rebuilt.
    const handle = buildScrollViewHandle(() => scrollNode);

    // Read ONCE and untracked — see the module header, point 2. Nothing reactive is lost: a
    // RefreshControl's live state is `refreshing`, which is a prop of the element itself.
    const refreshControlElement = untrack(() => local.refreshControl);
    const refreshControlNode = isSymbioteNode(refreshControlElement)
      ? refreshControlElement
      : undefined;
    const isWrappingRefreshControl =
      platform.refreshControlMode === 'wrap' &&
      refreshControlNode !== undefined;

    // Drives every sticky header's translateY (RN's _scrollAnimatedValue). Allocated
    // unconditionally, exactly like React's unconditional hook, and held by identity.
    const scrollAnimatedValue = new AnimatedValue(0);
    // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN
    // _handleLayout). Captured off the scroll view's own onLayout.
    const [viewportHeight, setViewportHeight] = createSignal<
      number | undefined
    >(undefined);
    // Sticky-header cross-talk (RN's _headerLayoutYs): a child-index -> measured-y map so each
    // header learns where the NEXT one starts — its push-off collision point. Mutated imperatively
    // from each header's onLayout; the version bump is what lets the PREVIOUS header re-read it.
    const headerLayoutYs = new Map<number, number>();
    const [headerLayoutVersion, setHeaderLayoutVersion] = createSignal(0);
    // RN fires the content onLayout on every layout pass; only a real size change emits.
    let lastContentSize: IContentSize | null = null;

    const isHorizontal = (): boolean => local.horizontal === true;
    const stickyHeaderIndices = createMemo(() => local.stickyHeaderIndices);
    const hasStickyHeaders = (): boolean => {
      const indices = stickyHeaderIndices();
      return indices !== undefined && indices.length > 0;
    };
    const nativeStickyAvailable = (): boolean =>
      hasStickyHeaders() && isNativeAnimatedAvailable();

    // A class-name string resolves through the shared registry before it reaches the intrinsic
    // selector, which only understands style objects/arrays.
    const resolvedContentContainerStyle = ():
      IStyleProp<IViewStyle> | undefined => {
      const style = local.contentContainerStyle;
      return typeof style === 'string' ? resolveClassName(style) : style;
    };
    const intrinsics = createMemo(() =>
      selectScrollIntrinsics(isHorizontal(), resolvedContentContainerStyle()),
    );

    // `class` is normally forwarded raw and resolved per-node at commit time, but the Android
    // RefreshControl wrap has to splitLayoutProps() BEFORE that, so a class-only layout prop
    // (flex, height, gap, …) would otherwise never reach the wrapper and it would collapse to
    // nothing.
    const layoutSplitStyle = (): IStyleProp<IViewStyle> => [
      resolveClassName(local.class),
      local.style,
    ];
    const splitStyles = createMemo(() => splitLayoutProps(layoutSplitStyle()));

    const forwarding = createMemo(() =>
      resolveScrollForwarding({
        hasStickyHeaders: hasStickyHeaders(),
        nativeStickyAvailable: nativeStickyAvailable(),
        invertStickyHeaders: local.invertStickyHeaders,
        scrollEventThrottle: local.scrollEventThrottle,
        maintainVisibleContentPosition: props.maintainVisibleContentPosition,
        snapToAlignment: props.snapToAlignment,
      }),
    );

    // onScroll: the JS-fallback path wraps the user's handler in Animated.event so the offset drives
    // the AnimatedValue each frame (RN's _scrollAnimatedValueAttachment); the native and plain paths
    // forward it as-is, because the native driver attaches the value on the UI thread instead.
    const scrollHandler = createMemo((): unknown => {
      const userOnScroll = local.onScroll;
      if (forwarding().mode !== 'sticky-js') return userOnScroll;
      return animatedEvent(
        [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
        userOnScroll === undefined
          ? undefined
          : {
              listener: (...args: unknown[]): void =>
                forwardScrollEvent(userOnScroll, args),
            },
      );
    });

    // onLayout on the scroll-view node: capture the viewport height for inverted sticky headers
    // (RN _handleLayout), then call the user's handler. Passed through unchanged otherwise, so a
    // ScrollView with neither never raises the onLayout flag prop and native never measures it.
    const scrollLayoutHandler = createMemo((): IScrollHandler | undefined => {
      const userOnLayout = local.onLayout;
      if (!forwarding().capturesViewportHeight) return userOnLayout;
      return (event: ISymbioteEvent): void => {
        const height = readLayoutDimension(event, 'height');
        if (height !== undefined) setViewportHeight(height);
        userOnLayout?.(event);
      };
    });

    const handleContentLayout = (event: ISymbioteEvent): void => {
      const width = readLayoutDimension(event, 'width');
      const height = readLayoutDimension(event, 'height');
      if (width === undefined || height === undefined) return;
      if (!didContentSizeChange(lastContentSize, { width, height })) return;
      lastContentSize = { width, height };
      dlog(`Solid ScrollView contentSizeChange ${width}x${height}`);
      local.onContentSizeChange?.(width, height);
    };

    const onHeaderLayoutY = (index: number, y: number): void => {
      if (headerLayoutYs.get(index) === y) return;
      headerLayoutYs.set(index, y);
      dlog(`Solid ScrollView sticky-header layoutY index=${index} y=${y}`);
      setHeaderLayoutVersion(tick => tick + 1);
    };
    const readNextHeaderLayoutY = (
      indexOfIndex: number,
    ): number | undefined => {
      // Read the bump FIRST so this stays a dependency of whichever header calls it — that is what
      // turns "a later header measured" into "the previous header rebuilds its collision range".
      headerLayoutVersion();
      const indices = stickyHeaderIndices();
      if (indices === undefined) return undefined;
      return nextStickyHeaderY(indices, indexOfIndex, headerLayoutYs);
    };

    // withStableKeys on BOTH bags: resolveAccessibilityProps has two branches with different key
    // sets, and several keys below are conditional. Solid's `spread` walks only the CURRENT keys and
    // has no removal pass, so a vanished key would keep its last value on the native view forever
    // (.claude/rules/solid-descriptor-bridge.md §1).
    const outerBag = withStableKeys(() => {
      const bag: Record<string, unknown> = {
        ...resolveAccessibilityProps(rest),
      };
      // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`): Android needs
      // it for a scrollable nested inside another to scroll independently; iOS handles nesting
      // natively. The Android RefreshControl wrap forces it, so the inner scroll view takes the
      // gesture before the refresh parent.
      bag.nestedScrollEnabled = isWrappingRefreshControl
        ? true
        : (props.nestedScrollEnabled ?? true);
      // Load-bearing on iOS (it flips RCTScrollView's axis), ignored by Android's dedicated
      // horizontal manager — so forward it whenever it is defined.
      if (local.horizontal !== undefined) bag.horizontal = local.horizontal;
      const rate = local.decelerationRate;
      if (rate !== undefined)
        bag.decelerationRate = resolveDecelerationRate(rate);
      // Base style UNDER the user style, so an explicit height / flexDirection still wins. Under the
      // Android wrap only the VISUAL half stays here; the LAYOUT half moved to the wrapper.
      bag.style = [
        intrinsics().scrollViewBaseStyle,
        isWrappingRefreshControl ? splitStyles().inner : local.style,
      ];
      // Stripped under the wrap: layoutSplitStyle already folded the resolved class into
      // outer/inner, so forwarding it raw too would re-apply its LAYOUT half a second time.
      if (!isWrappingRefreshControl) bag.class = local.class;
      bag.onScroll = scrollHandler();
      bag.onLayout = scrollLayoutHandler();
      bag.scrollEventThrottle = forwarding().scrollEventThrottle;
      return bag;
    });

    // `collapsable: false` is load-bearing on Android: the content container is a layout-only view
    // that Fabric would otherwise flatten away, hoisting the cells up as DIRECT children of the
    // scroll view — which hosts exactly one ("addViewAt" crash). iOS never flattens.
    const contentBag = withStableKeys(() => {
      const bag: Record<string, unknown> = {
        style: intrinsics().contentStyle,
        collapsable: false,
      };
      // maintainVisibleContentPosition (and Android snapToAlignment) anchor against the metrics of
      // MOUNTED cell views, so RN keeps them un-flattened too (ScrollView.js preserveChildren).
      if (forwarding().collapsableChildren) bag.collapsableChildren = false;
      if (local.onContentSizeChange !== undefined)
        bag.onLayout = handleContentLayout;
      return bag;
    });

    function mountChildren(content: ISymbioteNode): void {
      if (!hasStickyHeaders()) {
        // The plain path hands `insert` the raw children accessor, so its own nested-effect
        // machinery keeps updates fine-grained — a <For> inside re-runs only its own insert.
        insert(content, () => local.children);
        return;
      }
      // Sticky wrapping needs an INDEXABLE list, which is what solid's `children()` helper resolves
      // to. It costs a coarser update (any child change re-runs the whole wrap), which is why it is
      // created ONLY here and not for every ScrollView — and it must not coexist with the accessor
      // above, since reading `local.children` twice would build the subtree twice.
      const resolved = children(() => local.children);
      insert(content, () =>
        wrapStickyHeaders(resolved.toArray(), {
          stickyHeaderIndices: stickyHeaderIndices() ?? [],
          scrollAnimatedValue,
          readInverted: () => local.invertStickyHeaders,
          readScrollViewHeight: viewportHeight,
          readNextHeaderLayoutY,
          StickyHeaderComponent: local.StickyHeaderComponent,
          onHeaderLayoutY,
        }),
      );
    }

    function buildTree(): ISymbioteNode {
      const { scrollViewIntrinsic, contentIntrinsic } = intrinsics();
      dlog(
        `Solid ScrollView -> ${scrollViewIntrinsic} (horizontal=${String(isHorizontal())} sticky=${String(hasStickyHeaders())})`,
      );

      const content = hostElement(contentIntrinsic);
      spread(content, contentBag, true);
      mountChildren(content);

      const scroll = hostElement(scrollViewIntrinsic);
      scrollNode = scroll;
      spread(scroll, outerBag, true);
      // iOS: the RefreshControl is a childless SIBLING placed BEFORE the content container (RN
      // ScrollView.js: {refreshControl}{contentContainer}).
      if (refreshControlNode !== undefined && !isWrappingRefreshControl) {
        insertNode(scroll, refreshControlNode);
      }
      insertNode(scroll, content);
      if (refreshControlNode === undefined || !isWrappingRefreshControl)
        return scroll;

      // Android: the RefreshControl WRAPS the scroll view. React does this with cloneElement and Vue
      // by re-invoking the VNode's type; Solid has neither, because the element arrived already
      // built — so the scroll view is nested into the existing node and the outer style is written
      // onto it. A render effect, not a one-shot set, so a later style/class change still moves.
      //
      // This OVERRIDES a `style` the app put on the RefreshControl itself, exactly as React's
      // cloneElement({style}) does. Unlike React's, the two writers are independent render effects,
      // so an app that styles BOTH boxes on Android has no defined winner — pass the ScrollView's
      // layout through `style`/`class` there and leave the control's own `style` alone.
      createRenderEffect(() => {
        setProp(refreshControlNode, 'style', splitStyles().outer);
      });
      insertNode(refreshControlNode, scroll);
      return refreshControlNode;
    }

    // The scroll AXIS picks a different host TAG (horizontal is a separate ViewManager on Android)
    // and sticky headers pick a different children pipeline. Solid cannot swap a tag under a live
    // node, so either flip REBUILDS — which is exactly what React does when an element type changes.
    // `on()` runs buildTree untracked, so every other read inside it (style, class, handlers,
    // contentContainerStyle) re-props the SAME nodes through `spread` instead of rebuilding them.
    const treeShape = createMemo(
      () => `${String(isHorizontal())}:${String(hasStickyHeaders())}`,
    );
    const tree = createMemo(on(treeShape, () => buildTree()));

    // Solid's `ref` is a COMPILE-TIME construct: by the time a component body reads `props.ref`, a
    // `ref={scroller}` call site has already been rewritten into a callback. The full rationale (and
    // why the declared type still has to be the `Ref<T>` union) is in utils/host-ref.ts, whose
    // helper is typed for a host node — this hands back the imperative handle instead.
    //
    // Called AFTER `tree` has built at least once, not right after `handle` is constructed.
    // `createAnimatedComponent`'s captureRef (resolveHostNode) reads handle.getScrollNode()
    // EAGERLY, once, at ref-call time - it never re-reads the lazy getter later. React's
    // useImperativeHandle and Vue's expose() fire only after the child's own mount work, so they
    // never saw a null handle; Solid's `ref` is called by the component itself and has to be
    // sequenced by hand. Calling it before `buildTree()` gave captureRef a permanently-null node,
    // so Animated.ScrollView's onScroll never native-attached - a scroll-linked header fade froze
    // at its initial value on this adapter only.
    if (typeof local.ref === 'function') local.ref(handle);

    // Drive the sticky scroll value on the native UI thread (RN's attachNativeEvent /
    // _updateAnimatedNodeAttachment), so the header interpolations ride scroll natively with no JS
    // jitter. `tree()` is read for its dependency: a rebuild means a NEW scroll node to attach to.
    createEffect(() => {
      tree();
      if (!nativeStickyAvailable()) return;
      const node = scrollNode;
      if (node === null) return;
      let detach: (() => void) | undefined;
      // The engine commits on a microtask, so this node has no Fabric tag yet on the first run and
      // the attach would no-op with no retry. whenCommitted is that retry.
      const cancel = whenCommitted(node, () => {
        detach = attachStickyScroll(node, scrollAnimatedValue);
      });
      onCleanup(() => {
        cancel();
        detach?.();
      });
    });

    return tree;
  };
}
