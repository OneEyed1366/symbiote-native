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
  // A horizontal scroller lays its content along the row axis
  it('gives the horizontal content node the row direction', () => {
    expect(horizontal({}).payload.flexDirection).toBe('row');
  });

  // `ScrollView.js:1654` is `[row, contentContainerStyle]`, so the app's own direction wins
  it('lets the app contentContainerStyle override the row constant', () => {
    expect(
      horizontal({ contentContainerStyle: { flexDirection: 'column' } }).payload
        .flexDirection,
    ).toBe('column');
  });

  // Nothing composes a direction onto a vertical content node
  it('invents no direction on the vertical content node', () => {
    expect(vertical({}).payload.flexDirection).toBe(undefined);
    expect(
      vertical({ contentContainerStyle: { flexDirection: 'row' } }).payload
        .flexDirection,
    ).toBe('row');
  });

  // The owner holds the prop, the content node is what must stop collapsing its children
  it('stops collapsing its children when the OWNER anchors the scroll', () => {
    expect(
      vertical({ maintainVisibleContentPosition: { minIndexForVisible: 0 } })
        .payload.collapsableChildren,
    ).toBe(false);
  });

  // `snapToAlignment` preserves children on Android only (`ScrollView.js:1731-1733`)
  // The Android half lives in `android-rules.android.itest.ts`
  it('lets a snapping iOS scroller collapse its children, as RN does', () => {
    expect(
      vertical({ snapToAlignment: 'center' }).payload.collapsableChildren,
    ).toBe(undefined);
  });

  // `true` is the native default, so the key is written only when false
  it('writes nothing when the owner asks for neither', () => {
    expect(vertical({}).payload.collapsableChildren).toBe(undefined);
  });

  // The rule reads two names off the owner and copies nothing else down
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

  // `ScrollView.js:1740-1745`: sticky headers only change this on Android, unset stays unset
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

  // `collapsable={false}` is unconditional (`ScrollView.js:1747`)
  // The authored prop stays absent, so the rule and not a build-time seed wrote it
  it('refuses to be flattened away, from the rule and not a seed', () => {
    const content = contentOf({});

    expect(committedPayloadOf(content)?.collapsable).toBe(false);
    expect(propsOf(content).collapsable).toBe(undefined);
  });

  // A late write to the owner must dirty the content node, `slotDerived` names both props
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

    // `snapToAlignment` would be an Android-only leg, this claim is platform-independent
    routeProp(owner, 'maintainVisibleContentPosition', {
      minIndexForVisible: 0,
    });
    surface.commit();
    mounted();

    expect(committedPayloadOf(content)?.collapsableChildren).toBe(false);
  });

  // A scroll view costs zero trips into JS on both of its nodes
  it('costs no trip into JS for either node', () => {
    const one = vertical({ snapToAlignment: 'center' });
    print(`DEBUG scroll-content folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

report();
