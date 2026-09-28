// ScrollView's CONTENT node — the first rule that reads the node above it, and the seam that makes
// that possible.
//
// WHAT I HAD BEEN CALLING IMPOSSIBLE. Three iterations of this migration recorded "a per-node rule
// cannot reach another node, so this stays a JS fold" — for this content node, for ImageBackground's
// image, for the two clone-folds. That was true of the JS fold shape and NOT of the engine: the tree
// lives in C++ now, so a node already knows its parent and reading it is a pointer hop. `fabricProps`
// takes `ownerProps` from `node.parent`, and a rule that needs the owner reads it there.
//
// THE BOUNDARY DID NOT MOVE, only my reading of it. A rule may read the parent's PROPS — declarative,
// present at commit time. It still cannot read live JS state (`stickyFold`'s `translateY`), an owned
// LISTENER (`focusable`'s `onPress !== undefined`, which lives in the stash and in no bag), or
// anything a framework computes per render. Those remain JS folds, and that is the browser model's
// own line: a UA rule can see the tree, it cannot see the application's closures.
//
// THE TWO HALVES OF THIS RULE come from different places, which is what made it the right first user:
//
//   the row style         a CONSTANT of the tag — the content node's own tag is
//                         `horizontal-scroll-content` or `scroll-content`, so this half needs no
//                         owner at all and would have been portable at any point
//   collapsable           a CONSTANT too, and unconditional on both axes (`ScrollView.js:1747`). It
//                         is the rule's now, not a build-time `setProp` in `buildStructure` — see
//                         "from the rule and not a seed" for why that case has
//                         to assert an ABSENT authored prop to mean anything
//   collapsableChildren   DERIVED from the OWNER's `maintainVisibleContentPosition`, or its
//                         `snapToAlignment` on ANDROID ONLY (`:1731-1733`) — the half that needed
//                         the seam, and the one leg with a platform gate
//
// A STUB REGISTRATION HANDS THE TAG OVER, the same way the ActivityIndicator spinner's does: a tag
// reaches C++ only through `recordSetTag`, which `attachHostBehavior` emits, so a tag nobody
// registered carries an empty `tagName` in the host and no rule can fire for it.

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createSurface,
  propsOf,
  readSurfaceTelemetry,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

