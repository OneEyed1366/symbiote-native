// ScrollView's owner rule, both axes — the port that was blocked on a missing LOG rather than on
// anything about the rule itself.
//
// EVERY INPUT WAS THE NODE'S OWN BAG PLUS THE AXIS, and the axis is the TAG (`scroll-view` vs
// `horizontal-scroll-view`), so this was a tag rule by every criterion this migration uses. What
// moved: the base style composition, `nestedScrollEnabled`, the `horizontal` strip, the asymmetric
// bounce pair, the two ViewConfig-less strips, and `decelerationRate`.
//
// THE TAG IS THE ONLY AXIS INPUT, which is the point of the `horizontal` strip rather than a
// simplification. RN derives the scroller's `horizontal`, the base style's `flexDirection` and the
// content node's row style from ONE prop, so the three cannot disagree; here the tag plays that
// part. On iOS both tags really are `RCTScrollView`, so honouring a stray `horizontal` would produce
// a vertical scroller over a content node with no row style — a shape RN cannot make. It is IGNORED,
// and the warning that says so is `core/engine/cpp/tests/js/native-debug-log.itest.ts`.
//
// WHAT IS NOT HERE, and it is the one part of this rule a headless test cannot reach:
// `decelerationRate`'s Android constants. On iOS BOTH tags resolve to `RCTScrollView`, so the
// component name cannot tell iOS-vertical from Android-vertical the way `foldSwitchProps` can tell
// `Switch` from `AndroidSwitch` — the branch is `#ifdef ANDROID` and only its iOS half is asserted
// below. Same gap already recorded for `android_ripple`.

import { registerScrollViewBehavior } from '@symbiote-native/components';

