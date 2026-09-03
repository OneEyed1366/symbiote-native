// ScrollView's host behavior — the pilot for `IHostBehavior.buildStructure` + `childHost`, and now
// for `slotDerived` as well.
//
// WHAT IS AND IS NOT HERE. Structure, the two style compositions, `decelerationRate` resolution,
// `collapsableChildren`, and the synthesized `onContentSizeChange` are all wired. The STICKY half is
// not: `scrollEventThrottle`'s 1/16 defaults and `resolveScrollForwarding`'s `sticky-native` /
// `sticky-js` modes only mean something once a sticky header is a marked CHILD rather than an index
// into a children array a lowered element does not have. Resolving the throttle on its own would buy
// a per-frame scroll event with nothing reading it, so it waits for that step rather than landing
// half-wired. `onScroll` needs nothing either way — `scroll` is a real Fabric event and routes on
// its own.
//
// WHAT A COMPOSED PRIMITIVE COSTS TODAY. Every adapter's ScrollView wrapper builds the same two
// nodes: `selectScrollIntrinsics` picks a scroll intrinsic and a content intrinsic, and the
// wrapper's body nests `<content>{children}</content>` inside `<scroll>`. That body is a framework
// component instance per ScrollView — a Vue instance, a Solid props Proxy, Svelte anchors, an
// Angular LView — which is precisely the currency host-primitive lowering exists to delete
// (`.claude/rules/host-primitive-tier.md`). `foldPayload` gave a lowered primitive its wrapper's
// PROP MAPPING; nothing gave it the wrapper's COMPOSITION, so a composed primitive could not be
// lowered at all no matter what its props did. This is that half.
//
// WHY THE TAG CARRIES THE AXIS. `buildStructure` runs at `createElement`, before a single prop is
// routed, so it cannot read `horizontal`. It does not need to: horizontal scroll is already a
// SEPARATE intrinsic (`symbiote-horizontal-scroll-view` — a different native ViewManager on
// Android, not RCTScrollView with a flag), so the decision the behavior needs is in the tag it was
// looked up by. One behavior per tag, each knowing its own content intrinsic. That is the same
// shape `intrinsicWhen` gives TextInput's `multiline`, arrived at from the other side.
//
// NOT REGISTERED BY ANY ADAPTER, deliberately, and this is the whole reason the file is safe to
// land. `symbiote-scroll-view` is the tag the WRAPPERS already emit, and a wrapper builds its own
// content node from `selectScrollIntrinsics`. Registering here would give those trees a second
// content node — every existing ScrollView, silently double-nested. The precedent for the fix is
// `symbiote-text-input` vs `symbiote-text-input-managed` in `../component-names/shared.ts`: the
// wrapper and the lowered path get separate tags so exactly one owner builds each node. Splitting
// the scroll tags is the NEXT step and is not this one; until then `registerScrollViewBehavior()`
// is called only by tests, which is what exercises it.
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
  setEventListener,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteEvent,
  type ISymbioteNode,
  type IViewStyle,
} from '@symbiote-native/engine';

import { descriptorFor } from '../component-names';
import type { ISymbioteIntrinsic } from '../component-names/shared';
import {
  didContentSizeChange,
  preservesContentChildren,
  readLayoutDimension,
  resolveDecelerationRate,
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
  type IContentSize,
} from '../view/render-scroll-view';

export const SCROLL_VIEW_TAG = 'symbiote-scroll-view';
export const HORIZONTAL_SCROLL_VIEW_TAG = 'symbiote-horizontal-scroll-view';

// The app writes it on the ScrollView; it styles the content view. One entry, and it is the whole
// reason `slotProps` exists.
const SLOT_PROPS: Readonly<Record<string, string>> = {
  contentContainerStyle: 'style',
};

// Owner props the SLOT's payload reads. Declared so a write to one dirties the slot — see
// `IHostBehavior.slotDerived` for why nothing else makes that happen.
const SLOT_DERIVED = ['maintainVisibleContentPosition', 'snapToAlignment'];

// A `<RefreshControl>` written among the app's children belongs beside the content view, not
// inside it (RN iOS: `{refreshControl}{contentContainer}`). Resolved through `descriptorFor` so it
// is whatever the platform's name table says — `PullToRefreshView` on iOS.
//
// ANDROID IS NOT THIS SHAPE and is not done. An Android ScrollView takes exactly one child, so RN
// inverts the tree there: `AndroidSwipeRefreshLayout` WRAPS the scroll view
// (`ScrollView.js:1856`), with `splitLayoutProps` sending the layout half of the style to the
// wrapper. A claim cannot express that — the refresh control is not a child at all — so it needs a
// node that goes ABOVE the owner, and the owner has no parent yet when its children arrive. Until
// that is designed, a lowered ScrollView is iOS-only, which costs nothing today because no adapter
// registers this behavior.
const CLAIMED_CHILDREN = [descriptorFor('symbiote-refresh-control').component];

