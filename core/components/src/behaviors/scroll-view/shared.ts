// ScrollView's host behavior, platform-invariant half — pilot for `buildStructure` + `childHost`,
// `slotProps`, `slotDerived`, `claimedChildren`. Only the RefreshControl claim differs by platform
// (`index.ios` beside the content view, `index.android` wraps it); everything else is shared.

// TODO(rn-parity): `keyboardShouldPersistTaps` is type-only — no capture-phase responder
// negotiation eats a tap-elsewhere to dismiss the keyboard (`ScrollView.js:1360-1590`). Needs
// `TextInputState.isTextInput`-equivalent wiring on this tag; see audit skill.

// TODO(rn-parity): `stickyHeaderHiddenOnScroll` is entirely absent (no prop, no state, no
// wiring). Vendor composes `Animated.diffClamp` over the scroll delta onto the sticky translateY
// (`ScrollViewStickyHeader.js:39,84-103`); our sticky pin is a discrete number, not live Animated.

// A composed primitive could not become a tag from props alone: `foldPayload` gives a tag its
// wrapper's PROP MAPPING, but every adapter's ScrollView wrapper also built the same two nodes as
// a framework component instance — this file gives the tag the wrapper's COMPOSITION too.

// `buildStructure` runs at `createElement`, before any prop routes, so it can't read `horizontal`
// — it doesn't need to: the axis is a SEPARATE intrinsic (`horizontal-scroll-view`, a different
// native ViewManager on Android), so one behavior per tag already knows its own content intrinsic.

// The ENGINE is the single owner of the content node: an adapter wrapper building one for the
// same tag would double-commit it if registered while the wrapper still stands.

// STYLE precedence differs by node: owner is [base, style] (base UNDER the app's), slot is
// [contentContainerStyle, rowStyle] (row OVER the app's, horizontal only).

// `contentContainerStyle` travels through `slotProps` as a pure RENAME onto the slot's `style`;
// the row-direction CONSTANT is a `payloadFold` instead, assigned to the slot node inside
// `buildStructure` since `IHostBehavior.foldPayload` is only ever the OWNER's.
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
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import type { ISymbioteIntrinsic } from '../../component-names/shared';
import {
  didContentSizeChange,
  readLayoutDimension,
  type IContentSize,
} from '../../view/render-scroll-view';
import {
  installResponderPredicates,
  RESPONDER_OWNED_LISTENERS,
} from './responder';
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
const SLOT_DERIVED = [
  'maintainVisibleContentPosition',
  'snapToAlignment',
  'removeClippedSubviews',
];

// A `<RefreshControl>` written among the app's children is claimed; WHAT the owner does with it
// is the one thing that genuinely differs per platform — see the platform files.
export const REFRESH_CONTROL = descriptorFor('refresh-control').component;

// foldScrollViewProps in C++ owns the OWNER's fold: the per-axis base style UNDER the app's,
// decelerationRate resolved from RN's two words to a platform friction constant, and the
// horizontal strip and bounce pair — all tag rules, since strings reach Fabric unreadable.

// `horizontal` is a real C++ prop and the separate ViewManager is ANDROID's — on iOS both tags
// resolve to RCTScrollView, so the prop is what turns the axis there. Written from the TAG, not
// read off props; an app also writing `horizontal` on the vertical tag loses to the tag.

// foldScrollContentProps in C++ owns the slot's fold: rowStyle (horizontal-only constant) and
// collapsableChildren, derived from the OWNER's maintainVisibleContentPosition/snapToAlignment.

function buildContent(contentIntrinsic: ISymbioteIntrinsic) {
  return (node: ISymbioteNode): ISymbioteNode => {
    const descriptor = descriptorFor(contentIntrinsic);
    const content = createElement(
      descriptor.component,
      descriptor.isText,
      contentIntrinsic,
    );
    // `collapsable: false` is a TAG constant now (`foldScrollContentProps`, `ScrollView.js:1747`),
    // not seeded here — `scroll-content-payload.itest.ts` asserts the authored prop stays ABSENT.

    // Lands on the owner: `node.childHost` is undefined here, so `buildStructure` RETURNS the
    // slot instead of setting the field itself.
    appendChild(node, content);
    return content;
  };
}

