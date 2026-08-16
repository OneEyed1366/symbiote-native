// ScrollView, the Vue lifecycle half. The Fabric tree is nested: a scroll view wraps a
// content view holding the children (RN's ScrollView.js shape). Platform-invariant math
// (decelerationRate, per-axis intrinsics/base style, content-size dedupe, imperative handle,
// aria/role fold) lives in @symbiote-native/components, shared with React; Vue supplies only
// the reactivity - shallowRef host node, setup-scope lastContentSize dedupe, expose() handle -
// the twin of React's useRef + buildScrollViewHandle.
//
// Attrs are untyped, so every field is narrowed with a runtime guard, never a cast. The legacy
// onContentSizeChange callback key MUST be consumed if present: it is NOT a ViewConfig event,
// and forwarding a function prop reaches Fabric and crashes Android's folly::dynamic.
//
// Sticky headers are real: the scroll AnimatedValue, headerLayoutYs cross-talk map, viewport-
// height capture, and onScroll composition (native attach vs Animated.event) live here; the
// per-header component and children wrap live in sticky-header.ts.

import {
  defineComponent,
  h,
  isVNode,
  markRaw,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch,
  type Component,
  type VNode,
} from '@vue/runtime-core';
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
  type IAccessibilityProps,
  type IAriaProps,
  type IContentSize,
  type ISymbioteIntrinsic,
} from '@symbiote-native/components';
import {
  AnimatedValue,
  dlog,
  event as animatedEvent,
  isClassNameValue,
  isNativeAnimatedAvailable,
  isSymbioteNode,
  resolveClassName,
  type IClassNameValue,
  type IStyleProp,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { wrapStickyHeaders, type IStickyHeaderComponentType } from './sticky-header';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';

export type { IScrollViewHandle } from '@symbiote-native/components';

type IScrollHandler = (event: ISymbioteEvent) => void;

// React's ScrollViewProps is React-coupled (ReactNode children, ReactElement refreshControl);
// Vue takes children via slots, so this mirrors the same surface minus those.
export interface IScrollViewProps extends IAccessibilityProps, IAriaProps {
  style?: IStyleProp<IViewStyle>;
  // A bare string is a class name resolved through the style registry; an object/array is style
  // and passes through unchanged.
  contentContainerStyle?: IStyleProp<IViewStyle> | string;
  horizontal?: boolean;
  scrollEnabled?: boolean;
  showsVerticalScrollIndicator?: boolean;
  showsHorizontalScrollIndicator?: boolean;
  pagingEnabled?: boolean;
  bounces?: boolean;
  decelerationRate?: 'normal' | 'fast' | number;
  scrollEventThrottle?: number;
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number };
  contentOffset?: { x: number; y: number };
  // iOS renders it as a sibling before content; Android re-invokes its type to wrap the scroll view.
  refreshControl?: VNode;
  removeClippedSubviews?: boolean;
  // Resolves through the shared style registry. The Android RefreshControl wrap splits its
  // layout half onto the outer wrapper via layoutSplitStyle - see index.android.ts.
  class?: IClassNameValue;
  // Snap / paging family: forwarded straight to the native scroll view.
  snapToInterval?: number;
  snapToOffsets?: number[];
  snapToAlignment?: 'start' | 'center' | 'end';
  snapToStart?: boolean;
  snapToEnd?: boolean;
  disableIntervalMomentum?: boolean;
  // RN implements stickiness PURELY IN JS (ScrollView.js wraps each flagged child in
  // ScrollViewStickyHeader, driven by scroll offset) - the native view ignores this index array,
  // so we wrap the children here instead of forwarding it (a silent no-op on native).
  stickyHeaderIndices?: number[];
  // Stick to the BOTTOM instead of the top (RN invertStickyHeaders), used by inverted lists.
  invertStickyHeaders?: boolean;
  // Override the wrapper component for sticky headers, e.g. a SectionList header. Defaults to
  // the built-in sticky header.
  StickyHeaderComponent?: IStickyHeaderComponentType;
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
  scrollIndicatorInsets?: { top?: number; left?: number; bottom?: number; right?: number };
  indicatorStyle?: 'default' | 'black' | 'white';
  directionalLockEnabled?: boolean;
  automaticallyAdjustKeyboardInsets?: boolean;
  contentInsetAdjustmentBehavior?: 'automatic' | 'scrollableAxes' | 'never' | 'always';
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
}

export type IScrollViewEmits = {
  contentSizeChange: (width: number, height: number) => boolean;
};

