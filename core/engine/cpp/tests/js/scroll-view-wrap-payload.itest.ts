// The Android RefreshControl wrap — two nodes whose styles are ONE decision, and the first rule
// here that reads DOWNWARD.
//
// An Android ScrollView holds exactly one child, so a sibling refresh control is an `addViewAt`
// crash rather than a layout mistake. RN inverts the tree: `AndroidSwipeRefreshLayout` WRAPS the
// scroll view and the app's style is split across the two boxes — layout on the wrapper's frame,
// visual on the scroller, with the axis base composed onto BOTH (`ScrollView.js:1854-1863`, "the
// ScrollView still needs the baseStyle to be scrollable").
//
// WHY THIS PAIR RESISTED THREE ITERATIONS. Every seam the engine had reads UP: `ownerProps` (the
// parent's props), `IOwner.tagName` (the parent's name), `IAncestorLookup` (the nearest tagged
// ancestor). The wrapper is the scroll view's PARENT and needs the scroll view's AUTHORED style,
// which is the one direction none of them go — so this file's two folds were recorded as the last
// structural blocker in the migration.
//
// IT IS NOT A NEW KIND OF CLAIM, which is what makes the seam affordable. `ownerProps` already
// established that a rule may read another node's declarative props, and the tree lives in C++, so
// a child read is the same pointer hop a parent read is. Upstream itself builds the parent FROM the
// child — `cloneElement(refreshControl, {style: outer}, scrollView)` — so "the wrapper is derived
// from what it wraps" is RN's own shape, not one invented here. A UA doing this has a name too:
// `:has()` is a real selector, and a table's frame has always followed its cells.
//
// TOPOLOGY GATES IT, NOT `#ifdef ANDROID`, and that is strictly better for the reason
// `Switch`/`AndroidSwitch` already demonstrated. iOS claims the refresh control `beside` the
// content, so a scroll view is NEVER a refresh control's child there and the rule cannot fire
// however the host was compiled. That is why this fixture lives in the ORDINARY suite: the
// behaviour under test is a tree shape, and a tree shape is reachable on any build.
//
// WHAT IS STILL THE HOST'S iOS. `index.android` is imported by PATH here, exactly as
// `behaviors/scroll-view/wrap-android.test.ts` does, because the platform file is chosen by Metro
// and the harness resolves `index.ts` (iOS). So the refresh node serializes as `PullToRefreshView`
// rather than `AndroidSwipeRefreshLayout`. Every assertion below keys off ROLE — who wraps whom,
// which half of the style landed where — never the native name, so the substitution costs nothing.

import { registerRefreshControlBehavior } from '@symbiote-native/components';

import { registerScrollViewBehavior } from '../../../../components/src/behaviors/scroll-view/index.android';
import {
  REFRESH_CONTROL,
  SCROLL_VIEW_TAG,
} from '../../../../components/src/behaviors/scroll-view/shared';