// The last size each owner reported, so a layout pass that did not change the content size does not
// fire the app's handler — RN dedupes the same way (`_handleContentOnLayout`). Off the node: this
// exists only for the ScrollViews an app wired a handler to.
const lastContentSize = new WeakMap<ISymbioteNode, IContentSize>();

// RN synthesizes onContentSizeChange from the CONTENT view's own onLayout — there's no native
// content-size event. A tag has no inner node of its own, so the behavior installs it on the slot.

// The app's callback takes `(width, height)`, not an event, so `contentSizeChange` is an OWNED
// listener: setEventListener would wrap it as `(event) => handler(event)` and call it wrong.
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

// RN installs the content `onLayout` only when the app passed `onContentSizeChange`: `onLayout`
// is gated, so wiring it unconditionally would put `onLayout: true` in every ScrollView's payload.

// Follows the LISTENER rather than a commit, since a listener flip changes no payload by itself —
// the commit after it is a no-op and a post-commit hook would never fire.
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

// The platform half is a CLAIM MODE and a dirty list — nothing else. iOS takes the RefreshControl
// `beside` the content view; Android takes it as a `wrap`; the style split that inversion needs is
// `foldScrollViewProps`/`foldRefreshWrapperProps` in the engine.
export interface IScrollPlatform {
  claimMode: IClaimMode;
  // Owner props this platform's WRAPPER fold reads, added to the slot's own. Android needs
  // `style`, since foldRefreshWrapperProps derives from a node that isn't its own and only
  // re-reads on a commit that marks it — dirtying the content node too costs one avoidable clone.
  slotDerived?: readonly string[];
}

function scrollBehavior(
  contentIntrinsic: ISymbioteIntrinsic,
  rowStyle: IViewStyle | undefined,
  platform: IScrollPlatform,
): IHostBehavior {
  return {
    // `scroll` and `layout` are owned for the collision reason, not because the behavior consumes
    // them: node.listeners is single-slot, so installing either without owning it would silently
    // evict the app's own handler.
    ownedListeners: [
      'contentSizeChange',
      'scroll',
      'layout',
      ...RESPONDER_OWNED_LISTENERS,
    ],
    slotProps: SLOT_PROPS,
    slotDerived: [...SLOT_DERIVED, ...(platform.slotDerived ?? [])],
    claimedChildren: { [REFRESH_CONTROL]: platform.claimMode },
    buildStructure: buildContent(contentIntrinsic),
    // The scroll dispatcher is installed unconditionally: it drives the sticky AnimatedValue, and
    // a header can register long after this node was created.
    attach(node) {
      markScrollOwner(node);
      setBehaviorListener(node, 'scroll', event =>
        handleOwnerScroll(node, event),
      );
      installResponderPredicates(node);
    },
    onOwnedListenerChange: syncOwnedListener,
    // The one beat where the app's children are all present — no hook reports a children CHANGE,
    // and reconcileStickyIndices returns on a WeakSet miss for any that never used the prop.
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
  // REGISTRATIONS WITH NO RUNTIME, what hand the content tags to the host: a tag with no behavior
  // registered carries an EMPTY tagName in C++ and no rule can fire for it. A registration is how
  // this codebase says a tag HAS platform semantics.
  for (const contentTag of ['scroll-content', 'horizontal-scroll-content'])
    registerHostBehavior(contentTag, { attach() {}, detach() {} });
  // With the scroll views, never on its own: a sticky header is meaningless without an owner to
  // find, and registering the pair together is what makes "did the registration run" one question
  // rather than two.
  registerHostBehavior(STICKY_HEADER_TAG, stickyHeaderBehavior);
}
