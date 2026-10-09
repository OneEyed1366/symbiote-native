// The scroll host: the tag, its props, and the engine-owned content node the list body goes into

import { createEffect, createMemo, on, onCleanup } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  attachStickyScroll,
  buildListScrollProps,
  resolveAccessibilityProps,
  selectScrollIntrinsics,
  type IListNesting,
  type ISymbioteIntrinsic,
} from '@symbiote-native/components';
import {
  dlog,
  isSymbioteNode,
  resolveClassName,
  whenCommitted,
  type IStyleProp,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';
import { createElement, insert, insertNode, spread } from '../../renderer';
import { withStableKeys } from '../../utils/stable-keys';
import type { IScrollHandlers } from './scroll-handlers';
import type { IStickyState } from './sticky-state';
import type { IListDriver } from './use-list-driver';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IScrollTreeDeps<ItemT> = {
  props: IVirtualizedListProps<ItemT>;
  accessibility: () => ReturnType<typeof resolveAccessibilityProps>;
  driver: Pick<
    IListDriver<ItemT>,
    'metrics' | 'setHostNode' | 'commandedOffset'
  >;
  sticky: IStickyState;
  handlers: IScrollHandlers;
  nesting: IListNesting<ItemT>;
  hasHeader: boolean;
  body: () => JSX.Element;
};

// A class-name string resolves through the shared registry before it reaches the intrinsic
// selector, which only understands style objects and arrays
function contentContainerStyleInput<ItemT>(
  props: IVirtualizedListProps<ItemT>,
): IStyleProp<IViewStyle> | undefined {
  const style = props.contentContainerStyle;
  return typeof style === 'string' ? resolveClassName(style) : style;
}

// `withStableKeys` because several keys are conditional and Solid's `spread` has no removal pass, a
// key that vanished would keep its last value on the native view forever
function createOuterBag<ItemT>(deps: IScrollTreeDeps<ItemT>) {
  const { props, driver, sticky, handlers } = deps;
  return withStableKeys(() => ({
    ...buildListScrollProps(
      {
        horizontal: props.horizontal === true,
        inverted: props.inverted === true,
        style: props.style,
        contentContainerStyle: contentContainerStyleInput(props),
        maintainVisibleContentPosition: props.maintainVisibleContentPosition,
        onScrollBeginDrag: handlers.onScrollBeginDrag,
        onScrollEndDrag: handlers.onScrollEndDrag,
        onMomentumScrollBegin: handlers.onMomentumScrollBegin,
        onMomentumScrollEnd: handlers.onMomentumScrollEnd,
        onContentSizeChange: handlers.onContentSizeChange,
        // The folded throttle, not the raw prop: it carries the sticky-mode default
        scrollEventThrottle: sticky.forwarding().scrollEventThrottle,
        keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
        keyboardDismissMode: props.keyboardDismissMode,
        removeClippedSubviews: props.removeClippedSubviews,
        nestedScrollEnabled: props.nestedScrollEnabled,
        stickyHeaderHiddenOnScroll: props.stickyHeaderHiddenOnScroll,
        total: driver.metrics().total,
        hasHeader: deps.hasHeader,
        commandedOffset: driver.commandedOffset(),
        onScroll: handlers.onScroll,
        onLayout: handlers.onViewportLayout,
      },
      { ...deps.accessibility(), class: props.class },
    ),
    onScroll: handlers.scrollHandler(),
  }));
}

// The list above scrolls, so RN renders a `View` with no content container
function createNestedBag<ItemT>(deps: IScrollTreeDeps<ItemT>) {
  const { props, handlers } = deps;
  return withStableKeys(() => ({
    ...deps.accessibility(),
    class: props.class,
    style: props.style,
    onLayout: handlers.onViewportLayout,
  }));
}

function buildNestedTree<ItemT>(
  deps: IScrollTreeDeps<ItemT>,
  onHost: (node: ISymbioteNode) => void,
): ISymbioteNode {
  dlog('VirtualizedList nested in a list of the same orientation -> view');
  const view = hostElement('view');
  onHost(view);
  spread(view, createNestedBag(deps), true);
  insert(view, deps.body);
  return view;
}

function hostElement(tag: ISymbioteIntrinsic): ISymbioteNode {
  const node = createElement(tag);
  // Narrowing, the renderer types `createElement` over a union that includes the surface
  if (!isSymbioteNode(node)) {
    throw new Error(`VirtualizedList: ${tag} did not create a host node`);
  }
  return node;
}

// Built once: `refreshing` is written as a CALL, so the compiler emits a getter and the controlled
// state keeps reaching this same node
function buildRefreshControl<ItemT>(
  props: IVirtualizedListProps<ItemT>,
): ISymbioteNode | undefined {
  const onRefresh = props.onRefresh;
  if (onRefresh === undefined) return undefined;
  dlog('VirtualizedList wiring RefreshControl (onRefresh provided)');
  const element = (
    <refresh-control
      refreshing={props.refreshing ?? false}
      onRefresh={onRefresh}
      progressViewOffset={props.progressViewOffset}
    />
  );
  return isSymbioteNode(element) ? element : undefined;
}

// The scroll host is wired to the ENGINE-OWNED content node, building a second one here would nest
// `RCTScrollContentView` inside the behavior's own
function buildTree<ItemT>(
  deps: IScrollTreeDeps<ItemT>,
  outerBag: ReturnType<typeof createOuterBag>,
  scrollViewIntrinsic: ISymbioteIntrinsic,
  onHost: (node: ISymbioteNode) => void,
): ISymbioteNode {
  dlog(`VirtualizedList -> ${scrollViewIntrinsic}`);
  const scroll = hostElement(scrollViewIntrinsic);
  onHost(scroll);
  spread(scroll, outerBag, true);

  const content = scroll.childHost;
  if (content === undefined) {
    throw new Error(
      `VirtualizedList: ${scrollViewIntrinsic} built no content node, ` +
        'is registerScrollViewBehavior() wired?',
    );
  }
  insert(content, deps.body);

  // An ordinary child on both platforms, the behavior's `claimedChildren` places it
  const refresh = buildRefreshControl(deps.props);
  if (refresh !== undefined) insertNode(scroll, refresh);

  // A wrap claim re-parents `scroll` under the RefreshControl, the wrapper is what occupies this
  // subtree's place once claimed
  return scroll.wrapper ?? scroll;
}

// Drives the sticky scroll value on the native UI thread, no JS per frame
// The engine commits on a microtask, so the node has no Fabric tag on the first run and
// `whenCommitted` is the retry
function attachSticky<ItemT>(
  deps: IScrollTreeDeps<ItemT>,
  tree: () => ISymbioteNode,
  hostNode: () => ISymbioteNode | null,
): void {
  createEffect(() => {
    // Read for the dependency: a rebuild means a NEW scroll node to attach to
    tree();
    if (deps.nesting.isNested || !deps.sticky.nativeStickyAvailable()) return;
    const node = hostNode();
    if (node === null) return;
    let detach: (() => void) | undefined;
    const cancel = whenCommitted(node, () => {
      detach = attachStickyScroll(node, deps.sticky.scrollAnimatedValue);
    });
    onCleanup(() => {
      cancel();
      detach?.();
    });
  });
}

export function createScrollTree<ItemT>(
  deps: IScrollTreeDeps<ItemT>,
): () => ISymbioteNode {
  const { props } = deps;
  let scrollNode: ISymbioteNode | null = null;
  const outerBag = createOuterBag(deps);
  const horizontalAxis = createMemo(() => String(props.horizontal === true));
  // The axis picks a different host TAG and Solid cannot swap a tag under a live node, so the flip
  // rebuilds, `on()` runs the build untracked so every other read re-props the same nodes
  const tree = createMemo(
    on(horizontalAxis, () => {
      const onHost = (node: ISymbioteNode): void => {
        scrollNode = node;
        deps.driver.setHostNode(node);
      };
      if (deps.nesting.isNested) return buildNestedTree(deps, onHost);
      const { scrollViewIntrinsic } = selectScrollIntrinsics(
        props.horizontal === true,
        contentContainerStyleInput(props),
      );
      return buildTree(deps, outerBag, scrollViewIntrinsic, onHost);
    }),
  );
  attachSticky(deps, tree, () => scrollNode);
  return tree;
}
