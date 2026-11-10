// ScrollView's host behavior, platform-invariant half — pilot for `buildStructure` + `childHost`,
// `slotProps`, `slotDerived`, `claimedChildren`. Only the RefreshControl claim differs by platform
// (`index.ios` beside the content view, `index.android` wraps it); everything else is shared.

// A composed primitive could not become a tag from props alone: `foldPayload` gives a tag its
// wrapper's PROP MAPPING, but every adapter's ScrollView wrapper also built the same two nodes as
// a framework component instance — this file gives the tag the wrapper's COMPOSITION too.

// `buildStructure` runs at `createElement`, before any prop routes, so it can't read `horizontal`
// — it doesn't need to: the axis is a SEPARATE intrinsic (`horizontal-scroll-view`, a different
// native ViewManager on Android), so one behavior per tag already knows its own content intrinsic.

// The ENGINE is the single owner of the content node: an adapter wrapper building one for the
// same tag would double-commit it if registered while the wrapper still stands.

// Both nodes compose their base UNDER the app's style: the owner is `[base, style]` and the slot
// is `[row, contentContainerStyle]` (`ScrollView.js:1654`), the row on the horizontal axis only

// `contentContainerStyle` travels through `slotProps` as a pure RENAME onto the slot's `style`,
// the row-direction constant is `foldScrollContentProps` in C++
import {
  appendChild,
  appListenerFor,
  createElement,
  dlog,
  Keyboard,
  registerHostBehavior,
  setNodeDispatch,
  setEventListener,
  type IClaimMode,
  type IEventDispatch,
  type IEventSubscription,
  type IHostBehavior,
  type IKeyboardEventName,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import type { ISymbioteIntrinsic } from '../../component-names/shared';
import { readLayoutDimension } from '../../view/render-scroll-view';
import { installScrollResponder } from './imperative';
import { releaseInnerViewRef, syncInnerViewRef } from './inner-view-ref';
import {
  deliverResponderEvent,
  RESPONDER_DISPATCHED_NAMES,
  RESPONDER_OWNED_LISTENERS,
} from './responder';
import {
  handleOwnerScroll,
  markScrollOwner,
  releaseStickyOwner,
  stickyHeaderBehavior,
  STICKY_HEADER_TAG,
  syncHiddenOnScroll,
  syncOwnerLayout,
} from './sticky';
import { forgetStickyIndexOwner, reconcileStickyIndices } from './sticky-index';

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

// RN синтезирует `onContentSizeChange` из `onLayout` контент-вью и не дедуплицирует
// У тега нет внутреннего узла, поэтому поведение ставит слушатель на слот

// Колбэк приложения берёт `(width, height)`, не событие, поэтому `contentSizeChange` это OWNED
// слушатель: `setEventListener` обернул бы его как `(event) => handler(event)`
function contentSizeListener(owner: ISymbioteNode) {
  return (event: ISymbioteEvent): void => {
    const handler = appListenerFor(owner, 'contentSizeChange');
    if (typeof handler !== 'function') return;
    const width = readLayoutDimension(event, 'width');
    const height = readLayoutDimension(event, 'height');
    if (width === undefined || height === undefined) return;
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
    setEventListener(slot, 'layout', undefined);
  }
}

// `onKeyboard{Will,Did}{Show,Hide}` (ScrollView.js:1232-1257) get the keyboard event, subscribed
// while the app has the callback where RN subscribes all four for every ScrollView
const KEYBOARD_PROP_EVENTS = [
  'keyboardWillShow',
  'keyboardWillHide',
  'keyboardDidShow',
  'keyboardDidHide',
] as const satisfies readonly IKeyboardEventName[];

const keyboardSubscriptions = new WeakMap<
  ISymbioteNode,
  Map<string, IEventSubscription>
>();

function syncKeyboardListener(
  owner: ISymbioteNode,
  name: (typeof KEYBOARD_PROP_EVENTS)[number],
  wired: boolean,
): void {
  const subscriptions = keyboardSubscriptions.get(owner) ?? new Map();
  keyboardSubscriptions.set(owner, subscriptions);
  const known = subscriptions.get(name);
  if (!wired) {
    known?.remove();
    subscriptions.delete(name);
  } else if (known === undefined) {
    subscriptions.set(
      name,
      Keyboard.addListener(name, event => {
        const handler = appListenerFor(owner, name);
        if (typeof handler === 'function') handler(event);
      }),
    );
  }
}

function releaseKeyboardListeners(owner: ISymbioteNode): void {
  for (const subscription of keyboardSubscriptions.get(owner)?.values() ?? [])
    subscription.remove();
  keyboardSubscriptions.delete(owner);
}

// The nine names an owner answers, as ONE object for every ScrollView in the app. `scroll` is in
// here unconditionally т.к. it drives the sticky `AnimatedValue`, and a header may register long
// after the node was created
const OWNER_DISPATCH: IEventDispatch = {
  names: new Set([...RESPONDER_DISPATCHED_NAMES, 'scroll']),
  deliver(node, name, event) {
    if (name === 'scroll') return handleOwnerScroll(node, event);
    return deliverResponderEvent(node, name, event);
  },
};

// `contentSizeChange` wires the SLOT's layout, `layout` the owner's own, which an inverted sticky
// header also wants, so `syncOwnerLayout` settles the claim instead of whoever wrote last
function syncOwnedListener(
  owner: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  if (name === 'contentSizeChange') syncContentSizeWiring(owner, wired);
  else if (name === 'layout') syncOwnerLayout(owner);
  else if (isKeyboardPropEvent(name)) syncKeyboardListener(owner, name, wired);
}

function isKeyboardPropEvent(
  name: string,
): name is (typeof KEYBOARD_PROP_EVENTS)[number] {
  return KEYBOARD_PROP_EVENTS.some(event => event === name);
}

// The platform half is a CLAIM MODE and a dirty list — nothing else. iOS takes the RefreshControl
// `beside` the content view; Android takes it as a `wrap`; the style split that inversion needs is
// `foldScrollViewProps`/`foldRefreshWrapperProps` in the engine.
export type IScrollPlatform = {
  claimMode: IClaimMode;
  // Owner props this platform's WRAPPER fold reads, added to the slot's own. Android needs
  // `style`, since foldRefreshWrapperProps derives from a node that isn't its own and only
  // re-reads on a commit that marks it — dirtying the content node too costs one avoidable clone.
  slotDerived?: readonly string[];
};

function scrollBehavior(
  contentIntrinsic: ISymbioteIntrinsic,
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
      ...KEYBOARD_PROP_EVENTS,
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
      setNodeDispatch(node, OWNER_DISPATCH);
    },
    onOwnedListenerChange: syncOwnedListener,
    // The one beat where the app's children are all present — no hook reports a children CHANGE,
    // and reconcileStickyIndices returns on a WeakSet miss for any that never used the prop.
    afterCommit(owner) {
      reconcileStickyIndices(owner);
      syncHiddenOnScroll(owner);
      syncInnerViewRef(owner);
    },
    detach(node) {
      releaseKeyboardListeners(node);
      releaseInnerViewRef(node);
      setNodeDispatch(node, undefined);
      forgetStickyIndexOwner(node);
      releaseStickyOwner(node);
    },
  };
}

// Both axes, given the platform's answer to the RefreshControl question. The platform files call
// this; nothing else should.
export function registerScrollViewBehaviors(platform: IScrollPlatform): void {
  installScrollResponder();
  registerHostBehavior(
    SCROLL_VIEW_TAG,
    scrollBehavior('scroll-content', platform),
  );
  registerHostBehavior(
    HORIZONTAL_SCROLL_VIEW_TAG,
    scrollBehavior('horizontal-scroll-content', platform),
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
