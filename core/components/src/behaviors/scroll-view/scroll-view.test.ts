// The ScrollView structure behavior — the first consumer of `buildStructure` / `childHost`.
//
// WHAT THIS PROVES: the engine builds the same two-node shape every adapter's ScrollView wrapper
// builds today, from the tag alone, with no component instance anywhere — AND composes the same
// two style arrays onto it. The style half is the part that fails silently: both nodes get a
// style either way, and only the PRECEDENCE says whether the app's value or the axis constant
// won. The two orders are opposite on purpose (base under on the owner, row over on the slot), so
// a test that checked only one would pass with both folds written the same way.
//
// Registration happens HERE and nowhere else. `scroll-view` is the tag the wrappers
// already emit, so a global registration would give every existing ScrollView a second content
// node; see the behavior's header for the `-managed` split that resolves it.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  installFabric,
  type IFakeNode,
} from '../../../../test-utils/src/index';
import {
  appendChild,
  clearHostBehaviors,
  createElement,
  createSurface,
  insertBefore,
  removeChild,
  registerRules,
  routeProp,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import { descriptorFor } from '../../component-names';
import {
  resolveDecelerationRate,
  selectScrollIntrinsics,
} from '../../view/render-scroll-view';
import {
  HORIZONTAL_SCROLL_VIEW_TAG,
  registerScrollViewBehavior,
  SCROLL_VIEW_TAG,
} from './index';

const fabric = installFabric();
let nextRootTag = 9700;

function scrollNode(tag: string): ISymbioteNode {
  return createElement(descriptorFor(tag).component, false, tag);
}

beforeEach(() => {
  registerScrollViewBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  fabric.reset();
});

describe('the lowered structure reproduces the wrapper', () => {
  // Derived from `selectScrollIntrinsics`, never hardcoded: it is the ONE function every adapter's
  // wrapper calls, so deriving is what makes this a comparison rather than a restatement. It also
  // keeps the test honest across platforms — the vertical content intrinsic resolves to
  // RCTScrollContentView on iOS and to a plain RCTView on Android.
  it.each([
    { name: 'vertical', tag: SCROLL_VIEW_TAG, horizontal: false },
    { name: 'horizontal', tag: HORIZONTAL_SCROLL_VIEW_TAG, horizontal: true },
  ])(
    '$name: builds the content node the wrapper would',
    ({ tag, horizontal }) => {
      const { scrollViewIntrinsic, contentIntrinsic } = selectScrollIntrinsics(
        horizontal,
        undefined,
      );
      expect(tag).toBe(scrollViewIntrinsic);

      const owner = scrollNode(tag);

      expect(owner.children).toHaveLength(1);
      expect(owner.childHost).toBe(owner.children[0]);
      expect(owner.childHost?.component).toBe(
        descriptorFor(contentIntrinsic).component,
      );
    },
  );

  it('gives the horizontal content node the row direction the wrapper does', () => {
    const { contentStyle } = selectScrollIntrinsics(true, undefined);
    // The wrapper's contentStyle for horizontal is `[contentContainerStyle, {flexDirection:'row'}]`;
    // with no contentContainerStyle the only live half is the row direction, which is a constant of
    // the TAG and so is the only half a structure-time build can supply.
    expect(contentStyle).toEqual([undefined, { flexDirection: 'row' }]);

    // Structure time carries only what the wrapper sets unconditionally; the row direction is a
    // FOLD, so it shows up in the committed payload rather than in `props` (see the payload group).
    const owner = scrollNode(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(owner.childHost?.props).toEqual({ collapsable: false });
  });

  it('sets collapsable:false on the content node, both axes, as the wrapper does', () => {
    // Yoga may collapse a view that only groups children, and a collapsed content node takes the
    // scroll metrics with it. React's `contentProps` sets it unconditionally; so does this.
    expect(scrollNode(SCROLL_VIEW_TAG).childHost?.props).toEqual({
      collapsable: false,
    });
    expect(scrollNode(HORIZONTAL_SCROLL_VIEW_TAG).childHost?.props).toEqual({
      collapsable: false,
    });
  });
});

describe('app children reach Fabric under the content node', () => {
  it('commits RCTScrollView > content > children', () => {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);

    const owner = scrollNode(SCROLL_VIEW_TAG);
    const child = createElement('RCTImageView');
    // The adapter appends to the OWNER and never learns a slot exists — the whole point of the
    // redirect. Nothing in this test names `childHost` on the write path.
    appendChild(owner, child);
    appendChild(root, owner);
    surface.commit();

    const committed = fabric.find(node => node.viewName === 'RCTScrollView');
    const contentName = descriptorFor('scroll-content').component;
    expect(fabric.serialize([committed as never])).toBe(
      `RCTScrollView(${contentName}(RCTImageView))`,
    );
  });
});

describe('owner props that belong to the slot', () => {
  it('routes contentContainerStyle onto the content node, not the owner', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    // Written on the OWNER, which is where the app writes it and therefore where every adapter
    // writes it. Nothing on this line knows a slot exists.
    routeProp(owner, 'contentContainerStyle', { padding: 12 });

    expect(owner.props.contentContainerStyle).toBeUndefined();
    expect(owner.props.style).toBeUndefined();
    expect(owner.childHost?.props.style).toEqual([undefined, { padding: 12 }]);
  });

  // Device-found 2026-09-08: every canary writes `contentContainerStyle="scroll-content"`, a class
  // NAME. Renamed verbatim onto the slot it becomes a `style` holding a string — not a style, so
  // the whole rule (here the padding AND the gap) vanished with nothing red. React never showed it
  // because its wrapper calls resolveClassName itself before the engine sees the prop.
  it('resolves a class-NAME contentContainerStyle through the registry', () => {
    registerRules([
      {
        tokens: ['scroll-content'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 24, gap: 20 },
      },
    ]);
    const owner = scrollNode(SCROLL_VIEW_TAG);
    routeProp(owner, 'contentContainerStyle', 'scroll-content');

    expect(owner.childHost?.props.style).toEqual([
      { padding: 24, gap: 20 },
      undefined,
    ]);
    // The owner keeps its own class slot free: the name belongs to the content view.
    expect(owner.props.style).toBeUndefined();
  });

  it('leaves the owner its own style', () => {
    const owner = scrollNode(SCROLL_VIEW_TAG);
    routeProp(owner, 'style', { backgroundColor: 'red' });

    expect(owner.props.style).toEqual([undefined, { backgroundColor: 'red' }]);
    expect(owner.childHost?.props.style).toBeUndefined();
  });
});