import {
  appendChild,
  committedPayloadOf,
  createElement,
  createSurface,
  readSurfaceTelemetry,
  removeChild,
  routeProp,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { describe, expect, it, mounted, print, report } from './harness';

const SCROLL = 'RCTScrollView';
let nextRootTag = 7700;

registerScrollViewBehavior();
registerRefreshControlBehavior();

type IWrapped = {
  readonly owner: Readonly<Record<string, unknown>>;
  readonly wrapper: Readonly<Record<string, unknown>>;
  readonly folds: number;
  readonly restyle: (style: unknown) => IWrapped;
};

// A scroll view with a RefreshControl appended into it, which is what makes the engine invert the
// two. `routeProp` rather than `setProp`, because the class+style merge and the already-published
// guard are part of what an adapter's write actually does.
function wrapped(
  props: Readonly<Record<string, unknown>> = {},
  tag: string = SCROLL_VIEW_TAG,
): IWrapped {
  const rootTag = (nextRootTag += 1);
  const surface = createSurface(rootTag);
  const owner: ISymbioteNode = createElement(SCROLL, false, tag);
  for (const [name, value] of Object.entries(props))
    routeProp(owner, name, value);

  const refresh: ISymbioteNode = createElement(
    REFRESH_CONTROL,
    false,
    'refresh-control',
  );
  appendChild(owner, refresh);
  surface.appendChild(owner);

  const read = (): IWrapped => {
    surface.commit();
    mounted();
    const ownerPayload = committedPayloadOf(owner);
    const wrapperPayload = committedPayloadOf(refresh);
    if (ownerPayload === undefined)
      throw new Error('the scroller committed nothing');
    if (wrapperPayload === undefined)
      throw new Error('the wrapper committed nothing');
    return {
      owner: ownerPayload,
      wrapper: wrapperPayload,
      folds: readSurfaceTelemetry(rootTag)?.foldsFound ?? 0,
      restyle: (style: unknown): IWrapped => {
        routeProp(owner, 'style', style);
        return read();
      },
    };
  };
  return read();
}

describe('the android refresh wrap, split by the engine', () => {
  // why: THE PRICE, and it is what makes this a port rather than a rewrite. Everything below would
  // pass equally well with both folds still in JS closures — two trips per commit, on the two nodes
  // an app touches every time it pulls to refresh. This is the assertion that says they moved.
  it('costs no trip into JS on either node', () => {
    const tree = wrapped({ style: { marginTop: 7, opacity: 0.5 } });
    print(`DEBUG wrap folds=${tree.folds}`);
    expect(tree.folds).toBe(0);
  });

  // why: the LAYOUT half goes to the wrapper's frame and the VISUAL half stays on the scroller.
  // Asserted BOTH ways on each node, because a rule that forwarded the whole style to both boxes
  // would satisfy either half alone — and that is exactly the bug the split exists to prevent: the
  // wrapper would paint the app's background behind a scroller already painting it.
  it('routes layout to the wrapper and paint to the scroller', () => {
    const tree = wrapped({
      style: { marginTop: 7, height: 120, opacity: 0.5, paddingLeft: 3 },
    });

    expect(tree.wrapper.marginTop).toBe(7);
    expect(tree.wrapper.height).toBe(120);
    expect(tree.wrapper.opacity).toBe(undefined);
    expect(tree.wrapper.paddingLeft).toBe(undefined);

    expect(tree.owner.opacity).toBe(0.5);
    expect(tree.owner.paddingLeft).toBe(3);
    expect(tree.owner.marginTop).toBe(undefined);
    expect(tree.owner.height).toBe(undefined);
  });

  // why: `ScrollView.js:1856` composes the base onto BOTH boxes, and its own comment says why — a
  // wrapper with no explicit layout style otherwise loses `flexGrow` and collapses to its content
  // height inside a flex parent, where RN's grows. Every adapter had dropped it from the wrapper
  // before the split became one function; this is the case that stops it being dropped again.
  it('composes the axis base onto both boxes', () => {
    const tree = wrapped({ style: { opacity: 0.5 } });

    for (const box of [tree.owner, tree.wrapper]) {
      expect(box.flexGrow).toBe(1);
      expect(box.flexShrink).toBe(1);
      expect(box.flexDirection).toBe('column');
    }
    // `overflow` is VISUAL, so the split sends the app's to the scroller alone — but the base's
    // own copy reaches both, which is the whole point of composing it twice.
    expect(tree.owner.overflow).toBe('scroll');
    expect(tree.wrapper.overflow).toBe('scroll');
  });

  // why: the base goes UNDER the split half, so an explicit user value still wins — the same order
  // the UNWRAPPED scroll view composes. Reversed, a scroll view could never be given a height.
  it('lets an authored layout value beat the base', () => {
    const tree = wrapped({ style: { flexGrow: 4 } });

    expect(tree.wrapper.flexGrow).toBe(4);
    // And it went to the wrapper rather than the scroller, because `flexGrow` is a LAYOUT key: the
    // scroller keeps the base's own 1.
    expect(tree.owner.flexGrow).toBe(1);
  });

  // why: the axis is the SCROLL VIEW's, and the wrapper has no tag of its own that could say which
  // one. A rule that defaulted to vertical would paint a horizontal list into a column wrapper and
  // the list would not scroll — visible only on an Android device with a RefreshControl attached.
  it('takes the axis from the scroller it wraps', () => {
    const tree = wrapped({ style: { opacity: 0.5 } }, 'horizontal-scroll-view');

    expect(tree.owner.flexDirection).toBe('row');
    expect(tree.wrapper.flexDirection).toBe('row');
  });

  // why: the wrapper is DERIVED from a node that is not itself, so it re-derives only if a write to
  // the scroller marks it dirty. Without that it freezes at its mount frame while the scroller
  // visibly restyles inside it. `slotDerived` naming `style` is what makes it work and nothing
  // else does — this is the case that fails if that entry goes.
  it('re-derives both boxes on a style write after mount', () => {
    const first = wrapped({ style: { marginTop: 7, opacity: 0.5 } });
    expect(first.wrapper.marginTop).toBe(7);

    const second = first.restyle({ marginTop: 21, opacity: 0.25 });
    expect(second.wrapper.marginTop).toBe(21);
    expect(second.owner.opacity).toBe(0.25);
  });

  // why: the split is a property of BEING WRAPPED, not of the tag. Take the refresh control away
  // and the scroll view is an ordinary one again, carrying its whole style — so a rule keyed on the
  // tag alone would permanently strip every margin off any scroll view that had ever been pulled.
  it('hands the whole style back when the wrap goes away', () => {
    const rootTag = (nextRootTag += 1);
    const surface = createSurface(rootTag);
    const owner: ISymbioteNode = createElement(SCROLL, false, SCROLL_VIEW_TAG);
    routeProp(owner, 'style', { marginTop: 7, opacity: 0.5 });
    const refresh: ISymbioteNode = createElement(
      REFRESH_CONTROL,
      false,
      'refresh-control',
    );
    appendChild(owner, refresh);
    surface.appendChild(owner);
    surface.commit();
    mounted();
    expect(committedPayloadOf(owner)?.marginTop).toBe(undefined);

    removeChild(owner, refresh);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(owner);
    expect(payload?.marginTop).toBe(7);
    expect(payload?.opacity).toBe(0.5);
  });

  // why: a `<RefreshControl>` that wraps NOTHING — iOS claims it beside the content, and an app may
  // mount one on its own — must be left exactly as written. The rule reads a child that is not
  // there, and the answer to that has to be "nothing", not a base style for an axis nobody chose.
  it('invents nothing on a refresh control that wraps no scroller', () => {
    const rootTag = (nextRootTag += 1);
    const surface = createSurface(rootTag);
    const refresh: ISymbioteNode = createElement(
      REFRESH_CONTROL,
      false,
      'refresh-control',
    );
    routeProp(refresh, 'style', { marginTop: 7, opacity: 0.5 });
    surface.appendChild(refresh);
    surface.commit();
    mounted();

    const payload = committedPayloadOf(refresh);
    expect(payload?.marginTop).toBe(7);
    expect(payload?.opacity).toBe(0.5);
    expect(payload?.flexGrow).toBe(undefined);
    expect(payload?.overflow).toBe(undefined);
  });
});

report();