import {
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  routeProp,
  setProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const ROOT_TAG = 1;

registerScrollViewBehavior();

type ICommitted = {
  readonly payload: Readonly<Record<string, unknown>>;
  readonly folds: number;
};

function commit(tag: string, props: Record<string, unknown>): ICommitted {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement('RCTScrollView', false, tag);
  for (const [name, value] of Object.entries(props)) setProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();

  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return { payload, folds: readSurfaceTelemetry(ROOT_TAG)?.foldsFound ?? 0 };
}

const vertical = (props: Record<string, unknown>): ICommitted =>
  commit('scroll-view', props);

// Through `routeProp`, which is the path that diverts an owned `on*` into the listener stash and
// sends its existence bit — `setProp` would land a function in the bag instead.
function routed(
  props: Record<string, unknown>,
): Readonly<Record<string, unknown>> {
  const surface = createSurface(ROOT_TAG);
  const node: ISymbioteNode = createElement(
    'RCTScrollView',
    false,
    'scroll-view',
  );
  for (const [name, value] of Object.entries(props))
    routeProp(node, name, value);
  surface.appendChild(node);
  surface.commit();
  mounted();
  const payload = committedPayloadOf(node);
  if (payload === undefined) throw new Error('nothing committed');
  return payload;
}
const horizontal = (props: Record<string, unknown>): ICommitted =>
  commit('horizontal-scroll-view', props);

describe('what a scroll view sends native', () => {
  // why: RN's base style is what makes a ScrollView scroll at all — `overflow: scroll` plus a flex
  // pair — and the axis decides `flexDirection`. A tag inherits nothing a wrapper did, so without
  // this the scroller lays its children out on the wrong axis and clips instead of scrolling.
  it('composes the axis base style under the app style', () => {
    const down = vertical({}).payload;
    expect(down.flexDirection).toBe('column');
    expect(down.overflow).toBe('scroll');
    expect(down.flexGrow).toBe(1);

    expect(horizontal({}).payload.flexDirection).toBe('row');
  });

  // why: BASE FIRST, so an app's own style still wins — the same composition order every other
  // primitive here uses, and the only one that lets an app override the default.
  it('lets the app style win over the base', () => {
    expect(vertical({ style: { flexGrow: 0 } }).payload.flexGrow).toBe(0);
  });

  // why: ScrollView.js:1801-1804 — Android's ReactScrollView emits momentum events only when
  // `sendMomentumEvents` is on, and RN turns it on exactly when the app wired one of the two.
  it('asks native for momentum events only when the app listens for one', () => {
    expect(routed({}).sendMomentumEvents).toBe(false);
    expect(routed({ onMomentumScrollEnd: () => {} }).sendMomentumEvents).toBe(
      true,
    );
    expect(routed({ onMomentumScrollBegin: () => {} }).sendMomentumEvents).toBe(
      true,
    );
  });

  // why: ScrollView.js:1806-1808 — both default to true, only an explicit false turns them off.
  it('defaults snapToStart and snapToEnd on', () => {
    const payload = vertical({}).payload;
    expect(payload.snapToStart).toBe(true);
    expect(payload.snapToEnd).toBe(true);
    expect(vertical({ snapToEnd: false }).payload.snapToEnd).toBe(false);
  });

  // why: ScrollView.js:1797-1799 — sticky headers need every scroll frame, so the throttle is 1.
  it('throttles to every frame while headers stick', () => {
    expect(
      vertical({ stickyHeaderIndices: [0], scrollEventThrottle: 100 }).payload
        .scrollEventThrottle,
    ).toBe(1);
    expect(
      vertical({ scrollEventThrottle: 100 }).payload.scrollEventThrottle,
    ).toBe(100);
  });

  // why: endFillColor is a colorAttribute in RN's view config; native reads an int.
  it('commits endFillColor as a colour int', () => {
    expect(
      typeof vertical({ endFillColor: '#ff0000' }).payload.endFillColor,
    ).toBe('number');
  });

  // why: RN defaults it only under the Android refresh wrap (`ScrollView.js:1862`); a plain
  // scroller sends what the app authored and nothing else (native default: off).
  it('leaves nestedScrollEnabled unset on a plain scroller and lets an authored value through', () => {
    expect(vertical({}).payload.nestedScrollEnabled).toBe(undefined);
    expect(
      vertical({ nestedScrollEnabled: false }).payload.nestedScrollEnabled,
    ).toBe(false);
    expect(
      vertical({ nestedScrollEnabled: true }).payload.nestedScrollEnabled,
    ).toBe(true);
  });

  // why: the axis comes from the tag and ONLY from the tag. The horizontal tag must announce itself
  // to native; the vertical one must not, and an app's own `horizontal` must not survive on either —
  // it would make the scroller disagree with its own content node.
  it('takes the axis from the tag and strips the prop', () => {
    expect(horizontal({}).payload.horizontal).toBe(true);
    expect(vertical({}).payload.horizontal).toBe(undefined);
    expect(vertical({ horizontal: true }).payload.horizontal).toBe(undefined);
    expect(horizontal({ horizontal: false }).payload.horizontal).toBe(true);
  });

  // why: ASYMMETRIC, and it is upstream's shape rather than an oversight — RN falls back to
  // `this.props.horizontal`, which is unset on a vertical view, so `alwaysBounceHorizontal` never
  // resolves there and never reaches the payload. Computing it would make a vertical list bounce
  // sideways, which RN's never does.
  it('defaults the bounce pair per axis, and only where RN does', () => {
    const down = vertical({}).payload;
    expect(down.alwaysBounceVertical).toBe(true);
    expect(down.alwaysBounceHorizontal).toBe(undefined);

    const across = horizontal({}).payload;
    expect(across.alwaysBounceHorizontal).toBe(true);
    expect(across.alwaysBounceVertical).toBe(false);
  });

  // why: an explicit value wins over the default on both names — the default is a fallback, not an
  // override, and an app that turned bouncing off must keep it off.
  it('lets an explicit bounce value through', () => {
    expect(
      vertical({ alwaysBounceVertical: false }).payload.alwaysBounceVertical,
    ).toBe(false);
  });

  // why: RN's two WORDS are platform friction constants; a tag has no wrapper to resolve them, so
  // the string would reach Fabric unread and the scroll would keep the native default with nothing
  // red. iOS's pair only — the Android branch is `#ifdef` and unreachable from this build.
  it('resolves the named deceleration rates to numbers', () => {
    expect(
      vertical({ decelerationRate: 'normal' }).payload.decelerationRate,
    ).toBe(0.998);
    expect(
      vertical({ decelerationRate: 'fast' }).payload.decelerationRate,
    ).toBe(0.99);
  });

  // why: a NUMBER is already what native wants and must pass through untouched; an absent rate must
  // invent nothing, or every ScrollView would override a native default it never meant to.
  it('passes a numeric rate through and invents none', () => {
    expect(vertical({ decelerationRate: 0.5 }).payload.decelerationRate).toBe(
      0.5,
    );
    expect(vertical({}).payload.decelerationRate).toBe(undefined);
  });

  // why: both names are consumed by the behavior and declared by NO ViewConfig — neither appears
  // anywhere under `ReactCommon/react/renderer/components/scrollview`. Fabric drops an unknown key
  // without throwing, logging or painting differently, so the strip is only ever visible here.
  it('keeps the two sticky props off the payload', () => {
    const payload = vertical({
      stickyHeaderIndices: [0, 2],
      invertStickyHeaders: true,
    }).payload;

    expect(payload.stickyHeaderIndices).toBe(undefined);
    expect(payload.invertStickyHeaders).toBe(undefined);
  });

  // why: `pagingEnabled` and the two snap props FIGHT on iOS — native honours one or the other, so
  // RN sends `pagingEnabled === true && snapToInterval == null && snapToOffsets == null`
  // (`ScrollView.js:1810-1821`). Forwarded raw, an app that sets both gets paging and NO snapping,
  // silently: every prop reaches Fabric, nothing errors, and the scroller just does the other thing.
  it('drops paging on iOS when the app also asks for snapping', () => {
    expect(vertical({ pagingEnabled: true }).payload.pagingEnabled).toBe(true);
    expect(
      vertical({ pagingEnabled: true, snapToInterval: 100 }).payload
        .pagingEnabled,
    ).toBe(false);
    expect(
      vertical({ pagingEnabled: true, snapToOffsets: [0, 100] }).payload
        .pagingEnabled,
    ).toBe(false);
  });

  // why: THE OTHER SIDE of the same expression, and it is a `=== true` rather than a truthiness
  // check — RN resolves the key on EVERY scroll view, so a scroller that never mentions paging still
  // states it. Absent would let a stale `true` stand from a previous commit.
  it('states paging as false when the app never asked for it', () => {
    expect(vertical({}).payload.pagingEnabled).toBe(false);
    expect(vertical({ snapToInterval: 100 }).payload.pagingEnabled).toBe(false);
  });

  // why: THE PRICE, and it is ZERO for the whole primitive — both nodes.
  //
  // This assertion read `1` for one iteration, with a comment saying the content node's fold could
  // never move because "no per-node rule can reach" the owner it derives from. That was wrong about
  // the engine rather than about the fold: the tree lives in C++, so a rule reads its parent through
  // `ownerProps` (`scroll-content-payload.itest.ts`). Pinning the number is what made the claim
  // testable — the day it became false, this went red instead of quietly staying true.
  it('costs no trip into JS for either of its nodes', () => {
    const one = vertical({});
    print(`DEBUG scroll-view folds=${one.folds}`);
    expect(one.folds).toBe(0);
  });
});

report();