describe('style precedence, which is opposite on the two nodes', () => {
  function commitScroll(
    tag: string,
    props: Readonly<Record<string, unknown>>,
  ): { owner: IFakeNode; slot: IFakeNode } {
    const surface = createSurface((nextRootTag += 1));
    const root = createElement('RCTView');
    surface.appendChild(root);
    const node = scrollNode(tag);
    for (const key of Object.keys(props)) routeProp(node, key, props[key]);
    appendChild(root, node);
    surface.commit();

    const owner = fabric.find(n => n.viewName === descriptorFor(tag).component);
    if (owner === undefined) throw new Error('scroll node never committed');
    const slot = owner.children[0];
    if (slot === undefined) throw new Error('content node never committed');
    return { owner, slot };
  }

  it('horizontal: the base wins on the slot and loses on the owner', () => {
    const { owner, slot } = commitScroll(HORIZONTAL_SCROLL_VIEW_TAG, {
      // Collides with SCROLL_VIEW_BASE_HORIZONTAL's flexGrow: 1 — the app must win.
      style: { flexGrow: 9, backgroundColor: 'red' },
      // Collides with the fold's flexDirection: 'row' — the CONSTANT must win, because the
      // wrapper writes `[contentContainerStyle, {flexDirection:'row'}]`.
      contentContainerStyle: { padding: 12, flexDirection: 'column' },
    });

    expect(owner.props.flexGrow).toBe(9);
    expect(owner.props.backgroundColor).toBe('red');
    // Untouched halves of the base still land.
    expect(owner.props.flexDirection).toBe('row');
    expect(owner.props.overflow).toBe('scroll');

    expect(slot.props.padding).toBe(12);
    expect(slot.props.flexDirection).toBe('row');
    expect(slot.props.collapsable).toBe(false);
  });

  it('vertical: the base composes under the app style and the slot has no constant', () => {
    const { owner, slot } = commitScroll(SCROLL_VIEW_TAG, {
      style: { flexDirection: 'row' },
      contentContainerStyle: { padding: 4 },
    });

    // SCROLL_VIEW_BASE_VERTICAL says 'column'; the app said 'row' and wins.
    expect(owner.props.flexDirection).toBe('row');
    expect(owner.props.flexGrow).toBe(1);

    expect(slot.props.padding).toBe(4);
    // Nothing composes a direction onto a vertical content node — the wrapper's contentStyle for
    // vertical is `contentContainerStyle` alone.
    expect(slot.props.flexDirection).toBeUndefined();
  });
});

