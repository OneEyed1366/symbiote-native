// ScrollView's host behavior, the platform-invariant half — and the pilot for four of the engine's
// composed-primitive seams: `buildStructure` + `childHost`, `slotProps`, `slotDerived`, and
// `claimedChildren`.
//
// THE PLATFORM HALF IS THE REFRESHCONTROL, and only that. `index.ios` claims it `beside` the
// content view; `index.android` claims it as a `wrap`, because an Android ScrollView holds exactly
// one child. Everything else here is shared, including the tags, the folds and the content-size
// synthesis.
//
// WHAT IS WIRED. Structure, the style compositions, `decelerationRate` resolution,
// `collapsableChildren`, the synthesized `onContentSizeChange`, the RefreshControl on both
// platforms — and, since the sticky half landed, the raised `scrollEventThrottle`, the scroll
// value that drives the pins, the owner layout an inverted pin needs, and the per-commit walk that
// turns `stickyHeaderIndices` into those same headers. The sticky machinery itself lives in
// `./sticky`, because a `<StickyHeader>` is a CHILD and the three props above are functions of
// whether one registered.
//
// WHAT A COMPOSED PRIMITIVE COSTS TODAY. Every adapter's ScrollView wrapper builds the same two
// nodes: `selectScrollIntrinsics` picks a scroll intrinsic and a content intrinsic, and the
// wrapper's body nests `<content>{children}</content>` inside `<scroll>`. That body is a framework
// component instance per ScrollView — a Vue instance, a Solid props Proxy, Svelte anchors, an
// Angular LView — which is precisely the currency a tag exists to delete. `foldPayload` gives a tag
// its wrapper's PROP MAPPING; nothing gave it the wrapper's COMPOSITION, so a composed primitive
// could not become a tag at all no matter what its props did. This is that half.
//
// WHY THE TAG CARRIES THE AXIS. `buildStructure` runs at `createElement`, before a single prop is
// routed, so it cannot read `horizontal`. It does not need to: horizontal scroll is already a
// SEPARATE intrinsic (`horizontal-scroll-view` — a different native ViewManager on
// Android, not RCTScrollView with a flag), so the decision the behavior needs is in the tag it was
// looked up by. One behavior per tag, each knowing its own content intrinsic. That is the same
// shape `intrinsicWhen` gives TextInput's `multiline`, arrived at from the other side.
//
// REGISTERED BY SVELTE SINCE 2026-09-07 (`adapters/svelte/src/register.ts`), and by no other
// adapter — this paragraph read "NOT REGISTERED BY ANY ADAPTER" for three days after that stopped
// being true. The hazard still holds for the four that have not registered: `scroll-view` is the
// tag their WRAPPERS emit, and a wrapper builds its own content node from `selectScrollIntrinsics`,
// as does `VirtualizedList`. Registering while either stands silently gives those trees a SECOND
// content node: `RCTScrollView > RCTScrollContentView > RCTScrollContentView`. So the precondition
// per adapter is that nothing else builds the content node.
//
// A SECOND TAG WAS NOT THE ANSWER, and this reverses what this header said until 2026-09-07: a
// second spelling only keeps two owners apart while two paths exist, and it buys a rename across
// every call site now plus another when one path dies. The decision was that the ENGINE becomes the
// single owner of the content node. That cut LANDED 2026-09-11: nothing else builds a content node
// any more, and all five adapters register this behavior through
// `@symbiote-native/components/register`.
//
// STYLE, on both nodes, and the precedence is the part that is easy to get silently wrong. The
// wrapper composes exactly two arrays, and this reproduces both:
//
//   owner    [scrollViewBaseStyle, style]                  base UNDER the app's, so an explicit
//                                                          flexDirection still wins
//   slot     [contentContainerStyle, {flexDirection:'row'}] row OVER the app's, on horizontal only
//
// Which is why the two halves use different seams rather than one. `contentContainerStyle` is
// written by the app on the OWNER and belongs to the slot, so it travels through `slotProps` — a
// pure RENAME (`contentContainerStyle` -> the slot's `style`) that goes through the slot's own
// `routeProp` and inherits style merging, class merging and the already-published guard. The
// CONSTANT half is a `payloadFold`, because a fold is where precedence can be expressed: the
// owner's puts the base first, the slot's puts the row direction last. A redirect that also tried
// to compose would have to pick one order for both.
//
// The slot's fold is assigned to the node inside `buildStructure`, not declared on the behavior:
// `IHostBehavior.foldPayload` is the OWNER's, wired by `attachHostBehavior`, and a behavior that
// builds a node owns what that node carries.
import {
  appendChild,
  appListenerFor,
  createElement,
  dlog,
  registerHostBehavior,
  setBehaviorListener,
  setEventListener,
  type IClaimMode,
  type IHostBehavior,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
  setProp,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import type { ISymbioteIntrinsic } from '../../component-names/shared';
import {
  didContentSizeChange,
  readLayoutDimension,
  type IContentSize,
} from '../../view/render-scroll-view';
import {
  handleOwnerScroll,
  markScrollOwner,
  reconcileStickyIndices,
  releaseStickyOwner,
  stickyHeaderBehavior,
  STICKY_HEADER_TAG,
  syncOwnerLayout,
} from './sticky';

export const SCROLL_VIEW_TAG = 'scroll-view';
export const HORIZONTAL_SCROLL_VIEW_TAG = 'horizontal-scroll-view';

// The app writes it on the ScrollView; it styles the content view. One entry, and it is the whole
// reason `slotProps` exists.
const SLOT_PROPS: Readonly<Record<string, string>> = {
  contentContainerStyle: 'style',
};

// Owner props the SLOT's payload reads. Declared so a write to one dirties the slot — see
// `IHostBehavior.slotDerived` for why nothing else makes that happen.
const SLOT_DERIVED = ['maintainVisibleContentPosition', 'snapToAlignment'];

// A `<RefreshControl>` written among the app's children is claimed, and WHAT the owner does with
// it is the one thing that genuinely differs per platform — see the platform files. Resolved
// through `descriptorFor`, so this is `PullToRefreshView` on iOS and `AndroidSwipeRefreshLayout`
// on Android without either name appearing here.
export const REFRESH_CONTROL = descriptorFor('refresh-control').component;

// The OWNER's fold: the per-axis base style UNDER the app's (so an explicit `flexDirection` still
// wins), `decelerationRate` resolved from RN's two words to the platform's friction constant, and
// the two props a tag has no wrapper to write for it. The resolution has to happen here because
// 'normal'/'fast' reach Fabric as strings it cannot read.
//
// `horizontal` is a real C++ prop (`BaseScrollViewProps.h:56`) and the separate ViewManager is
// ANDROID's — on iOS both tags resolve to RCTScrollView, so the PROP is what turns the axis there
// and a bare `<horizontal-scroll-view>` would otherwise scroll vertically. Written from the tag
// rather than read off props, which is the same source `buildStructure` picked the content
// intrinsic from; an app that also writes `horizontal` on the vertical tag is contradicting the
// element it chose, and the tag wins.
//
// `nestedScrollEnabled` defaults ON because every wrapper writes it on every ScrollView, both
// platforms. RN itself only defaults it on the Android RefreshControl WRAP path
// (`ScrollView.js:1862`) — parity here is with the wrapper this behavior replaced.
// THE OWNER'S FOLD IS GONE (2026-09-18) — `foldScrollViewProps` in `SymbioteFabricProps.cpp`. Every
// input it had was the node's own bag plus the AXIS, and the axis is the tag (`scroll-view` vs
// `horizontal-scroll-view`), so it was a tag rule by every criterion: the base style composition,
// `nestedScrollEnabled`, the `horizontal` strip, the asymmetric bounce pair, the two ViewConfig-less
// strips, and `decelerationRate`. Contract:
// `core/engine/cpp/tests/js/scroll-view-payload.itest.ts`.
//
// IT WAS BLOCKED ON A MISSING LOG, not on anything about the rule. An app writing `horizontal` on
// the vertical tag has it IGNORED, and this fold `dlog`'d where to write it instead — while
// `core/engine/cpp` had no logging facility at all, only `throw jsi::JSError`. Moving the rule as
// written would have deleted a diagnostic, which `<keep_logs_gate_behind_DEBUG>` forbids. So
// `SymbioteDebug.h` was built first and this is its first caller
// (`core/engine/cpp/tests/js/native-debug-log.itest.ts`).
//
// `decelerationRate`'s two constants went with it and are `#ifdef ANDROID` there: on iOS BOTH tags
// resolve to `RCTScrollView`, so a component name cannot tell iOS-vertical from Android-vertical the
// way `foldSwitchProps` can. That leaves the Android half outside headless reach — the same gap
// already recorded for `android_ripple`, and the only part of this rule a test here cannot see.

// THE SLOT'S FOLD IS GONE (2026-09-18) — `foldScrollContentProps` in `SymbioteFabricProps.cpp`.
// Its two halves came from different places and the second is why it took until now:
//
//   rowStyle             a CONSTANT, horizontal only, composed OVER the app's contentContainerStyle
//                        — a function of the content node's OWN tag, portable from the start
//   collapsableChildren  DERIVED from `maintainVisibleContentPosition` / `snapToAlignment`, which
//                        stay on the OWNER
//
// "A per-node rule cannot reach another node" is what this file used to say, and it was a fact about
// the JS FOLD rather than about the engine: the tree lives in C++, so a node knows its parent and
// `fabricProps` now takes `ownerProps` from it. Contract:
// `core/engine/cpp/tests/js/scroll-content-payload.itest.ts`.

// `rowStyle` USED TO BE A PARAMETER HERE and is not one any more: the content node's row direction
// is decided in the engine from that node's OWN tag (`horizontal-scroll-content`), so this builder
// no longer needs to know the axis to build it. `scrollBehavior` still derives `horizontal` from the
// row style for the things that DO still need it in JS.
function buildContent(contentIntrinsic: ISymbioteIntrinsic) {
  return (node: ISymbioteNode): ISymbioteNode => {
    const descriptor = descriptorFor(contentIntrinsic);
    const content = createElement(
      descriptor.component,
      descriptor.isText,
      contentIntrinsic,
    );
    // The wrapper sets it on every content node, both axes (react's `contentProps`). Yoga may
    // collapse a view that only groups children, and a collapsed content node takes the scroll
    // metrics with it.
    setProp(content, 'collapsable', false);
    // Lands directly on the owner, because `node.childHost` is still undefined here: the engine
    // assigns it from what this returns. That ordering is why `buildStructure` RETURNS the slot
    // instead of setting the field itself — a behavior that set it first would redirect its own
    // structure into the slot it was building.
    appendChild(node, content);
    return content;
  };
}

// The last size each owner reported, so a layout pass that did not change the content size does not
// fire the app's handler — RN dedupes the same way (`_handleContentOnLayout`). Off the node: this
// exists only for the ScrollViews an app wired a handler to.
const lastContentSize = new WeakMap<ISymbioteNode, IContentSize>();

// RN synthesizes onContentSizeChange from the CONTENT view's own onLayout — there is no native
// content-size event (ScrollView.js:1675 `contentSizeChangeProps`). The wrapper wired that by
// rendering an `onLayout` onto its inner node; a tag has no inner node of its own, so the behavior
// installs it on the slot it built.
//
// The app's callback takes `(width, height)`, not an event, which is why `contentSizeChange` is an
// OWNED listener: `setEventListener` wraps an ordinary listener as `(event) => handler(event)` and
// would call a two-number handler with one event. Owned names are stashed raw instead.
function contentSizeListener(owner: ISymbioteNode) {
  return (event: ISymbioteEvent): void => {
    const handler = appListenerFor(owner, 'contentSizeChange');
    if (typeof handler !== 'function') return;
    const width = readLayoutDimension(event, 'width');
    const height = readLayoutDimension(event, 'height');
    if (width === undefined || height === undefined) return;
    if (
      !didContentSizeChange(lastContentSize.get(owner) ?? null, {
        width,
        height,
      })
    )
      return;
    lastContentSize.set(owner, { width, height });
    dlog(`ScrollView onContentSizeChange ${width}x${height}`);
    handler(width, height);
  };
}

// RN installs the content `onLayout` only when the app passed `onContentSizeChange`, and so does
// every wrapper — `onLayout` is a gated event, so wiring it unconditionally would put `onLayout:
// true` in the payload of every ScrollView's content node and buy a native event nobody reads. A
// change to the committed surface in EITHER direction is a bug, so the wiring has to follow the
// prop.
//
// It follows the LISTENER rather than a commit, which is what `onOwnedListenerChange` is for: a
// listener flip changes no payload by itself, so the commit after it is a no-op and a post-commit
// hook would never fire. Measured on exactly this — the wire worked (mount commits for other
// reasons) and the UNWIRE silently did not.
function syncContentSizeWiring(owner: ISymbioteNode, wired: boolean): void {
  const slot = owner.childHost;
  if (slot === undefined) return;
  if (wired) {
    setEventListener(slot, 'layout', contentSizeListener(owner));
  } else {
    lastContentSize.delete(owner);
    setEventListener(slot, 'layout', undefined);
  }
}

// Two owned names answer to a flip, and they answer on DIFFERENT nodes: `contentSizeChange` wires
// the SLOT's layout, `layout` wires the owner's own — which an inverted sticky header also wants,
// so the two claims are resolved in one place (`syncOwnerLayout`) rather than by whoever wrote last.
function syncOwnedListener(
  owner: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  if (name === 'contentSizeChange') syncContentSizeWiring(owner, wired);
  else if (name === 'layout') syncOwnerLayout(owner);
}

// The platform half, and as of 2026-09-18 it is a CLAIM MODE and a dirty list — nothing else. iOS
// takes the RefreshControl `beside` the content view; Android takes it as a `wrap`, and the style
// split that inversion needs is `foldScrollViewProps`/`foldRefreshWrapperProps` in the engine now.
//
// This interface carried an `onWrapChange` factory over the axis until then, purely to hand each
// behavior's base style to the two folds it installed. Both folds are gone, so the factory had no
// implementor and `scrollBehavior` no longer needs a `base` at all.
export interface IScrollPlatform {
  claimMode: IClaimMode;
  // Owner props this platform's WRAPPER fold reads, added to the slot's own. Android's needs
  // `style`, because the layout half of the scroll view's style is what the wrapper paints — and it
  // is load-bearing for the ENGINE's rule now rather than for a JS fold: `foldRefreshWrapperProps`
  // derives from a node that is not its own, so it re-reads only on a commit that marks it.
  //
  // It dirties the content node as well as the wrapper — the engine marks both from one list — so a
  // ScrollView style write on Android re-clones a content node whose payload did not change. A
  // style write is not a per-frame event, and a second list to avoid one clone is not worth a field.
  slotDerived?: readonly string[];
}

function scrollBehavior(
  contentIntrinsic: ISymbioteIntrinsic,
  rowStyle: IViewStyle | undefined,
  platform: IScrollPlatform,
): IHostBehavior {
  // The row style is the horizontal tag's constant and nothing else carries it, so it IS the axis —
  // deriving keeps the two from ever disagreeing about which behavior this is.
  const horizontal = rowStyle !== undefined;
  return {
    // `scroll` and `layout` are owned for the collision reason rather than because the behavior
    // consumes them: RN's ScrollView installs `_handleScroll` and `_handleLayout` on the native
    // view unconditionally and calls the app's own handler from inside them, and `node.listeners`
    // is single-slot — so a behavior that installed either without owning it would silently evict
    // the app's.
    ownedListeners: ['contentSizeChange', 'scroll', 'layout'],
    slotProps: SLOT_PROPS,
    slotDerived: [...SLOT_DERIVED, ...(platform.slotDerived ?? [])],
    claimedChildren: { [REFRESH_CONTROL]: platform.claimMode },
    buildStructure: buildContent(contentIntrinsic),
    // The scroll dispatcher is installed here and never conditionally: it is what drives the
    // sticky AnimatedValue, and a header can register long after this node was created. It costs a
    // forward per scroll event on a ScrollView with no sticky child, which is what RN pays too.
    // Nothing else is taken — no timer, and the two conditional listeners are wired on a flip.
    attach(node) {
      markScrollOwner(node);
      setBehaviorListener(node, 'scroll', event =>
        handleOwnerScroll(node, event),
      );
    },
    onOwnedListenerChange: syncOwnedListener,
    // The one beat at which the app's children are all present — `stickyHeaderIndices` addresses
    // them positionally, and no hook reports a children CHANGE. Costs a Set iteration per commit
    // over the ScrollViews alone, and `reconcileStickyIndices` returns on a WeakSet miss for any
    // that never used the prop.
    afterCommit: reconcileStickyIndices,
    detach(node) {
      lastContentSize.delete(node);
      releaseStickyOwner(node);
    },
  };
}

// Both axes, given the platform's answer to the RefreshControl question. The platform files call
// this; nothing else should.
export function registerScrollViewBehaviors(platform: IScrollPlatform): void {
  registerHostBehavior(
    SCROLL_VIEW_TAG,
    scrollBehavior('scroll-content', undefined, platform),
  );
  registerHostBehavior(
    HORIZONTAL_SCROLL_VIEW_TAG,
    scrollBehavior(
      'horizontal-scroll-content',
      { flexDirection: 'row' },
      platform,
    ),
  );
  // REGISTRATIONS WITH NO RUNTIME, and they are what hand the content tags to the host. A tag
  // crosses only through `recordSetTag`, which `attachHostBehavior` emits, so a tag with no behavior
  // registered carries an EMPTY `tagName` in C++ and no rule can fire for it. These two nodes are
  // built by `buildStructure` and named by no app, which is exactly the shape that trap has.
  //
  // Same reasoning as `activity-indicator-spinner`'s stub: a registration is how this codebase says
  // a tag HAS platform semantics, which is the claim being made.
  for (const contentTag of ['scroll-content', 'horizontal-scroll-content'])
    registerHostBehavior(contentTag, { attach() {}, detach() {} });
  // With the scroll views, never on its own: a sticky header is meaningless without an owner to
  // find, and registering the pair together is what makes "did the registration run" one question
  // rather than two.
  registerHostBehavior(STICKY_HEADER_TAG, stickyHeaderBehavior);
}