// How the .ios/.android files assemble the final element. RefreshControl diverges by platform:
// iOS places it as a SIBLING before content, Android WRAPS the scroll view with it (+
// splitLayoutProps style routing). Supplied whole by scroll-view.ios.ts / .android.ts
// (Metro filename-selected).
export interface IScrollViewAssembleInput {
  scrollViewIntrinsic: ISymbioteIntrinsic;
  // outerProps + style:[base,user] + ref. iOS and the Android no-refresh path use these as-is;
  // the Android wrap rebuilds the inner view from the pieces below.
  scrollProps: Record<string, unknown>;
  content: VNode;
  // undefined when absent. iOS renders as-is before content; Android re-invokes its type to WRAP
  // the scroll view (Vue has no cloneElement) using the rebuild pieces below.
  refreshControl: VNode | undefined;
  scrollViewBaseStyle: IViewStyle;
  userStyle: IStyleProp<IViewStyle> | undefined;
  // userStyle plus the resolved `class` prop - a class-only layout prop (flex/height/gap) is
  // otherwise invisible to the Android wrap's splitLayoutProps. Only that split reads this.
  layoutSplitStyle: IStyleProp<IViewStyle>;
  // scrollProps without style/ref: the wrap re-composes the inner style + the SAME node ref onto
  // the inner scroll view, so dispatchViewCommand keeps targeting it.
  scrollOuterProps: Record<string, unknown>;
  setNodeRef: (el: unknown) => void;
}
export interface IScrollViewPlatform {
  assemble: (input: IScrollViewAssembleInput) => VNode;
}

type IUnknownHandler = (...args: readonly unknown[]) => void;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

// Objects and arrays are valid StyleProp<ViewStyle>; primitives/null degrade to undefined.
function isStyleProp(value: unknown): value is IStyleProp<IViewStyle> {
  return typeof value === 'object' && value !== null;
}

// `class` forwards raw via forwardAttrs, resolved later by the renderer's patchProp. But the
// Android RefreshControl wrap (index.android.ts) reads userStyle alone to splitLayoutProps()
// the outer wrapper BEFORE that later resolution runs, so a class-only layout prop (flex,
// height, gap, …) would otherwise never reach the wrapper.
const isClassNameProp = isClassNameValue;

function asDecelerationRate(value: unknown): 'normal' | 'fast' | number | undefined {
  if (typeof value === 'number') return value;
  if (value === 'normal' || value === 'fast') return value;
  return undefined;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'number');
}

function isComponent(value: unknown): value is Component {
  return typeof value === 'function' || (typeof value === 'object' && value !== null);
}

// Prop/handler keys the lifecycle consumes itself; everything else forwards onto the scroll-view
// node. onContentSizeChange is consumed (synthesized from the content onLayout); refreshControl
// and the sticky-header props are consumed by the platform assemble / children wrap and must
// NEVER reach Fabric.
const HANDLED_ATTRS = [
  'style',
  'contentContainerStyle',
  'horizontal',
  'decelerationRate',
  'onContentSizeChange',
  'refreshControl',
  'stickyHeaderIndices',
  'invertStickyHeaders',
  'StickyHeaderComponent',
];

// Typed as the a11y intersection (built at that type, not cast) so resolveAccessibilityProps
// can fold aria-* into accessibility* over it before it reaches the host node.
type IForwardBag = IAccessibilityProps & IAriaProps & Record<string, unknown>;

function forwardAttrs(attrs: Record<string, unknown>): IForwardBag {
  const result: IForwardBag = {};
  for (const key of Object.keys(attrs)) {
    if (!HANDLED_ATTRS.includes(key)) result[key] = attrs[key];
  }
  return result;
}