// The owner is built through its real behavior, so `buildStructure` makes the content node exactly
// as an app's `<scroll-view>` would — reaching for it any other way would test a tree this code
// never produces.
// `routeProp`, NOT `setProp`, and the difference is load-bearing here rather than stylistic:
// `contentContainerStyle` is a prop the app writes on the OWNER that the behavior REDIRECTS onto the
// slot, and that redirect lives in `routeProp`. Written with `setProp` it lands on the owner and
// never reaches the content node, so the vertical case below read `undefined` and looked like a rule
// bug on the first run. An app reaches the engine through `routeProp`; a fixture that does not is
// testing a path no app takes.
function commit(tag: string, ownerProps: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const owner: ISymbioteNode = createElement('RCTScrollView', false, tag);
  for (const [name, value] of Object.entries(ownerProps))
    routeProp(owner, name, value);

  const content = owner.childHost;
  if (content === undefined)
    throw new Error('the behavior built no content node');

  // A child so the content node is not an empty group the walk might treat differently.
  appendChild(owner, createElement('RCTView', false, 'view'));
  surface.appendChild(owner);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(content);
  if (payload === undefined)
    throw new Error('the content node committed nothing');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const vertical = (ownerProps: Record<string, unknown>): ICommitted =>
  commit('scroll-view', ownerProps);

// The content NODE itself, for the one case that has to look at its authored props rather than at
// what the rule made of them.
function contentOf(ownerProps: Record<string, unknown>): ISymbioteNode {
  const surface = createSurface(ROOT_TAG);
  const owner: ISymbioteNode = createElement(
    'RCTScrollView',
    false,
    'scroll-view',
  );
  for (const [name, value] of Object.entries(ownerProps))
    routeProp(owner, name, value);
  const content = owner.childHost;
  if (content === undefined) throw new Error('the behavior built no content');
  appendChild(owner, createElement('RCTView', false, 'view'));
  surface.appendChild(owner);
  surface.commit();
  mounted();
  return content;
}
const horizontal = (ownerProps: Record<string, unknown>): ICommitted =>
  commit('horizontal-scroll-view', ownerProps);

describe('what a scroll content node sends native', () => {
  // why: a horizontal scroller lays its content along the row axis, and the content node is where
  // that happens — the wrapper writes `[contentContainerStyle, {flexDirection:'row'}]`. Without it
  // the row stacks vertically inside a horizontally-scrolling box and nothing scrolls.
  it('gives the horizontal content node the row direction', () => {
    expect(horizontal({}).payload.flexDirection).toBe('row');
  });

  // why: the CONSTANT wins here, which is the opposite precedence from the owner's base style and is
  // deliberate — RN writes the row direction AFTER the app's contentContainerStyle. A test that
  // checked only one node would pass with both folds written the same way.
  it('puts the row constant OVER the app contentContainerStyle', () => {
    expect(
      horizontal({ contentContainerStyle: { flexDirection: 'column' } }).payload
        .flexDirection,
    ).toBe('row');
  });

  // why: nothing composes a direction onto a VERTICAL content node — the wrapper's contentStyle for
  // vertical is `contentContainerStyle` alone. Inventing one would override an app that set its own.
  it('invents no direction on the vertical content node', () => {
    expect(vertical({}).payload.flexDirection).toBe(undefined);
    expect(
      vertical({ contentContainerStyle: { flexDirection: 'row' } }).payload
        .flexDirection,
    ).toBe('row');
  });

  // why: THE HALF THAT NEEDED THE SEAM. Both props stay on the OWNER, and the content node is what
  // must stop collapsing — a Yoga-collapsed content view takes the scroll metrics with it, and an
  // anchored scroll (`maintainVisibleContentPosition`) needs its children to keep their identity.
  it('stops collapsing its children when the OWNER anchors the scroll', () => {
    expect(
      vertical({ maintainVisibleContentPosition: { minIndexForVisible: 0 } })
        .payload.collapsableChildren,
    ).toBe(false);
  });

  // why: `snapToAlignment` is HALF a reason, and only on Android — RN's own gate is
  // `maintainVisibleContentPosition != null || (Platform.OS === 'android' && snapToAlignment !=
  // null)` (`ScrollView.js:1731-1733`). We honoured it on both platforms, so an iOS ScrollView that
  // merely snaps stopped Yoga flattening its children for no reason RN has. The Android half is
  // asserted on the arm that compiles it (`android-rules.android.itest.ts`).
  it('lets a snapping iOS scroller collapse its children, as RN does', () => {
    expect(
      vertical({ snapToAlignment: 'center' }).payload.collapsableChildren,
    ).toBe(undefined);
  });

  // why: PRESENCE decides, not truthiness — `snapToAlignment: 'start'` and an empty
  // `maintainVisibleContentPosition` object are both real requests. And the key is written only when
  // false, matching every wrapper: RN sends `collapsableChildren={!preserveChildren}`, so an
  // explicit `true` is the native default and one more key on every scroll view that ever renders.
  it('writes nothing when the owner asks for neither', () => {
    expect(vertical({}).payload.collapsableChildren).toBe(undefined);
  });

  // why: the owner's OTHER props must not leak down. The rule reads two names off the parent and
  // copies nothing — a rule that merged the parent's bag would put the scroller's whole surface on
  // its content view, which Fabric would mostly drop and partly honour.
  it('copies nothing else down from the owner', () => {
    const payload = vertical({
      testID: 'list',
      snapToAlignment: 'center',
      decelerationRate: 'fast',
    }).payload;

    expect(payload.testID).toBe(undefined);
    expect(payload.decelerationRate).toBe(undefined);
    expect(payload.snapToAlignment).toBe(undefined);
  });

  // why: ScrollView.js:1740-1745 — the content view carries the scroller's removeClippedSubviews
  // (sticky headers only change that on Android); unset stays unset.
  it('carries the owner removeClippedSubviews down, sticky headers or not, off Android', () => {
    expect(
      vertical({ removeClippedSubviews: true }).payload.removeClippedSubviews,
    ).toBe(true);
    expect(
      vertical({ removeClippedSubviews: true, stickyHeaderIndices: [0] })
        .payload.removeClippedSubviews,
    ).toBe(true);
    expect(vertical({}).payload.removeClippedSubviews).toBe(undefined);
  });

  // why: `collapsable={false}` is UNCONDITIONAL on RN's content view (`ScrollView.js:1747`) — Yoga may
  // collapse a view that only groups children, and a collapsed content node takes the scroll metrics
  // with it. A constant of the tag, so the rule writes it.
  //
  // THE SECOND ASSERTION IS THE ONE THAT DISCRIMINATES, and without it this case is green either way.
  // `buildStructure` used to seed the key with a `setProp` at build time, which reaches the payload by
  // a completely different route and would satisfy the first line forever. A rule's output lives in
  // the payload and nowhere else, so an absent AUTHORED prop is what says the seed is gone — the same
  // witness the sticky port used one commit earlier.
  it('refuses to be flattened away, from the rule and not a seed', () => {
    const content = contentOf({});

    expect(committedPayloadOf(content)?.collapsable).toBe(false);
    expect(propsOf(content).collapsable).toBe(undefined);
  });

  // why: THE FAILURE MODE THE SEAM INTRODUCES, and the only one. A rule that reads its parent runs
  // when THIS node is dirty, so a write to the OWNER after the first commit has to mark the content
  // node dirty or the rule never re-reads it — the content view would keep collapsing its children
  // forever while the scroller believes it anchors them.
  //
  // `slotDerived` already names both props, so this works, and it worked for the JS fold too for
  // exactly the same reason: that fold also only ran when its node was dirty. The seam did not
  // change the requirement, which is why this passes — but nothing said so out loud until now, and
  // an unstated invariant is one a later `slotDerived` edit deletes without noticing.
  it('re-reads the owner when the anchor prop arrives after the first commit', () => {
    const surface = createSurface(ROOT_TAG);
    const owner: ISymbioteNode = createElement(
      'RCTScrollView',
      false,
      'scroll-view',
    );
    const content = owner.childHost;
    if (content === undefined) throw new Error('no content node');
    appendChild(owner, createElement('RCTView', false, 'view'));
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(content)?.collapsableChildren).toBe(undefined);

    // `maintainVisibleContentPosition` rather than `snapToAlignment`, because the latter is an
    // Android-only leg and this claim — that a late write to the OWNER re-derives the CHILD — is
    // platform-independent. `slotDerived` names both, so either would do on the Android arm.
    routeProp(owner, 'maintainVisibleContentPosition', {
      minIndexForVisible: 0,
    });
    surface.commit();
    mounted();

    expect(committedPayloadOf(content)?.collapsableChildren).toBe(false);
  });

  // why: THE PRICE, and it is the whole point — a scroll view is now ZERO trips into JS on both of
  // its nodes. The owner shed its fold last iteration; this is the other one.
  it('costs no trip into JS for either node', () => {
    const one = vertical({ snapToAlignment: 'center' });
    print(`DEBUG scroll-content folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

report();