// Mounts a lowered ScrollView and hands back a re-commit, so a test can write a prop AFTER the
// first commit and read what the second one published. Reads out of `fabric.committed` rather than
// `fabric.find`, which searches `created` and so returns a node's own pre-clone self on any update
// (`.claude/rules/test-harness-false-greens.md`).
function mountScroll(
  tag: string,
  props: Readonly<Record<string, unknown>> = {},
): {
  node: ISymbioteNode;
  slot: ISymbioteNode;
  commit: () => { owner: IFakeNode; slot: IFakeNode };
} {
  const surface = createSurface((nextRootTag += 1));
  const root = createElement('RCTView');
  surface.appendChild(root);
  const node = scrollNode(tag);
  for (const key of Object.keys(props)) routeProp(node, key, props[key]);
  appendChild(root, node);

  const commit = (): { owner: IFakeNode; slot: IFakeNode } => {
    surface.commit();
    const latest = fabric.committed[fabric.committed.length - 1];
    const owner = latest?.children[0]?.children[0];
    const slot = owner?.children[0];
    if (owner === undefined || slot === undefined)
      throw new Error('the scroll view never committed its two nodes');
    return { owner, slot };
  };

  const slot = node.childHost;
  if (slot === undefined) throw new Error('buildStructure produced no slot');
  return { node, slot, commit };
}

function layoutEvent(
  node: ISymbioteNode,
  width: number,
  height: number,
): ISymbioteEvent {
  return {
    type: 'layout',
    target: node,
    currentTarget: node,
    nativeEvent: { layout: { x: 0, y: 0, width, height } },
    stopPropagation: () => {},
  };
}

describe('decelerationRate reaches Fabric as a number', () => {
  // RN's two words resolve to DIFFERENT friction constants per platform, and a wrapper is what did
  // that resolution. A lowered element has none, so the string would reach Fabric unread and the
  // scroll would keep the native default with nothing red.
  it.each(['normal', 'fast'] as const)('resolves %s', word => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, { decelerationRate: word });
    expect(commit().owner.props.decelerationRate).toBe(
      resolveDecelerationRate(word),
    );
  });

  it('passes a numeric rate through untouched', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, { decelerationRate: 0.5 });
    expect(commit().owner.props.decelerationRate).toBe(0.5);
  });

  it('invents no rate when the app set none', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().owner.props, 'decelerationRate')).toBe(false);
  });
});

// `horizontal` is a real C++ prop (`BaseScrollViewProps.h:56`) and the separate ViewManager is
// ANDROID's — on iOS both tags resolve to RCTScrollView, so the prop is the only thing that turns
// the axis there. Silent and device-only: the tag looks right, the content node is a row, and the
// scroller still pages vertically.
describe('the horizontal tag sets the C++ axis flag, not just the style', () => {
  it('writes horizontal on the horizontal tag', () => {
    const { commit } = mountScroll(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(commit().owner.props.horizontal).toBe(true);
  });

  // The negative half, and the case above is its control on the same fold: both tags go through
  // `ownerFold`, so a fold that wrote the key unconditionally would fail here and a fold that wrote
  // it nowhere would fail there.
  it('invents no key on the vertical tag, matching the wrapper', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().owner.props, 'horizontal')).toBe(false);
  });
});

// why: in RN the axis has ONE input. `horizontal` picks the native component, the row
// contentContainerStyle and the payload key together (`ScrollView.js:1644-1656`), so the three can
// never disagree. Our input is the TAG, which reopens the disagreement the wrapper used to close:
// an app writing `horizontal` on the vertical tag would otherwise ship a combination RN cannot
// produce — RCTScrollView with the axis flipped, a vertical content node and no row style. On iOS
// both tags ARE RCTScrollView, so the stray prop really does turn the scroller.
describe('the tag is the only axis input, as the prop is in RN', () => {
  it('eats an app-written horizontal on the vertical tag', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, { horizontal: true });
    expect(Object.hasOwn(commit().owner.props, 'horizontal')).toBe(false);
  });

  // The control: the same fold on the other tag must still write the flag, so a fold that deleted
  // the key unconditionally fails here rather than passing the case above for the wrong reason.
  it('still writes the flag from the horizontal tag when the app also wrote it', () => {
    const { commit } = mountScroll(HORIZONTAL_SCROLL_VIEW_TAG, {
      horizontal: false,
    });
    expect(commit().owner.props.horizontal).toBe(true);
  });
});