export function createScrollView(platform: IScrollViewPlatform) {
  return defineComponent<IScrollViewProps, IScrollViewEmits>(
    (_props, { slots, attrs: rawAttrs, expose, emit }) => {
      // shallowRef, NOT ref: a plain ref() would run the node through Vue's toReactive(),
      // handing back a Proxy the engine's WeakMap mirror doesn't recognize, so
      // scrollTo/scrollToEnd/flashScrollIndicators would silently no-op. Same rule as Switch.
      const nodeRef = shallowRef<ISymbioteNode | null>(null);
      const setNodeRef = (el: unknown): void => {
        nodeRef.value = isSymbioteNode(el) ? el : null;
      };

      // Lazy getter, not the node captured once: it is null until the element commits, so an
      // eager capture would freeze null. Vue twin of useImperativeHandle(ref, buildScrollViewHandle).
      expose(buildScrollViewHandle(() => nodeRef.value));

      // RN fires the content onLayout on every layout pass; only a real size change emits.
      let lastContentSize: IContentSize | null = null;

      // Drives every sticky header's translateY (RN's _scrollAnimatedValue). markRaw: an engine
      // object held by identity, never run through toReactive. Allocated unconditionally
      // (unused when no sticky headers are flagged), like React's unconditional hook.
      const scrollAnimatedValue = markRaw(new AnimatedValue(0));

      // Inverted sticky headers stick to the BOTTOM, so they need the viewport height (RN's
      // _handleLayout). Fed back into the wrapped headers on the next render.
      const viewportHeight = ref<number | undefined>(undefined);

      // Sticky-header cross-talk (RN ScrollView.js _headerLayoutYs): a child-index -> measured-y
      // map so each header learns where the NEXT sticky header starts (its push-off collision
      // point). Mutated imperatively from each header's onLayout; the bump ref forces the
      // re-render that feeds the freshly-recorded y into the previous header's nextStickyHeaderY.
      const headerLayoutYs = new Map<number, number>();
      const bumpHeaderLayout = ref(0);
      const onHeaderLayoutY = (index: number, y: number): void => {
        if (headerLayoutYs.get(index) === y) return;
        headerLayoutYs.set(index, y);
        dlog(`Vue ScrollView sticky-header layoutY index=${index} y=${y}`);
        bumpHeaderLayout.value += 1;
      };

      // Native sticky-scroll attach (RN attachNativeEvent): when the native module is available,
      // the scroll value is driven on the UI thread so interpolations ride scroll natively (no
      // JS jitter). A plain non-reactive flag set in render; the post-commit watch reads it once
      // the node commits. flush:'post' so the node has a Fabric handle before attachStickyScroll
      // reads it. Detached on unmount and re-detached if the node identity changes.
      let nativeStickyWanted = false;
      let detachStickyScroll: (() => void) | undefined;
      watch(
        () => nodeRef.value,
        node => {
          if (detachStickyScroll !== undefined) {
            detachStickyScroll();
            detachStickyScroll = undefined;
          }
          if (!nativeStickyWanted || node === null) return;
          detachStickyScroll = attachStickyScroll(node, scrollAnimatedValue);
        },
        { flush: 'post' },
      );
      onBeforeUnmount(() => {
        if (detachStickyScroll !== undefined) detachStickyScroll();
      });

      return () => {
        // Read the bump so a recorded header y re-runs render and feeds nextStickyHeaderY forward.
        void bumpHeaderLayout.value;
        // Fold kebab template props (:content-container-style) to the camelCase prop surface.
        const attrs = normalizeVueAttrs(rawAttrs);
        const isHorizontal = attrs.horizontal === true;
        const userStyle = isStyleProp(attrs.style) ? attrs.style : undefined;
        const classProp = isClassNameProp(attrs.class) ? attrs.class : undefined;
        const layoutSplitStyle: IStyleProp<IViewStyle> = [resolveClassName(classProp), userStyle];
        const contentContainerStyle =
          typeof attrs.contentContainerStyle === 'string'
            ? resolveClassName(attrs.contentContainerStyle)
            : isStyleProp(attrs.contentContainerStyle)
              ? attrs.contentContainerStyle
              : undefined;

        const stickyHeaderIndices = isNumberArray(attrs.stickyHeaderIndices)
          ? attrs.stickyHeaderIndices
          : undefined;
        const hasStickyHeaders =
          stickyHeaderIndices !== undefined && stickyHeaderIndices.length > 0;
        const invertStickyHeaders = attrs.invertStickyHeaders === true ? true : undefined;
        const stickyHeaderComponent = isComponent(attrs.StickyHeaderComponent)
          ? attrs.StickyHeaderComponent
          : undefined;

        const { scrollViewIntrinsic, contentIntrinsic, scrollViewBaseStyle, contentStyle } =
          selectScrollIntrinsics(isHorizontal, contentContainerStyle);

        // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`);
        // horizontal forwards only when defined (load-bearing on iOS's RCTScrollView axis).
        const outerProps: Record<string, unknown> = {
          ...resolveAccessibilityProps(forwardAttrs(attrs)),
        };
        outerProps.nestedScrollEnabled =
          typeof attrs.nestedScrollEnabled === 'boolean' ? attrs.nestedScrollEnabled : true;
        if (attrs.horizontal !== undefined) outerProps.horizontal = attrs.horizontal;
        const decel = asDecelerationRate(attrs.decelerationRate);
        if (decel !== undefined) outerProps.decelerationRate = resolveDecelerationRate(decel);

        // When sticky headers are active, the offset must reach the AnimatedValue (RN's
        // _scrollAnimatedValueAttachment). forwardAttrs already put the user's onScroll/onLayout/
        // scrollEventThrottle on outerProps; here we override per resolveScrollForwarding's
        // decisions (which path, throttle default, inverted capture).
        const nativeStickyAvailable = hasStickyHeaders && isNativeAnimatedAvailable();
        nativeStickyWanted = nativeStickyAvailable;
        const userThrottle =
          typeof attrs.scrollEventThrottle === 'number' ? attrs.scrollEventThrottle : undefined;
        const forwarding = resolveScrollForwarding({
          hasStickyHeaders,
          nativeStickyAvailable,
          invertStickyHeaders,
          scrollEventThrottle: userThrottle,
          maintainVisibleContentPosition: attrs.maintainVisibleContentPosition,
          snapToAlignment: attrs.snapToAlignment,
        });
        if (hasStickyHeaders) {
          const userOnScroll = isHandler(attrs.onScroll) ? attrs.onScroll : undefined;
          if (forwarding.mode === 'sticky-js') {
            // JS fallback (no native module): correct, but lags a frame under fast scroll, which
            // the native path removes on a real host.
            outerProps.onScroll = animatedEvent(
              [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
              userOnScroll === undefined
                ? undefined
                : { listener: (...args) => forwardScrollEvent(userOnScroll, args) },
            );
          }
          // Native path: the value is driven on the UI thread by the post-commit watch above, so
          // onScroll forwards untouched.
          if (forwarding.scrollEventThrottle !== undefined) {
            outerProps.scrollEventThrottle = forwarding.scrollEventThrottle;
          }
          // Capture the viewport height for inverted sticky headers (RN _handleLayout), then call
          // the user's handler.
          if (forwarding.capturesViewportHeight) {
            const userOnLayout = isHandler(attrs.onLayout) ? attrs.onLayout : undefined;
            outerProps.onLayout = (event: ISymbioteEvent): void => {
              const height = readLayoutDimension(event, 'height');
              if (height !== undefined) viewportHeight.value = height;
              if (userOnLayout !== undefined) userOnLayout(event);
            };
          }
        }

        dlog(
          `Vue ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal} sticky=${hasStickyHeaders})`,
        );

        // `collapsable: false` keeps the layout-only content view as a real native view: Android
        // Fabric view-flattens it away otherwise, hoisting the cells as direct children of the
        // scroll view (which hosts exactly one) - an addViewAt crash. iOS never flattens.
        const contentProps: Record<string, unknown> = { style: contentStyle, collapsable: false };
        if (forwarding.collapsableChildren) {
          contentProps.collapsableChildren = false;
        }
        // Synthesized from the content view's own onLayout (RN _handleContentOnLayout); emit only
        // on a real size change.
        contentProps.onLayout = (event: ISymbioteEvent): void => {
          const width = readLayoutDimension(event, 'width');
          const height = readLayoutDimension(event, 'height');
          if (width === undefined || height === undefined) return;
          if (!didContentSizeChange(lastContentSize, { width, height })) return;
          lastContentSize = { width, height };
          dlog(`Vue ScrollView contentSizeChange ${width}x${height}`);
          emit('contentSizeChange', width, height);
        };

        const slotChildren = slots.default !== undefined ? slots.default() : [];
        const contentChildren = hasStickyHeaders
          ? wrapStickyHeaders(
              slotChildren,
              stickyHeaderIndices,
              scrollAnimatedValue,
              invertStickyHeaders,
              viewportHeight.value,
              stickyHeaderComponent,
              headerLayoutYs,
              onHeaderLayoutY,
            )
          : slotChildren;

        const content = h(contentIntrinsic, contentProps, contentChildren);

        // Base style UNDER user style so an explicit user value (height, flexDirection) still wins.
        const scrollProps: Record<string, unknown> = {
          ...outerProps,
          style: [scrollViewBaseStyle, userStyle],
          ref: setNodeRef,
        };

        const refreshControl = isVNode(attrs.refreshControl) ? attrs.refreshControl : undefined;

        return platform.assemble({
          scrollViewIntrinsic,
          scrollProps,
          content,
          refreshControl,
          scrollViewBaseStyle,
          userStyle,
          layoutSplitStyle,
          scrollOuterProps: outerProps,
          setNodeRef,
        });
      };
    },
    {
      name: 'ScrollView',
      inheritAttrs: false,
      emits: {
        contentSizeChange: (_width: number, _height: number): boolean => true,
      },
    },
  );
}