// The OWNER's fold: the per-axis base style UNDER the app's (so an explicit `flexDirection` still
// wins), and `decelerationRate` resolved from RN's two words to the platform's friction constant.
// The resolution has to happen here rather than in an adapter because a lowered element has no
// wrapper to do it, and 'normal'/'fast' reach Fabric as strings it cannot read.
function ownerFold(base: IViewStyle): IPayloadFold {
  return props => {
    const next: Record<string, unknown> = {
      ...props,
      style: [base, props.style],
    };
    const rate = props.decelerationRate;
    if (rate === 'normal' || rate === 'fast' || typeof rate === 'number')
      next.decelerationRate = resolveDecelerationRate(rate);
    return next;
  };
}

// The SLOT's fold. Two halves with different sources, which is why it takes the owner:
//
//   rowStyle             a CONSTANT, horizontal only, composed OVER the app's contentContainerStyle
//                        (the wrapper writes `[contentContainerStyle, {flexDirection:'row'}]`)
//   collapsableChildren  DERIVED from props that stay on the OWNER, so it is read back off it
//
// Written only when false, matching every wrapper — RN sends `collapsableChildren={!preserveChildren}`
// and therefore an explicit `true`, which is the native default anyway.
function contentFold(
  owner: ISymbioteNode,
  rowStyle: IViewStyle | undefined,
): IPayloadFold {
  return props => {
    const preserve = preservesContentChildren(
      owner.props.maintainVisibleContentPosition,
      owner.props.snapToAlignment,
    );
    // The identity return IPayloadFold's contract asks for: a vertical content view with neither
    // prop set has nothing to add, which is the common case.
    if (rowStyle === undefined && !preserve) return props;
    const next: Record<string, unknown> = { ...props };
    if (rowStyle !== undefined) next.style = [props.style, rowStyle];
    if (preserve) next.collapsableChildren = false;
    return next;
  };
}

function buildContent(
  contentIntrinsic: ISymbioteIntrinsic,
  rowStyle: IViewStyle | undefined,
) {
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
    content.props = { collapsable: false };
    content.payloadFold = contentFold(node, rowStyle);
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
// rendering an `onLayout` onto its inner node; a lowered element has no inner node of its own, so
// the behavior installs it on the slot it built.
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
// true` in the payload of every lowered ScrollView's content node and buy a native event nobody
// reads. A lowering that changes the committed surface in EITHER direction is a bug, so the wiring
// has to follow the prop.
//
// It follows the LISTENER rather than a commit, which is what `onOwnedListenerChange` is for: a
// listener flip changes no payload by itself, so the commit after it is a no-op and a post-commit
// hook would never fire. Measured on exactly this — the wire worked (mount commits for other
// reasons) and the UNWIRE silently did not.
function syncContentSizeWiring(
  owner: ISymbioteNode,
  _name: string,
  wired: boolean,
): void {
  const slot = owner.childHost;
  if (slot === undefined) return;
  if (wired) {
    setEventListener(slot, 'layout', contentSizeListener(owner));
  } else {
    lastContentSize.delete(owner);
    setEventListener(slot, 'layout', undefined);
  }
}

function scrollBehavior(
  contentIntrinsic: ISymbioteIntrinsic,
  base: IViewStyle,
  rowStyle: IViewStyle | undefined,
): IHostBehavior {
  return {
    ownedListeners: ['contentSizeChange'],
    slotProps: SLOT_PROPS,
    slotDerived: SLOT_DERIVED,
    claimedChildren: CLAIMED_CHILDREN,
    buildStructure: buildContent(contentIntrinsic, rowStyle),
    foldPayload: ownerFold(base),
    // No timer and no listener taken here: the one listener this behavior installs is prop-driven,
    // so it is wired from `afterCommit` and released the same way. Written as an explicit no-op
    // rather than by widening `attach` to optional — a behavior that FORGOT its runtime and one
    // that has none must not be spelled the same way.
    attach() {},
    onOwnedListenerChange: syncContentSizeWiring,
    detach(node) {
      lastContentSize.delete(node);
    },
  };
}

export function registerScrollViewBehavior(): void {
  registerHostBehavior(
    SCROLL_VIEW_TAG,
    scrollBehavior(
      'symbiote-scroll-content',
      SCROLL_VIEW_BASE_VERTICAL,
      undefined,
    ),
  );
  registerHostBehavior(
    HORIZONTAL_SCROLL_VIEW_TAG,
    scrollBehavior(
      'symbiote-horizontal-scroll-content',
      SCROLL_VIEW_BASE_HORIZONTAL,
      {
        flexDirection: 'row',
      },
    ),
  );
}