// why: RN derives the bounce pair from the axis and nothing else does
// (`ScrollView.js:1753-1761`): `alwaysBounceHorizontal ?? horizontal`,
// `alwaysBounceVertical ?? !horizontal`. Both names are DECLARED in all five adapters' prop types
// and COMPUTED in none of them, so a vertical scroll view has never bounced by default on iOS —
// a gap on the wrapper path too, which is why no parity oracle reported it.
describe('the bounce pair defaults from the axis, as RN derives it', () => {
  // The pair is ASYMMETRIC, and copying it rather than tidying it is the point: RN's fallback is
  // `this.props.horizontal`, which a vertical ScrollView leaves UNSET, so the horizontal key
  // resolves to undefined and never reaches the payload at all. Writing `false` there instead
  // would mean the same thing to native and one more prop key on every vertical scroll view.
  it('vertical: bounces vertically, and writes no horizontal key', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(commit().owner.props.alwaysBounceVertical).toBe(true);
    expect(Object.hasOwn(commit().owner.props, 'alwaysBounceHorizontal')).toBe(
      false,
    );
  });

  it('horizontal: bounces horizontally and not vertically', () => {
    const { commit } = mountScroll(HORIZONTAL_SCROLL_VIEW_TAG);
    expect(commit().owner.props.alwaysBounceHorizontal).toBe(true);
    expect(commit().owner.props.alwaysBounceVertical).toBe(false);
  });

  it('lets an explicit value win on both keys', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, {
      alwaysBounceHorizontal: true,
      alwaysBounceVertical: false,
    });
    expect(commit().owner.props.alwaysBounceHorizontal).toBe(true);
    expect(commit().owner.props.alwaysBounceVertical).toBe(false);
  });
});

// Every wrapper writes `nestedScrollEnabled ?? true` on every ScrollView, both platforms — RN
// itself only defaults it on Android's RefreshControl WRAP path (`ScrollView.js:1862`), and it is
// the WRAPPER a lowered element replaces. Without it an Android list nested in a scroll view does
// not scroll on its own.
describe('nested scrolling defaults on, as the wrapper leaves it', () => {
  it('defaults to true when the app set nothing', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(commit().owner.props.nestedScrollEnabled).toBe(true);
  });

  it('honours an explicit false', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG, {
      nestedScrollEnabled: false,
    });
    expect(commit().owner.props.nestedScrollEnabled).toBe(false);
  });
});

describe('collapsableChildren is derived from props that stay on the owner', () => {
  it('writes no key when neither anchor prop is set', () => {
    const { commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().slot.props, 'collapsableChildren')).toBe(
      false,
    );
  });

  it.each(['maintainVisibleContentPosition', 'snapToAlignment'])(
    '%s lands on the OWNER and turns off flattening on the SLOT',
    key => {
      const { commit } = mountScroll(SCROLL_VIEW_TAG, {
        [key]: key === 'snapToAlignment' ? 'start' : { minIndexForVisible: 0 },
      });
      const { owner, slot } = commit();

      // The prop itself is the scroll view's — only the DERIVED value crosses to the slot.
      expect(owner.props[key]).toBeDefined();
      expect(slot.props.collapsableChildren).toBe(false);
      expect(Object.hasOwn(owner.props, 'collapsableChildren')).toBe(false);
    },
  );

  // The reason `slotDerived` exists. `markPropsDirty` bubbles UP, so an owner write reaches every
  // ancestor and never the slot, and `reconcile` skips a subtree whose root is clean — without the
  // declaration this second commit publishes nothing and the value is frozen at its mount answer.
  it('re-derives after a write that lands AFTER the first commit', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    expect(Object.hasOwn(commit().slot.props, 'collapsableChildren')).toBe(
      false,
    );

    routeProp(node, 'maintainVisibleContentPosition', {
      minIndexForVisible: 0,
    });
    expect(commit().slot.props.collapsableChildren).toBe(false);
  });

  // The other half of the same guard: a re-render writing the SAME value must not dirty the slot,
  // or every ScrollView render clones its content node. `setProp`'s identity guard is what stops
  // it, which is why the mark is read past it and not in `routeProp`.
  it('an unchanged rewrite dirties nothing', () => {
    const anchor = { minIndexForVisible: 0 };
    const { node, slot, commit } = mountScroll(SCROLL_VIEW_TAG, {
      maintainVisibleContentPosition: anchor,
    });
    commit();
    expect(slot.propsDirty).toBe(false);

    routeProp(node, 'maintainVisibleContentPosition', anchor);
    expect(slot.propsDirty).toBe(false);
  });
});

