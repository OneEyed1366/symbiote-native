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

  // why: RN's own default (`ScrollView.js`). On Android it is what lets an inner scroller consume
  // the gesture before a scrolling parent sees it; without it nested lists fight.
  it('defaults nestedScrollEnabled to true and lets false through', () => {
    expect(vertical({}).payload.nestedScrollEnabled).toBe(true);
    expect(
      vertical({ nestedScrollEnabled: false }).payload.nestedScrollEnabled,
    ).toBe(false);
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

  // why: THE PRICE. The owner sheds its fold entirely on iOS — everything it did was a tag rule. The
  // remaining trip is its CONTENT node's, whose `collapsableChildren` is derived from props that stay
  // on the owner, so no per-node rule can reach it. Pinned so the day that one moves too, this number
  // has to be edited deliberately.
  it('pays one trip for the pair, and it is the content node’s', () => {
    const one = vertical({});
    print(`DEBUG scroll-view folds=${one.folds}`);
    expect(one.folds).toBe(1);
  });
});

report();
