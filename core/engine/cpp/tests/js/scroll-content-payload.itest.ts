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
//   collapsableChildren   DERIVED from `maintainVisibleContentPosition` / `snapToAlignment`, which
//                         stay on the OWNER, and is the half that needed the seam
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
    expect(
      vertical({ snapToAlignment: 'center' }).payload.collapsableChildren,
    ).toBe(false);
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

  // why: `collapsable: false` is seeded at BUILD time by `buildStructure`, not by this rule, and it
  // must survive the rule running. Yoga may collapse a view that only groups children.
  it('keeps the build-time collapsable seed', () => {
    expect(vertical({}).payload.collapsable).toBe(false);
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

    routeProp(owner, 'snapToAlignment', 'center');
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