describe('onContentSizeChange is synthesized from the content view layout', () => {
  it('wires nothing when the app passed no handler', () => {
    const { slot, commit } = mountScroll(SCROLL_VIEW_TAG);
    // `onLayout` is a GATED event: wiring it unconditionally would put the flag in every lowered
    // ScrollView's payload and buy a native event nobody reads.
    expect(Object.hasOwn(commit().slot.props, 'onLayout')).toBe(false);
    expect(slot.listeners?.get('layout')).toBeUndefined();
  });

  it('wires the slot layout and reports positional width/height', () => {
    const seen: Array<readonly [unknown, unknown]> = [];
    const { slot, commit } = mountScroll(SCROLL_VIEW_TAG, {
      onContentSizeChange: (width: unknown, height: unknown) => {
        seen.push([width, height]);
      },
    });
    // ONE commit. The wiring follows the LISTENER and is synchronous, so the gate flag is on the
    // slot before the first commit — the wrapper has no two-pass mount either.
    expect(commit().slot.props.onLayout).toBe(true);

    const listener = slot.listeners?.get('layout');
    if (listener === undefined)
      throw new Error('no layout listener on the slot');

    listener(layoutEvent(slot, 320, 900));
    // RN's contract is positional, NOT a {width, height} object.
    expect(seen).toEqual([[320, 900]]);

    // Deduped exactly as RN dedupes: a layout pass that did not change the size is not a content
    // size change.
    listener(layoutEvent(slot, 320, 900));
    expect(seen).toHaveLength(1);

    listener(layoutEvent(slot, 320, 1200));
    expect(seen).toEqual([
      [320, 900],
      [320, 1200],
    ]);
  });

  it('unwires when the app drops the handler', () => {
    const { node, slot, commit } = mountScroll(SCROLL_VIEW_TAG, {
      onContentSizeChange: () => {},
    });
    expect(commit().slot.props.onLayout).toBe(true);

    routeProp(node, 'onContentSizeChange', undefined);
    // NULL, not absent: Fabric has no prop removal, so `diffProps` sends an explicit null for a key
    // that disappeared. Asserting absence here would be asserting a thing the platform cannot do.
    expect(commit().slot.props.onLayout).toBeNull();
    expect(slot.listeners?.get('layout')).toBeUndefined();
  });
});

describe('a RefreshControl child is claimed by the owner', () => {
  const REFRESH = descriptorFor('refresh-control').component;
  const CONTENT = descriptorFor('scroll-content').component;

  function refreshNode(): ISymbioteNode {
    return createElement(REFRESH, false, 'refresh-control');
  }

  // The app writes it among the children, because that is what a tag-only surface leaves it: the
  // prop carrying an element existed only because JSX had no way to MARK one.
  it('sits beside the content view, not inside it', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, refreshNode());
    appendChild(node, createElement('RCTImageView'));

    // RN's iOS branch renders `{refreshControl}{contentContainer}`, in that order.
    expect(fabric.serialize([commit().owner as never])).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // The control that says the claim is a claim and not "children stop being redirected". Without
  // it a broken `hostFor` that always returns the owner passes the case above.
  it('leaves an unclaimed child in the slot', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, createElement('RCTImageView'));

    expect(fabric.serialize([commit().owner as never])).toBe(
      `RCTScrollView(${CONTENT}(RCTImageView))`,
    );
  });

  // Source order is not delivery order: a framework may mount the rows first and the control on a
  // later pass. The position is the OWNER's rule, never the caller's.
  it('goes before the content view even when it arrives last', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    appendChild(node, createElement('RCTImageView'));
    appendChild(node, refreshNode());

    expect(fabric.serialize([commit().owner as never])).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // `insertBefore` names a node the framework can see, and every row it can see lives in the SLOT
  // — so `indexOf` on the owner's own list misses and a naive fallback appends past the content.
  it('lands before the content view when the anchor is a row inside the slot', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    const row = createElement('RCTImageView');
    appendChild(node, row);
    insertBefore(node, refreshNode(), row);

    expect(fabric.serialize([commit().owner as never])).toBe(
      `RCTScrollView(${REFRESH}${CONTENT}(RCTImageView))`,
    );
  });

  // The removal twin. The adapter names the owner, and the claimed child really is there — but a
  // `removeChild` that redirected to the slot would splice nothing and leave it committed forever.
  it('is removed from the owner the adapter named', () => {
    const { node, commit } = mountScroll(SCROLL_VIEW_TAG);
    const refresh = refreshNode();
    appendChild(node, refresh);
    appendChild(node, createElement('RCTImageView'));
    commit();

    removeChild(node, refresh);
    expect(fabric.serialize([commit().owner as never])).toBe(
      `RCTScrollView(${CONTENT}(RCTImageView))`,
    );
  });
});
